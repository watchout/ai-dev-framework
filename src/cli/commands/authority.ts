import type { Command } from "commander";
import {
  buildAuthorityCheck,
  buildFailureReport,
  readRecord,
  type AuthorityCheckInput,
  type ShirubeGateReport,
} from "../lib/shirube-artifact-gates.js";

interface AuthorityCheckOptions {
  fixture?: string;
  format?: string;
  json?: boolean;
}

export function registerAuthorityCommand(program: Command): void {
  const authority = program
    .command("authority")
    .description("Validate Shirube maker/checker authority records in report-only mode");

  authority
    .command("check")
    .description("Validate implementation actor differs from audit, merge, and release authorities")
    .requiredOption("--fixture <path>", "Authority fixture path")
    .option("--format <format>", "Output format: json")
    .option("--json", "Output machine-readable JSON")
    .action((options: AuthorityCheckOptions) => {
      runArtifactGateAction(options, () => {
        const record = readRecord(options.fixture!);
        return buildAuthorityCheck(record as AuthorityCheckInput);
      });
    });
}

function runArtifactGateAction(
  options: { format?: string; json?: boolean },
  action: () => ShirubeGateReport,
): void {
  try {
    if (options.format && options.format !== "json") {
      throw new Error("Invalid --format. Expected json.");
    }
    const report = action();
    writeArtifactGateReport(report, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeArtifactGateReport(buildFailureReport(message), options);
    process.exitCode = 1;
  }
}

function writeArtifactGateReport(report: ShirubeGateReport, options: { format?: string; json?: boolean }): void {
  if (options.json === true || options.format === "json") {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`${report.schema}: ${report.verdict}\n`);
  }
  if (report.verdict === "FAILURE") {
    process.exitCode = 1;
  }
}
