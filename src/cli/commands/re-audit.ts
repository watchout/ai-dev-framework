import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  classifyReauditHeadChange,
} from "../lib/rapid-delivery-accelerator.js";

interface ReauditClassifyOptions {
  previousAuditedHead?: string;
  currentHead?: string;
  prBodyExactHead?: string;
  deltaChangedFiles?: string;
  previousAuditVerdict?: string;
  validationRerun?: boolean;
  metadataOnlyConflictResolution?: boolean;
  functionalDiffChanged?: boolean;
  format?: string;
}

export function registerReAuditCommand(program: Command): void {
  const reAudit = program
    .command("re-audit")
    .description("Classify exact-head changes for scoped or full re-audit");

  reAudit
    .command("classify")
    .description("Classify a rebase/conflict-resolution head change")
    .option("--previous-audited-head <sha>", "Previous audited PR head")
    .option("--current-head <sha>", "Current PR head")
    .option("--pr-body-exact-head <sha>", "Exact head recorded in PR body")
    .option("--delta-changed-files <path>", "Newline-separated delta files from previous audited head to current head")
    .option("--previous-audit-verdict <verdict>", "Previous audit verdict")
    .option("--validation-rerun", "Current-head validation was rerun")
    .option("--metadata-only-conflict-resolution", "Delta is metadata-only or active handoff restoration")
    .option("--functional-diff-changed", "Functional diff changed or widened")
    .option("--format <format>", "Output format: json")
    .action((options: ReauditClassifyOptions) => {
      try {
        requireJsonFormat(options.format);
        const report = classifyReauditHeadChange({
          previousAuditedHead: options.previousAuditedHead,
          currentHead: options.currentHead,
          prBodyExactHead: options.prBodyExactHead,
          deltaChangedFiles: readLines(options.deltaChangedFiles),
          previousAuditVerdict: options.previousAuditVerdict,
          validationRerun: options.validationRerun,
          metadataOnlyConflictResolution: options.metadataOnlyConflictResolution,
          functionalDiffChanged: options.functionalDiffChanged,
        });
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } catch (error) {
        process.stdout.write(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }, null, 2) + "\n");
        process.exitCode = 1;
      }
    });
}

function requireJsonFormat(format: string | undefined): void {
  if (format !== "json") throw new Error("Invalid --format. Expected json.");
}

function readLines(filePath: string | undefined): string[] {
  if (!filePath) return [];
  return readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
