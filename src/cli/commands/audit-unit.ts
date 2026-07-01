import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  buildAuditUnit,
} from "../lib/rapid-delivery-accelerator.js";
import type { ConveyorCellQueue } from "../lib/conveyor-state-machine.js";

interface AuditUnitBuildOptions {
  cellQueue?: string;
  targetPr?: string;
  exactHead?: string;
  cellIds?: string;
  reviewPlanRef?: string;
  generatedAt?: string;
  format?: string;
}

export function registerAuditUnitCommand(program: Command): void {
  const auditUnit = program
    .command("audit-unit")
    .description("Build composed Shirube audit units for exact-head PR verification");

  auditUnit
    .command("build")
    .description("Build a shirube-audit-unit/v1 report for one PR exact head")
    .requiredOption("--cell-queue <path>", "shirube-cell-queue/v1 JSON file")
    .requiredOption("--target-pr <number>", "Target PR number")
    .requiredOption("--exact-head <sha>", "Exact PR head SHA")
    .requiredOption("--cell-ids <ids>", "Comma-separated covered Cell ids")
    .option("--review-plan-ref <ref>", "Review plan ref for the audit unit")
    .option("--generated-at <iso>", "Deterministic generated_at timestamp")
    .option("--format <format>", "Output format: json")
    .action((options: AuditUnitBuildOptions) => {
      try {
        requireJsonFormat(options.format);
        const report = buildAuditUnit({
          cellQueue: readJsonFile(requiredOption(options.cellQueue, "--cell-queue")) as ConveyorCellQueue,
          targetPr: parsePositiveInteger(requiredOption(options.targetPr, "--target-pr"), "--target-pr"),
          exactHeadSha: requiredOption(options.exactHead, "--exact-head"),
          cellIds: splitCsv(requiredOption(options.cellIds, "--cell-ids")),
          reviewPlanRef: options.reviewPlanRef,
          generatedAt: options.generatedAt,
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

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function requiredOption(value: string | undefined, option: string): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new Error(`Missing ${option}.`);
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${option}. Expected a positive integer.`);
  return parsed;
}

function splitCsv(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}
