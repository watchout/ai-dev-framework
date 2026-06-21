import type { Command } from "commander";
import {
  buildEvidenceCheck,
  buildFailureReport,
  findArtifactFiles,
  type ShirubeGateReport,
} from "../lib/shirube-artifact-gates.js";

interface EvidenceCheckOptions {
  fixture?: string;
  path?: string[];
  head?: string;
  base?: string;
  format?: string;
  json?: boolean;
}

export function registerEvidenceCommand(program: Command): void {
  const evidence = program
    .command("evidence")
    .description("Validate Shirube evidence artifacts in report-only mode");

  evidence
    .command("check")
    .description("Validate evidence artifact existence, required fields, and head/base consistency")
    .argument("[artifact]", "Evidence artifact path")
    .option("--fixture <path>", "Evidence artifact fixture path")
    .option("--path <path>", "Evidence artifact path; can be repeated", collectOption, [])
    .option("--head <sha>", "Expected exact verification head SHA")
    .option("--base <ref>", "Expected PR base ref")
    .option("--format <format>", "Output format: json")
    .option("--json", "Output machine-readable JSON")
    .action((artifact: string | undefined, options: EvidenceCheckOptions) => {
      runArtifactGateAction(options, () => {
        const files = resolveArtifactFiles({
          fixture: options.fixture,
          artifact,
          paths: options.path,
          defaultRoot: ".shirube/evidence",
        });
        return buildEvidenceCheck({
          files,
          expectedHead: options.head,
          expectedBase: options.base,
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
