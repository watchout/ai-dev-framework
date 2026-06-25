import type { Command } from "commander";
import {
  buildWorkResultFailureReport,
  buildWorkResultImportReport,
  buildWorkResultValidationReport,
  readJsonDocument,
} from "../lib/orchestration-contract.js";

interface WorkResultOptions {
  file?: string;
  workOrder?: string;
  format?: string;
}

export function registerWorkResultCommand(program: Command): void {
  const workResult = program
    .command("work-result")
    .description("Validate and import AUN Work Result envelopes in report-only mode");

  workResult
    .command("validate")
    .description("Validate a shirube-work-result/v1 JSON file")
    .requiredOption("--file <file>", "Work Result JSON file")
    .option("--work-order <file>", "Matching Work Order JSON file")
    .option("--format <format>", "Output format: json")
    .action((options: WorkResultOptions) => {
      writeValidation(options);
    });

  workResult
    .command("import")
    .description("Dry-run import of a shirube-work-result/v1 JSON file without mutating AUN or a DB")
    .requiredOption("--file <file>", "Work Result JSON file")
    .option("--work-order <file>", "Matching Work Order JSON file")
    .option("--format <format>", "Output format: json")
    .action((options: WorkResultOptions) => {
      const validation = buildValidation(options);
      writeJson(buildWorkResultImportReport(validation));
      if (validation.verdict === "FAILURE") process.exitCode = 1;
    });
}

function writeValidation(options: WorkResultOptions): void {
  const validation = buildValidation(options);
  writeJson(validation);
  if (validation.verdict === "FAILURE") process.exitCode = 1;
}

function buildValidation(options: WorkResultOptions) {
  if (options.format !== "json") {
    const report = buildWorkResultFailureReport(options.file ?? null, "unsupported_format", "--format json is required.");
    report.work_order_ref = options.workOrder ?? null;
    return report;
  }
  try {
    const document = readJsonDocument(options.file ?? "");
    const workOrder = options.workOrder ? readJsonDocument(options.workOrder) : null;
    return buildWorkResultValidationReport(options.file ?? null, document, options.workOrder ?? null, workOrder);
  } catch (error) {
    const report = buildWorkResultFailureReport(options.file ?? null, "read_error", errorMessage(error));
    report.work_order_ref = options.workOrder ?? null;
    return report;
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
