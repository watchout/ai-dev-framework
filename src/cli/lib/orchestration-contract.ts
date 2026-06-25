import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export type OrchestrationVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED" | "FAILURE";

export interface OrchestrationFinding {
  item_id: string;
  path: string;
  message: string;
  code?: string;
}

interface InternalFinding extends OrchestrationFinding {
  severity: "BLOCK" | "WARN";
}

export interface WorkOrderValidationReport {
  schema: "shirube-work-order-validation/v1";
  verdict: OrchestrationVerdict;
  would_block: boolean;
  file: string | null;
  work_order_id: string | null;
  idempotency_key: string | null;
  status: string | null;
  target: { package: string | null; capability: string | null };
  aun_consumable: boolean;
  blockers: OrchestrationFinding[];
  warnings: OrchestrationFinding[];
  evidence: Array<{ evidence_ref_id: string; evidence_type: string; uri: string }>;
  required_next_actions: Array<{ item_id: string; action: string }>;
}

export interface WorkResultValidationReport {
  schema: "shirube-work-result-validation/v1";
  verdict: OrchestrationVerdict;
  would_block: boolean;
  file: string | null;
  work_order_ref: string | null;
  work_result_id: string | null;
  work_order_id: string | null;
  idempotency_key: string | null;
  status: string | null;
  blockers: OrchestrationFinding[];
  warnings: OrchestrationFinding[];
  evidence: Array<{ evidence_ref_id: string; evidence_type: string; uri: string }>;
  required_next_actions: Array<{ item_id: string; action: string }>;
}

export interface WorkResultImportReport {
  schema: "shirube-work-result-import/v1";
  verdict: OrchestrationVerdict;
  would_block: boolean;
  file: string | null;
  work_order_ref: string | null;
  work_result_id: string | null;
  work_order_id: string | null;
  idempotency_key: string | null;
  mode: "dry-run";
  imported: false;
  aun_state_mutated: false;
  db_required: false;
  owner_approval_synthesized: false;
  validation: WorkResultValidationReport;
  blockers: OrchestrationFinding[];
  warnings: OrchestrationFinding[];
  required_next_actions: Array<{ item_id: string; action: string }>;
}

export interface WorkOrderExportOptions {
  workOrderId?: string;
  idempotencyKey?: string;
  repo?: string;
  defaultBranch?: string;
  headBranch?: string;
  headSha?: string;
  sourceType?: string;
  sourceRepo?: string;
  sourceRef?: string;
  sourceCommit?: string;
  sourceUrl?: string;
  sourceIssue?: string;
  frameworkRef?: string;
  targetPackage?: string;
  targetCapability?: string;
  cellId?: string;
  specId?: string;
  implId?: string;
  riskTier?: string;
  cellType?: string;
  title?: string;
  goal?: string;
  scope?: string[];
  nonScope?: string[];
  allowedPath?: string[];
  forbiddenPath?: string[];
  check?: string[];
  requiredEvidence?: string[];
  acceptanceCriterion?: string[];
  stopCondition?: string[];
  contextRef?: string[];
  evidenceRef?: string[];
  ownerActor?: string;
  ownerDecisionRef?: string;
  repoSpecRef?: string;
  handoffRef?: string;
  sourceMirrorRef?: string;
  validationEvidenceRef?: string;
  createdAt?: string;
  updatedAt?: string;
  out?: string;
}

const WORK_ORDER_SCHEMA = "shirube-work-order/v1";
const WORK_RESULT_SCHEMA = "shirube-work-result/v1";
const EVIDENCE_REF_SCHEMA = "core-evidence-ref/v1";
const WORK_ORDER_STATUSES = ["DRAFT", "READY_FOR_AUN", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"];
const WORK_RESULT_STATUSES = ["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"];
const RISK_TIERS = ["R0", "R1", "R2", "R3"];
const EVIDENCE_TYPES = [
  "audit_result",
  "acceptance_check_result",
  "context_pack",
  "restart_recovery",
  "validation_result",
  "gate_report",
  "owner_decision",
  "work_result",
  "post_merge",
];

export function buildWorkOrderDocument(options: WorkOrderExportOptions): Record<string, unknown> {
  const repo = requiredString(options.repo, "--repo");
  const targetPackage = options.targetPackage?.trim() || "aun";
  const targetCapability = requiredString(options.targetCapability, "--target-capability");
  const workOrderId = requiredString(options.workOrderId, "--work-order-id");
  const frameworkRef = requiredString(options.frameworkRef, "--framework-ref");
  const cellId = requiredString(options.cellId, "--cell-id");
  const riskTier = requiredString(options.riskTier, "--risk-tier");
  const ownerActor = requiredString(options.ownerActor, "--owner-actor");
  const createdAt = options.createdAt?.trim() || "1970-01-01T00:00:00Z";
  const idempotencyKey = options.idempotencyKey?.trim() || stableIdempotencyKey({
    repo,
    targetPackage,
    targetCapability,
    workOrderId,
    sourceRef: options.sourceRef,
    sourceCommit: options.sourceCommit ?? options.headSha,
    frameworkRef,
  });
  const allowedPaths = normalizeList(options.allowedPath);
  const forbiddenPaths = normalizeList(options.forbiddenPath);

  return compactObject({
    schema_version: WORK_ORDER_SCHEMA,
    work_order_id: workOrderId,
    idempotency_key: idempotencyKey,
    status: "READY_FOR_AUN",
    repo: compactObject({
      full_name: repo,
      default_branch: options.defaultBranch?.trim() || "main",
      head_branch: options.headBranch,
      head_sha: options.headSha,
    }),
    source: compactObject({
      type: options.sourceType?.trim() || (options.sourceIssue ? "github_issue" : "manual"),
      repo: options.sourceRepo?.trim() || repo,
      ref: options.sourceRef,
      commit: options.sourceCommit ?? options.headSha,
      framework_ref: frameworkRef,
      url: options.sourceUrl,
      issue: options.sourceIssue,
    }),
    target: {
      package: targetPackage,
      capability: targetCapability,
    },
    cell: compactObject({
      cell_id: cellId,
      spec_id: options.specId,
      impl_id: options.implId,
      risk_tier: riskTier,
      cell_type: options.cellType?.trim() || "rapid_lite",
    }),
    task: compactObject({
      title: requiredString(options.title, "--title"),
      goal: requiredString(options.goal, "--goal"),
      scope: normalizeList(options.scope, ["Shirube governed work described by this Work Order."]),
      non_scope: normalizeList(options.nonScope, ["AUN runtime execution", "DB runtime", "target repository mutation", "owner approval synthesis"]),
      allowed_paths: allowedPaths,
      forbidden_paths: forbiddenPaths,
      required_commands: normalizeList(options.check),
      required_evidence: normalizeList(options.requiredEvidence, ["validation_result", "owner_decision"]),
      acceptance_criteria: normalizeList(options.acceptanceCriterion),
      stop_conditions: normalizeList(options.stopCondition),
    }),
    authority: compactObject({
      owner_actor: ownerActor,
      owner_decision_required: true,
      exact_head_required: true,
      llm_final_authority_allowed: false,
      owner_decision_ref: options.ownerDecisionRef,
    }),
    refs: compactObject({
      framework_ref: frameworkRef,
      repo_spec_ref: options.repoSpecRef?.trim() || ".shirube/repo-spec.yaml",
      handoff_ref: options.handoffRef?.trim() || ".shirube/control-handoffs/CH-001.yaml",
      source_mirror_ref: options.sourceMirrorRef,
      validation_evidence_ref: options.validationEvidenceRef,
    }),
    context_refs: normalizeList(options.contextRef),
    handoff_boundary: {
      allowed_paths: allowedPaths,
      forbidden_paths: forbiddenPaths,
      protected_surfaces: [],
      owner_exact_head_required: true,
    },
    evidence_refs: buildEvidenceRefs({
      repo,
      workOrderId,
      refs: normalizeList(options.evidenceRef),
      createdAt,
    }),
    created_at: createdAt,
    updated_at: options.updatedAt?.trim() || createdAt,
    metadata: {
      dry_run: true,
      db_runtime_required: false,
      aun_runtime_required: false,
      aun_queue_mutated: false,
      owner_approval_synthesized: false,
    },
  });
}

export function writeWorkOrderDocument(document: Record<string, unknown>, out?: string): void {
  if (!out) return;
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
}

export function buildWorkOrderValidationReport(file: string | null, document: unknown): WorkOrderValidationReport {
  const findings = validateWorkOrderDocument(document);
  const blockers = stripFindings(findings, "BLOCK");
  const warnings = stripFindings(findings, "WARN");
  const verdict = verdictFromFindings(blockers, warnings);
  const doc = objectOrEmpty(document);
  return {
    schema: "shirube-work-order-validation/v1",
    verdict,
    would_block: verdict === "BLOCKED",
    file,
    work_order_id: stringOrNull(doc.work_order_id),
    idempotency_key: stringOrNull(doc.idempotency_key),
    status: stringOrNull(doc.status),
    target: {
      package: stringOrNull(objectOrEmpty(doc.target).package),
      capability: stringOrNull(objectOrEmpty(doc.target).capability),
    },
    aun_consumable: verdict !== "BLOCKED" && doc.status === "READY_FOR_AUN" && objectOrEmpty(doc.target).package === "aun",
    blockers,
    warnings,
    evidence: evidenceSummary(doc.evidence_refs),
    required_next_actions: requiredNextActions(blockers, warnings),
  };
}

export function buildWorkOrderFailureReport(file: string | null, code: string, message: string): WorkOrderValidationReport {
  return {
    schema: "shirube-work-order-validation/v1",
    verdict: "FAILURE",
    would_block: true,
    file,
    work_order_id: null,
    idempotency_key: null,
    status: null,
    target: { package: null, capability: null },
    aun_consumable: false,
    blockers: [{ item_id: "WO-FAILURE", code, path: file ?? "file", message }],
    warnings: [],
    evidence: [],
    required_next_actions: [{ item_id: "WO-FAILURE", action: message }],
  };
}

export function buildWorkResultValidationReport(
  file: string | null,
  document: unknown,
  workOrderRef: string | null = null,
  workOrder: unknown = null,
): WorkResultValidationReport {
  const findings = validateWorkResultDocument(document, workOrder);
  const blockers = stripFindings(findings, "BLOCK");
  const warnings = stripFindings(findings, "WARN");
  const verdict = verdictFromFindings(blockers, warnings);
  const doc = objectOrEmpty(document);
  return {
    schema: "shirube-work-result-validation/v1",
    verdict,
    would_block: verdict === "BLOCKED",
    file,
    work_order_ref: workOrderRef,
    work_result_id: stringOrNull(doc.work_result_id),
    work_order_id: stringOrNull(doc.work_order_id),
    idempotency_key: stringOrNull(doc.idempotency_key),
    status: stringOrNull(doc.status),
    blockers,
    warnings,
    evidence: evidenceSummary(doc.evidence_refs),
    required_next_actions: requiredNextActions(blockers, warnings),
  };
}

export function buildWorkResultFailureReport(file: string | null, code: string, message: string): WorkResultValidationReport {
  return {
    schema: "shirube-work-result-validation/v1",
    verdict: "FAILURE",
    would_block: true,
    file,
    work_order_ref: null,
    work_result_id: null,
    work_order_id: null,
    idempotency_key: null,
    status: null,
    blockers: [{ item_id: "WR-FAILURE", code, path: file ?? "file", message }],
    warnings: [],
    evidence: [],
    required_next_actions: [{ item_id: "WR-FAILURE", action: message }],
  };
}

export function buildWorkResultImportReport(validation: WorkResultValidationReport): WorkResultImportReport {
  return {
    schema: "shirube-work-result-import/v1",
    verdict: validation.verdict,
    would_block: validation.would_block || validation.verdict === "FAILURE",
    file: validation.file,
    work_order_ref: validation.work_order_ref,
    work_result_id: validation.work_result_id,
    work_order_id: validation.work_order_id,
    idempotency_key: validation.idempotency_key,
    mode: "dry-run",
    imported: false,
    aun_state_mutated: false,
    db_required: false,
    owner_approval_synthesized: false,
    validation,
    blockers: validation.blockers,
    warnings: validation.warnings,
    required_next_actions: validation.required_next_actions,
  };
}

export function readJsonDocument(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function validateWorkOrderDocument(document: unknown): InternalFinding[] {
  const findings: InternalFinding[] = [];
  const doc = objectOrEmpty(document);
  requireConst(findings, doc.schema_version, WORK_ORDER_SCHEMA, "schema_version", "WO-001", "schema_version must be shirube-work-order/v1.");
  requirePattern(findings, doc.work_order_id, /^WO-[A-Z0-9._:-]+$/, "work_order_id", "WO-002", "work_order_id must use WO-*.");
  requireString(findings, doc.idempotency_key, "idempotency_key", "WO-025", "idempotency_key is required.");
  requireEnum(findings, doc.status, WORK_ORDER_STATUSES, "status", "WO-003", "status must be a known Work Order state.");
  requireRepo(findings, doc.repo, "repo");
  requirePattern(findings, objectOrEmpty(doc.repo).head_sha, /^[a-f0-9]{7,40}$/, "repo.head_sha", "WO-004", "repo.head_sha must be a git SHA.", { optional: true });
  requireTarget(findings, doc.target, "target");
  const cell = objectOrEmpty(doc.cell);
  requirePattern(findings, cell.cell_id, /^CELL-[A-Z0-9._:-]+$/, "cell.cell_id", "WO-005", "cell.cell_id must use CELL-*.");
  requireEnum(findings, cell.risk_tier, RISK_TIERS, "cell.risk_tier", "WO-006", "cell.risk_tier must be R0, R1, R2, or R3.");
  requireString(findings, cell.cell_type, "cell.cell_type", "WO-007", "cell.cell_type is required.");
  const task = objectOrEmpty(doc.task);
  requireString(findings, task.title, "task.title", "WO-008", "task.title is required.");
  requireString(findings, task.goal, "task.goal", "WO-009", "task.goal is required.");
  requireNonEmptyStringArray(findings, task.scope, "task.scope", "WO-026", "task.scope must list included scope.");
  requireNonEmptyStringArray(findings, task.non_scope, "task.non_scope", "WO-010", "task.non_scope must list excluded scope.");
  requireNonEmptyStringArray(findings, task.allowed_paths, "task.allowed_paths", "WO-011", "task.allowed_paths is required.");
  requireNonEmptyStringArray(findings, task.forbidden_paths, "task.forbidden_paths", "WO-012", "task.forbidden_paths is required.");
  requireNonEmptyStringArray(findings, task.required_evidence, "task.required_evidence", "WO-013", "task.required_evidence is required.");
  const authority = objectOrEmpty(doc.authority);
  requireString(findings, authority.owner_actor, "authority.owner_actor", "WO-014", "authority.owner_actor is required.");
  requireBoolean(findings, authority.owner_decision_required, "authority.owner_decision_required", "WO-015", "authority.owner_decision_required must be boolean.");
  requireBoolean(findings, authority.exact_head_required, "authority.exact_head_required", "WO-016", "authority.exact_head_required must be boolean.");
  if (authority.llm_final_authority_allowed !== false) {
    findings.push(block("WO-017", "authority.llm_final_authority_allowed", "LLM final authority must be false."));
  }
  const refs = objectOrEmpty(doc.refs);
  requireString(findings, refs.framework_ref, "refs.framework_ref", "WO-018", "refs.framework_ref is required.");
  requireString(findings, refs.repo_spec_ref, "refs.repo_spec_ref", "WO-019", "refs.repo_spec_ref is required.");
  requireString(findings, refs.handoff_ref, "refs.handoff_ref", "WO-020", "refs.handoff_ref is required.");
  if (objectOrEmpty(doc.metadata).db_runtime_required === true) {
    findings.push(block("WO-021", "metadata.db_runtime_required", "DB runtime must not be mandatory for this contract."));
  }
  validateEvidenceRefs(findings, doc.evidence_refs, "evidence_refs");
  return findings;
}

export function validateWorkResultDocument(document: unknown, workOrder: unknown = null): InternalFinding[] {
  const findings: InternalFinding[] = [];
  const doc = objectOrEmpty(document);
  requireConst(findings, doc.schema_version, WORK_RESULT_SCHEMA, "schema_version", "WR-001", "schema_version must be shirube-work-result/v1.");
  requirePattern(findings, doc.work_result_id, /^WR-[A-Z0-9._:-]+$/, "work_result_id", "WR-002", "work_result_id must use WR-*.");
  requirePattern(findings, doc.work_order_id, /^WO-[A-Z0-9._:-]+$/, "work_order_id", "WR-003", "work_order_id must use WO-*.");
  requireString(findings, doc.idempotency_key, "idempotency_key", "WR-023", "idempotency_key is required.");
  requireEnum(findings, doc.status, WORK_RESULT_STATUSES, "status", "WR-004", "status must be a known Work Result state.");
  requireResultRepo(findings, doc.repo, "repo");
  const executor = objectOrEmpty(doc.executor);
  requireString(findings, executor.system, "executor.system", "WR-005", "executor.system is required.");
  requireString(findings, executor.actor, "executor.actor", "WR-006", "executor.actor is required.");
  requireString(findings, doc.summary, "summary", "WR-007", "summary is required.");
  requireDateTime(findings, doc.started_at, "started_at", "WR-008", "started_at must be an ISO timestamp.");
  requireDateTime(findings, doc.finished_at, "finished_at", "WR-009", "finished_at must be an ISO timestamp.");
  validateEvidenceRefs(findings, doc.evidence_refs, "evidence_refs");
  if (doc.status === "COMPLETED") {
    if (!Array.isArray(doc.evidence_refs) || doc.evidence_refs.length === 0) {
      findings.push(block("WR-010", "evidence_refs", "COMPLETED results require at least one evidence ref."));
    }
    if (Array.isArray(doc.commands) && doc.commands.some((command) => objectOrEmpty(command).result === "FAIL")) {
      findings.push(block("WR-011", "commands", "COMPLETED results must not contain failing command results."));
    }
  }
  if (["FAILED", "BLOCKED"].includes(String(doc.status))) {
    const failure = objectOrEmpty(doc.failure);
    if (!isObject(doc.failure)) {
      findings.push(block("WR-012", "failure", "FAILED or BLOCKED results require a failure object."));
    } else {
      requireString(findings, failure.code, "failure.code", "WR-013", "failure.code is required.");
      requireString(findings, failure.message, "failure.message", "WR-014", "failure.message is required.");
      requireBoolean(findings, failure.retryable, "failure.retryable", "WR-015", "failure.retryable must be boolean.");
    }
  }
  if (Array.isArray(doc.commands)) {
    doc.commands.forEach((entry, index) => {
      const command = objectOrEmpty(entry);
      requireString(findings, command.command, `commands[${index}].command`, "WR-016", "command is required.");
      requireEnum(findings, command.result, ["PASS", "FAIL", "SKIPPED"], `commands[${index}].result`, "WR-017", "command result must be PASS, FAIL, or SKIPPED.");
    });
  }
  if (isObject(workOrder)) {
    const order = objectOrEmpty(workOrder);
    if (doc.work_order_id !== order.work_order_id) {
      findings.push(block("WR-018", "work_order_id", "Work Result work_order_id must match the Work Order."));
    }
    if (objectOrEmpty(doc.repo).full_name !== objectOrEmpty(order.repo).full_name) {
      findings.push(block("WR-019", "repo.full_name", "Work Result repo.full_name must match the Work Order repo."));
    }
    if (doc.idempotency_key !== order.idempotency_key) {
      findings.push(block("WR-024", "idempotency_key", "Work Result idempotency_key must match the Work Order."));
    }
  }
  return findings;
}

function stableIdempotencyKey(parts: Record<string, unknown>): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  return `shirube:${digest}`;
}

function buildEvidenceRefs(input: { repo: string; workOrderId: string; refs: string[]; createdAt: string }) {
  return input.refs.map((uri, index) => ({
    schema_version: EVIDENCE_REF_SCHEMA,
    evidence_ref_id: `EVIDENCE-REF-${input.workOrderId.replace(/^WO-/, "")}-${String(index + 1).padStart(3, "0")}`,
    evidence_type: "validation_result",
    subject: {
      type: "work_order",
      id: input.workOrderId,
      repo: input.repo,
    },
    uri,
    producer: {
      package: "shirube",
      component: "work-order-export",
    },
    created_at: input.createdAt,
  }));
}

function validateEvidenceRefs(findings: InternalFinding[], evidenceRefs: unknown, path: string): void {
  if (evidenceRefs === undefined) return;
  if (!Array.isArray(evidenceRefs)) {
    findings.push(block("EVID-001", path, "evidence_refs must be an array."));
    return;
  }
  const seen = new Set<string>();
  evidenceRefs.forEach((entry, index) => {
    const ref = objectOrEmpty(entry);
    const refPath = `${path}[${index}]`;
    if (!isObject(entry)) {
      findings.push(block("EVID-002", refPath, "Evidence ref must be an object."));
      return;
    }
    requireConst(findings, ref.schema_version, EVIDENCE_REF_SCHEMA, `${refPath}.schema_version`, "EVID-003", "Evidence ref schema_version must be core-evidence-ref/v1.");
    requirePattern(findings, ref.evidence_ref_id, /^EVIDENCE-REF-[A-Z0-9._:-]+$/, `${refPath}.evidence_ref_id`, "EVID-004", "evidence_ref_id must use EVIDENCE-REF-*.");
    requireEnum(findings, ref.evidence_type, EVIDENCE_TYPES, `${refPath}.evidence_type`, "EVID-005", "Unknown evidence_type.");
    const subject = objectOrEmpty(ref.subject);
    requireString(findings, subject.type, `${refPath}.subject.type`, "EVID-006", "Evidence subject.type is required.");
    requireString(findings, subject.id, `${refPath}.subject.id`, "EVID-007", "Evidence subject.id is required.");
    requireString(findings, ref.uri, `${refPath}.uri`, "EVID-008", "Evidence uri is required.");
    const producer = objectOrEmpty(ref.producer);
    requireString(findings, producer.package, `${refPath}.producer.package`, "EVID-009", "Evidence producer.package is required.");
    requireString(findings, producer.component, `${refPath}.producer.component`, "EVID-010", "Evidence producer.component is required.");
    requireDateTime(findings, ref.created_at, `${refPath}.created_at`, "EVID-011", "Evidence created_at must be an ISO timestamp.");
    if (typeof ref.evidence_ref_id === "string" && seen.has(ref.evidence_ref_id)) {
      findings.push(block("EVID-012", `${refPath}.evidence_ref_id`, "Duplicate evidence_ref_id."));
    }
    if (typeof ref.evidence_ref_id === "string") seen.add(ref.evidence_ref_id);
  });
}

function requireRepo(findings: InternalFinding[], repoValue: unknown, path: string): void {
  const repo = objectOrEmpty(repoValue);
  if (!isObject(repoValue)) {
    findings.push(block("WO-022", path, "repo must be an object."));
    return;
  }
  requirePattern(findings, repo.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `${path}.full_name`, "WO-023", "repo.full_name must be owner/repo.");
  requireString(findings, repo.default_branch, `${path}.default_branch`, "WO-024", "repo.default_branch is required.");
}

function requireTarget(findings: InternalFinding[], targetValue: unknown, path: string): void {
  const target = objectOrEmpty(targetValue);
  if (!isObject(targetValue)) {
    findings.push(block("WO-027", path, "target must be an object."));
    return;
  }
  requireString(findings, target.package, `${path}.package`, "WO-028", "target.package is required.");
  requireString(findings, target.capability, `${path}.capability`, "WO-029", "target.capability is required.");
}

function requireResultRepo(findings: InternalFinding[], repoValue: unknown, path: string): void {
  const repo = objectOrEmpty(repoValue);
  if (!isObject(repoValue)) {
    findings.push(block("WR-020", path, "repo must be an object."));
    return;
  }
  requirePattern(findings, repo.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `${path}.full_name`, "WR-021", "repo.full_name must be owner/repo.");
  requirePattern(findings, repo.head_sha, /^[a-f0-9]{7,40}$/, `${path}.head_sha`, "WR-022", "repo.head_sha must be a git SHA.", { optional: true });
}

function requireString(findings: InternalFinding[], value: unknown, path: string, code: string, message: string): void {
  if (typeof value !== "string" || value.trim() === "") findings.push(block(code, path, message));
}

function requireBoolean(findings: InternalFinding[], value: unknown, path: string, code: string, message: string): void {
  if (typeof value !== "boolean") findings.push(block(code, path, message));
}

function requireConst(findings: InternalFinding[], value: unknown, expected: string | boolean, path: string, code: string, message: string): void {
  if (value !== expected) findings.push(block(code, path, message));
}

function requireEnum(findings: InternalFinding[], value: unknown, values: string[], path: string, code: string, message: string): void {
  if (typeof value !== "string" || !values.includes(value)) findings.push(block(code, path, message));
}

function requirePattern(
  findings: InternalFinding[],
  value: unknown,
  pattern: RegExp,
  path: string,
  code: string,
  message: string,
  options: { optional?: boolean } = {},
): void {
  if (options.optional && (value === undefined || value === null || value === "")) return;
  if (typeof value !== "string" || !pattern.test(value)) findings.push(block(code, path, message));
}

function requireDateTime(findings: InternalFinding[], value: unknown, path: string, code: string, message: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) findings.push(block(code, path, message));
}

function requireNonEmptyStringArray(findings: InternalFinding[], value: unknown, path: string, code: string, message: string): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    findings.push(block(code, path, message));
  }
}

function block(itemId: string, path: string, message: string): InternalFinding {
  return { severity: "BLOCK", item_id: itemId, path, message };
}

function stripFindings(findings: InternalFinding[], severity: "BLOCK" | "WARN"): OrchestrationFinding[] {
  return findings
    .filter((finding) => finding.severity === severity)
    .map(({ severity: _severity, ...finding }) => finding);
}

function verdictFromFindings(blockers: OrchestrationFinding[], warnings: OrchestrationFinding[]): OrchestrationVerdict {
  if (blockers.length > 0) return "BLOCKED";
  if (warnings.length > 0) return "PASS_WITH_WARN";
  return "PASS";
}

function requiredNextActions(blockers: OrchestrationFinding[], warnings: OrchestrationFinding[]): Array<{ item_id: string; action: string }> {
  return [...blockers, ...warnings].map((finding) => ({
    item_id: finding.item_id,
    action: finding.message,
  }));
}

function evidenceSummary(value: unknown): Array<{ evidence_ref_id: string; evidence_type: string; uri: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const ref = objectOrEmpty(entry);
    return {
      evidence_ref_id: String(ref.evidence_ref_id ?? ""),
      evidence_type: String(ref.evidence_type ?? ""),
      uri: String(ref.uri ?? ""),
    };
  });
}

function requiredString(value: string | undefined, option: string): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new Error(`Missing ${option}.`);
}

function normalizeList(value: string[] | undefined, fallback: string[] = []): string[] {
  const list = (value ?? []).map((entry) => entry.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === "") continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    output[key] = entry;
  }
  return output as T;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
