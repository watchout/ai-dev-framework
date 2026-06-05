import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  reconcileConveyor,
  type ConveyorReconcileInput,
  type ConveyorMode,
  type ConveyorAuditRole,
  type ConveyorAuditVerdict,
} from "../lib/conveyor-reconciler.js";
import {
  buildConveyorTickManifest,
  type ConveyorManifestInput,
  type ConveyorTickManifest,
} from "../lib/conveyor-manifest.js";
import {
  buildConveyorClaimEvidence,
  buildConveyorRoleView,
  isConveyorActorRole,
  selectConveyorRoleNextTarget,
  validateConveyorRoleLabelChange,
  type ConveyorClaimEvidence,
  type ConveyorActorRole,
  type ConveyorRoleAuthorityCheck,
  type ConveyorRoleView,
} from "../lib/conveyor-role-view.js";
import {
  buildProfiledConveyorRoleView,
  isConveyorProfileRole,
  type ConveyorProfileRole,
  type ConveyorProfiledRoleView,
  type ConveyorProjectProfile,
} from "../lib/conveyor-profile.js";
import {
  buildConveyorLabelSyncPlan,
  type ConveyorLabelSyncPlan,
} from "../lib/conveyor-label-sync.js";
import {
  buildConveyorStackGateReport,
  type ConveyorStackGateReport,
} from "../lib/conveyor-stack-gate.js";
import {
  buildConveyorAuditSweeperPlan,
  type ConveyorAuditSweeperLevel,
  type ConveyorAuditSweeperPlan,
} from "../lib/conveyor-audit-sweeper.js";
import {
  buildConveyorLiveStateReport,
  type ConveyorLiveStateInput,
  type ConveyorLiveStateReport,
} from "../lib/conveyor-live-state.js";
import { logger } from "../lib/logger.js";

interface ConveyorReconcileOptions {
  fixture?: string;
  json?: boolean;
  apply?: boolean;
}

interface ConveyorNextOptions extends ConveyorReconcileOptions {
  role?: string;
  profile?: string;
  previousProfile?: string;
  claim?: boolean;
  claimedBy?: string;
  claimTtlMinutes?: string;
  claimedAt?: string;
}

interface ConveyorAuditSweeperOptions extends ConveyorReconcileOptions {
  level?: string;
  profile?: string;
  previousProfile?: string;
}

interface ConveyorCheckOptions {
  role?: string;
  addLabel?: string[];
  removeLabel?: string[];
  json?: boolean;
}

interface ConveyorAuditReportOptions {
  repo?: string;
  pr?: string;
  role?: string;
  verdict?: string;
  head?: string;
  base?: string;
  route?: string;
  nextStateRecommendation?: string;
  reportedBy?: string;
  recordedAt?: string;
  template?: boolean;
  json?: boolean;
}

export function registerConveyorCommand(program: Command): void {
  const conveyor = program
    .command("conveyor")
    .description("Inspect and reconcile PR Conveyor lane state");

  conveyor
    .command("reconcile")
    .description("Run deterministic conveyor label/state reconciliation from a snapshot fixture")
    .option("--fixture <path>", "JSON snapshot with pull_requests and optional config")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply reconciliation to the in-memory snapshot result; does not mutate GitHub")
    .action((options: ConveyorReconcileOptions) => {
      runConveyorAction(options, () => {
        if (!options.fixture) {
          throw new Error("Missing --fixture. Live GitHub reconciliation is reserved for a later label-sync PR.");
        }
        const input = JSON.parse(readFileSync(options.fixture, "utf8")) as ConveyorReconcileInput;
        const mode: ConveyorMode = options.apply ? "apply" : "dry-run";
        const report = reconcileConveyor(input, mode);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatConveyorReport(report));
      });
    });

  const labels = conveyor
    .command("labels")
    .description("Inspect Conveyor label sync plans");

  labels
    .command("sync")
    .description("Build an observe-only Conveyor label sync plan from a snapshot fixture")
    .option("--fixture <path>", "JSON snapshot with pull_requests and optional config")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply reconciliation to the in-memory plan result; does not mutate GitHub")
    .action((options: ConveyorReconcileOptions) => {
      runConveyorAction(options, () => {
        if (!options.fixture) {
          throw new Error("Missing --fixture. Live GitHub label mutation is reserved for a later authorized PR.");
        }
        const input = JSON.parse(readFileSync(options.fixture, "utf8")) as ConveyorReconcileInput;
        const mode: ConveyorMode = options.apply ? "apply" : "dry-run";
        const plan = buildConveyorLabelSyncPlan(input, mode);
        if (options.json) {
          process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatLabelSyncPlan(plan));
      });
    });

  const stack = conveyor
    .command("stack")
    .description("Inspect Conveyor dependency stack gates");

  stack
    .command("gate")
    .description("Build an observe-only foundation blocker gate report from a snapshot fixture")
    .option("--fixture <path>", "JSON snapshot with pull_requests and dependency config")
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorReconcileOptions) => {
      runConveyorAction(options, () => {
        if (!options.fixture) {
          throw new Error("Missing --fixture. Live GitHub stack mutation is reserved for a later authorized PR.");
        }
        const input = JSON.parse(readFileSync(options.fixture, "utf8")) as ConveyorReconcileInput;
        const report = buildConveyorStackGateReport(input);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatStackGateReport(report));
      });
    });

  const auditSweeper = conveyor
    .command("audit-sweeper")
    .description("Inspect read-only cross-repo Audit Sweeper dispatch plans");

  auditSweeper
    .command("plan")
    .description("Build a read-only Audit Sweeper plan from a snapshot fixture and optional project profile")
    .option("--fixture <path>", "JSON snapshot with pull_requests and optional config")
    .option("--profile <path>", "JSON Conveyor project profile; filters repo scope")
    .option("--previous-profile <path>", "Previous JSON Conveyor project profile for profile_scope_changed reporting")
    .option("--level <level>", "Audit level: l1, l2, l3, or all", "all")
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorAuditSweeperOptions) => {
      runConveyorAction(options, () => {
        const input = readManifestFixture(options.fixture);
        const profile = options.profile ? readConveyorProfile(options.profile) : undefined;
        const previousProfile = options.previousProfile ? readConveyorProfile(options.previousProfile) : undefined;
        const plan = buildConveyorAuditSweeperPlan({
          manifest: input,
          level: parseAuditSweeperLevel(options.level),
          mode: "dry-run",
          profile,
          previousProfile,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatAuditSweeperPlan(plan));
      });
    });

  const liveState = conveyor
    .command("live-state")
    .description("Inspect read-only Conveyor live deployed commit reconciliation");

  liveState
    .command("reconcile")
    .description("Build a read-only deployed commit reconciliation report from a snapshot fixture")
    .option("--fixture <path>", "JSON snapshot with deployments, merged_heads, and optional pull_requests")
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorReconcileOptions) => {
      runConveyorAction(options, () => {
        if (!options.fixture) {
          throw new Error("Missing --fixture. Live checkout probing is reserved for a later guarded PR.");
        }
        const input = JSON.parse(readFileSync(options.fixture, "utf8")) as ConveyorLiveStateInput;
        const report = buildConveyorLiveStateReport(input, "dry-run");
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatLiveStateReport(report));
      });
    });

  conveyor
    .command("tick")
    .description("Build a deterministic conveyor lane manifest from a snapshot fixture")
    .option("--fixture <path>", "JSON snapshot with issues, pull_requests, and optional config")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply reconciliation to the in-memory snapshot result; does not mutate GitHub")
    .action((options: ConveyorReconcileOptions) => {
      runConveyorAction(options, () => {
        const input = readManifestFixture(options.fixture);
        const mode: ConveyorMode = options.apply ? "apply" : "dry-run";
        const manifest = buildConveyorTickManifest(input, mode);
        if (options.json) {
          process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatConveyorManifest(manifest));
      });
    });

  conveyor
    .command("next")
    .description("Select the next deterministic target for a conveyor role from a snapshot fixture")
    .requiredOption("--role <role>", "Role lane: implementation, l1, l2, l3, ceo, rework, blocked, checker, aun_mirror, or profile role aliases")
    .option("--fixture <path>", "JSON snapshot with issues, pull_requests, and optional config")
    .option("--profile <path>", "JSON Conveyor project profile; filters repo scope and role query")
    .option("--previous-profile <path>", "Previous JSON Conveyor project profile for profile_scope_changed reporting")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply reconciliation to the in-memory snapshot result; does not mutate GitHub")
    .option("--claim", "Emit append-only claim evidence for the selected target; does not post to GitHub")
    .option("--claimed-by <actor>", "Actor id to include in claim evidence")
    .option("--claim-ttl-minutes <minutes>", "Claim expiry window in minutes", "30")
    .option("--claimed-at <timestamp>", "ISO timestamp for deterministic claim evidence")
    .action((options: ConveyorNextOptions) => {
      runConveyorAction(options, () => {
        const input = readManifestFixture(options.fixture);
        const mode: ConveyorMode = options.apply ? "apply" : "dry-run";
        const profile = options.profile ? readConveyorProfile(options.profile) : undefined;
        const previousProfile = options.previousProfile ? readConveyorProfile(options.previousProfile) : undefined;
        const { role, view } = profile
          ? buildProfiledNextView(input, profile, previousProfile, options.role, mode)
          : buildNextView(input, options.role, mode);
        const target = selectConveyorRoleNextTarget(view);
        const claim = options.claim && target
          ? buildConveyorClaimEvidence({
              role: isConveyorActorRole(role) ? role : view.role,
              target,
              actor: options.claimedBy ?? process.env.USER ?? "conveyor",
              claimedAt: options.claimedAt ?? new Date().toISOString(),
              ttlMinutes: parseClaimTtlMinutes(options.claimTtlMinutes),
            })
          : undefined;
        const payload = {
          schema: "shirube-conveyor-next-target/v1",
          mode,
          role,
          claim_mode: options.claim ? "evidence_only" : "off",
          query: view.query,
          authority_notes: view.authority_notes,
          excluded: view.excluded,
          target: target ?? null,
          claim: claim ?? null,
          ...(isProfiledRoleView(view)
            ? {
                normalized_role: view.normalized_role,
                profile: view.profile,
                profile_scope_changed: view.profile_scope_changed,
                role_query: view.role_query,
                context_recovery: view.profile.context_recovery,
              }
            : {}),
        };
        if (options.json) {
          process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatNextTarget(payload));
      });
    });

  conveyor
    .command("check")
    .description("Validate Conveyor role authority for proposed label changes; does not mutate GitHub")
    .requiredOption("--role <role>", "Conveyor actor role")
    .option("--add-label <label>", "Proposed label to add", collectOption, [])
    .option("--remove-label <label>", "Proposed label to remove", collectOption, [])
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorCheckOptions) => {
      runConveyorAction(options, () => {
        const role = parseRole(options.role);
        const report = validateConveyorRoleLabelChange({
          role,
          add: options.addLabel,
          remove: options.removeLabel,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatAuthorityCheck(report));
      });
    });

  conveyor
    .command("audit-report")
    .description("Render a durable conveyor audit evidence block; does not post to GitHub")
    .option("--repo <repo>", "Repository name, for example watchout/agent-memory")
    .option("--pr <number>", "Pull request number")
    .option("--role <role>", "Audit role: l1, l2, or l3")
    .option("--verdict <verdict>", "PASS, BLOCK, CHANGES_REQUESTED, HOLD, STALE_HEAD, or NEEDS_INFO")
    .option("--head <sha>", "Exact current PR head SHA")
    .option("--base <ref>", "Exact current PR base branch or base SHA")
    .option("--route <route>", "Audit route, for example l1, l2, l3, standard, or strict", "standard")
    .option("--next-state-recommendation <state>", "Recommended next state/operation")
    .option("--reported-by <actor>", "Actor id for the evidence block", "conveyor")
    .option("--recorded-at <timestamp>", "ISO timestamp; defaults to current time")
    .option("--template", "Render a fill-in L1/L2/L3 audit-result template")
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorAuditReportOptions) => {
      runConveyorAction(options, () => {
        if (options.template) {
          const template = buildAuditReportTemplate(options);
          if (options.json) {
            process.stdout.write(JSON.stringify(template, null, 2) + "\n");
            return;
          }
          process.stdout.write(template.body);
          return;
        }
        const evidence = buildAuditReportEvidence(options);
        if (options.json) {
          process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatAuditReportEvidence(evidence));
      });
    });
}

function runConveyorAction(options: ConveyorReconcileOptions, action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      process.stdout.write(JSON.stringify({ error: { message } }, null, 2) + "\n");
    } else {
      logger.error(message);
    }
    process.exitCode = 1;
  }
}

function readManifestFixture(fixture: string | undefined): ConveyorManifestInput {
  if (!fixture) {
    throw new Error("Missing --fixture. Live GitHub discovery is reserved for a later conveyor tick PR.");
  }
  return JSON.parse(readFileSync(fixture, "utf8")) as ConveyorManifestInput;
}

function readConveyorProfile(profilePath: string): ConveyorProjectProfile {
  return JSON.parse(readFileSync(profilePath, "utf8")) as ConveyorProjectProfile;
}

function parseRole(role: string | undefined): ConveyorActorRole {
  if (!role || !isConveyorActorRole(role)) {
    throw new Error("Invalid --role. Expected implementation, l1, l2, l3, ceo, rework, blocked, checker, or aun_mirror.");
  }
  return role;
}

function parseProfileRole(role: string | undefined): ConveyorProfileRole {
  if (!role || !isConveyorProfileRole(role)) {
    throw new Error("Invalid --role. Expected a Conveyor role or profile role alias.");
  }
  return role;
}

function parseAuditSweeperLevel(level: string | undefined): ConveyorAuditSweeperLevel {
  if (level === "l1" || level === "l2" || level === "l3" || level === "all") return level;
  throw new Error("Invalid --level. Expected l1, l2, l3, or all.");
}

function parseClaimTtlMinutes(value: string | undefined): number {
  const ttl = Number(value ?? "30");
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("Invalid --claim-ttl-minutes. Expected a positive number.");
  }
  return ttl;
}

function buildNextView(
  input: ConveyorManifestInput,
  roleInput: string | undefined,
  mode: ConveyorMode,
): { role: ConveyorActorRole; view: ConveyorRoleView } {
  const role = parseRole(roleInput);
  return { role, view: buildConveyorRoleView(input, role, mode) };
}

function buildProfiledNextView(
  input: ConveyorManifestInput,
  profile: ConveyorProjectProfile,
  previousProfile: ConveyorProjectProfile | undefined,
  roleInput: string | undefined,
  mode: ConveyorMode,
): { role: ConveyorProfileRole; view: ConveyorProfiledRoleView } {
  const role = parseProfileRole(roleInput);
  return {
    role,
    view: buildProfiledConveyorRoleView({ manifest: input, profile, previousProfile, role, mode }),
  };
}

function isProfiledRoleView(view: ConveyorRoleView | ConveyorProfiledRoleView): view is ConveyorProfiledRoleView {
  return "profile" in view;
}

function parseAuditRole(role: string | undefined): ConveyorAuditRole {
  if (role === "l1" || role === "l2" || role === "l3") return role;
  throw new Error("Invalid --role. Expected l1, l2, or l3.");
}

function parseAuditVerdict(verdict: string | undefined): ConveyorAuditVerdict {
  const normalized = verdict?.toUpperCase();
  if (
    normalized === "PASS" ||
    normalized === "BLOCK" ||
    normalized === "CHANGES_REQUESTED" ||
    normalized === "HOLD" ||
    normalized === "STALE_HEAD" ||
    normalized === "NEEDS_INFO"
  ) {
    return normalized;
  }
  throw new Error("Invalid --verdict. Expected PASS, BLOCK, CHANGES_REQUESTED, HOLD, STALE_HEAD, or NEEDS_INFO.");
}

function buildAuditReportEvidence(options: ConveyorAuditReportOptions): {
  schema: "conveyor:audit-result/v1";
  repo: string;
  pr: number;
  role: ConveyorAuditRole;
  verdict: ConveyorAuditVerdict;
  head: string;
  base: string;
  route: string;
  next_state_recommendation: string;
  reported_by: string;
  recorded_at: string;
} {
  const common = parseAuditReportCommon(options);
  if (!options.verdict) throw new Error("Missing --verdict.");
  if (!options.nextStateRecommendation) throw new Error("Missing --next-state-recommendation.");
  return {
    schema: "conveyor:audit-result/v1",
    repo: common.repo,
    pr: common.pr,
    role: common.role,
    verdict: parseAuditVerdict(options.verdict),
    head: common.head,
    base: common.base,
    route: common.route,
    next_state_recommendation: options.nextStateRecommendation,
    reported_by: options.reportedBy ?? "conveyor",
    recorded_at: options.recordedAt ?? new Date().toISOString(),
  };
}

function buildAuditReportTemplate(options: ConveyorAuditReportOptions): {
  schema: "shirube-conveyor-audit-result-template/v1";
  repo: string;
  pr: number;
  role: ConveyorAuditRole;
  head: string;
  base: string;
  route: string;
  body: string;
} {
  const common = parseAuditReportCommon(options);
  const body = formatAuditReportEvidence({
    schema: "conveyor:audit-result/v1",
    repo: common.repo,
    pr: common.pr,
    role: common.role,
    verdict: "<PASS|BLOCK|STALE_HEAD|NEEDS_INFO>" as ConveyorAuditVerdict,
    head: common.head,
    base: common.base,
    route: common.route,
    next_state_recommendation: defaultNextStateRecommendation(common.role),
    reported_by: options.reportedBy ?? "<auditor>",
    recorded_at: options.recordedAt ?? "<iso8601>",
  });
  return {
    schema: "shirube-conveyor-audit-result-template/v1",
    repo: common.repo,
    pr: common.pr,
    role: common.role,
    head: common.head,
    base: common.base,
    route: common.route,
    body,
  };
}

function parseAuditReportCommon(options: ConveyorAuditReportOptions): {
  repo: string;
  pr: number;
  role: ConveyorAuditRole;
  head: string;
  base: string;
  route: string;
} {
  if (!options.repo) throw new Error("Missing --repo.");
  if (!options.pr || !Number.isInteger(Number(options.pr))) throw new Error("Invalid --pr.");
  if (!options.head) throw new Error("Missing --head.");
  if (!options.base) throw new Error("Missing --base.");
  return {
    repo: options.repo,
    pr: Number(options.pr),
    role: parseAuditRole(options.role),
    head: options.head,
    base: options.base,
    route: options.route ?? "standard",
  };
}

function defaultNextStateRecommendation(role: ConveyorAuditRole): string {
  if (role === "l1") return "<state:impl-l2|state:impl-l3|state:rework|no_transition>";
  if (role === "l2") return "<state:impl-l3|state:rework|no_transition>";
  return "<state:done+merge-ready|state:rework|no_transition>";
}

function formatConveyorReport(report: ReturnType<typeof reconcileConveyor>): string {
  const lines = [
    `Shirube Conveyor Reconcile (${report.mode})`,
    `Changed: ${report.changed ? "yes" : "no"}`,
    "",
  ];
  for (const pr of report.prs) {
    const added = pr.changes.add.length ? pr.changes.add.join(", ") : "-";
    const removed = pr.changes.remove.length ? pr.changes.remove.join(", ") : "-";
    const skipped = pr.skipped.length ? ` skipped=${pr.skipped.join(",")}` : "";
    const findings = pr.findings.length ? ` findings=${pr.findings.join(",")}` : "";
    lines.push(`${pr.repo}#${pr.pr} add=[${added}] remove=[${removed}]${skipped}${findings}`);
  }
  if (report.dependency_releases.length > 0) {
    lines.push("", "Dependency releases:");
    for (const release of report.dependency_releases) {
      lines.push(`${release.repo}#${release.predecessor} -> #${release.released} (${release.state})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatLabelSyncPlan(plan: ConveyorLabelSyncPlan): string {
  const lines = [
    `Shirube Conveyor Label Sync (${plan.mode})`,
    `Safe to apply remotely: ${plan.safe_to_apply ? "yes" : "no"}`,
    "",
  ];
  for (const action of plan.actions) {
    const added = action.add.length ? action.add.join(", ") : "-";
    const removed = action.remove.length ? action.remove.join(", ") : "-";
    const blocked = action.blocked ? " blocked" : "";
    const findings = action.findings.length ? ` findings=${action.findings.map((finding) => finding.code).join(",")}` : "";
    lines.push(`${action.repo}#${action.pr} add=[${added}] remove=[${removed}]${blocked}${findings}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatStackGateReport(report: ConveyorStackGateReport): string {
  const lines = [
    "Shirube Conveyor Stack Gate",
    `Safe to advance dependents: ${report.safe_to_advance_dependents ? "yes" : "no"}`,
    "",
  ];
  for (const dependent of report.blocked_dependents) {
    const add = dependent.recommended_add.length ? dependent.recommended_add.join(", ") : "-";
    const remove = dependent.recommended_remove.length ? dependent.recommended_remove.join(", ") : "-";
    lines.push(
      `${dependent.repo}#${dependent.pr} blocked by #${dependent.blocker_pr} add=[${add}] remove=[${remove}] state=${dependent.current_state ?? "-"}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatAuditSweeperPlan(plan: ConveyorAuditSweeperPlan): string {
  const lines = [
    `Shirube Conveyor Audit Sweeper (${plan.mode}, ${plan.level})`,
    `Targets: ${plan.metrics.total_targets}`,
    "",
  ];
  for (const target of plan.targets) {
    lines.push(
      `${target.audit_level} ${target.repo}#${target.pr} head=${target.head} bucket=${target.priority_bucket} evidence=${target.evidence.status}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatLiveStateReport(report: ConveyorLiveStateReport): string {
  const lines = [
    `Shirube Conveyor Live State (${report.mode})`,
    `Unreviewed deployed commits: ${report.metrics.unreviewed_deployed_commit_count}`,
    "",
  ];
  for (const deployment of report.deployments) {
    const head = deployment.deployed_head ? ` head=${deployment.deployed_head}` : "";
    const reasons = deployment.reason_codes.length ? ` reasons=${deployment.reason_codes.join(",")}` : "";
    const stop = deployment.stop_lane ? " stop-lane" : "";
    lines.push(`${deployment.component} ${deployment.repo}${head} status=${deployment.status}${stop}${reasons}`);
    for (const action of deployment.next_actions) {
      lines.push(`  next: ${action}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatConveyorManifest(manifest: ConveyorTickManifest): string {
  const lines = [`Shirube Conveyor Tick (${manifest.mode})`, ""];
  for (const lane of Object.values(manifest.lanes)) {
    lines.push(`${lane.role}:`);
    if (lane.targets.length === 0) {
      lines.push("  -");
      continue;
    }
    for (const target of lane.targets) {
      const head = target.head ? ` head=${target.head}` : "";
      const reason = target.reason ? ` reason=${target.reason}` : "";
      lines.push(`  ${target.repo}#${target.number} ${target.kind}${head}${reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatNextTarget(payload: {
  role: string;
  claim_mode?: string;
  query: string;
  authority_notes?: string[];
  excluded?: ConveyorRoleView["excluded"];
  target: ReturnType<typeof selectConveyorRoleNextTarget> | null;
  claim?: ConveyorClaimEvidence | null;
}): string {
  if (!payload.target) {
    return `No target for ${payload.role} (${payload.query})\n`;
  }
  const head = payload.target.head ? ` head=${payload.target.head}` : "";
  const lines = [`Next ${payload.role}: ${payload.target.repo}#${payload.target.number} ${payload.target.kind}${head}`];
  if (payload.claim) {
    lines.push("", "Claim evidence (not posted):", payload.claim.comment_body.trimEnd());
  }
  return `${lines.join("\n")}\n`;
}

function formatAuthorityCheck(report: ConveyorRoleAuthorityCheck): string {
  if (report.authorized) {
    return `Conveyor role check: authorized for ${report.role}\n`;
  }
  const lines = [`Conveyor role check: denied for ${report.role}`];
  for (const violation of report.violations) {
    lines.push(`- ${violation.operation} ${violation.label}: ${violation.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function formatAuditReportEvidence(evidence: ReturnType<typeof buildAuditReportEvidence>): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${evidence.repo}`,
    `pr: ${evidence.pr}`,
    `role: ${evidence.role}`,
    `verdict: ${evidence.verdict}`,
    `head: ${evidence.head}`,
    `base: ${evidence.base}`,
    `route: ${evidence.route}`,
    `next_state_recommendation: ${evidence.next_state_recommendation}`,
    `reported_by: ${evidence.reported_by}`,
    `recorded_at: ${evidence.recorded_at}`,
    "",
    "Findings:",
    "- <fill audit findings>",
    "",
    "Evidence:",
    "- <fill validation evidence>",
    "",
  ].join("\n");
}
