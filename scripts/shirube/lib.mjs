import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const VERDICTS = ["PASS", "WARN", "BLOCK"];
export const REPORT_ONLY_VERDICTS = ["PASS_WITH_WARN", "BLOCKED"];
export const ALL_VERDICTS = [...VERDICTS, ...REPORT_ONLY_VERDICTS];
export const FAILURE_VERDICT = "FAILURE";

export function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { options, positionals };
}

export function isMain(importMetaUrl) {
  return importMetaUrl === pathToFileURL(process.argv[1]).href;
}

export function readStructuredFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const text = readFileSync(filePath, "utf8");
  if (extname(filePath) === ".json") {
    return JSON.parse(text);
  }
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

export function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function isValidVerdict(verdict) {
  return ALL_VERDICTS.includes(verdict);
}

export function isWouldBlockVerdict(verdict) {
  return verdict === "BLOCK" || verdict === "BLOCKED";
}

export function isWarningVerdict(verdict) {
  return verdict === "WARN" || verdict === "PASS_WITH_WARN";
}

export function exitForVerdict(verdict) {
  const options = arguments[1] ?? {};
  const reportOnly = options.reportOnly ?? true;
  if (!isValidVerdict(verdict)) {
    process.exitCode = 1;
    return;
  }
  if (isWouldBlockVerdict(verdict) && !reportOnly) {
    process.exitCode = 1;
  }
}

export function buildResult({ gate, verdict, reasons = [], remediation, ...rest }) {
  return {
    gate,
    verdict,
    would_block: isWouldBlockVerdict(verdict),
    reasons,
    remediation: remediation ?? {
      what: verdict === "PASS" ? "No remediation required." : `Resolve ${gate} finding(s).`,
      doc_ref: "docs/standards/shirube-ai-development-governance-standard-v1.md",
    },
    ...rest,
  };
}

export function verdictFromFindings(findings) {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARN")) return "WARN";
  return "PASS";
}

export function combineVerdicts(verdicts) {
  if (verdicts.includes(FAILURE_VERDICT)) return "BLOCK";
  if (verdicts.some(isWouldBlockVerdict)) return "BLOCK";
  if (verdicts.some(isWarningVerdict)) return "WARN";
  return "PASS";
}

export function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

export function asBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return false;
  return ["true", "yes", "required"].includes(value.trim().toLowerCase());
}

export function present(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    return value.trim() !== "" && !["null", "none", "n/a", "pending", "false"].includes(value.trim().toLowerCase());
  }
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

export function planningFields(source) {
  const hierarchy = isObject(source?.planning_hierarchy) ? source.planning_hierarchy : {};
  return {
    ...source,
    ...hierarchy,
  };
}

export function listFiles(dir, predicate = () => true) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listFiles(path, predicate));
    } else if (predicate(path)) {
      files.push(path);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function extractIds(text, prefix) {
  const pattern = new RegExp(`\\b${escapeRegExp(prefix)}-[A-Z0-9][A-Z0-9._:-]*\\b`, "g");
  return [...new Set(text.match(pattern) ?? [])]
    .filter((id) => id !== `${prefix}-ID`)
    .sort((a, b) => a.localeCompare(b));
}

export function loadFixtureOrFiles(options, loader) {
  if (options.fixture) return readStructuredFile(options.fixture);
  return loader();
}

export function buildFailureResult({ code = "script_failure", message }) {
  return {
    gate: "script-error",
    verdict: FAILURE_VERDICT,
    would_block: false,
    reasons: [{ code, message }],
    remediation: {
      what: "Fix the script invocation, malformed input, missing artifact, or invalid verdict and rerun the gate.",
      doc_ref: "docs/standards/shirube-ai-development-governance-standard-v1.md",
    },
  };
}

export function safeRun(fn) {
  const options = arguments[1] ?? {};
  try {
    const result = fn();
    if (!isObject(result)) {
      throw new Error("Gate script returned a non-object result.");
    }
    if (!isValidVerdict(result.verdict)) {
      writeResult(buildFailureResult({
        code: "unknown_verdict",
        message: `Unknown verdict: ${String(result.verdict)}`,
      }));
      process.exitCode = 1;
      return;
    }
    writeResult({ ...result, would_block: result.would_block ?? isWouldBlockVerdict(result.verdict) });
    exitForVerdict(result.verdict, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeResult(buildFailureResult({ code: "script_error", message }));
    process.exitCode = 1;
  }
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
