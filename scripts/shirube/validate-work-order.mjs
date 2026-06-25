#!/usr/bin/env node
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-work-order-validation/v1";
const WORK_ORDER_SCHEMA = "shirube-work-order/v1";
const EVIDENCE_REF_SCHEMA = "core-evidence-ref/v1";
const WORK_ORDER_STATUSES = ["DRAFT", "READY_FOR_AUN", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"];
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

export function buildWorkOrderValidationReport(options = {}) {
  const file = stringOption(options.file) ?? stringOption(options.fixture);
  if (stringOption(options.format) !== "json") {
    return failureReport({ file, code: "unsupported_format", message: "--format json is required." });
  }
  if (!file) {
    return failureReport({ file, code: "missing_file", message: "--file is required." });
  }

  let document;
  try {
    document = readStructuredFile(file);
  } catch (error) {
    return failureReport({ file, code: "read_error", message: errorMessage(error) });
  }

  const findings = validateWorkOrderDocument(document);
  const blockers = findings.filter((finding) => finding.severity === "BLOCK").map(stripSeverity);
  const warnings = findings.filter((finding) => finding.severity === "WARN").map(stripSeverity);
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  return {
    schema: SCHEMA,
    verdict,
    would_block: verdict === "BLOCKED",
    file,
    work_order_id: document?.work_order_id ?? null,
    idempotency_key: document?.idempotency_key ?? null,
    status: document?.status ?? null,
    target: {
      package: document?.target?.package ?? null,
      capability: document?.target?.capability ?? null,
    },
    aun_consumable: verdict !== "BLOCKED" && document?.status === "READY_FOR_AUN",
    blockers,
    warnings,
    evidence: evidenceSummary(document),
    required_next_actions: requiredNextActions(blockers, warnings),
  };
}

export function validateWorkOrderDocument(document) {
  const findings = [];
  requireConst(findings, document?.schema_version, WORK_ORDER_SCHEMA, "schema_version", "WO-001", "schema_version must be shirube-work-order/v1.");
  requirePattern(findings, document?.work_order_id, /^WO-[A-Z0-9._:-]+$/, "work_order_id", "WO-002", "work_order_id must use WO-*.");
  requireString(findings, document?.idempotency_key, "idempotency_key", "WO-025", "idempotency_key is required.");
  requireEnum(findings, document?.status, WORK_ORDER_STATUSES, "status", "WO-003", "status must be a known Work Order state.");

  requireRepo(findings, document?.repo, "repo");
  requirePattern(findings, document?.repo?.head_sha, /^[a-f0-9]{7,40}$/, "repo.head_sha", "WO-004", "repo.head_sha must be a git SHA.", { optional: true });
  requireTarget(findings, document?.target, "target");

  requirePattern(findings, document?.cell?.cell_id, /^CELL-[A-Z0-9._:-]+$/, "cell.cell_id", "WO-005", "cell.cell_id must use CELL-*.");
  requireEnum(findings, document?.cell?.risk_tier, RISK_TIERS, "cell.risk_tier", "WO-006", "cell.risk_tier must be R0, R1, R2, or R3.");
  requireString(findings, document?.cell?.cell_type, "cell.cell_type", "WO-007", "cell.cell_type is required.");

  requireString(findings, document?.task?.title, "task.title", "WO-008", "task.title is required.");
  requireString(findings, document?.task?.goal, "task.goal", "WO-009", "task.goal is required.");
  requireNonEmptyStringArray(findings, document?.task?.scope, "task.scope", "WO-026", "task.scope must list included scope.");
  requireNonEmptyStringArray(findings, document?.task?.non_scope, "task.non_scope", "WO-010", "task.non_scope must list excluded scope.");
  requireNonEmptyStringArray(findings, document?.task?.allowed_paths, "task.allowed_paths", "WO-011", "task.allowed_paths is required.");
  requireNonEmptyStringArray(findings, document?.task?.forbidden_paths, "task.forbidden_paths", "WO-012", "task.forbidden_paths is required.");
  requireNonEmptyStringArray(findings, document?.task?.required_evidence, "task.required_evidence", "WO-013", "task.required_evidence is required.");

  requireString(findings, document?.authority?.owner_actor, "authority.owner_actor", "WO-014", "authority.owner_actor is required.");
  requireBoolean(findings, document?.authority?.owner_decision_required, "authority.owner_decision_required", "WO-015", "authority.owner_decision_required must be boolean.");
  requireBoolean(findings, document?.authority?.exact_head_required, "authority.exact_head_required", "WO-016", "authority.exact_head_required must be boolean.");
  if (document?.authority?.llm_final_authority_allowed !== false) {
    findings.push(block("WO-017", "authority.llm_final_authority_allowed", "LLM final authority must be false."));
  }

  requireString(findings, document?.refs?.framework_ref, "refs.framework_ref", "WO-018", "refs.framework_ref is required.");
  requireString(findings, document?.refs?.repo_spec_ref, "refs.repo_spec_ref", "WO-019", "refs.repo_spec_ref is required.");
  requireString(findings, document?.refs?.handoff_ref, "refs.handoff_ref", "WO-020", "refs.handoff_ref is required.");

  if (document?.metadata?.db_runtime_required === true) {
    findings.push(block("WO-021", "metadata.db_runtime_required", "DB runtime must not be mandatory for this contract."));
  }

  validateEvidenceRefs(findings, document?.evidence_refs, "evidence_refs");
  return findings;
}

export function validateEvidenceRefs(findings, evidenceRefs, path) {
  if (evidenceRefs === undefined) return;
  if (!Array.isArray(evidenceRefs)) {
    findings.push(block("EVID-001", path, "evidence_refs must be an array."));
    return;
  }
  const seen = new Set();
  evidenceRefs.forEach((ref, index) => {
    const refPath = `${path}[${index}]`;
    if (!isObject(ref)) {
      findings.push(block("EVID-002", refPath, "Evidence ref must be an object."));
      return;
    }
    requireConst(findings, ref.schema_version, EVIDENCE_REF_SCHEMA, `${refPath}.schema_version`, "EVID-003", "Evidence ref schema_version must be core-evidence-ref/v1.");
    requirePattern(findings, ref.evidence_ref_id, /^EVIDENCE-REF-[A-Z0-9._:-]+$/, `${refPath}.evidence_ref_id`, "EVID-004", "evidence_ref_id must use EVIDENCE-REF-*.");
    requireEnum(findings, ref.evidence_type, EVIDENCE_TYPES, `${refPath}.evidence_type`, "EVID-005", "Unknown evidence_type.");
    requireString(findings, ref.subject?.type, `${refPath}.subject.type`, "EVID-006", "Evidence subject.type is required.");
    requireString(findings, ref.subject?.id, `${refPath}.subject.id`, "EVID-007", "Evidence subject.id is required.");
    requireString(findings, ref.uri, `${refPath}.uri`, "EVID-008", "Evidence uri is required.");
    requireString(findings, ref.producer?.package, `${refPath}.producer.package`, "EVID-009", "Evidence producer.package is required.");
    requireString(findings, ref.producer?.component, `${refPath}.producer.component`, "EVID-010", "Evidence producer.component is required.");
    requireDateTime(findings, ref.created_at, `${refPath}.created_at`, "EVID-011", "Evidence created_at must be an ISO timestamp.");
    if (ref.evidence_ref_id && seen.has(ref.evidence_ref_id)) {
      findings.push(block("EVID-012", `${refPath}.evidence_ref_id`, "Duplicate evidence_ref_id."));
    }
    if (ref.evidence_ref_id) seen.add(ref.evidence_ref_id);
  });
}

export function requireRepo(findings, repo, path) {
  if (!isObject(repo)) {
    findings.push(block("WO-022", path, "repo must be an object."));
    return;
  }
  requirePattern(findings, repo.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `${path}.full_name`, "WO-023", "repo.full_name must be owner/repo.");
  requireString(findings, repo.default_branch, `${path}.default_branch`, "WO-024", "repo.default_branch is required.");
}

export function requireTarget(findings, target, path) {
  if (!isObject(target)) {
    findings.push(block("WO-027", path, "target must be an object."));
    return;
  }
  requireString(findings, target.package, `${path}.package`, "WO-028", "target.package is required.");
  requireString(findings, target.capability, `${path}.capability`, "WO-029", "target.capability is required.");
}

export function requireString(findings, value, path, code, message) {
  if (typeof value !== "string" || value.trim() === "") findings.push(block(code, path, message));
}

export function requireBoolean(findings, value, path, code, message) {
  if (typeof value !== "boolean") findings.push(block(code, path, message));
}

export function requireConst(findings, value, expected, path, code, message) {
  if (value !== expected) findings.push(block(code, path, message));
}

export function requireEnum(findings, value, values, path, code, message) {
  if (!values.includes(value)) findings.push(block(code, path, message));
}

export function requirePattern(findings, value, pattern, path, code, message, options = {}) {
  if (options.optional && (value === undefined || value === null || value === "")) return;
  if (typeof value !== "string" || !pattern.test(value)) findings.push(block(code, path, message));
}

export function requireDateTime(findings, value, path, code, message) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) findings.push(block(code, path, message));
}

export function requireNonEmptyStringArray(findings, value, path, code, message) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    findings.push(block(code, path, message));
  }
}

export function block(itemId, path, message) {
  return { severity: "BLOCK", item_id: itemId, path, message };
}

export function warn(itemId, path, message) {
  return { severity: "WARN", item_id: itemId, path, message };
}

export function stripSeverity(finding) {
  const { severity, ...rest } = finding;
  return rest;
}

export function stringOption(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function evidenceSummary(document) {
  return (document?.evidence_refs ?? []).map((ref) => ({
    evidence_ref_id: ref.evidence_ref_id,
    evidence_type: ref.evidence_type,
    uri: ref.uri,
  }));
}

function requiredNextActions(blockers, warnings) {
  return [...blockers, ...warnings].map((finding) => ({
    item_id: finding.item_id,
    action: finding.message,
  }));
}

function failureReport({ file, code, message }) {
  return {
    schema: SCHEMA,
    verdict: "FAILURE",
    would_block: true,
    file: file ?? null,
    work_order_id: null,
    idempotency_key: null,
    status: null,
    target: {
      package: null,
      capability: null,
    },
    aun_consumable: false,
    blockers: [{ item_id: "WO-FAILURE", code, message, path: file ?? "file" }],
    warnings: [],
    evidence: [],
    required_next_actions: [{ item_id: "WO-FAILURE", action: message }],
  };
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildWorkOrderValidationReport(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
