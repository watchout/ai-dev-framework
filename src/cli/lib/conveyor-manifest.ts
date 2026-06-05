import {
  collectConveyorAuditEvidence,
  reconcileConveyor,
  type ConveyorMode,
  type ConveyorEvidenceSource,
  type ConveyorDependencyRelease,
  type ConveyorReconcilerConfig,
  type ConveyorPullRequestSnapshot,
  type ConveyorReconcileInput,
  type ConveyorReconcileReport,
} from "./conveyor-reconciler.js";

export type ConveyorRole = "implementation" | "l1" | "l2" | "l3" | "ceo" | "rework" | "blocked";

export interface ConveyorIssueSnapshot {
  repo: string;
  number: number;
  url?: string;
  title?: string;
  labels: string[];
  comments?: ConveyorEvidenceSource[];
}

export interface ConveyorManifestInput extends ConveyorReconcileInput {
  issues?: ConveyorIssueSnapshot[];
  deployments?: ConveyorDeploymentSnapshot[];
  merged_heads?: Record<string, string[]>;
}

export interface ConveyorDeploymentSnapshot {
  component: string;
  repo: string;
  checkout_path?: string;
  deployed_head?: string;
  observed_at?: string;
}

export interface ConveyorTarget {
  kind: "issue" | "pr";
  repo: string;
  number: number;
  url?: string;
  title?: string;
  head?: string;
  labels: string[];
  merge_state?: string;
  skipped: string[];
  findings: string[];
  reason?: string;
}

export interface ConveyorLaneManifest {
  role: ConveyorRole;
  query: string;
  targets: ConveyorTarget[];
}

export interface ConveyorOpsTarget {
  kind: "issue" | "pr";
  repo: string;
  number: number;
  url?: string;
  title?: string;
  head?: string;
  labels: string[];
  reason_codes: string[];
  recommended_add: string[];
  recommended_remove: string[];
}

export interface ConveyorMergedStaleStateCleanup extends ConveyorOpsTarget {
  merge_state?: string;
}

export interface ConveyorDeploymentBlocker {
  component: string;
  repo: string;
  checkout_path?: string;
  deployed_head?: string;
  status: "missing_deployed_head" | "unreviewed_deployed_commit";
  reason_codes: string[];
  represented_by?: {
    repo: string;
    pr: number;
    head: string;
  };
  next_actions: string[];
}

export interface ConveyorLaneQueueSummary {
  role: ConveyorRole;
  count: number;
  targets: ConveyorTarget[];
}

export interface ConveyorCurrentOps {
  schema: "shirube-conveyor-current-ops/v1";
  safe_to_apply: false;
  lane_queues: Record<ConveyorRole, ConveyorLaneQueueSummary>;
  reconcile_backlog: ConveyorOpsTarget[];
  dirty_audit_queue: ConveyorOpsTarget[];
  merged_stale_state_cleanup: ConveyorMergedStaleStateCleanup[];
  dependency_release_candidates: ConveyorDependencyRelease[];
  human_approval_notifications: ConveyorOpsTarget[];
  unreviewed_deployed_commit_blockers: ConveyorDeploymentBlocker[];
  metrics: {
    lane_targets: Record<ConveyorRole, number>;
    reconcile_backlog: number;
    dirty_audit_queue: number;
    merged_stale_state_cleanup: number;
    dependency_release_candidates: number;
    human_approval_notifications: number;
    unreviewed_deployed_commit_blockers: number;
  };
  authority_notes: string[];
}

export interface ConveyorTickManifest {
  schema: "shirube-conveyor-tick-manifest/v1";
  mode: ConveyorMode;
  execution_mode: "batch";
  judgment_unit: "pull_request";
  dependency_order: string[][];
  lanes: Record<ConveyorRole, ConveyorLaneManifest>;
  current_ops: ConveyorCurrentOps;
  reconcile: ConveyorReconcileReport;
}

const ROLE_STATE: Partial<Record<ConveyorRole, string>> = {
  l1: "state:impl-l1",
  l2: "state:impl-l2",
  l3: "state:impl-l3",
  ceo: "state:ceo-approval",
  rework: "state:rework",
  blocked: "state:blocked",
};

const ROLE_QUERY: Record<ConveyorRole, string> = {
  implementation: "state:open label:needs:implementation",
  l1: "state:open label:state:impl-l1",
  l2: "state:open label:state:impl-l2",
  l3: "state:open label:state:impl-l3",
  ceo: "state:open label:state:ceo-approval",
  rework: "state:open label:state:rework",
  blocked: "state:open label:state:blocked",
};

export function buildConveyorTickManifest(input: ConveyorManifestInput, mode: ConveyorMode = "dry-run"): ConveyorTickManifest {
  const reconcile = reconcileConveyor(input, mode);
  const pullRequestsByKey = new Map(input.pull_requests.map((pr) => [targetKey(pr.repo, pr.number), pr]));
  const lanes = emptyLanes();

  for (const issue of input.issues ?? []) {
    if (issue.labels.includes("needs:implementation")) {
      lanes.implementation.targets.push(issueTarget(issue));
    }
  }

  for (const report of reconcile.prs) {
    const original = pullRequestsByKey.get(targetKey(report.repo, report.pr));
    const target = prTarget(report, original);
    for (const role of ["l1", "l2", "l3", "ceo", "rework", "blocked"] as const) {
      const state = ROLE_STATE[role];
      if (state && report.final_labels.includes(state)) {
        target.reason = reasonForTarget(target, role);
        lanes[role].targets.push(target);
        break;
      }
    }
  }

  for (const lane of Object.values(lanes)) {
    lane.targets.sort(compareTargets);
  }

  const currentOps = buildCurrentOps(input, lanes, reconcile, pullRequestsByKey);

  return {
    schema: "shirube-conveyor-tick-manifest/v1",
    mode,
    execution_mode: "batch",
    judgment_unit: "pull_request",
    dependency_order: dependencyOrder(input.config?.dependencies),
    lanes,
    current_ops: currentOps,
    reconcile,
  };
}

export function selectConveyorNextTarget(manifest: ConveyorTickManifest, role: ConveyorRole): ConveyorTarget | undefined {
  return manifest.lanes[role].targets[0];
}

export function isConveyorRole(value: string): value is ConveyorRole {
  return ["implementation", "l1", "l2", "l3", "ceo", "rework", "blocked"].includes(value);
}

function emptyLanes(): Record<ConveyorRole, ConveyorLaneManifest> {
  return {
    implementation: lane("implementation"),
    l1: lane("l1"),
    l2: lane("l2"),
    l3: lane("l3"),
    ceo: lane("ceo"),
    rework: lane("rework"),
    blocked: lane("blocked"),
  };
}

function lane(role: ConveyorRole): ConveyorLaneManifest {
  return {
    role,
    query: ROLE_QUERY[role],
    targets: [],
  };
}

function issueTarget(issue: ConveyorIssueSnapshot): ConveyorTarget {
  return {
    kind: "issue",
    repo: issue.repo,
    number: issue.number,
    url: issue.url,
    title: issue.title,
    labels: unique(issue.labels).sort(),
    skipped: [],
    findings: [],
  };
}

function prTarget(
  report: ConveyorReconcileReport["prs"][number],
  original: ConveyorPullRequestSnapshot | undefined,
): ConveyorTarget {
  return {
    kind: "pr",
    repo: report.repo,
    number: report.pr,
    url: original?.url,
    title: original?.title,
    head: report.head,
    labels: report.final_labels,
    merge_state: original?.merge_state,
    skipped: report.skipped,
    findings: report.findings,
  };
}

function buildCurrentOps(
  input: ConveyorManifestInput,
  lanes: Record<ConveyorRole, ConveyorLaneManifest>,
  reconcile: ConveyorReconcileReport,
  pullRequestsByKey: Map<string, ConveyorPullRequestSnapshot>,
): ConveyorCurrentOps {
  const laneQueues = buildLaneQueueSummary(lanes);
  const laneTargets = Object.fromEntries(
    Object.entries(laneQueues).map(([role, queue]) => [role, queue.count]),
  ) as Record<ConveyorRole, number>;
  const reconcileBacklog: ConveyorOpsTarget[] = [];
  const dirtyAuditQueue: ConveyorOpsTarget[] = [];
  const mergedCleanup: ConveyorMergedStaleStateCleanup[] = [];
  const humanApproval: ConveyorOpsTarget[] = [];

  for (const report of reconcile.prs) {
    const original = pullRequestsByKey.get(targetKey(report.repo, report.pr));
    const reasonCodes = unique([...report.transition_plan.reason_codes, ...report.skipped, ...report.findings]);
    if (report.transition_plan.safe_to_apply) {
      reconcileBacklog.push(opsTarget(report, original, ["safe_transition_plan"]));
    }
    if (reasonCodes.length > 0 && hasAuditPendingLabel(report.final_labels)) {
      dirtyAuditQueue.push(opsTarget(report, original, reasonCodes));
    }
    if (original && isMergedPr(original) && hasStaleActiveState(original.labels)) {
      mergedCleanup.push(mergedCleanupTarget(report, original));
    }
    if (requiresHumanApproval(report.final_labels, original?.labels ?? [])) {
      humanApproval.push(opsTarget(report, original, ["human_approval_required"]));
    }
  }

  const deployedBlockers = buildDeploymentBlockers(input);

  return {
    schema: "shirube-conveyor-current-ops/v1",
    safe_to_apply: false,
    lane_queues: laneQueues,
    reconcile_backlog: reconcileBacklog.sort(compareOpsTargets),
    dirty_audit_queue: dirtyAuditQueue.sort(compareOpsTargets),
    merged_stale_state_cleanup: mergedCleanup.sort(compareOpsTargets),
    dependency_release_candidates: reconcile.dependency_releases,
    human_approval_notifications: humanApproval.sort(compareOpsTargets),
    unreviewed_deployed_commit_blockers: deployedBlockers,
    metrics: {
      lane_targets: laneTargets,
      reconcile_backlog: reconcileBacklog.length,
      dirty_audit_queue: dirtyAuditQueue.length,
      merged_stale_state_cleanup: mergedCleanup.length,
      dependency_release_candidates: reconcile.dependency_releases.length,
      human_approval_notifications: humanApproval.length,
      unreviewed_deployed_commit_blockers: deployedBlockers.length,
    },
    authority_notes: [
      "current_ops_tick_is_read_only",
      "dry_run_by_default",
      "no_merge_approval_draft_remove_deploy_restart_db_queue_discord_or_aun_dispatch",
    ],
  };
}

function buildLaneQueueSummary(lanes: Record<ConveyorRole, ConveyorLaneManifest>): Record<ConveyorRole, ConveyorLaneQueueSummary> {
  return Object.fromEntries(
    Object.entries(lanes).map(([role, lane]) => [
      role,
      {
        role: lane.role,
        count: lane.targets.length,
        targets: lane.targets,
      },
    ]),
  ) as Record<ConveyorRole, ConveyorLaneQueueSummary>;
}

function opsTarget(
  report: ConveyorReconcileReport["prs"][number],
  original: ConveyorPullRequestSnapshot | undefined,
  reasonCodes: string[],
): ConveyorOpsTarget {
  return {
    kind: "pr",
    repo: report.repo,
    number: report.pr,
    url: original?.url,
    title: original?.title,
    head: report.head,
    labels: report.final_labels,
    reason_codes: unique(reasonCodes),
    recommended_add: report.changes.add,
    recommended_remove: report.changes.remove,
  };
}

function mergedCleanupTarget(
  report: ConveyorReconcileReport["prs"][number],
  original: ConveyorPullRequestSnapshot,
): ConveyorMergedStaleStateCleanup {
  const staleLabels = original.labels.filter(isStaleMergedLabel);
  return {
    ...opsTarget(report, original, ["merged_pr_has_stale_active_state"]),
    merge_state: original.merge_state,
    recommended_add: ["state:done", "merged_closed"].filter((label) => !original.labels.includes(label)),
    recommended_remove: unique([...staleLabels, "audit-pending"].filter((label) => original.labels.includes(label))),
  };
}

function buildDeploymentBlockers(input: ConveyorManifestInput): ConveyorDeploymentBlocker[] {
  const blockers: ConveyorDeploymentBlocker[] = [];
  for (const deployment of input.deployments ?? []) {
    if (!deployment.deployed_head) {
      blockers.push({
        component: deployment.component,
        repo: deployment.repo,
        checkout_path: deployment.checkout_path,
        status: "missing_deployed_head",
        reason_codes: ["missing_deployed_head"],
        next_actions: ["record_live_probe_head_before_reconcile"],
      });
      continue;
    }
    if ((input.merged_heads?.[deployment.repo] ?? []).includes(deployment.deployed_head)) continue;

    const representedBy = findReviewedExactHeadPr(input.pull_requests, deployment.repo, deployment.deployed_head);
    if (representedBy) continue;

    const exactHeadPr = input.pull_requests.find((pr) => pr.repo === deployment.repo && pr.head === deployment.deployed_head);
    blockers.push({
      component: deployment.component,
      repo: deployment.repo,
      checkout_path: deployment.checkout_path,
      deployed_head: deployment.deployed_head,
      status: "unreviewed_deployed_commit",
      reason_codes: exactHeadPr
        ? ["deployed_head_pr_missing_pass_audit_evidence"]
        : ["no_merged_commit_or_reviewed_pr_for_deployed_head"],
      represented_by: exactHeadPr
        ? { repo: exactHeadPr.repo, pr: exactHeadPr.number, head: exactHeadPr.head }
        : undefined,
      next_actions: ["open_or_attach_pr_with_exact_head_audit_evidence", "hold_done_or_recovered_claim"],
    });
  }
  return blockers.sort((left, right) => left.repo.localeCompare(right.repo) || left.component.localeCompare(right.component));
}

function findReviewedExactHeadPr(
  pullRequests: ConveyorPullRequestSnapshot[],
  repo: string,
  head: string,
): ConveyorPullRequestSnapshot | undefined {
  return pullRequests.find((pr) =>
    pr.repo === repo &&
    pr.head === head &&
    collectConveyorAuditEvidence(pr).some((evidence) => evidence.head === head && evidence.verdict === "PASS")
  );
}

function reasonForTarget(target: ConveyorTarget, role: ConveyorRole): string | undefined {
  if (target.skipped.length > 0) return target.skipped.join(",");
  if (target.labels.includes("dependency-blocked")) return "dependency-blocked";
  if (role === "ceo") return "state:ceo-approval";
  if (role === "rework") return "state:rework";
  if (role === "blocked") return "state:blocked";
  return undefined;
}

function compareTargets(left: ConveyorTarget, right: ConveyorTarget): number {
  return left.repo === right.repo ? left.number - right.number : left.repo.localeCompare(right.repo);
}

function compareOpsTargets(left: ConveyorOpsTarget, right: ConveyorOpsTarget): number {
  return left.repo === right.repo ? left.number - right.number : left.repo.localeCompare(right.repo);
}

function targetKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

function dependencyOrder(dependencies: ConveyorReconcilerConfig["dependencies"] | undefined): string[][] {
  const order: string[][] = [];
  for (const [repo, stacks] of Object.entries(dependencies ?? {})) {
    for (const stack of stacks) {
      order.push(stack.map((pr) => `${repo}#${pr}`));
    }
  }
  return order;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function hasAuditPendingLabel(labels: string[]): boolean {
  return labels.includes("audit-pending") || labels.some((label) => label.startsWith("audit:") && label.endsWith("-pending"));
}

function isMergedPr(pr: ConveyorPullRequestSnapshot): boolean {
  return pr.merge_state?.toUpperCase() === "MERGED" || pr.labels.includes("merged_closed");
}

function hasStaleActiveState(labels: string[]): boolean {
  return labels.some(isStaleMergedLabel);
}

function isStaleMergedLabel(label: string): boolean {
  if (label === "state:done" || label === "merged_closed") return false;
  return label.startsWith("state:") ||
    label === "audit-pending" ||
    label.startsWith("audit:") && label.endsWith("-pending") ||
    label.startsWith("needs:");
}

function requiresHumanApproval(finalLabels: string[], originalLabels: string[]): boolean {
  return finalLabels.includes("state:ceo-approval") ||
    finalLabels.includes("needs:ceo-approval") ||
    originalLabels.includes("route:ceo-approval");
}
