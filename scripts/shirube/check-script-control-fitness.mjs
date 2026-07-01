#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-script-control-fitness/v1";
const DEFAULT_AS_OF = new Date().toISOString().slice(0, 10);
const REPORT_ONLY_MODES = new Set(["report-only", "report_only", "advisory"]);
const ENFORCED_MODES = new Set(["enforced"]);
const ALLOWED_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json"]);
const PLACEHOLDER_PATTERN = /^(?:tbd|todo|later|none|null|n\/a|na|<[^>]+>)$/i;

const CONTROL_ROOTS = [
  ".shirube/",
  "docs/spec/",
  "docs/impl/",
  "docs/verify/",
  "rubrics/",
];

const CONDITIONAL_CONTROL_ROOTS = [
  "docs/standards/",
  "templates/",
  "scripts/shirube/",
  ".github/workflows/",
];

const CONTROL_TERMS = [
  "control_points",
  "control_source",
  "control_handoff",
  "execution_context",
  "owner_decision",
  "gate_result",
  "required_check",
  "branch_protection",
  "enforcement",
  "authority",
];

const FINDINGS = {
  "SCF-001": ["missing_control_points", "Control-bearing spec/ARC/handoff files must declare control_points[].", "control_points"],
  "SCF-002": ["missing_authority", "control_points[].authority is required and must be deterministic-script.", "control_points.authority"],
  "SCF-003": ["invalid_authority", "control_points[].authority must be deterministic-script; LLM/manual/owner prose authority is forbidden.", "control_points.authority"],
  "SCF-004": ["missing_enforcement", "control_points[].enforcement.mode is required.", "control_points.enforcement.mode"],
  "SCF-005": ["invalid_enforcement_mode", "control_points[].enforcement.mode must be enforced, report-only, report_only, or advisory.", "control_points.enforcement.mode"],
  "SCF-006": ["report_only_missing_enforce_by", "report-only/report_only/advisory control points require a concrete enforce_by date.", "control_points.enforcement.enforce_by"],
  "SCF-007": ["report_only_missing_owner", "report-only/report_only/advisory control points require a concrete owner.", "control_points.enforcement.owner"],
  "SCF-008": ["report_only_missing_reason", "report-only/report_only/advisory control points require a concrete reason.", "control_points.enforcement.reason"],
  "SCF-009": ["report_only_expired_enforce_by", "report-only/report_only/advisory control point enforce_by is expired.", "control_points.enforcement.enforce_by"],
  "SCF-010": ["parse_error", "Control-bearing file could not be parsed deterministically.", "file"],
  "SCF-011": ["placeholder_value", "Control point fields must not use TBD/TODO/later/none/null/<...> placeholders.", "control_points"],
};

export function buildScriptControlFitnessReport(input) {
  const root = input.root ?? process.cwd();
  const asOf = normalizeDate(input.asOf ?? DEFAULT_AS_OF) ?? DEFAULT_AS_OF;
  const mode = input.backfill ? "backfill" : "changed";
  const files = resolveInputFiles({ root, mode, changedFilesPath: input.changedFilesPath, explicitFile: input.file });
  const blockers = [];
  const warnings = [];
  const failures = [];
  const controlPointsChecked = [];
  const filesScanned = [];
  const migrationFindings = [];

  for (const file of files) {
    const absolutePath = join(root, file);
    if (!existsSync(absolutePath)) continue;
    if (!statSync(absolutePath).isFile()) continue;
    if (!isScannableFile(file)) continue;
    if (isTestOrFixture(file)) continue;

    const text = readFileSync(absolutePath, "utf8");
    const hasDeclaredControlPoints = declaresControlPoints(text);
    const shouldRequire = mode === "changed" && requiresControlPoints(file, text);
    if (mode === "backfill" && !hasDeclaredControlPoints) {
      if (isLegacyMigrationCandidate(file, text)) {
        migrationFindings.push(finding("SCF-001", { file, path: file }));
      }
      continue;
    }
    const shouldScan = shouldRequire || hasDeclaredControlPoints;
    if (!shouldScan) continue;
    filesScanned.push(file);

    const parsed = parseControlDocuments(absolutePath, file);
    if (parsed.errors.length > 0) {
      for (const error of parsed.errors) {
        failures.push(finding("SCF-010", { file, message: error.message, path: error.path ?? file }));
      }
      continue;
    }

    const records = collectControlPointRecords(parsed.documents);
    if (records.length === 0) {
      if (shouldRequire) {
        blockers.push(finding("SCF-001", { file, path: file }));
      } else if (mode === "backfill" && isLegacyMigrationCandidate(file, text)) {
        migrationFindings.push(finding("SCF-001", { file, path: file }));
      }
      continue;
    }

    for (const record of records) {
      const points = Array.isArray(record.value) ? record.value : [];
      if (points.length === 0) {
        blockers.push(finding("SCF-001", { file, path: `${file}:${record.path}` }));
        continue;
      }
      points.forEach((point, index) => {
        const pointPath = `${record.path}[${index}]`;
        const summary = summarizeControlPoint({ file, path: pointPath, point });
        controlPointsChecked.push(summary);
        blockers.push(...validateControlPoint({ file, path: pointPath, point, asOf }));
      });
    }
  }

  const uniqueFailures = uniqueFindings(failures);
  const uniqueBlockers = uniqueFindings(blockers);
  const uniqueWarnings = uniqueFindings(warnings);
  const verdict = uniqueFailures.length > 0 ? "FAILURE" : uniqueBlockers.length > 0 ? "BLOCKED" : "PASS";

  return {
    schema: SCHEMA,
    mode,
    as_of: asOf,
    verdict,
    ci_should_fail: verdict !== "PASS",
    files_scanned: [...new Set(filesScanned)].sort(),
    control_points_checked: controlPointsChecked.sort(compareControlPointSummary),
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    failures: uniqueFailures,
    migration_findings: uniqueFindings(migrationFindings),
    required_next_actions: requiredNextActions([...uniqueFailures, ...uniqueBlockers]),
  };
}

function resolveInputFiles({ root, mode, changedFilesPath, explicitFile }) {
  if (explicitFile) return [normalizePath(explicitFile)];
  if (changedFilesPath) {
    return readFileSync(changedFilesPath, "utf8")
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean)
      .sort();
  }
  if (mode === "backfill") return discoverBackfillFiles(root);
  try {
    return execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).split(/\r?\n/).map((line) => normalizePath(line.trim())).filter(Boolean).sort();
  } catch {
    return [];
  }
}

function discoverBackfillFiles(root) {
  const files = [];
  for (const start of [...CONTROL_ROOTS, ...CONDITIONAL_CONTROL_ROOTS]) {
    const absolute = join(root, start);
    if (!existsSync(absolute)) continue;
    walk(absolute, root, files);
  }
  return [...new Set(files)].sort();
}

function walk(directory, root, files) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      walk(absolute, root, files);
    } else if (stats.isFile()) {
      const relativePath = normalizePath(relative(root, absolute));
      if (isScannableFile(relativePath)) files.push(relativePath);
    }
  }
}

function parseControlDocuments(absolutePath, file) {
  const extension = extname(file);
  const text = readFileSync(absolutePath, "utf8");
  const documents = [];
  const errors = [];

  if (extension === ".json") {
    try {
      documents.push({ value: JSON.parse(text), source: "json", path: "$" });
    } catch (error) {
      errors.push({ message: errorMessage(error), path: file });
    }
    return { documents, errors };
  }

  if (extension === ".yaml" || extension === ".yml") {
    try {
      documents.push({ value: readStructuredFile(absolutePath), source: "yaml", path: "$" });
    } catch (error) {
      errors.push({ message: errorMessage(error), path: file });
    }
    return { documents, errors };
  }

  for (const snippet of markdownYamlSnippets(text)) {
    try {
      documents.push({ value: parseYamlText(snippet.text), source: snippet.source, path: snippet.path });
    } catch (error) {
      errors.push({ message: errorMessage(error), path: `${file}:${snippet.path}` });
    }
  }

  return { documents, errors };
}

function markdownYamlSnippets(text) {
  const snippets = [];
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    if (end > 0) {
      snippets.push({ source: "frontmatter", path: "frontmatter", text: text.slice(4, end) });
    }
  }
  const fencePattern = /```(?:ya?ml)\s*\n([\s\S]*?)```/gi;
  let match;
  let index = 0;
  while ((match = fencePattern.exec(text)) !== null) {
    snippets.push({ source: "fenced_yaml", path: `fenced_yaml[${index}]`, text: match[1] });
    index += 1;
  }
  return snippets;
}

function parseYamlText(text) {
  const json = execFileSync("ruby", [
    "-ryaml",
    "-rjson",
    "-rdate",
    "-e",
    [
      "body = YAML.safe_load(STDIN.read, permitted_classes: [Date, Time], aliases: true)",
      "puts JSON.generate(body)",
    ].join("; "),
  ], { input: text, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(json);
}

function collectControlPointRecords(documents) {
  const records = [];
  for (const document of documents) {
    findControlPointArrays(document.value, document.path, records);
  }
  return records;
}

function findControlPointArrays(value, path, records) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findControlPointArrays(item, `${path}[${index}]`, records));
    return;
  }
  if (!isObject(value)) return;
  for (const key of Object.keys(value).sort()) {
    const nextPath = path === "$" ? key : `${path}.${key}`;
    if (key === "control_points") {
      records.push({ path: nextPath, value: value[key] });
    }
    findControlPointArrays(value[key], nextPath, records);
  }
}

function validateControlPoint({ file, path, point, asOf }) {
  const blockers = [];
  if (!isObject(point)) {
    blockers.push(finding("SCF-001", { file, path }));
    return blockers;
  }

  const authority = stringValue(point.authority);
  if (isPlaceholder(authority)) {
    blockers.push(finding("SCF-002", { file, path: `${path}.authority` }));
  } else if (normalizeToken(authority) !== "deterministic-script") {
    blockers.push(finding("SCF-003", { file, path: `${path}.authority`, observed: authority }));
  }

  const enforcement = normalizeEnforcement(point.enforcement);
  const mode = normalizeToken(enforcement.mode);
  if (isPlaceholder(enforcement.mode)) {
    blockers.push(finding("SCF-004", { file, path: `${path}.enforcement.mode` }));
    return blockers;
  }
  if (!ENFORCED_MODES.has(mode) && !REPORT_ONLY_MODES.has(mode)) {
    blockers.push(finding("SCF-005", { file, path: `${path}.enforcement.mode`, observed: enforcement.mode }));
    return blockers;
  }

  if (REPORT_ONLY_MODES.has(mode)) {
    const enforceBy = firstPresent(enforcement.enforce_by, enforcement.until, point.enforce_by);
    const owner = firstPresent(enforcement.owner, point.owner);
    const reason = firstPresent(enforcement.reason, point.reason);
    if (isPlaceholder(enforceBy) || !normalizeDate(enforceBy)) {
      blockers.push(finding("SCF-006", { file, path: `${path}.enforcement.enforce_by` }));
    } else if (dateIsExpired(enforceBy, asOf)) {
      blockers.push(finding("SCF-009", { file, path: `${path}.enforcement.enforce_by`, observed: String(enforceBy) }));
    }
    if (isPlaceholderOwner(owner)) {
      blockers.push(finding("SCF-007", { file, path: `${path}.enforcement.owner` }));
    }
    if (isPlaceholder(reason)) {
      blockers.push(finding("SCF-008", { file, path: `${path}.enforcement.reason` }));
    }
  }

  for (const placeholder of placeholderFields(point, path)) {
    blockers.push(finding("SCF-011", { file, path: placeholder.path, observed: placeholder.value }));
  }

  return blockers;
}

function normalizeEnforcement(enforcement) {
  if (typeof enforcement === "string") return { mode: enforcement };
  if (isObject(enforcement)) return enforcement;
  return { mode: undefined };
}

function summarizeControlPoint({ file, path, point }) {
  const enforcement = isObject(point) ? normalizeEnforcement(point.enforcement) : {};
  return {
    file,
    path,
    id: isObject(point) ? stringValue(point.id) ?? null : null,
    authority: isObject(point) ? stringValue(point.authority) ?? null : null,
    enforcement_mode: stringValue(enforcement.mode) ?? null,
  };
}

function placeholderFields(point, path) {
  const fields = [];
  const checks = [
    ["authority", point.authority],
    ["enforcement.mode", normalizeEnforcement(point.enforcement).mode],
    ["enforcement.enforce_by", normalizeEnforcement(point.enforcement).enforce_by],
    ["enforcement.owner", normalizeEnforcement(point.enforcement).owner],
    ["enforcement.reason", normalizeEnforcement(point.enforcement).reason],
  ];
  for (const [field, value] of checks) {
    if (value !== undefined && value !== null && isPlaceholder(value)) {
      fields.push({ path: `${path}.${field}`, value: String(value) });
    }
  }
  return fields;
}

function requiresControlPoints(file, text) {
  if (isTestOrFixture(file)) return false;
  if (isScriptOrWorkflow(file)) return false;
  if (!isScannableFile(file)) return false;
  if (CONTROL_ROOTS.some((root) => file.startsWith(root))) return true;
  if (file.startsWith("templates/") && /(?:enforcement-policy|control-handoff).*\.ya?ml$/i.test(file)) return true;
  if (file.startsWith("docs/standards/")) return hasControlTerms(text);
  return false;
}

function isLegacyMigrationCandidate(file, text) {
  if (isTestOrFixture(file)) return false;
  if (!isScannableFile(file)) return false;
  if (isScriptOrWorkflow(file)) return false;
  return CONTROL_ROOTS.some((root) => file.startsWith(root)) || hasControlTerms(text);
}

function isScriptOrWorkflow(file) {
  return file.startsWith("scripts/shirube/") || file.startsWith(".github/workflows/");
}

function declaresControlPoints(text) {
  return /\bcontrol_points\s*:/m.test(text);
}

function hasControlTerms(text) {
  const lower = text.toLowerCase();
  return CONTROL_TERMS.some((term) => lower.includes(term));
}

function isScannableFile(file) {
  return ALLOWED_EXTENSIONS.has(extname(file));
}

function isTestOrFixture(file) {
  return file.startsWith("test/") || file.includes("/fixtures/") || file.startsWith("tests/");
}

function normalizePath(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeToken(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PATTERN.test(trimmed);
}

function isPlaceholderOwner(owner) {
  if (isPlaceholder(owner)) return true;
  if (typeof owner === "string") return false;
  if (!isObject(owner)) return true;
  return isPlaceholder(firstPresent(owner.actor, owner.role, owner.name));
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : match[1];
}

function dateIsExpired(enforceBy, asOf) {
  const enforceByDate = normalizeDate(enforceBy);
  const asOfDate = normalizeDate(asOf);
  if (!enforceByDate || !asOfDate) return false;
  return enforceByDate < asOfDate;
}

function finding(itemId, overrides = {}) {
  const [code, message, defaultPath] = FINDINGS[itemId];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    file: overrides.file ?? null,
    path: overrides.path ?? defaultPath,
    observed: overrides.observed ?? undefined,
  };
}

function uniqueFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const item of findings) {
    const normalized = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique.sort((a, b) => `${a.file ?? ""}\0${a.path}\0${a.item_id}`.localeCompare(`${b.file ?? ""}\0${b.path}\0${b.item_id}`));
}

function requiredNextActions(findings) {
  return findings.map((item) => ({
    item_id: item.item_id,
    action: actionFor(item.item_id),
  }));
}

function actionFor(itemId) {
  const actions = {
    "SCF-001": "Add machine-readable control_points[] to the touched control-bearing spec/ARC/handoff file.",
    "SCF-002": "Set control_points[].authority to deterministic-script.",
    "SCF-003": "Replace manual/LLM/owner-prose gate authority with deterministic-script evidence.",
    "SCF-004": "Set control_points[].enforcement.mode.",
    "SCF-005": "Use enforced, report-only, report_only, or advisory as the enforcement mode.",
    "SCF-006": "Add a concrete enforce_by date for bounded report-only/advisory mode.",
    "SCF-007": "Add a concrete owner for bounded report-only/advisory mode.",
    "SCF-008": "Add a concrete reason for bounded report-only/advisory mode.",
    "SCF-009": "Promote or re-authorize the expired report-only/advisory control point.",
    "SCF-010": "Fix YAML/JSON syntax so the control record is machine-readable.",
    "SCF-011": "Replace placeholder values with concrete control evidence.",
  };
  return actions[itemId] ?? "Resolve the script-control fitness finding.";
}

function compareControlPointSummary(a, b) {
  return `${a.file}\0${a.path}\0${a.id ?? ""}`.localeCompare(`${b.file}\0${b.path}\0${b.id ?? ""}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  if (options.format !== "json") {
    process.stdout.write(`${JSON.stringify({
      schema: SCHEMA,
      verdict: "FAILURE",
      ci_should_fail: true,
      failures: [{ code: "unsupported_format", message: "--format json is required.", path: "format" }],
      blockers: [],
      warnings: [],
      required_next_actions: [{ code: "unsupported_format", action: "Run with --format json." }],
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const report = buildScriptControlFitnessReport({
    root: typeof options.root === "string" ? options.root : process.cwd(),
    asOf: typeof options["as-of"] === "string" ? options["as-of"] : DEFAULT_AS_OF,
    backfill: options.backfill === true,
    changedFilesPath: typeof options["changed-files"] === "string" ? options["changed-files"] : null,
    file: typeof options.file === "string" ? options.file : null,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.ci_should_fail) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main();
}
