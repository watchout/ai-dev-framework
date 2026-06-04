export type PrCellRiskRoute = "R0" | "R1" | "R2" | "R3" | "R4";
export type PrCellAuditRoute = "minimal" | "standard" | "strict" | "l1" | "l2" | "l3" | "ceo";
export type PrCellOwnerRole = "implementation" | "audit" | "merge_authority" | "ops" | "human_approval";
export type PrCellKind = "implementation" | "ops" | "human_approval";

export interface PrCellPlanIssueRef {
  repo: string;
  number: number;
}

export interface PrCellContinuationPolicy {
  continue_after: "pr_evidence_posted_and_state_impl_l1" | "merge_completed" | "explicit_approval";
  stop_on: string[];
}

export interface PrCell {
  id: string;
  title: string;
  objective?: string;
  repo: string;
  issue: number;
  kind?: PrCellKind;
  expected_pr_count: number;
  depends_on: string[];
  parallel_group?: string;
  risk_route: PrCellRiskRoute;
  audit_route: PrCellAuditRoute;
  owner_role: PrCellOwnerRole;
  required_labels: string[];
  l2_required: boolean;
  forbidden: string[];
  evidence_required: string[];
  stop_conditions: string[];
  continuation_policy?: PrCellContinuationPolicy;
}

export interface PrCellPlan {
  schema: "shirube-pr-cell-plan/v1";
  cell_plan_id: string;
  issue: PrCellPlanIssueRef;
  objective: string;
  continuation_policy: PrCellContinuationPolicy;
  cells: PrCell[];
}

export interface PrCellValidationFinding {
  code: string;
  path: string;
  message: string;
}

export interface PrCellPlanValidationReport {
  schema: "shirube-pr-cell-plan-validation/v1";
  valid: boolean;
  findings: PrCellValidationFinding[];
}

export interface PrCellRuntimePrState {
  repo: string;
  number: number;
  labels: string[];
  merged?: boolean;
}

export interface PrCellRuntimeState {
  cell_id: string;
  pr?: PrCellRuntimePrState;
  blocked?: boolean;
  block_reason?: string;
}

export interface PrCellLanePlan {
  schema: "shirube-pr-cell-lane-plan/v1";
  eligible_implementation_cells: PrCellLaneTarget[];
  held_cells: PrCellLaneHold[];
  visible_ops_cells: PrCellLaneTarget[];
}

export interface PrCellLaneTarget {
  cell_id: string;
  title: string;
  repo: string;
  issue: number;
  parallel_group?: string;
  risk_route: PrCellRiskRoute;
  audit_route: PrCellAuditRoute;
  continue_after: PrCellContinuationPolicy["continue_after"];
  forbidden: string[];
  evidence_required: string[];
}

export interface PrCellLaneHold extends PrCellLaneTarget {
  reason_codes: string[];
}

const PLAN_MARKER = "<!-- codex-goal-cell-plan/v1 -->";
const REQUIRED_FORBIDDEN_OPS = ["merge", "approve", "live_aun_dispatch", "production_db_mutation"];
const REQUIRED_EVIDENCE = ["exact_head", "validation_commands", "non_goals"];
const REQUIRED_CONTINUATION_STOPS = [
  "direct_dependency_blocked",
  "merge_required",
  "ceo_approval_required",
  "live_operation_required",
  "production_db_or_secret_mutation",
];

export function parsePrCellPlanFromText(text: string): PrCellPlan | null {
  if (!text.includes(PLAN_MARKER)) return null;
  const afterMarker = text.slice(text.indexOf(PLAN_MARKER) + PLAN_MARKER.length);
  const fenced = afterMarker.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? afterMarker.slice(afterMarker.indexOf("{"));
  if (!jsonText.trim().startsWith("{")) return null;
  return JSON.parse(jsonText) as PrCellPlan;
}

export function validatePrCellPlan(plan: PrCellPlan): PrCellPlanValidationReport {
  const findings: PrCellValidationFinding[] = [];
  if (plan.schema !== "shirube-pr-cell-plan/v1") {
    findings.push(finding("invalid_schema", "schema", "schema must be shirube-pr-cell-plan/v1"));
  }
  if (!plan.cell_plan_id) findings.push(finding("missing_cell_plan_id", "cell_plan_id", "cell_plan_id is required"));
  if (!plan.issue?.repo || !Number.isInteger(plan.issue?.number)) {
    findings.push(finding("missing_issue", "issue", "issue repo and number are required"));
  }
  if (!plan.objective) findings.push(finding("missing_objective", "objective", "objective is required"));
  validateContinuationPolicy(plan.continuation_policy, "continuation_policy", findings);
  if (!Array.isArray(plan.cells) || plan.cells.length === 0) {
    findings.push(finding("missing_cells", "cells", "at least one cell is required"));
    return validationReport(findings);
  }

  const cellIds = new Set<string>();
  for (const [index, cell] of plan.cells.entries()) {
    const path = `cells[${index}]`;
    validateCell(cell, path, findings);
    if (cell.id) {
      if (cellIds.has(cell.id)) findings.push(finding("duplicate_cell_id", `${path}.id`, `duplicate cell id ${cell.id}`));
      cellIds.add(cell.id);
    }
  }
  for (const [index, cell] of plan.cells.entries()) {
    for (const dependency of cell.depends_on ?? []) {
      if (!cellIds.has(dependency)) {
        findings.push(finding("unknown_dependency", `cells[${index}].depends_on`, `unknown dependency ${dependency}`));
      }
    }
  }
  return validationReport(findings);
}

export function buildPrCellLanePlan(plan: PrCellPlan, runtime: PrCellRuntimeState[] = []): PrCellLanePlan {
  const runtimeByCell = new Map(runtime.map((state) => [state.cell_id, state]));
  const eligible: PrCellLaneTarget[] = [];
  const held: PrCellLaneHold[] = [];
  const ops: PrCellLaneTarget[] = [];

  for (const cell of plan.cells) {
    const target = laneTarget(cell, plan);
    if (cell.kind === "ops" || cell.kind === "human_approval" || cell.owner_role === "ops" || cell.owner_role === "human_approval") {
      ops.push(target);
      continue;
    }
    const reasonCodes = holdReasons(cell, plan, runtimeByCell);
    if (reasonCodes.length > 0) {
      held.push({ ...target, reason_codes: reasonCodes });
      continue;
    }
    eligible.push(target);
  }

  return {
    schema: "shirube-pr-cell-lane-plan/v1",
    eligible_implementation_cells: eligible.sort(compareLaneTargets),
    held_cells: held.sort(compareLaneTargets),
    visible_ops_cells: ops.sort(compareLaneTargets),
  };
}

function validateCell(cell: PrCell, path: string, findings: PrCellValidationFinding[]): void {
  if (!cell.id) findings.push(finding("missing_cell_id", `${path}.id`, "cell id is required"));
  if (!cell.title) findings.push(finding("missing_cell_title", `${path}.title`, "cell title is required"));
  if (!cell.repo) findings.push(finding("missing_cell_repo", `${path}.repo`, "cell repo is required"));
  if (!Number.isInteger(cell.issue)) findings.push(finding("missing_cell_issue", `${path}.issue`, "cell issue is required"));
  if (!Number.isInteger(cell.expected_pr_count) || cell.expected_pr_count < 0) {
    findings.push(finding("invalid_expected_pr_count", `${path}.expected_pr_count`, "expected_pr_count must be a non-negative integer"));
  }
  if (!Array.isArray(cell.depends_on)) findings.push(finding("missing_dependency_information", `${path}.depends_on`, "depends_on is required"));
  if (!cell.risk_route) findings.push(finding("missing_risk_route", `${path}.risk_route`, "risk_route is required"));
  if (!cell.audit_route) findings.push(finding("missing_audit_route", `${path}.audit_route`, "audit_route is required"));
  if (!cell.owner_role) findings.push(finding("missing_owner_role", `${path}.owner_role`, "owner_role is required"));
  validateRequiredValues(cell.forbidden, REQUIRED_FORBIDDEN_OPS, `${path}.forbidden`, "missing_forbidden_operation", findings);
  validateRequiredValues(cell.evidence_required, REQUIRED_EVIDENCE, `${path}.evidence_required`, "missing_evidence_requirement", findings);
  if (!Array.isArray(cell.stop_conditions) || cell.stop_conditions.length === 0) {
    findings.push(finding("missing_stop_conditions", `${path}.stop_conditions`, "stop_conditions are required"));
  }
  if (cell.owner_role === "implementation" && cell.risk_route === "R4") {
    findings.push(finding("r4_not_implementation_assignable", `${path}.risk_route`, "R4 cells must be ops or human approval gated"));
  }
  if (cell.owner_role === "implementation" && !cell.forbidden?.includes("ceo_approval_bypass")) {
    findings.push(finding("missing_ceo_bypass_guard", `${path}.forbidden`, "implementation cells must forbid ceo_approval_bypass"));
  }
}

function validateContinuationPolicy(
  policy: PrCellContinuationPolicy | undefined,
  path: string,
  findings: PrCellValidationFinding[],
): void {
  if (!policy) {
    findings.push(finding("missing_continuation_policy", path, "continuation_policy is required"));
    return;
  }
  if (!policy.continue_after) {
    findings.push(finding("missing_continue_after", `${path}.continue_after`, "continue_after is required"));
  }
  validateRequiredValues(policy.stop_on, REQUIRED_CONTINUATION_STOPS, `${path}.stop_on`, "missing_continuation_stop", findings);
}

function validateRequiredValues(
  actual: string[] | undefined,
  required: string[],
  path: string,
  code: string,
  findings: PrCellValidationFinding[],
): void {
  if (!Array.isArray(actual)) {
    findings.push(finding(code, path, `${path} is required`));
    return;
  }
  for (const value of required) {
    if (!actual.includes(value)) findings.push(finding(code, path, `${value} is required`));
  }
}

function holdReasons(
  cell: PrCell,
  plan: PrCellPlan,
  runtimeByCell: Map<string, PrCellRuntimeState>,
): string[] {
  const reasons: string[] = [];
  for (const dependencyId of cell.depends_on) {
    const dependency = plan.cells.find((item) => item.id === dependencyId);
    const dependencyState = runtimeByCell.get(dependencyId);
    if (!dependency) {
      reasons.push(`unknown_dependency:${dependencyId}`);
      continue;
    }
    if (dependencyState?.blocked) {
      reasons.push(`dependency_blocked:${dependencyId}`);
      continue;
    }
    if (!dependencyReadyForContinuation(plan, dependency, dependencyState)) {
      reasons.push(`dependency_not_ready:${dependencyId}`);
    }
  }
  return reasons;
}

function dependencyReadyForContinuation(
  plan: PrCellPlan,
  dependency: PrCell,
  state: PrCellRuntimeState | undefined,
): boolean {
  const continueAfter = dependency.continuation_policy?.continue_after ?? plan.continuation_policy.continue_after;
  if (continueAfter === "merge_completed") return Boolean(state?.pr?.merged);
  if (continueAfter === "explicit_approval") return state?.pr?.labels.includes("approved") ?? false;
  const labels = state?.pr?.labels ?? [];
  return labels.includes("state:impl-l1") && labels.includes("evidence-ready");
}

function laneTarget(cell: PrCell, plan: PrCellPlan): PrCellLaneTarget {
  return {
    cell_id: cell.id,
    title: cell.title,
    repo: cell.repo,
    issue: cell.issue,
    parallel_group: cell.parallel_group,
    risk_route: cell.risk_route,
    audit_route: cell.audit_route,
    continue_after: cell.continuation_policy?.continue_after ?? plan.continuation_policy.continue_after,
    forbidden: cell.forbidden,
    evidence_required: cell.evidence_required,
  };
}

function finding(code: string, path: string, message: string): PrCellValidationFinding {
  return { code, path, message };
}

function validationReport(findings: PrCellValidationFinding[]): PrCellPlanValidationReport {
  return {
    schema: "shirube-pr-cell-plan-validation/v1",
    valid: findings.length === 0,
    findings,
  };
}

function compareLaneTargets(left: PrCellLaneTarget, right: PrCellLaneTarget): number {
  return left.repo.localeCompare(right.repo) || left.issue - right.issue || left.cell_id.localeCompare(right.cell_id);
}
