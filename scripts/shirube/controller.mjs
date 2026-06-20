import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buildResult, combineVerdicts, isMain, parseArgs, safeRun, verdictFromFindings } from "./lib.mjs";

const SCRIPT_BY_GATE = {
  "repo-spec": "scripts/shirube/check-repo-spec.mjs",
  planning: "scripts/shirube/check-planning.mjs",
  trace: "scripts/shirube/check-trace.mjs",
  phase: "scripts/shirube/check-phase.mjs",
  conformance: "scripts/shirube/check-conformance.mjs",
};

export function runController(mode, options = {}) {
  if (!["readiness", "dev-loop", "change-flow"].includes(mode)) {
    return buildResult({
      gate: "controller",
      verdict: "BLOCK",
      reasons: [{ code: "invalid_controller_mode", message: "Mode must be readiness, dev-loop, or change-flow." }],
      remediation: {
        what: "Invoke controller.mjs with readiness, dev-loop, or change-flow.",
        doc_ref: "scripts/shirube/controller.mjs",
      },
    });
  }

  const childResults = runChildGates(mode, options);
  const changeFlowResult = mode === "change-flow" ? evaluateChangeFlow(options) : null;
  const verdicts = [
    ...childResults.map((result) => result.verdict),
    ...(changeFlowResult ? [changeFlowResult.verdict] : []),
  ];
  const verdict = combineVerdicts(verdicts);
  const reasons = [
    ...childResults.flatMap((result) => result.verdict === "PASS" ? [] : [{ gate: result.gate, verdict: result.verdict, reasons: result.reasons }]),
    ...(changeFlowResult && changeFlowResult.verdict !== "PASS" ? [{ gate: changeFlowResult.gate, verdict: changeFlowResult.verdict, reasons: changeFlowResult.reasons }] : []),
  ];

  return buildResult({
    gate: `controller:${mode}`,
    verdict,
    reasons,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Resolve blocking or warning child gate results before treating the controller as ready.",
      doc_ref: "scripts/shirube/controller.mjs",
    },
    child_results: [...childResults, ...(changeFlowResult ? [changeFlowResult] : [])],
  });
}

function runChildGates(mode, options) {
  const gates = mode === "readiness"
    ? ["repo-spec", "planning"]
    : ["trace", "phase", "conformance"];
  if (mode === "change-flow") gates.unshift("repo-spec");
  return gates.map((gate) => runGate(gate, options));
}

function runGate(gate, options) {
  const args = [SCRIPT_BY_GATE[gate]];
  const fixtureKey = `${gate}-fixture`;
  if (options[fixtureKey]) args.push("--fixture", options[fixtureKey]);
  if (gate === "phase" && options["phase-state"]) args.push("--state", options["phase-state"]);
  try {
    return JSON.parse(execFileSync("node", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }));
  } catch (error) {
    const stdout = error.stdout?.toString();
    if (stdout) return JSON.parse(stdout);
    return buildResult({
      gate,
      verdict: "BLOCK",
      reasons: [{ code: "child_gate_failed", message: error.message }],
      remediation: {
        what: `Fix ${gate} script execution.`,
        doc_ref: SCRIPT_BY_GATE[gate],
      },
    });
  }
}

export function evaluateChangeFlow(options = {}) {
  const changedFiles = readChangedFiles(options);
  const governedChanges = changedFiles.filter((file) =>
    /^(src|scripts|schemas|templates|\.github\/workflows)\//.test(file) ||
    file === "package.json" ||
    file.endsWith("package-lock.json") ||
    file.endsWith("pnpm-lock.yaml")
  );
  const hasSpec = changedFiles.some((file) => file.startsWith(".shirube/specs/") || file.startsWith("docs/spec/"));
  const hasCell = changedFiles.some((file) => file.startsWith(".shirube/cells/"));
  const findings = [];
  if (governedChanges.length > 0 && !hasSpec) {
    findings.push({ severity: "BLOCK", code: "governed_change_without_spec", message: "Governed changes require a spec artifact.", files: governedChanges });
  }
  if (governedChanges.length > 0 && !hasCell) {
    findings.push({ severity: "BLOCK", code: "governed_change_without_cell", message: "Governed changes require a Cell artifact.", files: governedChanges });
  }
  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "change-flow",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Add current PR spec and Cell artifacts for governed changes.",
      doc_ref: ".shirube/specs/",
    },
    changed_files: changedFiles,
  });
}

function readChangedFiles(options) {
  if (options["changed-files"]) {
    return readFileSync(options["changed-files"], "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (process.env.SHIRUBE_CHANGED_FILES) {
    return process.env.SHIRUBE_CHANGED_FILES.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
  }
  try {
    return execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return existsSync(".git") ? [] : [];
  }
}

if (isMain(import.meta.url)) {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  safeRun(() => runController(positionals[0], options));
}
