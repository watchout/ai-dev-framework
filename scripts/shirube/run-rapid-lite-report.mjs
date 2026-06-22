#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isMain,
  isObject,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-rapid-lite-report/v1";
const MARKER = "<!-- shirube-rapid-lite-gates-report/v1 -->";
const DEFAULT_RESULT_DIR = ".shirube-rapid-lite";

export function buildRapidLiteReport(options) {
  const resultDir = stringOption(options["result-dir"]) ?? DEFAULT_RESULT_DIR;
  mkdirSync(resultDir, { recursive: true });

  const changedFilesPath = stringOption(options["changed-files"]);
  const prBodyPath = stringOption(options["pr-body"]);
  const diffRoot = stringOption(options["diff-root"]) ?? ".";
  const changedFiles = readChangedFiles(changedFilesPath);
  const prBody = prBodyPath && existsSync(prBodyPath) ? readFileSync(prBodyPath, "utf8") : "";
  const refs = discoverRefs({ prBody, changedFiles });
  const records = [];

  const adoption = runAdoption({ resultDir, refs, changedFilesPath });
  records.push(adoption);

  const gateContract = runGateContract({ resultDir, refs, changedFilesPath });
  records.push(gateContract);

  const designRules = runDesignRules({ resultDir, refs, changedFilesPath, prBodyPath, diffRoot });
  records.push(designRules);

  const lifecycle = runLifecycle({
    resultDir,
    refs,
    changedFilesPath,
    adoptionReportPath: adoption.status === "ran" ? adoption.output_path : refs.adoptionReport,
    gateContractReportPath: gateContract.status === "ran" ? gateContract.output_path : refs.gateContractReport,
    designRuleReportPath: designRules.status === "ran" ? designRules.output_path : refs.designRuleReport,
  });
  records.splice(1, 0, lifecycle);

  const aggregate = aggregateReport({ resultDir, refs, records, changedFiles });
  writeFileSync(path.join(resultDir, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  writeFileSync(path.join(resultDir, "summary.md"), renderSummary(aggregate));
  return aggregate;
}

function runAdoption({ resultDir, refs, changedFilesPath }) {
  if (!refs.adoptionPlan) return skipped("adoption", "No adoption intake plan was found.");
  const args = [
    "scripts/shirube/check-adoption.mjs",
    "--adoption-plan",
    refs.adoptionPlan,
  ];
  addArg(args, "--existing-state", refs.existingState);
  addArg(args, "--legacy-inventory", refs.legacyInventory);
  addArg(args, "--repo-spec", refs.repoSpec);
  addArg(args, "--spec-reconciliation", refs.specReconciliation);
  addArg(args, "--handoff", refs.handoff);
  addArg(args, "--changed-files", changedFilesPath);
  args.push("--format", "json");
  return runGate({ gate: "adoption", args, outputPath: path.join(resultDir, "adoption.json") });
}

function runGateContract({ resultDir, refs, changedFilesPath }) {
  if (!refs.handoff) return skipped("gate-contract", "No Rapid/Lite control handoff was found.");
  const args = [
    "scripts/shirube/check-gate-contract.mjs",
  ];
  addArg(args, "--matrix", refs.matrix);
  addArg(args, "--repo-spec", refs.repoSpec);
  addArg(args, "--framework-lock", refs.frameworkLock);
  args.push("--handoff", refs.handoff);
  addArg(args, "--changed-files", changedFilesPath);
  addArg(args, "--owner-decision", refs.ownerDecision);
  args.push("--format", "json");
  return runGate({ gate: "gate-contract", args, outputPath: path.join(resultDir, "gate-contract.json") });
}

function runDesignRules({ resultDir, refs, changedFilesPath, prBodyPath, diffRoot }) {
  if (!refs.rulePack) return skipped("design-rules", "No design rule pack was found.");
  const args = [
    "scripts/shirube/check-design-rules.mjs",
    "--rule-pack",
    refs.rulePack,
  ];
  addArg(args, "--changed-files", changedFilesPath);
  addArg(args, "--diff-root", diffRoot);
  addArg(args, "--handoff", refs.handoff);
  addArg(args, "--pr-body", prBodyPath);
  args.push("--format", "json");
  return runGate({ gate: "design-rules", args, outputPath: path.join(resultDir, "design-rules.json") });
}

function runLifecycle({ resultDir, refs, changedFilesPath, adoptionReportPath, gateContractReportPath, designRuleReportPath }) {
  if (!refs.lifecycleState) return skipped("lifecycle", "No lifecycle state was found.");
  const args = [
    "scripts/shirube/check-lifecycle.mjs",
    "--state",
    refs.lifecycleState,
  ];
  addArg(args, "--adoption-report", adoptionReportPath);
  addArg(args, "--repo-spec", refs.repoSpec);
  addArg(args, "--framework-lock", refs.frameworkLock);
  addArg(args, "--handoff", refs.handoff);
  addArg(args, "--gate-contract-report", gateContractReportPath);
  addArg(args, "--design-rule-report", designRuleReportPath);
  addArg(args, "--owner-decision", refs.ownerDecision);
  addArg(args, "--post-merge", refs.postMerge);
  addArg(args, "--changed-files", changedFilesPath);
  args.push("--format", "json");
  return runGate({ gate: "lifecycle", args, outputPath: path.join(resultDir, "lifecycle.json") });
}

function runGate({ gate, args, outputPath }) {
  const command = ["node", ...args].join(" ");
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  writeFileSync(outputPath, stdout.trim() ? `${stdout.trim()}\n` : "{}\n");
  if (stderr.trim()) writeFileSync(`${outputPath}.stderr.txt`, `${stderr.trim()}\n`);

  let report = null;
  let parseError = null;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  if (!report) {
    report = {
      schema: "shirube-rapid-lite-gate-run/v1",
      verdict: "FAILURE",
      would_block: false,
      blockers: [],
      warnings: [],
      required_next_actions: [
        {
          code: "malformed_gate_json",
          message: parseError ?? "Gate command did not produce JSON.",
        },
      ],
    };
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return {
    gate,
    status: "ran",
    command,
    output_path: outputPath,
    exit_code: result.status ?? 1,
    verdict: report.verdict ?? "UNKNOWN",
    current_phase: report.current_phase ?? null,
    disposition: report.disposition ?? report.adoption?.disposition ?? null,
    would_block: report.would_block === true,
    blockers: findings(report, "blockers"),
    warnings: findings(report, "warnings"),
    required_next_actions: Array.isArray(report.required_next_actions) ? report.required_next_actions : [],
    report,
  };
}

function skipped(gate, reason) {
  return {
    gate,
    status: "skipped",
    reason,
    output_path: null,
    exit_code: null,
    verdict: "SKIPPED",
    current_phase: null,
    disposition: null,
    would_block: false,
    blockers: [],
    warnings: [],
    required_next_actions: [],
  };
}

function aggregateReport({ resultDir, refs, records, changedFiles }) {
  const ran = records.filter((record) => record.status === "ran");
  const verdict = aggregateVerdict(ran.map((record) => record.verdict));
  return {
    schema: SCHEMA,
    report_only: true,
    generated_at: new Date().toISOString(),
    result_dir: resultDir,
    verdict,
    would_block: ran.some((record) => record.would_block || record.verdict === "BLOCKED"),
    gates: records.map((record) => ({
      gate: record.gate,
      status: record.status,
      reason: record.reason ?? null,
      command: record.command ?? null,
      output_path: record.output_path,
      exit_code: record.exit_code,
      verdict: record.verdict,
      current_phase: record.current_phase,
      disposition: record.disposition,
      would_block: record.would_block,
      blockers: record.blockers,
      warnings: record.warnings,
      required_next_actions: record.required_next_actions,
    })),
    discovered_inputs: refs,
    changed_files_count: changedFiles.length,
    changed_files: changedFiles,
  };
}

function renderSummary(report) {
  const lines = [
    MARKER,
    "",
    "## Shirube Rapid/Lite Gates Report",
    "",
    `- Verdict: \`${report.verdict}\``,
    `- Would block: \`${String(report.would_block)}\``,
    `- Report-only: \`${String(report.report_only)}\``,
    `- Changed files: \`${report.changed_files_count}\``,
    "",
    "This workflow is report-only. `BLOCKED` findings are recorded as PR-visible evidence and uploaded JSON artifacts; they do not fail this workflow or change required checks.",
    "",
    "### Gate Summary",
    "",
    "| Gate | Status | Verdict | Current phase | Disposition | Would block |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((gate) => `| ${gate.gate} | ${gate.status}${gate.reason ? `<br>${escapeTable(gate.reason)}` : ""} | ${gate.verdict ?? ""} | ${gate.current_phase ?? ""} | ${gate.disposition ?? ""} | ${String(gate.would_block)} |`),
    "",
    "### Findings",
    "",
  ];

  for (const gate of report.gates) {
    lines.push(`#### ${gate.gate}`);
    lines.push("");
    appendFindingList(lines, "Blockers", gate.blockers);
    appendFindingList(lines, "Warnings", gate.warnings);
    appendActions(lines, gate.required_next_actions);
    lines.push("");
  }

  lines.push("### Artifact Outputs");
  lines.push("");
  for (const gate of report.gates) {
    if (gate.output_path) lines.push(`- ${gate.gate}: \`${gate.output_path}\``);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendFindingList(lines, title, findingsList) {
  lines.push(`**${title}**`);
  lines.push("");
  if (!Array.isArray(findingsList) || findingsList.length === 0) {
    lines.push("- none");
    lines.push("");
    return;
  }
  for (const item of findingsList.slice(0, 20)) {
    const id = item.item_id ?? item.rule_id ?? item.code ?? "finding";
    const message = item.message ?? item.action ?? "";
    const location = item.path ? ` (${item.path})` : "";
    lines.push(`- \`${id}\`${location}: ${message}`);
  }
  if (findingsList.length > 20) lines.push(`- ... ${findingsList.length - 20} more`);
  lines.push("");
}

function appendActions(lines, actions) {
  lines.push("**Required next actions**");
  lines.push("");
  if (!Array.isArray(actions) || actions.length === 0) {
    lines.push("- none");
    lines.push("");
    return;
  }
  for (const action of actions.slice(0, 20)) {
    if (typeof action === "string") {
      lines.push(`- ${action}`);
    } else {
      const id = action.item_id ?? action.code ?? "action";
      lines.push(`- \`${id}\`: ${action.action ?? action.message ?? ""}`);
    }
  }
  if (actions.length > 20) lines.push(`- ... ${actions.length - 20} more`);
  lines.push("");
}

function discoverRefs({ prBody, changedFiles }) {
  const explicit = {
    adoptionPlan: refFromBody(prBody, ["adoption_plan_ref", "adoption_plan", "adoption-plan", "adoption plan"]),
    existingState: refFromBody(prBody, ["existing_state_ref", "existing_state", "existing-state", "existing state"]),
    legacyInventory: refFromBody(prBody, ["legacy_inventory_ref", "legacy_inventory", "legacy-inventory"]),
    specReconciliation: refFromBody(prBody, ["spec_reconciliation_ref", "spec_reconciliation", "spec-reconciliation"]),
    lifecycleState: refFromBody(prBody, ["lifecycle_state_ref", "lifecycle_state", "lifecycle-state"]),
    adoptionReport: refFromBody(prBody, ["adoption_report_ref", "adoption_report", "adoption-report"]),
    gateContractReport: refFromBody(prBody, ["gate_contract_report_ref", "gate_contract_report", "gate-contract-report"]),
    designRuleReport: refFromBody(prBody, ["design_rule_report_ref", "design_rule_report", "design-rule-report"]),
    repoSpec: refFromBody(prBody, ["repo_spec_ref", "repo_spec", "repo-spec", "premise_ref"]),
    frameworkLock: refFromBody(prBody, ["framework_lock_ref", "framework_lock", "framework-lock"]),
    handoff: refFromBody(prBody, ["handoff_ref", "handoff", "control_handoff_ref", "control_handoff", "control-handoff"]),
    ownerDecision: refFromBody(prBody, ["owner_decision_ref", "owner_decision", "owner-decision"]),
    postMerge: refFromBody(prBody, ["post_merge_ref", "post_merge", "post-merge"]),
    matrix: refFromBody(prBody, ["matrix_ref", "gate_contract_matrix_ref", "gate_contract_matrix"]),
    rulePack: refFromBody(prBody, ["rule_pack_ref", "rule_pack", "rule-pack", "design_rule_pack_ref"]),
  };

  const schemaMatches = schemasFromFiles([...changedFiles, ...walkFiles(".shirube")]);
  return {
    adoptionPlan: firstExisting(explicit.adoptionPlan, bySchema(schemaMatches, "shirube-adoption-intake/v1"), ".shirube/adoption-intake.yaml", ".shirube/adoption/intake.yaml"),
    existingState: firstExisting(explicit.existingState, bySchema(schemaMatches, "shirube-existing-state-scan/v1"), ".shirube/existing-state-scan.yaml", ".shirube/adoption/existing-state-scan.yaml"),
    legacyInventory: firstExisting(explicit.legacyInventory, ".shirube/legacy-inventory.yaml"),
    specReconciliation: firstExisting(explicit.specReconciliation, bySchema(schemaMatches, "shirube-spec-reconciliation-plan/v1"), ".shirube/spec-reconciliation-plan.yaml"),
    lifecycleState: firstExisting(explicit.lifecycleState, bySchema(schemaMatches, "shirube-lifecycle-state/rapid-lite/v1"), ".shirube/lifecycle-state.yaml", ".shirube/lifecycle-state.rapid-lite.yaml"),
    adoptionReport: firstExisting(explicit.adoptionReport, ".shirube/reports/adoption.json"),
    gateContractReport: firstExisting(explicit.gateContractReport, ".shirube/reports/gate-contract.json"),
    designRuleReport: firstExisting(explicit.designRuleReport, ".shirube/reports/design-rules.json"),
    repoSpec: firstExisting(explicit.repoSpec, ".shirube/repo-spec.yaml"),
    frameworkLock: firstExisting(explicit.frameworkLock, ".shirube/shirube-framework-lock.yaml"),
    handoff: firstExisting(explicit.handoff, bySchema(schemaMatches, "shirube-control-handoff/rapid-lite/v1"), ".shirube/control-handoff.yaml", ...walkFiles(".shirube/control-handoffs").filter((file) => /\.ya?ml$/i.test(file))),
    ownerDecision: firstExisting(explicit.ownerDecision, ".shirube/evidence/owner-decision.yaml"),
    postMerge: firstExisting(explicit.postMerge, ".shirube/evidence/post-merge.yaml"),
    matrix: firstExisting(explicit.matrix, ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml"),
    rulePack: firstExisting(explicit.rulePack, ".shirube/design-rule-packs/shirube-default-design-rules.yaml"),
  };
}

function refFromBody(body, keys) {
  if (!body) return null;
  for (const key of keys) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${escapeRegExp(key)})\\s*:\\s*([^\\n]+?)\\s*(?=\\n|$)`, "i");
    const match = body.match(pattern);
    const value = sanitizeRef(match?.[1]);
    if (value) return value;
  }
  return null;
}

function sanitizeRef(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^["'`]|["'`]$/g, "");
  if (!cleaned || /^https?:\/\//i.test(cleaned) || cleaned === "null") return null;
  return cleaned.split(/\s+/)[0];
}

function schemasFromFiles(files) {
  const matches = [];
  for (const file of [...new Set(files)].sort((a, b) => a.localeCompare(b))) {
    if (!existsSync(file) || !/\.(ya?ml|json)$/i.test(file)) continue;
    try {
      const body = readStructuredFile(file);
      const schema = isObject(body) ? body.schema_version : null;
      if (schema) matches.push({ file, schema });
    } catch {
      // Input discovery must not fail the report-only workflow.
    }
  }
  return matches;
}

function bySchema(matches, schema) {
  return matches.find((entry) => entry.schema === schema)?.file ?? null;
}

function firstExisting(...values) {
  return values.flat().filter(Boolean).find((value) => existsSync(value)) ?? null;
}

function walkFiles(root) {
  if (!root || !existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(root).sort((a, b) => a.localeCompare(b))) {
    const fullPath = path.join(root, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) files.push(...walkFiles(fullPath));
    if (entryStat.isFile()) files.push(fullPath);
  }
  return files;
}

function readChangedFiles(filePath) {
  if (!filePath || !existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .sort((a, b) => a.localeCompare(b));
}

function findings(report, key) {
  const primary = Array.isArray(report[key]) ? report[key] : [];
  if (key === "blockers" && Array.isArray(report.hard_blocks)) return [...primary, ...report.hard_blocks];
  return primary;
}

function aggregateVerdict(verdicts) {
  if (verdicts.includes("FAILURE")) return "FAILURE";
  if (verdicts.includes("BLOCKED")) return "BLOCKED";
  if (verdicts.includes("PASS_WITH_WARN")) return "PASS_WITH_WARN";
  if (verdicts.includes("PASS")) return "PASS";
  return "SKIPPED";
}

function addArg(args, key, value) {
  if (value) args.push(key, value);
}

function stringOption(value) {
  return typeof value === "string" ? value : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|");
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  if (options.format !== "json") {
    process.stdout.write(`${JSON.stringify({
      schema: SCHEMA,
      verdict: "FAILURE",
      would_block: false,
      required_next_actions: [{ code: "unsupported_format", message: "--format json is required." }],
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const report = buildRapidLiteReport(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  main();
}
