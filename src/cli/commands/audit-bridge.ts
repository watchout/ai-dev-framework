import type { Command } from "commander";
import {
  buildAuditBridgeCheck,
  buildAuditBridgeFailureReport,
  resolveAuditBridgeInputFromFixture,
  type AuditBridgeCheckInput,
  type AuditBridgeCheckReport,
} from "../lib/shirube-audit-bridge.js";

interface AuditBridgeCheckOptions {
  fixture?: string;
  itemSet?: string;
  evidenceFixture?: string[];
  evidencePath?: string[];
  implementationActor?: string;
  implementationModel?: string;
  head?: string;
  base?: string;
  format?: string;
  json?: boolean;
}

export function registerAuditBridgeCommand(program: Command): void {
  const auditBridge = program
    .command("audit-bridge")
    .description("Validate Shirube structured audit Bridge admissibility in report-only mode");

  auditBridge
    .command("check")
    .description("Check structured audit records against their item set and artifact evidence")
    .option("--fixture <path>", "Bridge fixture or shirube-audit/v1 audit record path")
    .option("--item-set <path>", "Audit item set path override")
    .option("--evidence-fixture <path>", "Evidence artifact fixture path; can be repeated", collectOption, [])
    .option("--evidence-path <path>", "Evidence artifact path; can be repeated", collectOption, [])
    .option("--implementation-actor <actor>", "Implementation actor for maker/checker validation")
    .option("--implementation-model <model>", "Implementation model for maker/checker validation")
    .option("--head <sha>", "Expected exact reviewed head SHA")
    .option("--base <ref>", "Expected PR base ref for evidence artifacts")
    .option("--format <format>", "Output format: json")
    .option("--json", "Output machine-readable JSON")
    .action((options: AuditBridgeCheckOptions) => {
      runAuditBridgeAction(options, () => {
        const input = resolveAuditBridgeCliInput(options);
        return buildAuditBridgeCheck(input);
      });
    });
}

function resolveAuditBridgeCliInput(options: AuditBridgeCheckOptions): AuditBridgeCheckInput {
  const evidenceFiles = [
    ...(options.evidenceFixture ?? []),
    ...(options.evidencePath ?? []),
  ];
  const overrides: Partial<AuditBridgeCheckInput> = {
    itemSetFile: options.itemSet,
    evidenceFiles,
    expectedHead: options.head,
    expectedBase: options.base,
    implementationActor: options.implementationActor,
    implementationModel: options.implementationModel,
  };

  if (!options.fixture) return overrides;

  return resolveAuditBridgeInputFromFixture(options.fixture, overrides);
}

function runAuditBridgeAction(
  options: { format?: string; json?: boolean },
  action: () => AuditBridgeCheckReport,
): void {
  try {
    if (options.format && options.format !== "json") {
      throw new Error("Invalid --format. Expected json.");
    }
    const report = action();
    writeAuditBridgeReport(report, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeAuditBridgeReport(buildAuditBridgeFailureReport(message), options);
    process.exitCode = 1;
  }
}

function writeAuditBridgeReport(
  report: AuditBridgeCheckReport,
  options: { format?: string; json?: boolean },
): void {
  if (options.json === true || options.format === "json") {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`${report.schema}: ${report.verdict}\n`);
  }
  if (report.verdict === "FAILURE") {
    process.exitCode = 1;
  }
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
