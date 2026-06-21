import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { buildResult, extractIds, isMain, isObject, listFiles, parseArgs, readStructuredFile, safeRun, verdictFromFindings } from "./lib.mjs";

export function runTraceCheck(options = {}) {
  if (options.fixture) {
    return evaluateTrace(readStructuredFile(options.fixture));
  }
  const specDir = options["spec-dir"] ?? ".shirube/specs";
  const cellDir = options["cell-dir"] ?? ".shirube/cells";
  const requirements = listFiles(specDir, (path) => path.endsWith(".md"))
    .flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...extractIds(text, "REQ"), ...extractIds(text, "SEC")];
    });
  const cells = listFiles(cellDir, (path) => path.endsWith(".yaml") || path.endsWith(".yml"))
    .map((path) => ({ path, ...readStructuredFile(path) }));
  return evaluateTrace({ requirements: [...new Set(requirements)].sort(), cells });
}

export function evaluateTrace(input) {
  const findings = [];
  const requirements = new Set(input.requirements ?? []);
  const covered = new Map();
  const cells = Array.isArray(input.cells) ? input.cells : [];

  for (const cell of cells) {
    const cellId = cell.id ?? cell["CELL-ID"] ?? cell.cell_id ?? cell.path ?? "unknown-cell";
    if (!cell.risk_tier) {
      findings.push({ severity: "BLOCK", code: "cell_missing_risk_tier", cell: cellId, message: `${cellId} is missing risk_tier.` });
    }
    if (!Array.isArray(cell.allowed_paths) || cell.allowed_paths.length === 0) {
      findings.push({ severity: "BLOCK", code: "cell_missing_allowed_paths", cell: cellId, message: `${cellId} is missing allowed_paths.` });
    }
    for (const req of cell.covered_req_ids ?? []) {
      if (!covered.has(req)) covered.set(req, []);
      covered.get(req).push(cellId);
      if (!requirements.has(req)) {
        findings.push({ severity: "BLOCK", code: "orphan_cell_requirement", cell: cellId, requirement: req, message: `${cellId} covers unknown requirement ${req}.` });
      }
    }
  }

  for (const req of requirements) {
    if (!covered.has(req)) {
      findings.push({ severity: "BLOCK", code: "uncovered_requirement", requirement: req, message: `${req} is not covered by any Cell.` });
    }
  }

  if (cells.some((cell) => !isObject(cell))) {
    findings.push({ severity: "BLOCK", code: "invalid_cell_record", message: "Each cell must be a mapping." });
  }

  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "spec-to-cell-trace",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Update Cell covered_req_ids, allowed_paths, and risk_tier so every REQ-ID is covered exactly by structured Cell records.",
      doc_ref: ".shirube/cells/",
    },
    observed: {
      requirement_count: requirements.size,
      cell_count: cells.length,
      cells: cells.map((cell) => cell.id ?? cell["CELL-ID"] ?? basename(cell.path ?? "unknown-cell")),
    },
  });
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  safeRun(() => runTraceCheck(options));
}
