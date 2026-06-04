import type { ConveyorManifestInput } from "./conveyor-manifest.js";
import {
  collectConveyorAuditEvidence,
  type ConveyorAuditEvidence,
  type ConveyorAuditRole,
  type ConveyorMode,
  type ConveyorPullRequestSnapshot,
} from "./conveyor-reconciler.js";
import {
  filterManifestByProfile,
  summarizeConveyorProfile,
  type ConveyorProfileSummary,
  type ConveyorProjectProfile,
} from "./conveyor-profile.js";

export type ConveyorAuditSweeperLevel = ConveyorAuditRole | "all";

export interface ConveyorAuditSweeperInput {
  manifest: ConveyorManifestInput;
  level?: ConveyorAuditSweeperLevel;
  mode?: ConveyorMode;
  profile?: ConveyorProjectProfile;
  previousProfile?: ConveyorProjectProfile;
}

export interface ConveyorAuditSweeperTarget {
  repo: string;
  pr: number;
  url?: string;
  title?: string;
  head: string;
  labels: string[];
  merge_state?: string;
  audit_level: ConveyorAuditRole;
  state_label: "state:impl-l1" | "state:impl-l2" | "state:impl-l3";
  priority_bucket:
    | "stop_lane"
    | "re_audit_after_changes"
    | "stale_or_missing_evidence"
    | "dependency_blocked"
    | "normal";
  dispatch_reason: string;
  risk_class?: "R0" | "R1" | "R2" | "R3" | "R4" | "unknown";
  risk_route: "normal" | "l2_required" | "unclear";
  evidence: {
    status: "current" | "stale" | "hold_only" | "missing";
    current?: ConveyorAuditEvidence;
    stale?: ConveyorAuditEvidence;
  };
  prior_audit: {
    required: ConveyorAuditRole[];
    satisfied: ConveyorAuditRole[];
    missing: ConveyorAuditRole[];
    stale: ConveyorAuditRole[];
  };
  dependency_status: {
    status: "clear" | "blocked" | "pending" | "none";
    blockers: Array<{ repo: string; pr: number; labels: string[]; reason: string }>;
  };
  recommendations: string[];
}

export interface ConveyorAuditSweeperPlan {
  schema: "shirube-conveyor-audit-sweeper-plan/v1";
  mode: ConveyorMode;
  level: ConveyorAuditSweeperLevel;
  query: Record<ConveyorAuditRole, string>;
  profile?: ConveyorProfileSummary;
  profile_scope_changed?: boolean;
  context_recovery?: ConveyorProjectProfile["context_recovery"];
  authority_notes: string[];
  targets: ConveyorAuditSweeperTarget[];
  metrics: {
    total_targets: number;
    by_level: Record<ConveyorAuditRole, number>;
    stop_lane: number;
    stale_or_missing_evidence: number;
    dependency_blocked: number;
    high_risk_or_unclear: number;
  };
}

const STATE_BY_LEVEL: Record<ConveyorAuditRole, ConveyorAuditSweeperTarget["state_label"]> = {
  l1: "state:impl-l1",
  l2: "state:impl-l2",
  l3: "state:impl-l3",
};

const QUERY_BY_LEVEL: Record<ConveyorAuditRole, string> = {
  l1: "state:open label:state:impl-l1",
  l2: "state:open label:state:impl-l2",
  l3: "state:open label:state:impl-l3",
};

const REPO_PRIORITY = [
  "watchout/ai-dev-framework",
  "watchout/agent-comms-mcp",
  "watchout/agent-memory",
  "watchout/aun-platform",
];

export function buildConveyorAuditSweeperPlan(input: ConveyorAuditSweeperInput): ConveyorAuditSweeperPlan {
  const mode = input.mode ?? "dry-run";
  const level = input.level ?? "all";
  const scopedManifest = input.profile ? filterManifestByProfile(input.manifest, input.profile) : input.manifest;
  const profile = input.profile ? summarizeConveyorProfile(input.profile, input.previousProfile) : undefined;
  const levels = level === "all" ? (["l1", "l2", "l3"] as const) : [level];
  const targets = scopedManifest.pull_requests
    .flatMap((pr) => levels.flatMap((auditLevel) => targetForLevel(pr, auditLevel, scopedManifest)))
    .filter((target): target is ConveyorAuditSweeperTarget => Boolean(target))
    .sort(compareTargets);

  return {
    schema: "shirube-conveyor-audit-sweeper-plan/v1",
    mode,
    level,
    query: QUERY_BY_LEVEL,
    profile,
    profile_scope_changed: profile ? profile.scope_changes.length > 0 : undefined,
    context_recovery: profile?.context_recovery,
    authority_notes: [
      "read_only_audit_dispatch_plan",
      "github_labels_are_wave1_ssot",
      "no_product_implementation_authority",
      "no_merge_authority",
      "no_aun_lifecycle_or_runner_dispatch",
    ],
    targets,
    metrics: summarizeTargets(targets),
  };
}

function targetForLevel(
  pr: ConveyorPullRequestSnapshot,
  auditLevel: ConveyorAuditRole,
  manifest: ConveyorManifestInput,
): ConveyorAuditSweeperTarget | undefined {
  const stateLabel = STATE_BY_LEVEL[auditLevel];
  if (!pr.labels.includes(stateLabel)) return undefined;
  const evidence = evidenceFor(pr, auditLevel);
  const priorAudit = priorAuditStatus(pr, auditLevel);
  const dependencyStatus = dependencyStatusFor(pr, manifest);
  const riskClass = riskClassFor(pr);
  const priorityBucket = priorityBucketFor(pr, evidence.status, dependencyStatus.status);
  const riskRoute = riskClass === "R3" || riskClass === "R4" ? "l2_required" : riskClass === "unknown" ? "unclear" : "normal";
  const recommendations = recommendationsFor({
    auditLevel,
    evidenceStatus: evidence.status,
    priorAudit,
    dependencyStatus,
    riskRoute,
  });
  return {
    repo: pr.repo,
    pr: pr.number,
    url: pr.url,
    title: pr.title,
    head: pr.head,
    labels: unique(pr.labels).sort(),
    merge_state: pr.merge_state,
    audit_level: auditLevel,
    state_label: stateLabel,
    priority_bucket: priorityBucket,
    dispatch_reason: dispatchReason(auditLevel, priorityBucket),
    risk_class: riskClass,
    risk_route: riskRoute,
    evidence,
    prior_audit: priorAudit,
    dependency_status: dependencyStatus,
    recommendations,
  };
}

function evidenceFor(
  pr: ConveyorPullRequestSnapshot,
  auditLevel: ConveyorAuditRole,
): ConveyorAuditSweeperTarget["evidence"] {
  const roleEvidence = collectConveyorAuditEvidence(pr).filter((evidence) => evidence.role === auditLevel);
  const current = roleEvidence.find((evidence) => evidence.head === pr.head && evidence.verdict !== "HOLD");
  if (current) return { status: "current", current };
  const hold = roleEvidence.find((evidence) => evidence.head === pr.head && evidence.verdict === "HOLD");
  if (hold) return { status: "hold_only", current: hold };
  const stale = roleEvidence.find((evidence) => evidence.verdict !== "HOLD");
  if (stale) return { status: "stale", stale };
  return { status: "missing" };
}

function priorAuditStatus(
  pr: ConveyorPullRequestSnapshot,
  auditLevel: ConveyorAuditRole,
): ConveyorAuditSweeperTarget["prior_audit"] {
  const required = priorRoles(auditLevel, pr.labels);
  const evidence = collectConveyorAuditEvidence(pr);
  const satisfied = required.filter((role) =>
    evidence.some((item) => item.role === role && item.verdict === "PASS" && item.head === pr.head),
  );
  const stale = required.filter((role) =>
    !satisfied.includes(role) && evidence.some((item) => item.role === role && item.verdict === "PASS"),
  );
  const missing = required.filter((role) => !satisfied.includes(role) && !stale.includes(role));
  return { required, satisfied, missing, stale };
}

function priorRoles(auditLevel: ConveyorAuditRole, labels: string[]): ConveyorAuditRole[] {
  if (auditLevel === "l1") return [];
  if (auditLevel === "l2") return ["l1"];
  if (labels.includes("audit:l2-required")) return ["l2"];
  return ["l1"];
}

function dependencyStatusFor(
  pr: ConveyorPullRequestSnapshot,
  manifest: ConveyorManifestInput,
): ConveyorAuditSweeperTarget["dependency_status"] {
  const dependencies = manifest.config?.dependencies?.[pr.repo] ?? [];
  const blockers: ConveyorAuditSweeperTarget["dependency_status"]["blockers"] = [];
  let hasPending = false;
  for (const stack of dependencies) {
    const index = stack.indexOf(pr.number);
    if (index <= 0) continue;
    for (const previousPrNumber of stack.slice(0, index)) {
      const previous = manifest.pull_requests.find((candidate) => candidate.repo === pr.repo && candidate.number === previousPrNumber);
      if (!previous) {
        hasPending = true;
        blockers.push({ repo: pr.repo, pr: previousPrNumber, labels: [], reason: "dependency_snapshot_missing" });
        continue;
      }
      const reason = dependencyBlockerReason(previous.labels);
      if (reason) {
        blockers.push({ repo: previous.repo, pr: previous.number, labels: unique(previous.labels).sort(), reason });
      } else if (!dependencyAccepted(previous.labels)) {
        hasPending = true;
        blockers.push({ repo: previous.repo, pr: previous.number, labels: unique(previous.labels).sort(), reason: "dependency_not_accepted" });
      }
    }
  }
  if (blockers.some((blocker) => blocker.reason !== "dependency_not_accepted" && blocker.reason !== "dependency_snapshot_missing")) {
    return { status: "blocked", blockers };
  }
  if (hasPending) return { status: "pending", blockers };
  return dependencies.some((stack) => stack.includes(pr.number)) ? { status: "clear", blockers: [] } : { status: "none", blockers: [] };
}

function dependencyBlockerReason(labels: string[]): string | undefined {
  if (labels.includes("foundation-blocker")) return "foundation_blocker";
  if (labels.includes("blocked-stop-lane")) return "blocked_stop_lane";
  if (labels.includes("changes-requested") || labels.includes("audit:changes-requested") || labels.includes("state:rework")) {
    return "dependency_rework";
  }
  return undefined;
}

function dependencyAccepted(labels: string[]): boolean {
  return labels.includes("state:done") || labels.includes("merge-ready") || labels.includes("audit:l3-passed");
}

function priorityBucketFor(
  pr: ConveyorPullRequestSnapshot,
  evidenceStatus: ConveyorAuditSweeperTarget["evidence"]["status"],
  dependencyStatus: ConveyorAuditSweeperTarget["dependency_status"]["status"],
): ConveyorAuditSweeperTarget["priority_bucket"] {
  if (pr.labels.includes("foundation-blocker") || pr.labels.includes("blocked-stop-lane")) return "stop_lane";
  if (pr.labels.includes("changes-requested") || pr.labels.includes("audit:changes-requested") || pr.labels.includes("state:rework")) {
    return "re_audit_after_changes";
  }
  if (evidenceStatus === "stale" || evidenceStatus === "missing") return "stale_or_missing_evidence";
  if (dependencyStatus === "blocked" || dependencyStatus === "pending") return "dependency_blocked";
  return "normal";
}

function recommendationsFor(input: {
  auditLevel: ConveyorAuditRole;
  evidenceStatus: ConveyorAuditSweeperTarget["evidence"]["status"];
  priorAudit: ConveyorAuditSweeperTarget["prior_audit"];
  dependencyStatus: ConveyorAuditSweeperTarget["dependency_status"];
  riskRoute: ConveyorAuditSweeperTarget["risk_route"];
}): string[] {
  const recommendations: string[] = [];
  if (input.evidenceStatus === "stale") recommendations.push("re_audit_exact_head_required");
  if (input.evidenceStatus === "missing") recommendations.push("audit_evidence_missing");
  if (input.priorAudit.missing.length > 0) recommendations.push("prior_exact_head_pass_missing");
  if (input.priorAudit.stale.length > 0) recommendations.push("prior_exact_head_pass_stale");
  if (input.dependencyStatus.status === "blocked" || input.dependencyStatus.status === "pending") {
    recommendations.push("review_dependency_watermark_before_final_verdict");
  }
  if (input.auditLevel === "l1" && input.riskRoute !== "normal") recommendations.push("escalate_or_route_l2");
  return unique(recommendations);
}

function dispatchReason(
  auditLevel: ConveyorAuditRole,
  priorityBucket: ConveyorAuditSweeperTarget["priority_bucket"],
): string {
  if (priorityBucket === "stop_lane") return `${auditLevel}: stop-lane/foundation blocker first`;
  if (priorityBucket === "re_audit_after_changes") return `${auditLevel}: re-audit after requested changes`;
  if (priorityBucket === "stale_or_missing_evidence") return `${auditLevel}: evidence missing or stale at current head`;
  if (priorityBucket === "dependency_blocked") return `${auditLevel}: dependency watermark needs review`;
  return `${auditLevel}: canonical state dispatch`;
}

function riskClassFor(pr: ConveyorPullRequestSnapshot): ConveyorAuditSweeperTarget["risk_class"] {
  for (const label of pr.labels) {
    const normalized = label.toUpperCase();
    const match = normalized.match(/(?:^|[:_-])(R[0-4])$/);
    if (match) return match[1] as "R0" | "R1" | "R2" | "R3" | "R4";
  }
  return "unknown";
}

function summarizeTargets(targets: ConveyorAuditSweeperTarget[]): ConveyorAuditSweeperPlan["metrics"] {
  return {
    total_targets: targets.length,
    by_level: {
      l1: targets.filter((target) => target.audit_level === "l1").length,
      l2: targets.filter((target) => target.audit_level === "l2").length,
      l3: targets.filter((target) => target.audit_level === "l3").length,
    },
    stop_lane: targets.filter((target) => target.priority_bucket === "stop_lane").length,
    stale_or_missing_evidence: targets.filter((target) => target.priority_bucket === "stale_or_missing_evidence").length,
    dependency_blocked: targets.filter((target) => target.dependency_status.status === "blocked" || target.dependency_status.status === "pending").length,
    high_risk_or_unclear: targets.filter((target) => target.risk_route !== "normal").length,
  };
}

function compareTargets(left: ConveyorAuditSweeperTarget, right: ConveyorAuditSweeperTarget): number {
  return (
    priorityRank(left.priority_bucket) - priorityRank(right.priority_bucket) ||
    auditLevelRank(left.audit_level) - auditLevelRank(right.audit_level) ||
    repoRank(left.repo) - repoRank(right.repo) ||
    left.repo.localeCompare(right.repo) ||
    left.pr - right.pr
  );
}

function priorityRank(priority: ConveyorAuditSweeperTarget["priority_bucket"]): number {
  return ["stop_lane", "re_audit_after_changes", "stale_or_missing_evidence", "dependency_blocked", "normal"].indexOf(priority);
}

function auditLevelRank(level: ConveyorAuditRole): number {
  return ["l1", "l2", "l3"].indexOf(level);
}

function repoRank(repo: string): number {
  const index = REPO_PRIORITY.indexOf(repo);
  return index >= 0 ? index : REPO_PRIORITY.length;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
