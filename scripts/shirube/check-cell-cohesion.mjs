#!/usr/bin/env node
import { existsSync } from "node:fs";
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-cell-cohesion-check/v1";

export function buildCellCohesionCheck(input = {}) {
  const handoff = input.handoff ?? {};
  const cell = resolveCell({ handoff, cellFile: input.cell });
  const lifecycle = isObject(cell.cell_lifecycle) ? cell.cell_lifecycle : isObject(handoff.cell_lifecycle) ? handoff.cell_lifecycle : {};
  const stages = resolveStages({ cell, handoff, lifecycle });
  const acceptance = asArray(cell.acceptance_criteria?.length ? cell.acceptance_criteria : handoff.acceptance_criteria);
  const completionDefinition = firstPresent(cell.completion_definition, lifecycle.cell_completion_definition, handoff.cell_completion_definition);
  const goal = firstPresent(cell.goal_summary, cell.cell_goal, cell.goal, lifecycle.cell_goal, handoff.goal_summary, handoff.scope?.summary);
  const blockers = [];
  const warnings = [];

  if (!nonEmptyString(goal)) blockers.push(finding("CELL-COHESION-001"));
  if (!nonEmptyString(completionDefinition)) blockers.push(finding("CELL-COHESION-004"));
  if (acceptance.length === 0) blockers.push(finding("CELL-COHESION-005"));

  const prStage = firstPresent(handoff.pr_stage, handoff.pr_role?.expected_next_stage, handoff.pr_role?.role?.replace(/_pr$/u, ""), lifecycle.stage);
  if (prStage && stages.length > 0 && !stageNames(stages).has(prStage)) {
    blockers.push(finding("CELL-COHESION-002", {
      message: `PR stage ${prStage} is not declared in the Cell stage plan.`,
    }));
  }

  if (cell.unrelated_outcomes === true || handoff.unrelated_outcomes === true || asArray(cell.outcomes).length > 1 && !cell.shared_meaningful_outcome) {
    blockers.push(finding("CELL-COHESION-003"));
  }

  if (auditReductionOnly(cell, handoff)) {
    blockers.push(finding("CELL-COHESION-003", {
      message: "Audit-reduction convenience is not valid Cell cohesion.",
    }));
  }

  if (cell.mixed_risk_surfaces_without_policy === true || handoff.mixed_risk_surfaces_without_policy === true) {
    blockers.push(finding("CELL-COHESION-006"));
  }

  if (stages.length > 0 && acceptance.length > 0 && !acceptanceCoversStages(acceptance, stages)) {
    warnings.push({
      item_id: "CELL-COHESION-W001",
      code: "acceptance_stage_trace_weak",
      message: "Acceptance criteria do not explicitly name every declared stage; verify coverage before full delivery-wave expansion.",
      path: "acceptance_criteria",
    });
  }

  return report({
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
    stages,
    cell,
  });
}

function report({ blockers, warnings, stages, cell }) {
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  return {
    schema: SCHEMA,
    generated_by: "scripts/shirube/check-cell-cohesion.mjs",
    verdict,
    report_failed: false,
    would_block: verdict === "BLOCKED",
    owner_must_not_merge: verdict === "BLOCKED",
    current_phase: verdict === "BLOCKED" ? "METADATA_REFRESH_REQUIRED" : null,
    next_action: verdict === "BLOCKED"
      ? {
          action: "request_owner_planning_decision",
          responsible_role: "lead",
          allowed_actor_role: "lead",
          reason: "Cell cohesion metadata is missing, contradictory, or not semantically meaningful.",
        }
      : null,
    owner_approval_allowed: verdict === "BLOCKED" ? false : null,
    merge_ready_allowed: verdict === "BLOCKED" ? false : null,
    forbidden_next_actions: verdict === "BLOCKED"
      ? ["owner_exact_head_approval", "request_owner_exact_head_decision", "mark_merge_ready", "merge"]
      : [],
    inventory: {
      cell_id: cell.cell_id ?? null,
      stage_count: stages.length,
      stages: [...stageNames(stages)],
    },
    blockers,
    warnings,
    required_next_actions: blockers.map((blocker) => ({
      item_id: blocker.item_id,
      action: "Fix Cell cohesion metadata before audit or owner approval.",
    })),
  };
}

function resolveCell({ handoff, cellFile }) {
  if (isObject(cellFile)) return cellFile;
  if (isObject(handoff.cell)) return handoff.cell;
  if (isObject(handoff.cell_definition)) return handoff.cell_definition;
  return {};
}

function resolveStages({ cell, handoff, lifecycle }) {
  const stages = asArray(cell.stages);
  if (stages.length > 0) return stages;
  const handoffStages = asArray(handoff.stages ?? handoff.cell_stages);
  if (handoffStages.length > 0) return handoffStages;
  if (isObject(lifecycle) && lifecycle.stage) return [lifecycle];
  return [];
}

function stageNames(stages) {
  return new Set(stages
    .map((stage) => isObject(stage) ? stage.stage_id ?? stage.stage : stage)
    .filter(Boolean)
    .map(String));
}

function acceptanceCoversStages(acceptance, stages) {
  const text = acceptance.map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry)).join(" ").toLowerCase();
  return [...stageNames(stages)].every((stage) => text.includes(String(stage).toLowerCase()));
}

function auditReductionOnly(cell, handoff) {
  const text = [
    cell.grouping_reason,
    handoff.grouping_reason,
    cell.reason,
    handoff.reason,
  ].filter(Boolean).join(" ");
  return /audit[-_ ]?reduction[-_ ]?only|only to reduce audit|reduce audit count/i.test(text);
}

function finding(itemId, overrides = {}) {
  const defaults = {
    "CELL-COHESION-001": ["missing_meaningful_outcome", "Cell meaningful outcome is missing.", "goal_summary"],
    "CELL-COHESION-002": ["pr_stage_not_declared", "PR stage is not declared in the Cell stage plan.", "stages"],
    "CELL-COHESION-003": ["unrelated_prs_grouped", "Unrelated outcomes cannot be grouped into one Cell.", "cell"],
    "CELL-COHESION-004": ["missing_completion_definition", "Cell completion definition is missing.", "completion_definition"],
    "CELL-COHESION-005": ["acceptance_criteria_incomplete", "Acceptance criteria do not cover Cell stages.", "acceptance_criteria"],
    "CELL-COHESION-006": ["risk_surfaces_mixed_without_policy", "Risk surfaces are mixed without policy allowance.", "protected_surfaces"],
  };
  const [code, message, path] = defaults[itemId] ?? ["cell_cohesion_error", "Cell cohesion check failed.", "cell"];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? path,
  };
}

function readOptional(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return readStructuredFile(filePath);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function firstPresent(...values) {
  return values.find((value) => nonEmptyString(value));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 && !/^(pending|todo|tbd|null|none)$/i.test(value.trim());
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.item_id}:${finding.path}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringOption(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const input = {
    cell: readOptional(stringOption(options.cell)),
    handoff: readOptional(stringOption(options.handoff)) ?? {},
  };
  const result = buildCellCohesionCheck(input);
  const format = stringOption(options.format) ?? "json";
  if (format === "json") process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  main();
}
