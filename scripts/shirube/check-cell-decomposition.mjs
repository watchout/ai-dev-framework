#!/usr/bin/env node
import { existsSync } from "node:fs";
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-cell-decomposition-check/v1";
const CELL_LIFECYCLE_SCHEMA = "shirube-cell-lifecycle/v1";
const PR_ROLE_SCHEMA = "shirube-pr-role/v1";

const STAGES = new Set([
  "route_metadata",
  "implementation",
  "verification",
  "docs",
  "evidence_completion",
  "canary",
  "activation",
  "post_merge",
]);

const PR_ROLES = new Set([
  "route_metadata_pr",
  "implementation_pr",
  "verification_pr",
  "docs_pr",
  "evidence_completion_pr",
  "post_merge_pr",
  "ref_update_pr",
  "governance_policy_pr",
]);

export function buildCellDecompositionCheck(input = {}) {
  const handoff = input.handoff ?? {};
  const cellFile = input.cell ?? null;
  const cell = resolveCell({ handoff, cellFile });
  const lifecycle = resolveLifecycle({ handoff, cell });
  const prRole = resolvePrRole({ handoff, cell });
  const implementationPrPlan = resolveImplementationPrPlan({ handoff, cell });
  const blockers = [];
  const warnings = [];

  const cellId = firstPresent(cell.cell_id, lifecycle.cell_id, handoff.cell_id, handoff.cell);
  const parent = firstPresent(cell.parent_ssot, cell.parent, handoff.parent_ssot, handoff.parent, handoff.source_control, handoff.work_order);
  const goal = firstPresent(cell.goal_summary, cell.cell_goal, cell.goal, lifecycle.cell_goal, handoff.goal_summary, handoff.scope?.summary);
  const completionDefinition = firstPresent(cell.completion_definition, cell.cell_completion_definition, lifecycle.cell_completion_definition, handoff.cell_completion_definition);
  const acceptanceCriteria = nonEmptyArray(cell.acceptance_criteria) ? cell.acceptance_criteria : asArray(handoff.acceptance_criteria);
  const nonScope = nonEmptyArray(cell.non_scope) ? cell.non_scope : asArray(handoff.non_scope ?? handoff.non_scope_confirmed);

  if (!nonEmptyString(cellId)) blockers.push(finding("CELL-DECOMP-001"));
  if (!nonEmptyString(parent)) blockers.push(finding("CELL-DECOMP-002"));
  if (!nonEmptyString(goal)) blockers.push(finding("CELL-DECOMP-003"));
  if (!nonEmptyString(completionDefinition)) blockers.push(finding("CELL-DECOMP-004"));
  if (acceptanceCriteria.length === 0) blockers.push(finding("CELL-DECOMP-005"));
  if (nonScope.length === 0) warnings.push(warning("CELL-DECOMP-W001", "non_scope_missing", "Cell non-scope is not declared.", "non_scope"));

  if (auditReductionOnly(cell, handoff)) blockers.push(finding("CELL-DECOMP-007"));

  const stages = resolveStages({ cell, handoff, lifecycle });
  const multiStage = stages.length > 1 || lifecycle.stage === "route_metadata" || lifecycle.completes_cell === false;
  if (multiStage && stages.length === 0 && !isObject(lifecycle)) {
    blockers.push(finding("CELL-DECOMP-008"));
  }

  blockers.push(...validateLifecycle(lifecycle, { multiStage }));
  blockers.push(...validatePrRole(prRole, lifecycle, { multiStage }));
  blockers.push(...validateImplementationPrPlan(implementationPrPlan, prRole, lifecycle));

  const routeMetadata = lifecycle.stage === "route_metadata" || prRole.role === "route_metadata_pr";
  if (routeMetadata && lifecycle.completes_cell === true) {
    blockers.push(finding("CELL-LC-005"));
    blockers.push(finding("PR-ROLE-003"));
  }

  return report({
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
    cell,
    lifecycle,
    prRole,
    implementationPrPlan,
    cellId,
    stages,
  });
}

function validateLifecycle(lifecycle, context) {
  const blockers = [];
  if (!isObject(lifecycle)) {
    if (context.multiStage) blockers.push(finding("CELL-LC-001"));
    return blockers;
  }
  if (lifecycle.schema_version && lifecycle.schema_version !== CELL_LIFECYCLE_SCHEMA) {
    blockers.push(finding("CELL-LC-001", { message: `Expected ${CELL_LIFECYCLE_SCHEMA}.` }));
  }
  if (!STAGES.has(String(lifecycle.stage ?? ""))) {
    blockers.push(finding("CELL-LC-002"));
  }
  if (lifecycle.completes_cell === false && !nonEmptyString(lifecycle.next_stage)) {
    blockers.push(finding("CELL-LC-003"));
  }
  if (lifecycle.completes_cell === false && lifecycle.next_stage && !STAGES.has(String(lifecycle.next_stage))) {
    blockers.push(finding("CELL-LC-002", { path: "cell_lifecycle.next_stage", message: `Unknown next_stage ${lifecycle.next_stage}.` }));
  }
  if (lifecycle.completes_cell === true && asArray(lifecycle.incomplete_required_stages).length > 0) {
    blockers.push(finding("CELL-LC-004"));
  }
  if (lifecycle.completes_cell === false && lifecycle.next_cell_selection_allowed === true) {
    blockers.push(finding("CELL-LC-006"));
  }
  return blockers;
}

function validatePrRole(prRole, lifecycle, context) {
  const blockers = [];
  if (!isObject(prRole)) {
    if (context.multiStage) blockers.push(finding("PR-ROLE-001"));
    return blockers;
  }
  if (prRole.schema_version && prRole.schema_version !== PR_ROLE_SCHEMA) {
    blockers.push(finding("PR-ROLE-001", { message: `Expected ${PR_ROLE_SCHEMA}.` }));
  }
  if (!PR_ROLES.has(String(prRole.role ?? ""))) {
    blockers.push(finding("PR-ROLE-001", { path: "pr_role.role", message: "PR role is missing or unknown." }));
  }
  if (prRole.role === "route_metadata_pr" && prRole.completes_cell === true) {
    blockers.push(finding("PR-ROLE-003"));
  }
  if (prRole.role === "implementation_pr" && lifecycle.stage && lifecycle.stage !== "implementation") {
    blockers.push(finding("PR-ROLE-004"));
  }
  if (prRole.role === "ref_update_pr" && prRole.completes_cell === true) {
    blockers.push(finding("PR-ROLE-005"));
  }
  return blockers;
}

function validateImplementationPrPlan(plan, prRole, lifecycle) {
  const blockers = [];
  if (!isObject(plan) || Object.keys(plan).length === 0) {
    blockers.push(finding("CELL-PLAN-001"));
    return blockers;
  }
  const mode = String(plan.mode ?? "");
  const prs = asArray(plan.prs);
  if (!["single_pr", "multi_pr"].includes(mode)) {
    blockers.push(finding("CELL-PLAN-002"));
  }
  if (prs.length === 0) {
    blockers.push(finding("CELL-PLAN-003"));
  }
  if (mode === "single_pr" && prs.length !== 1) {
    blockers.push(finding("CELL-PLAN-004"));
  }
  for (const [index, pr] of prs.entries()) {
    if (!isObject(pr) || !nonEmptyString(pr.pr_role) || !nonEmptyString(pr.title) || typeof pr.completes_cell !== "boolean") {
      blockers.push(finding("CELL-PLAN-005", { path: `implementation_pr_plan.prs.${index}` }));
    }
  }
  if (isObject(prRole) && nonEmptyString(prRole.role)) {
    const roleMatches = prs.some((pr) => isObject(pr) && pr.pr_role === prRole.role);
    if (!roleMatches) {
      blockers.push(finding("CELL-PLAN-006"));
    }
  }
  if (lifecycle.completes_cell === true && !prs.some((pr) => isObject(pr) && pr.completes_cell === true)) {
    blockers.push(finding("CELL-PLAN-007"));
  }
  return blockers;
}

function report({ blockers, warnings, cell, lifecycle, prRole, implementationPrPlan, cellId, stages }) {
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  const continuation = lifecycle.completes_cell === false;
  return {
    schema: SCHEMA,
    generated_by: "scripts/shirube/check-cell-decomposition.mjs",
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
          reason: "Cell lifecycle, PR role, or implementation PR plan metadata is missing or contradictory.",
        }
      : null,
    owner_approval_allowed: verdict === "BLOCKED" ? false : null,
    merge_ready_allowed: verdict === "BLOCKED" ? false : null,
    forbidden_next_actions: verdict === "BLOCKED"
      ? ["owner_exact_head_approval", "request_owner_exact_head_decision", "mark_merge_ready", "merge"]
      : [],
    cell_id: cellId ?? null,
    cell_complete: lifecycle.completes_cell === true ? false : false,
    cell_stage_complete: false,
    next_cell_selection_allowed: continuation ? false : null,
    same_cell_continuation_required: continuation ? true : null,
    next_stage: lifecycle.next_stage ?? prRole.expected_next_stage ?? null,
    next_expected_action: lifecycle.next_expected_action ?? prRole.expected_next_action ?? null,
    next_expected_command: lifecycle.next_expected_command ?? null,
    inventory: {
      cell_present: isObject(cell),
      cell_lifecycle_present: isObject(lifecycle),
      pr_role_present: isObject(prRole),
      implementation_pr_plan_present: isObject(implementationPrPlan) && Object.keys(implementationPrPlan).length > 0,
      stages: stages.map((stage) => stage.stage_id ?? stage.stage ?? stage),
    },
    blockers,
    warnings,
    required_next_actions: blockers.map((blocker) => ({
      item_id: blocker.item_id,
      action: actionFor(blocker.item_id),
    })),
  };
}

function resolveCell({ handoff, cellFile }) {
  if (isObject(cellFile)) return cellFile;
  if (isObject(handoff.cell)) return handoff.cell;
  if (isObject(handoff.cell_definition)) return handoff.cell_definition;
  return {};
}

function resolveLifecycle({ handoff, cell }) {
  if (isObject(cell.cell_lifecycle)) return cell.cell_lifecycle;
  if (isObject(handoff.cell_lifecycle)) return handoff.cell_lifecycle;
  if (isObject(handoff.lifecycle?.cell_lifecycle)) return handoff.lifecycle.cell_lifecycle;
  return {};
}

function resolvePrRole({ handoff, cell }) {
  if (isObject(cell.pr_role)) return cell.pr_role;
  if (isObject(handoff.pr_role)) return handoff.pr_role;
  return {};
}

function resolveImplementationPrPlan({ handoff, cell }) {
  if (isObject(cell.implementation_pr_plan)) return cell.implementation_pr_plan;
  if (isObject(handoff.implementation_pr_plan)) return handoff.implementation_pr_plan;
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
    "CELL-DECOMP-001": ["missing_cell_id", "Cell ID is missing.", "cell_id"],
    "CELL-DECOMP-002": ["missing_parent_ssot", "Parent SSOT or control source is missing.", "parent_ssot"],
    "CELL-DECOMP-003": ["missing_meaningful_outcome", "Cell meaningful goal/outcome is missing.", "goal_summary"],
    "CELL-DECOMP-004": ["missing_completion_definition", "Cell completion definition is missing.", "completion_definition"],
    "CELL-DECOMP-005": ["missing_acceptance_criteria", "Cell acceptance criteria are missing.", "acceptance_criteria"],
    "CELL-DECOMP-007": ["audit_reduction_only_grouping", "Cell grouping cannot be justified only by audit reduction.", "grouping_reason"],
    "CELL-DECOMP-008": ["missing_stage_plan", "Multi-stage Cell is missing required stage plan.", "stages"],
    "CELL-LC-001": ["missing_cell_lifecycle", "cell_lifecycle is missing or invalid for a multi-stage Cell.", "cell_lifecycle"],
    "CELL-LC-002": ["unknown_stage", "cell_lifecycle stage is unknown.", "cell_lifecycle.stage"],
    "CELL-LC-003": ["next_stage_missing", "completes_cell=false requires next_stage.", "cell_lifecycle.next_stage"],
    "CELL-LC-004": ["required_stages_incomplete", "completes_cell=true requires all required stages to be complete.", "cell_lifecycle"],
    "CELL-LC-005": ["route_metadata_completes_cell", "route_metadata PR cannot complete the Cell.", "cell_lifecycle.completes_cell"],
    "CELL-LC-006": ["next_cell_selection_forbidden", "Next Cell selection is forbidden while current Cell is incomplete.", "cell_lifecycle.next_cell_selection_allowed"],
    "PR-ROLE-001": ["missing_pr_role", "PR role is missing or invalid for a multi-stage Cell.", "pr_role"],
    "PR-ROLE-003": ["route_metadata_claims_completion", "route metadata PR incorrectly claims Cell completion.", "pr_role.completes_cell"],
    "PR-ROLE-004": ["implementation_stage_missing", "implementation_pr must align with implementation Cell stage.", "pr_role.role"],
    "PR-ROLE-005": ["ref_update_claims_runtime_completion", "ref-update PR must not claim product/runtime Cell completion.", "pr_role.completes_cell"],
    "CELL-PLAN-001": ["missing_implementation_pr_plan", "Cell implementation PR plan is missing.", "implementation_pr_plan"],
    "CELL-PLAN-002": ["invalid_implementation_pr_plan_mode", "implementation_pr_plan.mode must be single_pr or multi_pr.", "implementation_pr_plan.mode"],
    "CELL-PLAN-003": ["missing_planned_prs", "implementation_pr_plan.prs must list at least one PR unit.", "implementation_pr_plan.prs"],
    "CELL-PLAN-004": ["single_pr_plan_not_single", "implementation_pr_plan.mode=single_pr requires exactly one planned PR.", "implementation_pr_plan.prs"],
    "CELL-PLAN-005": ["invalid_planned_pr", "Each planned PR requires pr_role, title, and completes_cell.", "implementation_pr_plan.prs"],
    "CELL-PLAN-006": ["current_pr_role_not_in_plan", "Current pr_role is not present in implementation_pr_plan.prs.", "implementation_pr_plan.prs"],
    "CELL-PLAN-007": ["completion_pr_missing", "A completing lifecycle requires a planned PR with completes_cell=true.", "implementation_pr_plan.prs"],
  };
  const [code, message, path] = defaults[itemId] ?? ["cell_decomposition_error", "Cell decomposition check failed.", "cell"];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? path,
  };
}

function warning(itemId, code, message, path) {
  return { item_id: itemId, code, message, path };
}

function actionFor(itemId) {
  if (itemId.startsWith("CELL-LC") || itemId.startsWith("PR-ROLE") || itemId.startsWith("CELL-PLAN")) {
    return "Fix cell_lifecycle, pr_role, and implementation_pr_plan metadata before audit or owner approval.";
  }
  return "Fix Cell decomposition metadata before audit or owner approval.";
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

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
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
  const cellPath = stringOption(options.cell);
  const handoffPath = stringOption(options.handoff);
  const input = {
    cell: readOptional(cellPath),
    handoff: readOptional(handoffPath) ?? {},
  };
  const result = buildCellDecompositionCheck(input);
  const format = stringOption(options.format) ?? "json";
  if (format === "json") process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  main();
}
