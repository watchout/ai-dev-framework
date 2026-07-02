import { writeFileSync } from "node:fs";
import {
  buildWorkOrderDocument,
  buildWorkOrderValidationReport,
  type WorkOrderValidationReport,
} from "./orchestration-contract.js";

export type ConveyorStateVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED" | "FAILURE";

export type ConveyorCellStatus =
  | "planned"
  | "ready_for_implementation"
  | "implementation_in_progress"
  | "pr_open"
  | "audit_required"
  | "owner_decision_required"
  | "merge_ready"
  | "merged"
  | "blocked"
  | "skipped";

export interface ConveyorFinding {
  item_id: string;
  code: string;
  path: string;
  message: string;
}

export interface ConveyorNextAction {
  action: string;
  responsible_role: string;
  allowed_actor_role: string;
  reason: string;
}

export interface ConveyorCellQueue {
  schema_version?: string;
  schema?: string;
  parent_ssot?: string;
  repo?: string;
  cells?: ConveyorQueuedCell[];
}

export interface ConveyorQueuedCell {
  cell_id?: string;
  status?: ConveyorCellStatus | string;
  depends_on?: string[];
  priority?: number;
  order?: number;
  goal?: string;
  acceptance_criteria?: string[];
  risk_class?: string;
  risk_tier?: string;
  cell_type?: string;
  protected_surfaces?: string[];
  allowed_paths?: string[];
  forbidden_paths?: string[];
  expected_outputs?: string[];
  implementation_pr_plan?: {
    mode?: string;
    prs?: Array<{
      id?: string;
      pr_role?: string;
      title?: string;
      completes_cell?: boolean;
      depends_on?: string[];
    }>;
  };
  validation_plan?: {
    required_commands?: string[];
    required_evidence?: string[];
  };
  audit_checklist_ref?: string;
  close_condition?: string;
  pr_number?: number;
  merge_commit?: string;
  merged_at?: string;
  title?: string;
  scope?: string[];
  non_scope?: string[];
  validation?: {
    required_commands?: string[];
    required_evidence?: string[];
  };
  owner_actor?: string;
  target_package?: string;
  target_capability?: string;
  framework_ref?: string;
  source_ref?: string;
}

export interface ConveyorPostMergeEvidence {
  schema_version?: string;
  repo?: string;
  parent_ssot?: string;
  source_pr?: number;
  merged_pr?: number;
  pr_number?: number;
  pr?: number;
  approved_head_sha?: string;
  exact_merged_head?: string;
  merged_head?: string;
  merge_commit?: string;
  merge_commit_sha?: string;
  merged_at?: string;
  merged_at_utc?: string;
  post_merge_smoke?: string;
  post_merge_smoke_or_NA?: string;
  unresolved_follow_up_blockers?: unknown[];
  follow_up_blockers?: unknown[];
  next_step?: string;
}

export interface BuildConveyorNextInput {
  parentSsot: string;
  repo: string;
  afterMergePr: number;
  mergeCommit: string;
  cellQueue: ConveyorCellQueue;
  postMergeEvidence: ConveyorPostMergeEvidence;
  generatedAt?: string;
}

export interface ConveyorNextReport {
  schema: "shirube-conveyor-next/v1";
  verdict: ConveyorStateVerdict;
  parent_ssot: string;
  completed_pr: number;
  completed_merge_commit: string;
  completed_cell_id: string | null;
  next_action: ConveyorNextAction;
  next_cell_id: string | null;
  next_cell_status: string | null;
  required_inputs: string[];
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  generated_at: string;
}

export interface BuildConveyorPlanInput {
  cellQueue: ConveyorCellQueue;
  cellId: string;
  parentSsot?: string;
  repo?: string;
  frameworkRef?: string;
  ownerActor?: string;
  generatedAt?: string;
}

export interface ConveyorPlanReport {
  schema: "shirube-conveyor-plan/v1";
  verdict: ConveyorStateVerdict;
  parent_ssot: string | null;
  repo: string | null;
  cell_id: string | null;
  next_action: ConveyorNextAction;
  handoff_draft: Record<string, unknown> | null;
  audit_checklist_draft: Record<string, unknown> | null;
  review_plan_draft: Record<string, unknown> | null;
  validation_commands: string[];
  allowed_paths: string[];
  forbidden_paths: string[];
  risk_class: string | null;
  protected_surfaces: string[];
  work_order_preview: Record<string, unknown> | null;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  generated_at: string;
}

export interface ConveyorOpenPrPlan {
  schema: "shirube-conveyor-open-pr/v1";
  verdict: ConveyorStateVerdict;
  mode: "draft_pr_plan_only";
  mutation_performed: false;
  draft_pr_required: true;
  owner_approval_synthesized: false;
  merge_performed: false;
  branch_protection_mutated: false;
  required_checks_mutated: false;
  cell_id: string | null;
  title: string | null;
  body: string | null;
  next_action: ConveyorNextAction;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
}

export interface ConveyorPostMergeRecordInput {
  repo: string;
  parentSsot?: string;
  pr: number;
  mergedHead: string;
  mergeCommit: string;
  mergedAt: string;
  postMergeSmokeOrNa: string;
  nextStep: string;
  out?: string;
}

export interface ConveyorPostMergeRecord {
  schema: "shirube-conveyor-post-merge-record/v1";
  verdict: ConveyorStateVerdict;
  evidence: Record<string, unknown>;
  written_to: string | null;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
}

export interface ConveyorWorkOrderExportInput extends BuildConveyorPlanInput {
  targetCapability?: string;
  out?: string;
}

interface ConveyorCellSelection {
  cell?: ConveyorQueuedCell;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
  requiredInputs: string[];
  nextAction: ConveyorNextAction;
}

export interface ConveyorWorkOrderExportReport {
  schema: "shirube-conveyor-work-order-export/v1";
  verdict: ConveyorStateVerdict;
  would_block: boolean;
  cell_id: string | null;
  work_order: Record<string, unknown> | null;
  validation: WorkOrderValidationReport | null;
  out: string | null;
  blockers: ConveyorFinding[];
  warnings: ConveyorFinding[];
}

const CELL_QUEUE_SCHEMA = "shirube-cell-queue/v1";
const READY_STATUS = "ready_for_implementation";
const MERGED_STATUS = "merged";
const COMPLETION_STATUSES = new Set(["merged", "skipped"]);
const ACTIVE_BLOCKED_STATUSES = new Set(["blocked"]);
const REQUIRED_CELL_INPUTS = [
  "goal",
  "acceptance_criteria",
  "non_scope",
  "risk_class",
  "cell_type",
  "allowed_paths",
  "forbidden_paths",
  "expected_outputs",
  "implementation_pr_plan",
  "validation_plan",
  "audit_checklist_ref",
  "close_condition",
];

export function buildConveyorNext(input: BuildConveyorNextInput): ConveyorNextReport {
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  validateQueueEnvelope(input.cellQueue, input.parentSsot, input.repo, blockers);
  validatePostMergeEvidence(input.postMergeEvidence, input, blockers);

  const cells = input.cellQueue.cells ?? [];
  const completedCell = findCompletedCell(cells, input.afterMergePr, input.mergeCommit);
  if (!completedCell) {
    blockers.push(finding("CONV-MERGE-004", "completed_cell_missing", "cell_queue.cells", "No queued Cell matches the merged PR or merge commit."));
  }

  const selection = blockers.length === 0
    ? selectNextCell(cells, completedCell?.cell_id)
    : emptySelection("record_post_merge_evidence", "Post-merge evidence must be corrected before selecting the next Cell.");

  blockers.push(...selection.blockers);
  warnings.push(...selection.warnings);
  const verdict = verdictFromFindings(blockers, warnings);
  const selected = selection.cell ?? null;
  return {
    schema: "shirube-conveyor-next/v1",
    verdict,
    parent_ssot: input.parentSsot,
    completed_pr: input.afterMergePr,
    completed_merge_commit: input.mergeCommit,
    completed_cell_id: completedCell?.cell_id ?? null,
    next_action: selection.nextAction,
    next_cell_id: selected?.cell_id ?? null,
    next_cell_status: selected?.status ?? null,
    required_inputs: selected ? missingCellInputs(selected) : selection.requiredInputs,
    blockers,
    warnings,
    generated_at: generatedAt,
  };
}

export function buildConveyorPlan(input: BuildConveyorPlanInput): ConveyorPlanReport {
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  validateQueueEnvelope(input.cellQueue, input.parentSsot ?? input.cellQueue.parent_ssot ?? "", input.repo ?? input.cellQueue.repo ?? "", blockers, { allowMissingExpectation: true });
  const cell = findCell(input.cellQueue, input.cellId);
  if (!cell) {
    blockers.push(finding("CONV-PLAN-001", "cell_not_found", "cell_id", `Cell ${input.cellId} was not found in the queue.`));
  }
  if (cell) {
    for (const missing of missingCellInputs(cell)) {
      blockers.push(finding("CONV-CELL-001", "missing_required_input", `cells.${cell.cell_id}.${missing}`, `Cell ${cell.cell_id} is missing required input ${missing}.`));
    }
  }
  const verdict = verdictFromFindings(blockers, warnings);
  const parentSsot = input.parentSsot ?? input.cellQueue.parent_ssot ?? null;
  const repo = input.repo ?? input.cellQueue.repo ?? null;
  const handoff = cell && blockers.length === 0 ? buildHandoffDraft(cell, parentSsot, repo) : null;
  const reviewPlan = cell && blockers.length === 0 ? buildReviewPlanDraft(cell) : null;
  const checklist = cell && blockers.length === 0 ? buildAuditChecklistDraft(cell, repo) : null;
  const workOrder = cell && blockers.length === 0 ? buildCellWorkOrder(cell, {
    repo: repo ?? "unknown/unknown",
    parentSsot: parentSsot ?? undefined,
    frameworkRef: input.frameworkRef ?? cell.framework_ref ?? "watchout/ai-dev-framework@<PINNED_SHA>",
    ownerActor: input.ownerActor ?? cell.owner_actor ?? "<owner>",
    generatedAt,
    targetCapability: cell.target_capability ?? "cell_implementation",
  }) : null;

  return {
    schema: "shirube-conveyor-plan/v1",
    verdict,
    parent_ssot: parentSsot,
    repo,
    cell_id: cell?.cell_id ?? input.cellId,
    next_action: blockers.length > 0
      ? action("complete_cell_inputs", "lead", "lead", "The Cell cannot be handed off until required queue inputs are complete.")
      : action("prepare_next_cell_handoff", "lead", "lead", `Prepare handoff, audit checklist, and review plan for ${cell?.cell_id}.`),
    handoff_draft: handoff,
    audit_checklist_draft: checklist,
    review_plan_draft: reviewPlan,
    validation_commands: cell ? validationCommands(cell) : [],
    allowed_paths: cell?.allowed_paths ?? [],
    forbidden_paths: cell?.forbidden_paths ?? [],
    risk_class: cell ? riskClass(cell) : null,
    protected_surfaces: cell?.protected_surfaces ?? [],
    work_order_preview: workOrder,
    blockers,
    warnings,
    generated_at: generatedAt,
  };
}

export function buildConveyorOpenPrPlan(plan: ConveyorPlanReport): ConveyorOpenPrPlan {
  const blockers = [...plan.blockers];
  const warnings = [...plan.warnings];
  const title = plan.cell_id ? `[Shirube Cell] ${plan.cell_id}` : null;
  const body = plan.handoff_draft
    ? [
        "Draft PR generated by Shirube Conveyor plan.",
        "",
        `CELL-ID: ${plan.cell_id}`,
        `parent_ssot: ${plan.parent_ssot ?? "<parent-ssot>"}`,
        `review_plan_ref: ${String(plan.handoff_draft.review_plan_ref ?? "<review-plan-ref>")}`,
        "",
        "This command does not synthesize audit, owner approval, or merge authority.",
      ].join("\n")
    : null;
  return {
    schema: "shirube-conveyor-open-pr/v1",
    verdict: plan.verdict,
    mode: "draft_pr_plan_only",
    mutation_performed: false,
    draft_pr_required: true,
    owner_approval_synthesized: false,
    merge_performed: false,
    branch_protection_mutated: false,
    required_checks_mutated: false,
    cell_id: plan.cell_id,
    title,
    body,
    next_action: plan.verdict === "BLOCKED"
      ? action("fix_conveyor_plan_before_pr", "lead", "lead", "Draft PR opening is blocked until the conveyor plan is complete.")
      : action("open_draft_pr", "lead", "lead", "Open a draft PR with the generated handoff; audit and owner approval remain separate gates."),
    blockers,
    warnings,
  };
}

export function buildConveyorWorkOrderExport(input: ConveyorWorkOrderExportInput): ConveyorWorkOrderExportReport {
  const plan = buildConveyorPlan(input);
  if (plan.verdict === "BLOCKED" || !plan.work_order_preview) {
    return {
      schema: "shirube-conveyor-work-order-export/v1",
      verdict: plan.verdict,
      would_block: true,
      cell_id: plan.cell_id,
      work_order: null,
      validation: null,
      out: input.out ?? null,
      blockers: plan.blockers,
      warnings: plan.warnings,
    };
  }
  const validation = buildWorkOrderValidationReport(input.out ?? null, plan.work_order_preview);
  if (validation.verdict !== "BLOCKED" && input.out) {
    writeFileSync(input.out, `${JSON.stringify(plan.work_order_preview, null, 2)}\n`);
  }
  return {
    schema: "shirube-conveyor-work-order-export/v1",
    verdict: validation.verdict,
    would_block: validation.would_block,
    cell_id: plan.cell_id,
    work_order: plan.work_order_preview,
    validation,
    out: input.out ?? null,
    blockers: validation.blockers.map(contractFinding),
    warnings: validation.warnings.map(contractFinding),
  };
}

export function buildConveyorPostMergeRecord(input: ConveyorPostMergeRecordInput): ConveyorPostMergeRecord {
  const blockers: ConveyorFinding[] = [];
  if (!input.repo) blockers.push(finding("CONV-POST-001", "missing_repo", "repo", "Repository is required."));
  if (!Number.isInteger(input.pr) || input.pr <= 0) blockers.push(finding("CONV-POST-002", "invalid_pr", "pr", "Merged PR number must be positive."));
  if (!isShaLike(input.mergedHead)) blockers.push(finding("CONV-POST-003", "invalid_merged_head", "merged_head", "Merged head must be a git SHA."));
  if (!isShaLike(input.mergeCommit)) blockers.push(finding("CONV-POST-004", "invalid_merge_commit", "merge_commit", "Merge commit must be a git SHA."));
  if (Number.isNaN(Date.parse(input.mergedAt))) blockers.push(finding("CONV-POST-005", "invalid_merged_at", "merged_at", "Merged timestamp must be ISO-8601."));
  const evidence = {
    schema_version: "shirube-post-merge-evidence/v1",
    repo: input.repo,
    parent_ssot: input.parentSsot,
    merged_pr: input.pr,
    exact_merged_head: input.mergedHead,
    merge_commit: input.mergeCommit,
    merged_at: input.mergedAt,
    post_merge_smoke_or_NA: input.postMergeSmokeOrNa,
    unresolved_follow_up_blockers: [],
    next_step: input.nextStep,
  };
  const verdict = verdictFromFindings(blockers, []);
  if (verdict !== "BLOCKED" && input.out) {
    writeFileSync(input.out, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  return {
    schema: "shirube-conveyor-post-merge-record/v1",
    verdict,
    evidence,
    written_to: verdict !== "BLOCKED" ? input.out ?? null : null,
    blockers,
    warnings: [],
  };
}

function validateQueueEnvelope(
  queue: ConveyorCellQueue,
  parentSsot: string,
  repo: string,
  blockers: ConveyorFinding[],
  options: { allowMissingExpectation?: boolean } = {},
): void {
  const schema = queue.schema_version ?? queue.schema;
  if (schema !== CELL_QUEUE_SCHEMA) {
    blockers.push(finding("CONV-QUEUE-001", "invalid_cell_queue_schema", "cell_queue.schema_version", "Cell queue schema_version must be shirube-cell-queue/v1."));
  }
  if (!Array.isArray(queue.cells)) {
    blockers.push(finding("CONV-QUEUE-002", "missing_cells", "cell_queue.cells", "Cell queue must include cells[]."));
  }
  if (!options.allowMissingExpectation && queue.parent_ssot !== parentSsot) {
    blockers.push(finding("CONV-QUEUE-003", "parent_ssot_mismatch", "cell_queue.parent_ssot", "Cell queue parent_ssot must match --parent-ssot."));
  }
  if (!options.allowMissingExpectation && queue.repo !== repo) {
    blockers.push(finding("CONV-QUEUE-004", "repo_mismatch", "cell_queue.repo", "Cell queue repo must match --repo."));
  }
}

function validatePostMergeEvidence(evidence: ConveyorPostMergeEvidence, input: BuildConveyorNextInput, blockers: ConveyorFinding[]): void {
  const pr = evidencePr(evidence);
  const commit = evidenceMergeCommit(evidence);
  const smoke = evidence.post_merge_smoke_or_NA ?? evidence.post_merge_smoke;
  const unresolved = unresolvedBlockers(evidence);
  if (evidence.repo && evidence.repo !== input.repo) {
    blockers.push(finding("CONV-MERGE-001", "post_merge_repo_mismatch", "post_merge_evidence.repo", "Post-merge evidence repo must match --repo."));
  }
  if (evidence.parent_ssot && evidence.parent_ssot !== input.parentSsot) {
    blockers.push(finding("CONV-MERGE-002", "post_merge_parent_mismatch", "post_merge_evidence.parent_ssot", "Post-merge evidence parent_ssot must match --parent-ssot."));
  }
  if (pr !== input.afterMergePr) {
    blockers.push(finding("CONV-MERGE-003", "merged_pr_mismatch", "post_merge_evidence.merged_pr", "Post-merge evidence PR must match --after-merge-pr."));
  }
  if (commit !== input.mergeCommit) {
    blockers.push(finding("CONV-MERGE-005", "merge_commit_mismatch", "post_merge_evidence.merge_commit", "Post-merge evidence merge commit must match --merge-commit."));
  }
  if (String(smoke ?? "").toUpperCase() === "FAIL") {
    blockers.push(finding("CONV-MERGE-006", "post_merge_smoke_failed", "post_merge_evidence.post_merge_smoke", "Post-merge smoke must not be FAIL."));
  }
  if (unresolved.length > 0) {
    blockers.push(finding("CONV-MERGE-007", "unresolved_follow_up_blocker", "post_merge_evidence.unresolved_follow_up_blockers", "Post-merge evidence has unresolved follow-up blockers."));
  }
}

function selectNextCell(cells: ConveyorQueuedCell[], completedCellId: string | undefined): ConveyorCellSelection {
  const blockers: ConveyorFinding[] = [];
  const warnings: ConveyorFinding[] = [];
  const ready = cells.filter((cell) => normalizedStatus(cell, completedCellId) === READY_STATUS);
  const blockedDeps = ready.filter((cell) => hasBlockedDependency(cell, cells, completedCellId));
  const eligible = ready.filter((cell) => dependenciesSatisfied(cell, cells, completedCellId));
  const inputIncomplete = eligible.filter((cell) => missingCellInputs(cell).length > 0);
  if (inputIncomplete.length > 0) {
    for (const cell of inputIncomplete) {
      for (const missing of missingCellInputs(cell)) {
        blockers.push(finding("CONV-CELL-001", "missing_required_input", `cells.${cell.cell_id ?? "<unknown>"}.${missing}`, `Ready Cell ${cell.cell_id ?? "<unknown>"} is missing required input ${missing}.`));
      }
    }
    return {
      blockers,
      warnings,
      requiredInputs: [...new Set(inputIncomplete.flatMap(missingCellInputs))],
      nextAction: action("complete_cell_inputs", "lead", "lead", "A ready Cell is missing required handoff inputs."),
    };
  }
  if (eligible.length === 0) {
    if (blockedDeps.length > 0) {
      blockers.push(finding("CONV-DEP-001", "blocked_dependency_prevents_selection", "cell_queue.cells.depends_on", "A ready Cell depends on a blocked or skipped dependency."));
      return {
        blockers,
        warnings,
        requiredInputs: [],
        nextAction: action("resolve_blocked_dependency", "lead", "lead", "Resolve the blocked dependency before selecting the next Cell."),
      };
    }
    warnings.push(finding("CONV-NEXT-001", "no_next_cell_available", "cell_queue.cells", "No Cell is currently ready for implementation."));
    return {
      blockers,
      warnings,
      requiredInputs: [],
      nextAction: action("update_cell_queue", "lead", "lead", "No ready Cell was found; update the delivery graph or record queue completion."),
    };
  }
  if (eligible.length > 1 && eligible.every((cell) => cell.priority === undefined && cell.order === undefined)) {
    blockers.push(finding("CONV-NEXT-002", "ambiguous_ready_cells_without_priority", "cell_queue.cells", "Multiple Cells are ready and no explicit priority/order exists."));
    return {
      blockers,
      warnings,
      requiredInputs: [],
      nextAction: action("request_owner_planning_decision", "owner", "owner", "Owner planning decision is required because multiple Cells are ready without priority."),
    };
  }
  const sorted = [...eligible].sort((a, b) => priorityValue(a) - priorityValue(b));
  return {
    cell: sorted[0],
    blockers,
    warnings,
    requiredInputs: [],
    nextAction: action("open_next_cell_pr", "lead", "lead", `Open or emit a draft workflow for ${sorted[0].cell_id}.`),
  };
}

function emptySelection(nextActionName: string, reason: string): ConveyorCellSelection {
  return {
    blockers: [],
    warnings: [],
    requiredInputs: [],
    nextAction: action(nextActionName, "lead", "lead", reason),
  };
}

function buildHandoffDraft(cell: ConveyorQueuedCell, parentSsot: string | null, repo: string | null): Record<string, unknown> {
  const cellId = requireCellId(cell);
  return {
    schema_version: "shirube-control-handoff/v1",
    cell_id: cellId,
    parent_ssot: parentSsot,
    repo,
    scope: nonEmpty(cell.scope, cell.expected_outputs),
    goal: cell.goal,
    acceptance_criteria: cell.acceptance_criteria ?? cell.expected_outputs,
    non_scope: nonEmpty(cell.non_scope, [
      "audit synthesis",
      "owner approval synthesis",
      "merge",
      "required check activation",
      "branch protection mutation",
      "ruleset mutation",
      "AUN queue mutation",
    ]),
    risk_class: riskClass(cell),
    cell_type: cell.cell_type,
    allowed_paths: cell.allowed_paths,
    forbidden_paths: cell.forbidden_paths,
    implementation_pr_plan: cell.implementation_pr_plan,
    close_condition: cell.close_condition,
    protected_surfaces: {
      declared: cell.protected_surfaces ?? [],
      touched: (cell.protected_surfaces ?? []).length > 0,
      reason: "Derived from shirube-cell-queue/v1. Review requirements must come from review_plan, not prose.",
    },
    validation: {
      required_commands: validationCommands(cell),
      required_evidence: validationEvidence(cell),
    },
    review_plan_ref: `.shirube/work-orders/${slugCell(cellId)}/review-plan.yaml`,
    audit_checklist_ref: cell.audit_checklist_ref ?? `.shirube/work-orders/${slugCell(cellId)}/audit-checklist.yaml`,
    owner_decision: {
      required: true,
      exact_head_required: true,
      allowed_after: ["base_audit_complete", "all_additional_reviews_complete"],
    },
    post_merge_evidence_required: true,
  };
}

function buildReviewPlanDraft(cell: ConveyorQueuedCell): Record<string, unknown> {
  const risk = riskClass(cell);
  const protectedSurfaces = cell.protected_surfaces ?? [];
  const additionalReviews = additionalReviewsFor(risk, protectedSurfaces, cell.cell_type ?? "");
  return {
    schema_version: "shirube-review-plan/v1",
    base_audit: {
      required: true,
      type: "independent_structured_audit",
      checklist_profile: checklistProfileFor(risk, protectedSurfaces, cell.cell_type ?? ""),
    },
    additional_reviews: additionalReviews,
    owner_decision: {
      required: true,
      allowed_after: additionalReviews.length > 0
        ? ["base_audit_complete", "all_additional_reviews_complete"]
        : ["base_audit_complete"],
    },
    decision_basis: {
      risk_class: risk,
      cell_type: cell.cell_type,
      protected_surfaces: protectedSurfaces,
      changed_surface_summary: protectedSurfaces,
      reason_codes: additionalReviews.length > 0
        ? ["CONVEYOR_REVIEW_PLAN_REQUIRED", "ADDITIONAL_REVIEW_BY_POLICY"]
        : ["CONVEYOR_REVIEW_PLAN_REQUIRED", "NO_ADDITIONAL_PROTECTED_REVIEW"],
    },
  };
}

function buildAuditChecklistDraft(cell: ConveyorQueuedCell, repo: string | null): Record<string, unknown> {
  const cellId = requireCellId(cell);
  const items = [
    {
      item_id: "AUDIT-001",
      source: "allowed_paths",
      verification_method: "executable",
      required: true,
      prompt: "Verify changed files are inside allowed_paths.",
      expected_evidence: ["diff_path_check"],
    },
    {
      item_id: "AUDIT-002",
      source: "forbidden_paths",
      verification_method: "executable",
      required: true,
      prompt: "Verify changed files do not touch forbidden_paths.",
      expected_evidence: ["diff_path_check"],
    },
    {
      item_id: "AUDIT-003",
      source: "owner_decision",
      verification_method: "semantic",
      required: true,
      prompt: "Verify owner exact-head decision is requested only after required audit/review completion.",
      expected_evidence: ["owner_decision_ref"],
    },
    {
      item_id: "AUDIT-004",
      source: "post_merge",
      verification_method: "executable",
      required: true,
      prompt: "Verify post-merge evidence is required before Cell completion.",
      expected_evidence: ["post_merge_evidence_ref"],
    },
    {
      item_id: "AUDIT-005",
      source: "cell_acceptance",
      verification_method: "semantic",
      required: true,
      prompt: "Verify the implementation evidence satisfies every Cell acceptance criterion.",
      expected_evidence: ["acceptance_criteria_trace"],
    },
    {
      item_id: "AUDIT-006",
      source: "implementation_pr_plan",
      verification_method: "semantic",
      required: true,
      prompt: "Verify the PR role, completes_cell flag, and close condition match the Cell implementation PR plan.",
      expected_evidence: ["pr_role", "completes_cell", "close_condition"],
    },
  ];
  for (const command of validationCommands(cell)) {
    items.push({
      item_id: `AUDIT-CMD-${String(items.length + 1).padStart(3, "0")}`,
      source: "validation_command",
      verification_method: "executable",
      required: true,
      prompt: `Verify required command passed: ${command}`,
      expected_evidence: ["validation_result"],
    });
  }
  return {
    schema_version: "shirube-audit-checklist/v1",
    audit_checklist_id: `AUDIT-CHECKLIST-${cellId}`,
    source: {
      handoff_ref: `.shirube/work-orders/${slugCell(cellId)}/control-handoff.yaml`,
      cell_id: cellId,
      pr: repo ? `${repo}#<draft-pr>` : "<repo>#<draft-pr>",
    },
    items,
  };
}

function buildCellWorkOrder(cell: ConveyorQueuedCell, input: {
  repo: string;
  parentSsot?: string;
  frameworkRef: string;
  ownerActor: string;
  generatedAt: string;
  targetCapability: string;
}): Record<string, unknown> {
  const cellId = requireCellId(cell);
  return buildWorkOrderDocument({
    workOrderId: `WO-${cellId.replace(/^CELL-/, "")}`,
    repo: input.repo,
    sourceType: input.parentSsot ? "github_issue" : "manual",
    sourceRef: input.parentSsot,
    sourceIssue: input.parentSsot,
    frameworkRef: input.frameworkRef,
    targetPackage: cell.target_package ?? "aun",
    targetCapability: input.targetCapability,
    cellId,
    riskTier: normalizeRiskForWorkOrder(riskClass(cell)),
    cellType: cell.cell_type ?? "rapid_lite",
    title: cell.title ?? cellId,
    goal: cell.goal ?? `Implement ${cellId}.`,
    scope: nonEmpty(cell.scope, cell.expected_outputs),
    nonScope: nonEmpty(cell.non_scope, ["audit synthesis", "owner approval synthesis", "merge", "AUN queue mutation"]),
    allowedPath: cell.allowed_paths,
    forbiddenPath: cell.forbidden_paths,
    check: validationCommands(cell),
    requiredEvidence: validationEvidence(cell),
    acceptanceCriterion: cell.acceptance_criteria ?? cell.expected_outputs,
    ownerActor: input.ownerActor,
    repoSpecRef: ".shirube/repo-spec.yaml",
    handoffRef: `.shirube/work-orders/${slugCell(cellId)}/control-handoff.yaml`,
    createdAt: input.generatedAt,
  });
}

function findCompletedCell(cells: ConveyorQueuedCell[], pr: number, mergeCommit: string): ConveyorQueuedCell | undefined {
  return cells.find((cell) => cell.pr_number === pr || cell.merge_commit === mergeCommit);
}

function findCell(queue: ConveyorCellQueue, cellId: string): ConveyorQueuedCell | undefined {
  return (queue.cells ?? []).find((cell) => cell.cell_id === cellId);
}

function normalizedStatus(cell: ConveyorQueuedCell, completedCellId: string | undefined): string {
  if (completedCellId && cell.cell_id === completedCellId) return MERGED_STATUS;
  return cell.status ?? "planned";
}

function dependenciesSatisfied(cell: ConveyorQueuedCell, cells: ConveyorQueuedCell[], completedCellId: string | undefined): boolean {
  return (cell.depends_on ?? []).every((dependency) => {
    const dep = cells.find((candidate) => candidate.cell_id === dependency);
    return dep ? COMPLETION_STATUSES.has(normalizedStatus(dep, completedCellId)) : false;
  });
}

function hasBlockedDependency(cell: ConveyorQueuedCell, cells: ConveyorQueuedCell[], completedCellId: string | undefined): boolean {
  return (cell.depends_on ?? []).some((dependency) => {
    const dep = cells.find((candidate) => candidate.cell_id === dependency);
    return !dep || ACTIVE_BLOCKED_STATUSES.has(normalizedStatus(dep, completedCellId));
  });
}

function missingCellInputs(cell: ConveyorQueuedCell): string[] {
  const missing: string[] = [];
  if (!nonBlank(cell.goal)) missing.push("goal");
  if (!Array.isArray(cell.acceptance_criteria) || cell.acceptance_criteria.length === 0) missing.push("acceptance_criteria");
  if (!Array.isArray(cell.non_scope) || cell.non_scope.length === 0) missing.push("non_scope");
  if (!riskClass(cell)) missing.push("risk_class");
  if (!cell.cell_type) missing.push("cell_type");
  if (!Array.isArray(cell.allowed_paths) || cell.allowed_paths.length === 0) missing.push("allowed_paths");
  if (!Array.isArray(cell.forbidden_paths) || cell.forbidden_paths.length === 0) missing.push("forbidden_paths");
  if (!Array.isArray(cell.expected_outputs) || cell.expected_outputs.length === 0) missing.push("expected_outputs");
  if (!hasImplementationPrPlan(cell)) missing.push("implementation_pr_plan");
  if (!hasValidationPlan(cell)) missing.push("validation_plan");
  if (!nonBlank(cell.audit_checklist_ref)) missing.push("audit_checklist_ref");
  if (!nonBlank(cell.close_condition)) missing.push("close_condition");
  return REQUIRED_CELL_INPUTS.filter((input) => missing.includes(input));
}

function hasImplementationPrPlan(cell: ConveyorQueuedCell): boolean {
  const plan = cell.implementation_pr_plan;
  if (!plan || !["single_pr", "multi_pr"].includes(plan.mode ?? "")) return false;
  if (!Array.isArray(plan.prs) || plan.prs.length === 0) return false;
  if (plan.mode === "single_pr" && plan.prs.length !== 1) return false;
  return plan.prs.every((pr) => nonBlank(pr.pr_role) && nonBlank(pr.title) && typeof pr.completes_cell === "boolean");
}

function hasValidationPlan(cell: ConveyorQueuedCell): boolean {
  return validationCommands(cell).length > 0 && validationEvidence(cell).length > 0;
}

function validationCommands(cell: ConveyorQueuedCell): string[] {
  return nonEmpty(cell.validation_plan?.required_commands, cell.validation?.required_commands);
}

function validationEvidence(cell: ConveyorQueuedCell): string[] {
  return nonEmpty(cell.validation_plan?.required_evidence, cell.validation?.required_evidence ?? ["validation_result", "audit_checklist_report", "owner_decision", "post_merge_evidence"]);
}

function evidencePr(evidence: ConveyorPostMergeEvidence): number | null {
  const value = evidence.merged_pr ?? evidence.source_pr ?? evidence.pr_number ?? evidence.pr;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function evidenceMergeCommit(evidence: ConveyorPostMergeEvidence): string | null {
  return evidence.merge_commit ?? evidence.merge_commit_sha ?? null;
}

function unresolvedBlockers(evidence: ConveyorPostMergeEvidence): unknown[] {
  const value = evidence.unresolved_follow_up_blockers ?? evidence.follow_up_blockers ?? [];
  return Array.isArray(value) ? value : [value];
}

function riskClass(cell: ConveyorQueuedCell): string {
  return cell.risk_class ?? cell.risk_tier ?? "";
}

function priorityValue(cell: ConveyorQueuedCell): number {
  if (typeof cell.priority === "number") return cell.priority;
  if (typeof cell.order === "number") return cell.order;
  return Number.MAX_SAFE_INTEGER;
}

function verdictFromFindings(blockers: ConveyorFinding[], warnings: ConveyorFinding[]): ConveyorStateVerdict {
  if (blockers.length > 0) return "BLOCKED";
  if (warnings.length > 0) return "PASS_WITH_WARN";
  return "PASS";
}

function finding(itemId: string, code: string, path: string, message: string): ConveyorFinding {
  return { item_id: itemId, code, path, message };
}

function contractFinding(findingInput: { item_id: string; code?: string; path: string; message: string }): ConveyorFinding {
  return {
    item_id: findingInput.item_id,
    code: findingInput.code ?? findingInput.item_id.toLowerCase(),
    path: findingInput.path,
    message: findingInput.message,
  };
}

function action(actionName: string, responsibleRole: string, allowedActorRole: string, reason: string): ConveyorNextAction {
  return {
    action: actionName,
    responsible_role: responsibleRole,
    allowed_actor_role: allowedActorRole,
    reason,
  };
}

function requireCellId(cell: ConveyorQueuedCell): string {
  if (!cell.cell_id) throw new Error("Cell is missing cell_id.");
  return cell.cell_id;
}

function slugCell(cellId: string): string {
  return cellId.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function nonEmpty(value: string[] | undefined, fallback: string[] | undefined): string[] {
  const normalized = (value ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
  if (normalized.length > 0) return normalized;
  return (fallback ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
}

function nonBlank(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeRiskForWorkOrder(risk: string): string {
  return risk === "R4" ? "R3" : risk;
}

function checklistProfileFor(risk: string, protectedSurfaces: string[], cellType: string): string {
  if (risk === "R3" || risk === "R4" || protectedSurfaces.length > 0) return "protected";
  if (risk === "R2" || /runtime|policy/i.test(cellType)) return "runtime_policy_standard";
  return "docs_light";
}

function additionalReviewsFor(risk: string, protectedSurfaces: string[], cellType: string): Array<Record<string, unknown>> {
  if (risk === "R3" || risk === "R4") {
    return [
      {
        review_type: "cto_review",
        responsible_role: "cto",
        required: true,
        reason_codes: ["R3_OR_PROTECTED_SURFACE"],
      },
      {
        review_type: "technical_owner_review",
        responsible_role: "technical_owner",
        required: true,
        reason_codes: ["PROTECTED_TECHNICAL_REVIEW"],
      },
    ];
  }
  if (risk === "R2" && (protectedSurfaces.length > 0 || /runtime|policy/i.test(cellType))) {
    return [
      {
        review_type: "technical_owner_review",
        responsible_role: "technical_owner",
        required: true,
        reason_codes: ["R2_RUNTIME_OR_POLICY_SURFACE"],
      },
    ];
  }
  return [];
}

function isShaLike(value: string): boolean {
  return /^[a-f0-9]{7,40}$/.test(value);
}
