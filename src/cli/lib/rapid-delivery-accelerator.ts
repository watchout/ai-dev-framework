import {
  type ConveyorCellQueue,
  type ConveyorFinding,
  type ConveyorNextAction,
  type ConveyorQueuedCell,
  type ConveyorStateVerdict,
} from "./conveyor-state-machine.js";

export interface CellBatchPolicyInput {
  cellQueue: ConveyorCellQueue;
  cellIds?: string[];
  changedFiles?: string[];
  generatedAt?: string;
}

export interface CellBatchPolicyReport {
  schema: "shirube-cell-batch-policy/v1";
  verdict: ConveyorStateVerdict;
  would_block: boolean;
  batch_allowed: boolean;
  batch_reason_codes: string[];
  batch_id: string | null;
  covered_cells: string[];
  required_pr_count: number;
  required_audit_count: number;
  review_plan_profile: "docs_light" | "standard" | "runtime_policy_standard" | "protected";
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  generated_at: string;
}

export interface AuditUnitInput {
  cellQueue: ConveyorCellQueue;
  targetPr: number;
  exactHeadSha: string;
  cellIds: string[];
  reviewPlanRef?: string;
  generatedAt?: string;
}

export interface AuditUnitReport {
  schema: "shirube-audit-unit/v1";
  verdict: ConveyorStateVerdict;
  would_block: boolean;
  audit_unit_id: string | null;
  target_pr: number;
  exact_head_sha: string;
  covered_cells: string[];
  audit_item_sets: string[];
  review_plan_ref: string | null;
  owner_decision_scope: "pr_exact_head";
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  generated_at: string;
}

export interface ReauditClassificationInput {
  previousAuditedHead?: string;
  currentHead?: string;
  prBodyExactHead?: string;
  deltaChangedFiles?: string[];
  previousAuditVerdict?: string;
  validationRerun?: boolean;
  metadataOnlyConflictResolution?: boolean;
  functionalDiffChanged?: boolean;
}

export type ReauditClassification =
  | "full_reaudit_required"
  | "scoped_reaudit_allowed"
  | "metadata_refresh_required"
  | "blocked_unclassified_head_change";

export interface ReauditClassificationReport {
  schema: "shirube-reaudit-classification/v1";
  verdict: ConveyorStateVerdict;
  would_block: boolean;
  head_change: {
    previous_audited_head: string | null;
    current_head: string | null;
    classification: ReauditClassification;
    functional_diff_changed: boolean;
    metadata_only_conflict_resolution: boolean;
    required_next_action: "request_independent_audit" | "request_scoped_reaudit" | "refresh_exact_head_metadata" | "request_owner_planning_decision";
  };
  current_phase: "AUDIT_REQUIRED" | "SCOPED_REAUDIT_REQUIRED" | "METADATA_REFRESH_REQUIRED" | "BLOCKED";
  next_action: ConveyorNextAction;
  owner_approval_allowed: false;
  merge_ready_allowed: false;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
}

export interface PrUnit {
  pr_unit_id: string;
  covered_cells: string[];
  batch_allowed: boolean;
  audit_unit_id: string;
  review_plan_profile: string;
  allowed_paths: string[];
  forbidden_paths: string[];
}

export interface ConveyorDeliveryPlanReport {
  schema: "shirube-conveyor-delivery-plan/v1";
  verdict: ConveyorStateVerdict;
  parent_ssot: string | null;
  repo: string | null;
  pr_units: PrUnit[];
  audit_units: Array<Pick<AuditUnitReport, "schema" | "audit_unit_id" | "covered_cells" | "audit_item_sets" | "review_plan_ref">>;
  batch_policy: CellBatchPolicyReport;
  next_action: ConveyorNextAction;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  generated_at: string;
}

const LOW_RISK = new Set(["R0", "R1"]);
const BATCHABLE_CELL_TYPES = new Set([
  "docs_only",
  "docs_contract",
  "metadata_only",
  "evidence_completion",
  "source_ledger",
]);
const PROTECTED_PATH_PATTERNS = [
  /^src\//,
  /^app\//,
  /^api\//,
  /^lib\//,
  /^db\//,
  /^migrations\//,
  /^\.github\/workflows\//,
  /^\.github\/branch-protection\//,
  /^\.github\/rulesets\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
];
const PROTECTED_SURFACES = new Set([
  "runtime",
  "policy",
  "permissions",
  "security",
  "privacy",
  "legal",
  "auth",
  "db",
  "database",
  "workflow",
  "external",
  "api",
]);

export function buildCellBatchPolicy(input: CellBatchPolicyInput): CellBatchPolicyReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const cells = selectedCells(input.cellQueue, input.cellIds);
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const reasonCodes: string[] = [];

  if (cells.length === 0) {
    blockers.push(finding("BATCH-001", "no_cells_selected", "cells", "At least one Cell is required for a batch decision."));
  }

  const parentSsot = input.cellQueue.parent_ssot ?? "";
  const owners = unique(cells.map((cell) => cell.owner_actor ?? ""));
  if (!input.cellQueue.repo) blockers.push(finding("BATCH-002", "missing_repo", "repo", "Batch policy requires a repository."));
  if (!parentSsot) blockers.push(finding("BATCH-003", "missing_parent_ssot", "parent_ssot", "Batch policy requires a parent SSOT."));
  if (owners.filter(Boolean).length > 1) blockers.push(finding("BATCH-004", "different_owner", "cells.owner_actor", "Batch Cells must have the same owner."));

  for (const cell of cells) {
    const risk = riskClass(cell);
    const type = normalize(cell.cell_type);
    if (!LOW_RISK.has(risk) && cell.batchable !== true) {
      blockers.push(finding("BATCH-005", "risk_not_batchable", `cells.${cell.cell_id}.risk_class`, `${cell.cell_id} is ${risk || "unknown"} and is not explicitly batchable.`));
    }
    if (!BATCHABLE_CELL_TYPES.has(type) && cell.batchable !== true) {
      blockers.push(finding("BATCH-006", "cell_type_not_batchable", `cells.${cell.cell_id}.cell_type`, `${cell.cell_id} type ${cell.cell_type ?? "unknown"} is not batchable by default.`));
    }
    const surfaces = (cell.protected_surfaces ?? []).map(normalize);
    const protectedSurface = surfaces.find((surface) => PROTECTED_SURFACES.has(surface));
    if (protectedSurface && cell.batchable !== true) {
      blockers.push(finding("BATCH-007", "protected_surface_not_batchable", `cells.${cell.cell_id}.protected_surfaces`, `${cell.cell_id} touches protected surface ${protectedSurface}.`));
    }
    if (!dependenciesSatisfied(cell, cells)) {
      blockers.push(finding("BATCH-008", "conflicting_dependencies", `cells.${cell.cell_id}.depends_on`, `${cell.cell_id} has dependencies outside the selected batch or not already complete.`));
    }
  }

  const protectedFile = (input.changedFiles ?? []).find((file) => PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(file)));
  if (protectedFile) {
    blockers.push(finding("BATCH-009", "protected_path_changed", "changed_files", `Changed file ${protectedFile} requires isolated or protected review.`));
  }

  const allowedUnion = unique(cells.flatMap((cell) => cell.allowed_paths ?? []));
  const forbiddenUnion = unique(cells.flatMap((cell) => cell.forbidden_paths ?? []));
  if (allowedUnion.length === 0 || forbiddenUnion.length === 0) {
    blockers.push(finding("BATCH-010", "missing_path_boundaries", "cells.allowed_paths", "Batch requires allowed_paths and forbidden_paths union."));
  }

  if (blockers.length === 0) reasonCodes.push("SAFE_LOW_RISK_CELL_BATCH", "ONE_PR_ONE_AUDIT_UNIT");
  const batchAllowed = blockers.length === 0;
  const profile = batchAllowed ? reviewPlanProfile(cells) : stricterReviewProfile(cells);
  return {
    schema: "shirube-cell-batch-policy/v1",
    verdict: verdictFrom(blockers, warnings),
    would_block: blockers.length > 0,
    batch_allowed: batchAllowed,
    batch_reason_codes: batchAllowed ? reasonCodes : blockers.map((blocker) => blocker.code),
    batch_id: batchAllowed ? `BATCH-${slug(cells.map((cell) => cell.cell_id).join("-"))}` : null,
    covered_cells: cells.map((cell) => cell.cell_id).filter((id): id is string => Boolean(id)),
    required_pr_count: batchAllowed ? 1 : Math.max(1, cells.length),
    required_audit_count: batchAllowed ? 1 : Math.max(1, cells.length),
    review_plan_profile: profile,
    blockers,
    warnings,
    generated_at: generatedAt,
  };
}

export function buildAuditUnit(input: AuditUnitInput): AuditUnitReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const cells = selectedCells(input.cellQueue, input.cellIds);
  if (cells.length === 0) blockers.push(finding("AUDIT-UNIT-001", "no_covered_cells", "covered_cells", "Audit unit requires at least one covered Cell."));
  if (!Number.isInteger(input.targetPr) || input.targetPr <= 0) blockers.push(finding("AUDIT-UNIT-002", "invalid_target_pr", "target_pr", "Audit unit target_pr must be positive."));
  if (!isSha(input.exactHeadSha)) blockers.push(finding("AUDIT-UNIT-003", "invalid_exact_head", "exact_head_sha", "Audit unit exact_head_sha must be a git SHA."));
  const ids = cells.map((cell) => cell.cell_id).filter((id): id is string => Boolean(id));
  return {
    schema: "shirube-audit-unit/v1",
    verdict: verdictFrom(blockers, warnings),
    would_block: blockers.length > 0,
    audit_unit_id: blockers.length === 0 ? `AUDIT-UNIT-${slug(ids.join("-"))}` : null,
    target_pr: input.targetPr,
    exact_head_sha: input.exactHeadSha,
    covered_cells: ids,
    audit_item_sets: [
      "common_exact_head_scope_validation",
      ...ids.map((id) => `cell_specific_items:${id}`),
    ],
    review_plan_ref: input.reviewPlanRef ?? ".shirube/review-plan.yaml",
    owner_decision_scope: "pr_exact_head",
    blockers,
    warnings,
    generated_at: generatedAt,
  };
}

export function classifyReauditHeadChange(input: ReauditClassificationInput): ReauditClassificationReport {
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const previous = input.previousAuditedHead ?? null;
  const current = input.currentHead ?? null;
  const exact = input.prBodyExactHead ?? null;
  const files = input.deltaChangedFiles ?? [];
  const previousAccepted = ["PASS", "PASS_WITH_WARN", "APPROVED"].includes(String(input.previousAuditVerdict ?? "").toUpperCase());
  let classification: ReauditClassification;

  if (!previous || !current || files.length === 0) {
    classification = "blocked_unclassified_head_change";
    blockers.push(finding("REAUDIT-001", "missing_head_change_context", "head_change", "Previous head, current head, and delta changed files are required."));
  } else if (exact !== current) {
    classification = "metadata_refresh_required";
  } else if (!input.validationRerun || !previousAccepted) {
    classification = "blocked_unclassified_head_change";
    blockers.push(finding("REAUDIT-002", "missing_validation_or_previous_pass", "validation", "Scoped re-audit requires current validation and a previous PASS/PASS_WITH_WARN audit."));
  } else if (input.functionalDiffChanged || files.some(isProtectedPath)) {
    classification = "full_reaudit_required";
  } else if (input.metadataOnlyConflictResolution === true || files.every(isMetadataPath)) {
    classification = "scoped_reaudit_allowed";
  } else {
    classification = "blocked_unclassified_head_change";
    blockers.push(finding("REAUDIT-003", "unclassified_head_change", "delta_changed_files", "Head change is not classified as metadata-only and does not have a full audit route."));
  }

  const phase = phaseForReaudit(classification);
  const nextActionName = nextActionForReaudit(classification);
  const wouldBlock = true;
  return {
    schema: "shirube-reaudit-classification/v1",
    verdict: blockers.length > 0 || classification === "blocked_unclassified_head_change" ? "BLOCKED" : classification === "scoped_reaudit_allowed" ? "PASS_WITH_WARN" : "BLOCKED",
    would_block: wouldBlock,
    head_change: {
      previous_audited_head: previous,
      current_head: current,
      classification,
      functional_diff_changed: Boolean(input.functionalDiffChanged),
      metadata_only_conflict_resolution: Boolean(input.metadataOnlyConflictResolution),
      required_next_action: nextActionName,
    },
    current_phase: phase,
    next_action: action(nextActionName, nextActionName === "refresh_exact_head_metadata" ? "dev" : "auditor", nextActionName === "refresh_exact_head_metadata" ? "dev" : "independent_reviewer", reasonForReaudit(classification)),
    owner_approval_allowed: false,
    merge_ready_allowed: false,
    blockers,
    warnings,
  };
}

export function buildConveyorDeliveryPlan(input: CellBatchPolicyInput): ConveyorDeliveryPlanReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const cells = selectedCells(input.cellQueue, input.cellIds).filter((cell) => cell.status === "ready_for_implementation");
  const policy = buildCellBatchPolicy({ ...input, cellIds: cells.map((cell) => cell.cell_id ?? "") });
  const blockers = [...policy.blockers];
  const warnings = [...policy.warnings];
  const prUnits: PrUnit[] = [];
  if (policy.batch_allowed) {
    prUnits.push(prUnitForCells(cells, "PR-UNIT-001", policy.review_plan_profile));
  } else if (cells.length > 1 && cells.every((cell) => cell.priority === undefined && cell.order === undefined)) {
    blockers.push(finding("CONV-BATCH-001", "ambiguous_batch_ordering", "cell_queue.cells", "Multiple ready Cells cannot be batched and have no priority/order."));
  } else {
    for (const [index, cell] of [...cells].sort((a, b) => priorityValue(a) - priorityValue(b)).entries()) {
      prUnits.push(prUnitForCells([cell], `PR-UNIT-${String(index + 1).padStart(3, "0")}`, reviewPlanProfile([cell])));
    }
  }
  const auditUnits = prUnits.map((unit) => ({
    schema: "shirube-audit-unit/v1" as const,
    audit_unit_id: unit.audit_unit_id,
    covered_cells: unit.covered_cells,
    audit_item_sets: [
      "common_exact_head_scope_validation",
      ...unit.covered_cells.map((cellId) => `cell_specific_items:${cellId}`),
    ],
    review_plan_ref: `.shirube/pr-units/${unit.pr_unit_id}/review-plan.yaml`,
  }));
  const verdict = verdictFrom(blockers, warnings);
  return {
    schema: "shirube-conveyor-delivery-plan/v1",
    verdict,
    parent_ssot: input.cellQueue.parent_ssot ?? null,
    repo: input.cellQueue.repo ?? null,
    pr_units: verdict === "BLOCKED" ? [] : prUnits,
    audit_units: verdict === "BLOCKED" ? [] : auditUnits,
    batch_policy: policy,
    next_action: verdict === "BLOCKED"
      ? action("request_owner_planning_decision", "owner", "owner", "Batching is ambiguous or blocked; owner planning decision is required.")
      : action("open_next_pr_unit", "lead", "lead", "Open or emit the next PR unit; audit and owner decision remain exact-head gates."),
    blockers,
    warnings,
    generated_at: generatedAt,
  };
}

function selectedCells(queue: ConveyorCellQueue, cellIds?: string[]): ConveyorQueuedCell[] {
  const cells = queue.cells ?? [];
  const requested = (cellIds ?? []).filter(Boolean);
  if (requested.length === 0) return cells;
  const wanted = new Set(requested);
  return cells.filter((cell) => cell.cell_id && wanted.has(cell.cell_id));
}

function dependenciesSatisfied(cell: ConveyorQueuedCell, selected: ConveyorQueuedCell[]): boolean {
  const selectedIds = new Set(selected.map((entry) => entry.cell_id).filter(Boolean));
  return (cell.depends_on ?? []).every((dependency) => selectedIds.has(dependency));
}

function prUnitForCells(cells: ConveyorQueuedCell[], id: string, profile: string): PrUnit {
  const cellIds = cells.map((cell) => cell.cell_id).filter((cellId): cellId is string => Boolean(cellId));
  return {
    pr_unit_id: id,
    covered_cells: cellIds,
    batch_allowed: cells.length > 1,
    audit_unit_id: `AUDIT-UNIT-${slug(cellIds.join("-"))}`,
    review_plan_profile: profile,
    allowed_paths: unique(cells.flatMap((cell) => cell.allowed_paths ?? [])),
    forbidden_paths: unique(cells.flatMap((cell) => cell.forbidden_paths ?? [])),
  };
}

function reviewPlanProfile(cells: ConveyorQueuedCell[]): "docs_light" | "standard" | "runtime_policy_standard" | "protected" {
  if (cells.some((cell) => ["R3", "R4"].includes(riskClass(cell)) || (cell.protected_surfaces ?? []).length > 0)) return "protected";
  if (cells.some((cell) => riskClass(cell) === "R2" || /runtime|policy/i.test(String(cell.cell_type ?? "")))) return "runtime_policy_standard";
  if (cells.every((cell) => /docs|metadata|evidence|ledger/i.test(String(cell.cell_type ?? "")))) return "docs_light";
  return "standard";
}

function stricterReviewProfile(cells: ConveyorQueuedCell[]): "docs_light" | "standard" | "runtime_policy_standard" | "protected" {
  return reviewPlanProfile(cells);
}

function riskClass(cell: ConveyorQueuedCell): string {
  return String(cell.risk_class ?? cell.risk_tier ?? "").toUpperCase();
}

function priorityValue(cell: ConveyorQueuedCell): number {
  if (typeof cell.priority === "number") return cell.priority;
  if (typeof cell.order === "number") return cell.order;
  return Number.MAX_SAFE_INTEGER;
}

function isProtectedPath(file: string): boolean {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(file));
}

function isMetadataPath(file: string): boolean {
  return /^\.shirube\//.test(file) || /^docs\//.test(file) || /^test\/fixtures\//.test(file);
}

function phaseForReaudit(classification: ReauditClassification): ReauditClassificationReport["current_phase"] {
  if (classification === "metadata_refresh_required") return "METADATA_REFRESH_REQUIRED";
  if (classification === "scoped_reaudit_allowed") return "SCOPED_REAUDIT_REQUIRED";
  if (classification === "full_reaudit_required") return "AUDIT_REQUIRED";
  return "BLOCKED";
}

function nextActionForReaudit(classification: ReauditClassification): ReauditClassificationReport["head_change"]["required_next_action"] {
  if (classification === "metadata_refresh_required") return "refresh_exact_head_metadata";
  if (classification === "scoped_reaudit_allowed") return "request_scoped_reaudit";
  if (classification === "full_reaudit_required") return "request_independent_audit";
  return "request_owner_planning_decision";
}

function reasonForReaudit(classification: ReauditClassification): string {
  if (classification === "metadata_refresh_required") return "Refresh PR exact-head metadata before audit or owner decision.";
  if (classification === "scoped_reaudit_allowed") return "Request scoped re-audit for metadata-only or conflict-resolution head change.";
  if (classification === "full_reaudit_required") return "Functional or protected-surface delta requires full independent audit.";
  return "Head change could not be safely classified.";
}

function verdictFrom(blockers: ConveyorFinding[], warnings: ConveyorFinding[]): ConveyorStateVerdict {
  if (blockers.length > 0) return "BLOCKED";
  if (warnings.length > 0) return "PASS_WITH_WARN";
  return "PASS";
}

function finding(itemId: string, code: string, path: string, message: string): ConveyorFinding {
  return { item_id: itemId, code, path, message };
}

function action(actionName: string, responsibleRole: string, allowedActorRole: string, reason: string): ConveyorNextAction {
  return {
    action: actionName,
    responsible_role: responsibleRole,
    allowed_actor_role: allowedActorRole,
    reason,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))];
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isSha(value: string): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value);
}
