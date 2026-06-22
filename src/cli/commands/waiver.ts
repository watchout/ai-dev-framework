import type { Command } from "commander";
import {
  buildFailureReport,
  buildWaiverCheck,
  findArtifactFiles,
  type ShirubeGateReport,
} from "../lib/shirube-artifact-gates.js";

interface WaiverCheckOptions {
  fixture?: string;
  path?: string[];
  targetCell?: string;
  targetCheck?: string;
  checkedAt?: string;
  format?: string;
  json?: boolean;
}

export function registerWaiverCommand(program: Command): void {
  const waiver = program
    .command("waiver")
    .description("Validate Shirube waiver artifacts in report-only mode");

  waiver
    .command("check")
    .description("Validate waiver target, reason, expiry, and scope")
    .argument("[artifact]", "Waiver artifact path")
    .option("--fixture <path>", "Waiver artifact fixture path")
    .option("--path <path>", "Waiver artifact path; can be repeated", collectOption, [])
    .option("--target-cell <id>", "Expected target_cell")
    .option("--target-check <id>", "Expected target_check")
    .option("--checked-at <timestamp>", "UTC timestamp used for expiry evaluation")
    .option("--format <format>", "Output format: json")
    .option("--json", "Output machine-readable JSON")
    .action((artifact: string | undefined, options: WaiverCheckOptions) => {
      runArtifactGateAction(options, () => {
        const files = resolveArtifactFiles({
          fixture: options.fixture,
          artifact,
          paths: options.path,
          defaultRoot: ".shirube/waivers",
        });
        return buildWaiverCheck({
          files,
          targetCell: options.targetCell,
          targetCheck: options.targetCheck,
          checkedAtUtc: options.checkedAt,
        });
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

function resolveArtifactFiles(input: {
  fixture?: string;
  artifact?: string;
  paths?: string[];
  defaultRoot: string;
}): string[] {
  if (input.fixture) return [input.fixture];
  const explicitPaths = [
    ...(input.artifact ? [input.artifact] : []),
    ...(input.paths ?? []),
  ];
  if (explicitPaths.length > 0) return explicitPaths;
  return findArtifactFiles(input.defaultRoot);
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
