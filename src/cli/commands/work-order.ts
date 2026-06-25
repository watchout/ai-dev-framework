import type { Command } from "commander";
import {
  buildWorkOrderDocument,
  buildWorkOrderFailureReport,
  buildWorkOrderValidationReport,
  readJsonDocument,
  writeWorkOrderDocument,
  type WorkOrderExportOptions,
} from "../lib/orchestration-contract.js";

interface WorkOrderValidateOptions {
  file?: string;
  format?: string;
}

export function registerWorkOrderCommand(program: Command): void {
  const workOrder = program
    .command("work-order")
    .description("Export and validate Shirube Work Orders for AUN-compatible orchestration");

  workOrder
    .command("export")
    .description("Emit a shirube-work-order/v1 JSON envelope without dispatching or mutating AUN")
    .option("--work-order-id <id>", "Work Order id, for example WO-ADF-511-AUN-CLI-001")
    .option("--idempotency-key <key>", "Stable idempotency key; generated deterministically when omitted")
    .option("--repo <owner/repo>", "Target repository")
    .option("--default-branch <branch>", "Target repository default branch", "main")
    .option("--head-branch <branch>", "Target repository head branch")
    .option("--head-sha <sha>", "Target repository head SHA")
    .option("--source-type <type>", "Source type", "manual")
    .option("--source-repo <owner/repo>", "Source repository")
    .option("--source-ref <ref>", "Source ref")
    .option("--source-commit <sha>", "Source commit SHA")
    .option("--source-url <url>", "Source URL")
    .option("--source-issue <owner/repo#issue>", "Source issue reference")
    .option("--framework-ref <ref>", "Pinned Shirube framework ref")
    .option("--target-package <package>", "Execution target package", "aun")
    .option("--target-capability <capability>", "Execution target capability")
    .option("--cell-id <id>", "CELL-ID")
    .option("--spec-id <id>", "SPEC-ID")
    .option("--impl-id <id>", "IMPL-ID")
    .option("--risk-tier <tier>", "Risk tier")
    .option("--cell-type <type>", "Cell type", "rapid_lite")
    .option("--title <text>", "Work Order title")
    .option("--goal <text>", "Work Order goal")
    .option("--scope <item>", "Included scope; repeatable", collect, [])
    .option("--non-scope <item>", "Excluded scope; repeatable", collect, [])
    .option("--allowed-path <path>", "Allowed path; repeatable", collect, [])
    .option("--forbidden-path <path>", "Forbidden path; repeatable", collect, [])
    .option("--check <command>", "Required check command; repeatable", collect, [])
    .option("--required-evidence <name>", "Required evidence name; repeatable", collect, [])
    .option("--acceptance-criterion <text>", "Acceptance criterion; repeatable", collect, [])
    .option("--stop-condition <text>", "Stop condition; repeatable", collect, [])
    .option("--context-ref <ref>", "Context reference; repeatable", collect, [])
    .option("--evidence-ref <uri>", "Evidence reference URI; repeatable", collect, [])
    .option("--owner-actor <actor>", "Owner actor")
    .option("--owner-decision-ref <ref>", "Owner decision reference")
    .option("--repo-spec-ref <ref>", "Repo spec reference")
    .option("--handoff-ref <ref>", "Control handoff reference")
    .option("--source-mirror-ref <ref>", "Source mirror reference")
    .option("--validation-evidence-ref <ref>", "Validation evidence reference")
    .option("--created-at <iso>", "Created timestamp", "1970-01-01T00:00:00Z")
    .option("--updated-at <iso>", "Updated timestamp")
    .option("--out <file>", "Also write the Work Order JSON to a file")
    .option("--format <format>", "Output format: json")
    .action((options: WorkOrderExportOptions & { format?: string }) => {
      if (!isJsonFormat(options.format)) {
        writeJson(buildWorkOrderFailureReport(null, "unsupported_format", "--format json is required."));
        process.exitCode = 1;
        return;
      }
      try {
        const document = buildWorkOrderDocument(options);
        const validation = buildWorkOrderValidationReport(options.out ?? null, document);
        if (validation.verdict === "BLOCKED") {
          writeJson(validation);
          return;
        }
        writeWorkOrderDocument(document, options.out);
        writeJson(document);
      } catch (error) {
        writeJson(buildWorkOrderFailureReport(null, "export_error", errorMessage(error)));
        process.exitCode = 1;
      }
    });

  workOrder
    .command("validate")
    .description("Validate a shirube-work-order/v1 JSON file")
    .requiredOption("--file <file>", "Work Order JSON file")
    .option("--format <format>", "Output format: json")
    .action((options: WorkOrderValidateOptions) => {
      if (!isJsonFormat(options.format)) {
        writeJson(buildWorkOrderFailureReport(options.file ?? null, "unsupported_format", "--format json is required."));
        process.exitCode = 1;
        return;
      }
      try {
        writeJson(buildWorkOrderValidationReport(options.file ?? null, readJsonDocument(options.file ?? "")));
      } catch (error) {
        writeJson(buildWorkOrderFailureReport(options.file ?? null, "read_error", errorMessage(error)));
        process.exitCode = 1;
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function isJsonFormat(format?: string): boolean {
  return format === "json";
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
