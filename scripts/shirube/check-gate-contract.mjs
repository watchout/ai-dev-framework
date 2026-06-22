#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-gate-contract-check/v1";
const DEFAULT_MATRIX = ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml";
const RAPID_LITE_CHANGED_FILE_WARN_LIMIT = 12;

const HARD_MESSAGES = {
  "RL-GOAL-001": ["missing_control_handoff", "Control handoff file is required and must be readable.", "handoff"],
  "RL-GOAL-002": ["missing_repo_local_issue", "repo_local_issue is required.", "repo_local_issue"],
  "RL-GOAL-003": ["legacy_as_truth", "legacy_source_boundary.legacy_sources_are_truth must not be true.", "legacy_source_boundary.legacy_sources_are_truth"],
  "RL-GOAL-004": ["missing_owner_or_next_role", "owner.role, owner.actor, and next_role are required.", "owner"],
  "RL-CELL-001": ["missing_cell_id", "CELL-ID is required.", "cell.CELL-ID"],
  "RL-CELL-002": ["missing_allowed_paths", "cell.allowed_paths must contain at least one path glob.", "cell.allowed_paths"],
  "RL-CELL-003": ["missing_forbidden_paths", "cell.forbidden_paths must contain at least one path glob.", "cell.forbidden_paths"],
  "RL-CELL-004": ["missing_stop_conditions", "cell.stop_conditions must contain at least one stop condition.", "cell.stop_conditions"],
  "RL-CELL-006": ["protected_surface_requires_standard_or_enterprise", "Protected surfaces require Standard or Enterprise mode.", "cell.cell_type"],
  "RL-PR-002": ["changed_files_outside_allowed_paths", "Changed file is outside cell.allowed_paths.", "changed_files"],
  "RL-PR-003": ["forbidden_paths_touched", "Changed file matches cell.forbidden_paths.", "changed_files"],
  "RL-EVID-001": ["missing_validation_evidence", "validation.required_evidence is required.", "validation.required_evidence"],
  "RL-EVID-002": ["placeholder_evidence", "Required evidence must not contain placeholder or pending values.", "validation.required_evidence"],
  "RL-MERGE-001": ["owner_decision_missing", "Owner decision is required before merge.", "owner_decision"],
  "RL-MERGE-002": ["merge_head_mismatch", "Owner decision exact head does not match expected PR head.", "owner_decision.exact_head_sha"],
};

const WARN_MESSAGES = {
  "RL-SPEC-W001": ["AC_TEST_granularity_low", "Acceptance or test detail is too thin for Rapid/Lite promotion.", "acceptance_criteria"],
  "RL-PR-W001": ["PR_size_large", "Changed file count exceeds the Rapid/Lite report-only threshold.", "changed_files"],
  "RL-EVID-W002": ["manual_evidence_only", "Validation evidence is durable but manual only.", "validation"],
};

export function buildGateContractReport(input) {
  const hardBlocks = [];
  const warnings = [];
  const evidence = [];
  const matrixPath = input.matrixPath;
  const handoffPath = input.handoffPath;
  const changedFiles = input.changedFiles ?? [];
  const matrix = input.matrix;
  const handoff = input.handoff;
  const validationArtifact = input.validationArtifact;
  const ownerDecisionArtifact = input.ownerDecisionArtifact;

  evidence.push({ code: "gate_contract_matrix", source: "file", detail: matrixPath });
  if (!handoff) {
    hardBlocks.push(finding("RL-GOAL-001"));
    return report({
      matrixPath,
      handoffPath: handoffPath ?? "",
      mode: stringValue(matrix?.mode) ?? "rapid-lite",
      profile: "UNKNOWN",
      cellId: null,
      cellType: null,
      hardBlocks,
      warnings,
      evidence,
    });
  }

  const mode = stringValue(handoff.mode) ?? stringValue(matrix?.mode) ?? "rapid-lite";
  const profile = stringValue(handoff.profile) ?? "UNKNOWN";
  const cell = isObject(handoff.cell) ? handoff.cell : {};
  const cellId = stringValue(cell["CELL-ID"]) ?? null;
  const cellType = stringValue(cell.cell_type) ?? "UNKNOWN";
  const allowedPaths = asStringArray(cell.allowed_paths);
  const forbiddenPaths = asStringArray(cell.forbidden_paths);
  const stopConditions = asArray(cell.stop_conditions);
  const owner = isObject(handoff.owner) ? handoff.owner : {};
  const ownerDecision = mergeObjects(isObject(handoff.owner_decision) ? handoff.owner_decision : {}, ownerDecisionArtifact);
  const validation = mergeObjects(isObject(handoff.validation) ? handoff.validation : {}, validationArtifact);

  evidence.push({ code: "control_handoff", source: "file", detail: handoffPath });
  evidence.push({ code: "changed_files", source: input.changedFilesPath ? "file" : "input", detail: `${changedFiles.length} changed file(s)` });
  if (input.ownerDecisionPath) evidence.push({ code: "owner_decision", source: "file", detail: input.ownerDecisionPath });
  if (input.validationPath) evidence.push({ code: "validation_evidence", source: "file", detail: input.validationPath });

  if (isPlaceholder(handoff.repo_local_issue)) hardBlocks.push(finding("RL-GOAL-002"));
  if (handoff.legacy_source_boundary?.legacy_sources_are_truth === true) hardBlocks.push(finding("RL-GOAL-003"));
  if (isPlaceholder(owner.role) || isPlaceholder(owner.actor) || isPlaceholder(handoff.next_role)) {
    hardBlocks.push(finding("RL-GOAL-004"));
  }

  if (isPlaceholder(cellId)) hardBlocks.push(finding("RL-CELL-001"));
  if (allowedPaths.length === 0) hardBlocks.push(finding("RL-CELL-002"));
  if (forbiddenPaths.length === 0) hardBlocks.push(finding("RL-CELL-003"));
  if (stopConditions.length === 0) hardBlocks.push(finding("RL-CELL-004"));
  if (isProtectedStop({ matrix, profile, cell, cellType })) hardBlocks.push(finding("RL-CELL-006"));

  for (const file of changedFiles) {
    if (allowedPaths.length > 0 && !matchesAnyGlob(file, allowedPaths)) {
      hardBlocks.push(finding("RL-PR-002", { message: `${file} is outside cell.allowed_paths.`, path: file }));
    }
    if (forbiddenPaths.length > 0 && matchesAnyGlob(file, forbiddenPaths)) {
      hardBlocks.push(finding("RL-PR-003", { message: `${file} matches cell.forbidden_paths.`, path: file }));
    }
  }

  const requiredEvidence = asArray(validation.required_evidence);
  if (requiredEvidence.length === 0 || validation.evidence_file_required === true && !input.validationPath) {
    hardBlocks.push(finding("RL-EVID-001"));
  }
  for (const placeholderPath of findPlaceholderPaths(requiredEvidence, "validation.required_evidence")) {
    hardBlocks.push(finding("RL-EVID-002", { path: placeholderPath }));
  }
  if (validationArtifact !== undefined) {
    for (const placeholderPath of findPlaceholderPaths(validationArtifact, "validation")) {
      hardBlocks.push(finding("RL-EVID-002", { path: placeholderPath }));
    }
  }

  if (ownerDecision.required_before_merge === true && !hasOwnerDecisionEvidence(ownerDecision, input.ownerDecisionPath)) {
    hardBlocks.push(finding("RL-MERGE-001"));
  }
  const expectedHead = firstPresent(
    handoff.pr_head_sha,
    handoff.PR_head_SHA,
    handoff.expected_pr_head_sha,
    validation.pr_head_sha,
    validation.expected_pr_head_sha,
  );
  const ownerHead = firstPresent(ownerDecision.exact_head_sha, ownerDecision.head_sha, ownerDecision.target_head);
  if (!isPlaceholder(expectedHead) && !isPlaceholder(ownerHead) && String(expectedHead) !== String(ownerHead)) {
    hardBlocks.push(finding("RL-MERGE-002"));
  }

  if (!hasAcceptanceOrTestDetail(handoff)) warnings.push(finding("RL-SPEC-W001", {}, WARN_MESSAGES));
  if (changedFiles.length > RAPID_LITE_CHANGED_FILE_WARN_LIMIT) warnings.push(finding("RL-PR-W001", {}, WARN_MESSAGES));
  if (input.validationPath && isManualOnlyValidation(validationArtifact)) {
    warnings.push(finding("RL-EVID-W002", {}, WARN_MESSAGES));
  }

  return report({
    matrixPath,
    handoffPath,
    mode,
    profile,
    cellId,
    cellType,
    hardBlocks: uniqueFindings(hardBlocks),
    warnings: uniqueFindings(warnings),
    evidence,
  });
}

function report({ matrixPath, handoffPath, mode, profile, cellId, cellType, hardBlocks, warnings, evidence }) {
  const verdict = hardBlocks.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";
  return {
    schema: SCHEMA,
    mode,
    profile,
    verdict,
    would_block: verdict === "BLOCKED",
    handoff_ref: handoffPath,
    matrix_ref: matrixPath,
    cell_id: cellId,
    cell_type: cellType,
    hard_blocks: hardBlocks,
    warnings,
    evidence: uniqueEvidence(evidence),
    required_next_actions: requiredNextActions(hardBlocks, warnings),
  };
}

function failureReport({ code, message, matrixPath = "", handoffPath = "" }) {
  return {
    schema: SCHEMA,
    mode: "rapid-lite",
    profile: "UNKNOWN",
    verdict: "FAILURE",
    would_block: false,
    handoff_ref: handoffPath,
    matrix_ref: matrixPath,
    cell_id: null,
    cell_type: null,
    hard_blocks: [],
    warnings: [],
    evidence: [],
    required_next_actions: [
      {
        code,
        message,
      },
    ],
  };
}

function finding(itemId, overrides = {}, source = HARD_MESSAGES) {
  const [code, message, defaultPath] = source[itemId];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? defaultPath,
  };
}

function requiredNextActions(hardBlocks, warnings) {
  if (hardBlocks.length === 0 && warnings.length === 0) return [];
  return [...hardBlocks, ...warnings].map((finding) => ({
    item_id: finding.item_id,
    action: finding.message,
  }));
}

function readInput(options) {
  const matrixPath = typeof options.matrix === "string"
    ? options.matrix
    : existsSync(DEFAULT_MATRIX)
      ? DEFAULT_MATRIX
      : null;
  const handoffPath = typeof options.handoff === "string" ? options.handoff : null;
  const changedFilesPath = typeof options["changed-files"] === "string" ? options["changed-files"] : null;
  const ownerDecisionPath = typeof options["owner-decision"] === "string" ? options["owner-decision"] : null;
  const validationPath = typeof options.validation === "string" ? options.validation : null;

  if (!matrixPath) {
    return { error: failureReport({ code: "missing_matrix", message: "--matrix is required when the default matrix does not exist." }) };
  }

  let matrix;
  try {
    matrix = readStructuredFile(matrixPath);
  } catch (error) {
    return {
      error: failureReport({
        code: "matrix_parse_error",
        message: errorMessage(error),
        matrixPath,
        handoffPath: handoffPath ?? "",
      }),
    };
  }

  let handoff = null;
  if (handoffPath && existsSync(handoffPath)) {
    try {
      handoff = readStructuredFile(handoffPath);
    } catch (error) {
      return {
        error: failureReport({
          code: "handoff_parse_error",
          message: errorMessage(error),
          matrixPath,
          handoffPath,
        }),
      };
    }
  }

  let ownerDecisionArtifact;
  if (ownerDecisionPath) {
    try {
      ownerDecisionArtifact = readStructuredFile(ownerDecisionPath);
    } catch (error) {
      return {
        error: failureReport({
          code: "owner_decision_parse_error",
          message: errorMessage(error),
          matrixPath,
          handoffPath: handoffPath ?? "",
        }),
      };
    }
  }

  let validationArtifact;
  if (validationPath) {
    try {
      validationArtifact = readStructuredFile(validationPath);
    } catch (error) {
      return {
        error: failureReport({
          code: "validation_parse_error",
          message: errorMessage(error),
          matrixPath,
          handoffPath: handoffPath ?? "",
        }),
      };
    }
  }

  return {
    input: {
      matrix,
      matrixPath,
      handoff,
      handoffPath,
      changedFiles: readChangedFiles(changedFilesPath),
      changedFilesPath,
      ownerDecisionArtifact,
      ownerDecisionPath,
      validationArtifact,
      validationPath,
    },
  };
}

function readChangedFiles(filePath) {
  if (!filePath) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .sort((a, b) => a.localeCompare(b));
}

function isProtectedStop({ matrix, profile, cell, cellType }) {
  if (cellType === "protected_stop") return true;
  const forbiddenSurfaces = new Set(asArray(matrix?.profiles?.[profile]?.hard_forbidden_surfaces).map(String));
  const requested = [
    ...asStringArray(cell.protected_surfaces),
    ...asStringArray(cell.requested_surfaces),
    ...asStringArray(cell.surfaces),
    ...asStringArray(cell.requested_operations),
  ];
  return requested.some((surface) => forbiddenSurfaces.has(surface));
}

function hasOwnerDecisionEvidence(ownerDecision, ownerDecisionPath) {
  if (ownerDecisionPath) return true;
  return !isPlaceholder(ownerDecision.decision_ref) ||
    !isPlaceholder(ownerDecision.ref) ||
    !isPlaceholder(ownerDecision.url) ||
    !isPlaceholder(ownerDecision.exact_head_sha) ||
    !isPlaceholder(ownerDecision.head_sha) ||
    !isPlaceholder(ownerDecision.target_head);
}

function hasAcceptanceOrTestDetail(handoff) {
  return presentArray(handoff.acceptance_criteria) ||
    presentArray(handoff.tests) ||
    presentArray(handoff.test_plan) ||
    presentArray(handoff.cell?.acceptance_criteria) ||
    presentArray(handoff.validation?.acceptance_tests) ||
    presentArray(handoff.validation?.test_expectations);
}

function isManualOnlyValidation(value) {
  if (!isObject(value)) return false;
  const hasManual = value.manual === true ||
    presentArray(value.manual_notes) ||
    presentArray(value.notes) ||
    typeof value.manual_notes === "string";
  const hasExecutable = presentArray(value.commands) ||
    presentArray(value.required_commands) ||
    presentArray(value.results) ||
    presentArray(value.validation_results);
  return hasManual && !hasExecutable;
}

function findPlaceholderPaths(value, path) {
  if (isPlaceholder(value)) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findPlaceholderPaths(entry, `${path}[${index}]`));
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, entry]) => findPlaceholderPaths(entry, `${path}.${key}`));
  }
  return [];
}

function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^<[^>]+>$/.test(trimmed)) return true;
  return /^(pending|pending-.+|tbd|todo|null|none|n\/a|replace this.*)$/i.test(trimmed);
}

function matchesAnyGlob(file, globs) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}

function globToRegExp(glob) {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    const nextNext = glob[index + 2];
    if (char === "*" && next === "*" && nextNext === "/") {
      pattern += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }
    pattern += escapeRegExp(char);
  }
  pattern += "$";
  return new RegExp(pattern);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function asStringArray(value) {
  return asArray(value).filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim());
}

function presentArray(value) {
  return asArray(value).some((entry) => {
    if (Array.isArray(entry)) return presentArray(entry);
    if (isObject(entry)) return Object.keys(entry).length > 0;
    return !isPlaceholder(entry);
  });
}

function mergeObjects(base, override) {
  return {
    ...(isObject(base) ? base : {}),
    ...(isObject(override) ? override : {}),
  };
}

function firstPresent(...values) {
  return values.find((value) => !isPlaceholder(value));
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = `${finding.item_id}\0${finding.code}\0${finding.path}\0${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

function uniqueEvidence(evidence) {
  const seen = new Set();
  const unique = [];
  for (const item of evidence) {
    const key = `${item.code}\0${item.source}\0${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function printPlain(result) {
  process.stdout.write(`${result.verdict} ${result.cell_id ?? "UNKNOWN"} ${result.cell_type ?? "UNKNOWN"} hard_blocks=${result.hard_blocks.length} warnings=${result.warnings.length}\n`);
}

export function runGateContractCheck(argv = process.argv.slice(2)) {
  const { options } = parseArgs(argv);
  const format = options.format;
  if (format !== undefined && format !== "json") {
    return {
      result: failureReport({
        code: "unsupported_format",
        message: `Unsupported format: ${String(format)}. Only --format json is supported.`,
      }),
      exitCode: 1,
      json: true,
    };
  }
  const loaded = readInput(options);
  if (loaded.error) return { result: loaded.error, exitCode: 1, json: true };
  const result = buildGateContractReport(loaded.input);
  return {
    result,
    exitCode: result.verdict === "FAILURE" ? 1 : 0,
    json: format === "json",
  };
}

if (isMain(import.meta.url)) {
  const { result, exitCode, json } = runGateContractCheck();
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printPlain(result);
  }
  process.exitCode = exitCode;
}
