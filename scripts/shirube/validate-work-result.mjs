#!/usr/bin/env node
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";
import {
  block,
  errorMessage,
  requireDateTime,
  requireEnum,
  requirePattern,
  requireString,
  requireConst,
  stripSeverity,
  stringOption,
  validateEvidenceRefs,
} from "./validate-work-order.mjs";

const SCHEMA = "shirube-work-result-validation/v1";
const WORK_RESULT_SCHEMA = "shirube-work-result/v1";
const RESULT_STATUSES = ["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"];

export function buildWorkResultValidationReport(options = {}) {
  const file = stringOption(options.file) ?? stringOption(options.fixture);
  const workOrderFile = stringOption(options["work-order"]);
  if (stringOption(options.format) !== "json") {
    return failureReport({ file, code: "unsupported_format", message: "--format json is required." });
  }
  if (!file) {
    return failureReport({ file, code: "missing_file", message: "--file is required." });
  }

  let document;
  let workOrder = null;
  try {
    document = readStructuredFile(file);
    if (workOrderFile) workOrder = readStructuredFile(workOrderFile);
  } catch (error) {
    return failureReport({ file, code: "read_error", message: errorMessage(error) });
  }

  const findings = validateWorkResultDocument(document, workOrder);
  const blockers = findings.filter((finding) => finding.severity === "BLOCK").map(stripSeverity);
  const warnings = findings.filter((finding) => finding.severity === "WARN").map(stripSeverity);
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  return {
    schema: SCHEMA,
    verdict,
    would_block: verdict === "BLOCKED",
    file,
    work_order_ref: workOrderFile ?? null,
    work_result_id: document?.work_result_id ?? null,
    work_order_id: document?.work_order_id ?? null,
    status: document?.status ?? null,
    blockers,
    warnings,
    evidence: (document?.evidence_refs ?? []).map((ref) => ({
      evidence_ref_id: ref.evidence_ref_id,
      evidence_type: ref.evidence_type,
      uri: ref.uri,
    })),
    required_next_actions: requiredNextActions(blockers, warnings),
  };
}

export function validateWorkResultDocument(document, workOrder = null) {
  const findings = [];
  requireConst(findings, document?.schema_version, WORK_RESULT_SCHEMA, "schema_version", "WR-001", "schema_version must be shirube-work-result/v1.");
  requirePattern(findings, document?.work_result_id, /^WR-[A-Z0-9._:-]+$/, "work_result_id", "WR-002", "work_result_id must use WR-*.");
  requirePattern(findings, document?.work_order_id, /^WO-[A-Z0-9._:-]+$/, "work_order_id", "WR-003", "work_order_id must use WO-*.");
  requireEnum(findings, document?.status, RESULT_STATUSES, "status", "WR-004", "status must be a known Work Result state.");
  requireResultRepo(findings, document?.repo, "repo");
  requireString(findings, document?.executor?.system, "executor.system", "WR-005", "executor.system is required.");
  requireString(findings, document?.executor?.actor, "executor.actor", "WR-006", "executor.actor is required.");
  requireString(findings, document?.summary, "summary", "WR-007", "summary is required.");
  requireDateTime(findings, document?.started_at, "started_at", "WR-008", "started_at must be an ISO timestamp.");
  requireDateTime(findings, document?.finished_at, "finished_at", "WR-009", "finished_at must be an ISO timestamp.");
  validateEvidenceRefs(findings, document?.evidence_refs, "evidence_refs");

  if (document?.status === "COMPLETED") {
    if (!Array.isArray(document?.evidence_refs) || document.evidence_refs.length === 0) {
      findings.push(block("WR-010", "evidence_refs", "COMPLETED results require at least one evidence ref."));
    }
    const failedCommand = (document?.commands ?? []).find((command) => command?.result === "FAIL");
    if (failedCommand) {
      findings.push(block("WR-011", "commands", "COMPLETED results must not contain failing command results."));
    }
  }

  if (["FAILED", "BLOCKED"].includes(document?.status)) {
    if (!isObject(document?.failure)) {
      findings.push(block("WR-012", "failure", "FAILED or BLOCKED results require a failure object."));
    } else {
      requireString(findings, document.failure.code, "failure.code", "WR-013", "failure.code is required.");
      requireString(findings, document.failure.message, "failure.message", "WR-014", "failure.message is required.");
      if (typeof document.failure.retryable !== "boolean") {
        findings.push(block("WR-015", "failure.retryable", "failure.retryable must be boolean."));
      }
    }
  }

  if (Array.isArray(document?.commands)) {
    document.commands.forEach((command, index) => {
      requireString(findings, command?.command, `commands[${index}].command`, "WR-016", "command is required.");
      requireEnum(findings, command?.result, ["PASS", "FAIL", "SKIPPED"], `commands[${index}].result`, "WR-017", "command result must be PASS, FAIL, or SKIPPED.");
    });
  }

  if (isObject(workOrder)) {
    if (document?.work_order_id !== workOrder.work_order_id) {
      findings.push(block("WR-018", "work_order_id", "Work Result work_order_id must match the Work Order."));
    }
    if (document?.repo?.full_name !== workOrder.repo?.full_name) {
      findings.push(block("WR-019", "repo.full_name", "Work Result repo.full_name must match the Work Order repo."));
    }
  }

  return findings;
}

function requireResultRepo(findings, repo, path) {
  if (!isObject(repo)) {
    findings.push(block("WR-020", path, "repo must be an object."));
    return;
  }
  requirePattern(findings, repo.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `${path}.full_name`, "WR-021", "repo.full_name must be owner/repo.");
  requirePattern(findings, repo.head_sha, /^[a-f0-9]{7,40}$/, `${path}.head_sha`, "WR-022", "repo.head_sha must be a git SHA.", { optional: true });
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
    work_order_ref: null,
    work_result_id: null,
    work_order_id: null,
    status: null,
    blockers: [{ item_id: "WR-FAILURE", code, message, path: file ?? "file" }],
    warnings: [],
    evidence: [],
    required_next_actions: [{ item_id: "WR-FAILURE", action: message }],
  };
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildWorkResultValidationReport(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
