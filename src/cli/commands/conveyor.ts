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
  isConveyorRole,
  selectConveyorNextTarget,
  type ConveyorManifestInput,
  type ConveyorRole,
  type ConveyorTickManifest,
} from "../lib/conveyor-manifest.js";
import {
  buildConveyorLabelSyncPlan,
  type ConveyorLabelSyncPlan,
} from "../lib/conveyor-label-sync.js";
import {
  buildConveyorStackGateReport,
  type ConveyorStackGateReport,
} from "../lib/conveyor-stack-gate.js";
import { logger } from "../lib/logger.js";

interface ConveyorReconcileOptions {
  fixture?: string;
  json?: boolean;
  apply?: boolean;
}

interface ConveyorNextOptions extends ConveyorReconcileOptions {
  role?: string;
}

interface ConveyorAuditReportOptions {
  repo?: string;
  pr?: string;
  role?: string;
  verdict?: string;
  head?: string;
  reportedBy?: string;
  recordedAt?: string;
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
    .requiredOption("--role <role>", "Role lane: implementation, l1, l2, l3, ceo, rework, or blocked")
    .option("--fixture <path>", "JSON snapshot with issues, pull_requests, and optional config")
    .option("--json", "Output machine-readable JSON")
    .option("--apply", "Apply reconciliation to the in-memory snapshot result; does not mutate GitHub")
    .action((options: ConveyorNextOptions) => {
      runConveyorAction(options, () => {
        const role = parseRole(options.role);
        const input = readManifestFixture(options.fixture);
        const mode: ConveyorMode = options.apply ? "apply" : "dry-run";
        const manifest = buildConveyorTickManifest(input, mode);
        const target = selectConveyorNextTarget(manifest, role);
        const payload = {
          schema: "shirube-conveyor-next-target/v1",
          mode,
          role,
          query: manifest.lanes[role].query,
          target: target ?? null,
        };
        if (options.json) {
          process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
          return;
        }
        process.stdout.write(formatNextTarget(payload));
      });
    });

  conveyor
    .command("audit-report")
    .description("Render a durable conveyor audit evidence block; does not post to GitHub")
    .requiredOption("--repo <repo>", "Repository name, for example watchout/agent-memory")
    .requiredOption("--pr <number>", "Pull request number")
    .requiredOption("--role <role>", "Audit role: l1, l2, or l3")
    .requiredOption("--verdict <verdict>", "PASS, BLOCK, CHANGES_REQUESTED, or HOLD")
    .requiredOption("--head <sha>", "Exact current PR head SHA")
    .option("--reported-by <actor>", "Actor id for the evidence block", "conveyor")
    .option("--recorded-at <timestamp>", "ISO timestamp; defaults to current time")
    .option("--json", "Output machine-readable JSON")
    .action((options: ConveyorAuditReportOptions) => {
      runConveyorAction(options, () => {
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

function parseRole(role: string | undefined): ConveyorRole {
  if (!role || !isConveyorRole(role)) {
    throw new Error("Invalid --role. Expected implementation, l1, l2, l3, ceo, rework, or blocked.");
  }
  return role;
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
    normalized === "HOLD"
  ) {
    return normalized;
  }
  throw new Error("Invalid --verdict. Expected PASS, BLOCK, CHANGES_REQUESTED, or HOLD.");
}

function buildAuditReportEvidence(options: ConveyorAuditReportOptions): {
  schema: "conveyor:audit-result/v1";
  repo: string;
  pr: number;
  role: ConveyorAuditRole;
  verdict: ConveyorAuditVerdict;
  head: string;
  reported_by: string;
  recorded_at: string;
} {
  if (!options.repo) throw new Error("Missing --repo.");
  if (!options.pr || !Number.isInteger(Number(options.pr))) throw new Error("Invalid --pr.");
  if (!options.head) throw new Error("Missing --head.");
  return {
    schema: "conveyor:audit-result/v1",
    repo: options.repo,
    pr: Number(options.pr),
    role: parseAuditRole(options.role),
    verdict: parseAuditVerdict(options.verdict),
    head: options.head,
    reported_by: options.reportedBy ?? "conveyor",
    recorded_at: options.recordedAt ?? new Date().toISOString(),
  };
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
  role: ConveyorRole;
  query: string;
  target: ReturnType<typeof selectConveyorNextTarget> | null;
}): string {
  if (!payload.target) {
    return `No target for ${payload.role} (${payload.query})\n`;
  }
  const head = payload.target.head ? ` head=${payload.target.head}` : "";
  return `Next ${payload.role}: ${payload.target.repo}#${payload.target.number} ${payload.target.kind}${head}\n`;
}

function formatAuditReportEvidence(evidence: ReturnType<typeof buildAuditReportEvidence>): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${evidence.repo}`,
    `pr: ${evidence.pr}`,
    `role: ${evidence.role}`,
    `verdict: ${evidence.verdict}`,
    `head: ${evidence.head}`,
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
