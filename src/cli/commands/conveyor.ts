import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  reconcileConveyor,
  type ConveyorReconcileInput,
  type ConveyorMode,
} from "../lib/conveyor-reconciler.js";
import { logger } from "../lib/logger.js";

interface ConveyorReconcileOptions {
  fixture?: string;
  json?: boolean;
  apply?: boolean;
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
