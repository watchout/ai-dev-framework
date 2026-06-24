#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMain,
  isObject,
  listFiles,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-overlay-pilot-readiness/v1";
const SUPPORTED_PROFILES = ["hotel-lite"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK_ROOT = path.resolve(SCRIPT_DIR, "../..");

const FINDINGS = {
  "OPR-001": ["adoption_pack_check_blocked", "Adoption pack safety check blocked the pack."],
  "OPR-002": ["rapid_lite_dry_run_blocked", "Generated overlay Rapid/Lite dry-run would block."],
  "OPR-003": ["rapid_lite_dry_run_failure", "Generated overlay Rapid/Lite dry-run failed."],
  "OPR-004": ["missing_cell_id", "Generated handoff must contain a concrete CELL-ID before pilot PR creation."],
  "OPR-005": ["missing_owner_or_confirmation", "Generated overlay must contain concrete owner actor and owner confirmation evidence."],
  "OPR-006": ["pending_owner_decision_treated_as_approval", "Committed pending owner-decision policy must not be treated as final approval."],
  "OPR-007": ["invalid_source_control", "Generated source mirror has invalid source-control metadata."],
  "OPR-008": ["invalid_input", "Overlay pilot readiness invocation is invalid."],
  "OPR-009": ["lifecycle_phase_mismatch", "Generated lifecycle state is incompatible with the Rapid/Lite dry-run."],
};

export function buildOverlayPilotReadiness(options) {
  const input = normalizeInput(options);
  const invocationFindings = validateInvocation(input);
  if (invocationFindings.length > 0) {
    return result({ input, verdict: "FAILURE", blockers: invocationFindings });
  }

  let artifacts;
  try {
    artifacts = readPackArtifacts(input.packRoot);
  } catch (error) {
    return result({
      input,
      verdict: "FAILURE",
      blockers: [finding("OPR-008", { message: error instanceof Error ? error.message : String(error), path: "pack-root" })],
    });
  }

  const structuralFindings = [
    ...sourceControlFindings(artifacts.sourceMirror),
    ...pilotInputFindings(artifacts),
    ...pendingOwnerDecisionFindings(artifacts, input),
  ];
  const fatalStructural = structuralFindings.filter((item) => item.item_id === "OPR-007");
  if (fatalStructural.length > 0) {
    return result({ input, verdict: "FAILURE", blockers: structuralFindings });
  }

  const adoptionPackCheck = runAdoptionPackCheck(input);
  const blockers = [...structuralFindings];
  const warnings = [];
  if (adoptionPackCheck.report_failed || adoptionPackCheck.verdict === "FAILURE") {
    return result({
      input,
      verdict: "FAILURE",
      adoptionPackCheck,
      blockers: [...blockers, finding("OPR-001", { path: "check-adoption-pack", nested: adoptionPackCheck.blockers })],
      warnings,
    });
  }
  if (adoptionPackCheck.would_block || adoptionPackCheck.verdict === "BLOCKED") {
    blockers.push(finding("OPR-001", { path: "check-adoption-pack", nested: adoptionPackCheck.blockers }));
  }

  const dryRun = runRapidLiteDryRun({ input, artifacts });
  if (dryRun.report_failed || dryRun.verdict === "FAILURE") {
    return result({
      input,
      verdict: "FAILURE",
      adoptionPackCheck,
      rapidLiteDryRun: dryRun,
      blockers: [...blockers, finding("OPR-003", { path: "run-rapid-lite-report", nested: dryRun.blockers })],
      warnings,
    });
  }
  if (dryRun.would_block === true || dryRun.verdict === "BLOCKED") {
    blockers.push(finding("OPR-002", { path: "run-rapid-lite-report", nested: dryRun.blockers }));
    if (dryRun.gates?.some((gate) => gate.gate === "lifecycle" && gate.would_block === true)) {
      blockers.push(finding("OPR-009", { path: ".shirube/lifecycle-state.yaml", nested: gateBlockers(dryRun, "lifecycle") }));
    }
  }

  for (const warning of [...(adoptionPackCheck.warnings ?? []), ...(dryRun.warnings ?? [])]) {
    warnings.push(warning);
  }

  return result({
    input,
    verdict: blockers.length > 0 ? "BLOCKED" : warnings.length > 0 || dryRun.verdict === "PASS_WITH_WARN" || adoptionPackCheck.verdict === "PASS_WITH_WARN" ? "PASS_WITH_WARN" : "PASS",
    adoptionPackCheck,
    rapidLiteDryRun: dryRun,
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
  });
}

function normalizeInput(options) {
  return {
    packRoot: stringOption(options["pack-root"]),
    targetRepo: stringOption(options["target-repo"]),
    profile: stringOption(options.profile),
    actualHead: stringOption(options["actual-head"]),
    format: stringOption(options.format),
  };
}

function validateInvocation(input) {
  const findings = [];
  if (!input.packRoot || !existsSync(input.packRoot)) {
    findings.push(finding("OPR-008", { path: "pack-root", message: "--pack-root must point to a rendered adoption pack." }));
  }
  if (!repoPattern().test(input.targetRepo ?? "")) {
    findings.push(finding("OPR-008", { path: "target-repo", message: "--target-repo must be owner/repo." }));
  }
  if (!SUPPORTED_PROFILES.includes(input.profile)) {
    findings.push(finding("OPR-008", { path: "profile", message: "--profile must be hotel-lite." }));
  }
  if (!input.actualHead || isPlaceholder(input.actualHead)) {
    findings.push(finding("OPR-008", { path: "actual-head", message: "--actual-head must be provided for the dry-run." }));
  }
  if (input.format !== "json") {
    findings.push(finding("OPR-008", { path: "format", message: "--format json is required." }));
  }
  return findings;
}

function readPackArtifacts(packRoot) {
  return {
    executionContext: readOptionalStructured(path.join(packRoot, ".shirube/execution-context.yaml")),
    adoptionIntake: readOptionalStructured(path.join(packRoot, ".shirube/adoption-intake.yaml")),
    repoSpec: readOptionalStructured(path.join(packRoot, ".shirube/repo-spec.yaml")),
    handoff: readOptionalStructured(path.join(packRoot, ".shirube/control-handoffs/CH-001.yaml")),
    lifecycleState: readOptionalStructured(path.join(packRoot, ".shirube/lifecycle-state.yaml")),
    sourceMirror: readOptionalStructured(path.join(packRoot, ".shirube/source-mirrors/control-issue.yaml")),
    enforcementPolicy: readOptionalStructured(path.join(packRoot, ".shirube/enforcement-policy.yaml")),
    controlState: readOptionalStructured(path.join(packRoot, ".shirube/control-state-completeness.yaml")),
    ownerDecisionFiles: [
      ".shirube/evidence/owner-decision.yaml",
      ".shirube/owner-decision.yaml",
    ].map((relativePath) => ({ relativePath, value: readOptionalStructured(path.join(packRoot, relativePath)) })),
  };
}

function sourceControlFindings(sourceMirror) {
  const findings = [];
  if (!isObject(sourceMirror)) return findings;
  const sourceRef = sourceMirror.source_ref;
  const sourceRepo = sourceMirror.source_repo;
  const issueNumber = sourceMirror.issue_number;
  if (!sourceControlPattern().test(sourceRef ?? "")) {
    findings.push(finding("OPR-007", { path: ".shirube/source-mirrors/control-issue.yaml:source_ref" }));
  }
  if (!repoPattern().test(sourceRepo ?? "") || !Number.isInteger(Number(issueNumber)) || Number(issueNumber) < 1) {
    findings.push(finding("OPR-007", { path: ".shirube/source-mirrors/control-issue.yaml" }));
  }
  return findings;
}

function pilotInputFindings(artifacts) {
  const findings = [];
  const handoff = artifacts.handoff;
  const cellId = handoff?.cell?.["CELL-ID"];
  if (isPlaceholder(cellId)) findings.push(finding("OPR-004", { path: ".shirube/control-handoffs/CH-001.yaml:cell.CELL-ID" }));

  const ownerActor = handoff?.owner?.actor ?? artifacts.adoptionIntake?.owner?.actor ?? artifacts.enforcementPolicy?.owner?.actor;
  const ownerConfirmation = handoff?.owner_confirmation_ref ?? handoff?.premise_confirmation_ref ?? artifacts.adoptionIntake?.owner_confirmation_ref;
  if (isPlaceholder(ownerActor) || isPlaceholder(ownerConfirmation)) {
    findings.push(finding("OPR-005", { path: ".shirube/control-handoffs/CH-001.yaml:owner" }));
  }
  return findings;
}

function pendingOwnerDecisionFindings(artifacts, input) {
  const findings = [];
  const decisions = [
    { path: ".shirube/control-handoffs/CH-001.yaml:owner_decision", value: artifacts.handoff?.owner_decision },
    ...artifacts.ownerDecisionFiles.filter((entry) => isObject(entry.value)).map((entry) => ({ path: entry.relativePath, value: entry.value })),
  ];
  for (const decision of decisions) {
    if (!isObject(decision.value)) continue;
    const head = firstPresent(decision.value.exact_head_sha, decision.value.head_sha, decision.value.target_head);
    const verdict = String(firstPresent(decision.value.decision, decision.value.verdict, decision.value.status) ?? "").toUpperCase();
    const approvalGranted = decision.value.approval_granted;
    if (!isPlaceholder(head) && String(head) === input.actualHead && (verdict === "PENDING" || approvalGranted === false)) {
      findings.push(finding("OPR-006", { path: decision.path }));
    }
  }
  return findings;
}

function runAdoptionPackCheck(input) {
  const stdout = runNode([
    path.join(SCRIPT_DIR, "check-adoption-pack.mjs"),
    "--pack-root",
    input.packRoot,
    "--target-repo",
    input.targetRepo,
    "--profile",
    input.profile,
    "--format",
    "json",
  ], { cwd: FRAMEWORK_ROOT });
  return commandReport(stdout, "check-adoption-pack");
}

function runRapidLiteDryRun({ input, artifacts }) {
  const scratch = mkdtempSync(path.join(tmpdir(), "shirube-overlay-pilot-"));
  const changedFilesPath = path.join(scratch, "changed-files.txt");
  const prBodyPath = path.join(scratch, "pr-body.md");
  const validationPath = path.join(scratch, "validation-evidence.json");
  const ownerDecisionPath = path.join(scratch, "owner-decision.json");
  const resultDir = path.join(scratch, "rapid-lite-report");

  const changedFiles = packFiles(input.packRoot);
  writeFileSync(changedFilesPath, `${changedFiles.join("\n")}\n`);
  writeFileSync(validationPath, `${JSON.stringify(validationEvidence({ input, artifacts, changedFiles }), null, 2)}\n`);
  writeFileSync(ownerDecisionPath, `${JSON.stringify(ownerDecisionEvidence({ input, artifacts }), null, 2)}\n`);
  writeFileSync(prBodyPath, `${prBody({ validationPath, ownerDecisionPath })}\n`);

  const stdout = runNode([
    path.join(SCRIPT_DIR, "run-rapid-lite-report.mjs"),
    "--result-dir",
    resultDir,
    "--changed-files",
    changedFilesPath,
    "--pr-body",
    prBodyPath,
    "--actual-repo",
    input.targetRepo,
    "--actual-branch",
    "shirube/rapid-lite-adoption",
    "--actual-head",
    input.actualHead,
    "--diff-root",
    ".",
    "--format",
    "json",
  ], { cwd: input.packRoot });
  const report = commandReport(stdout, "run-rapid-lite-report");
  return {
    ...report,
    result_dir: resultDir,
    changed_files_count: changedFiles.length,
  };
}

function validationEvidence({ input, artifacts, changedFiles }) {
  return {
    schema_version: "shirube-validation-evidence/v1",
    evidence_id: "OVERLAY-PILOT-READINESS-VALIDATION",
    target_repo: input.targetRepo,
    pr_head_sha: input.actualHead,
    commands: [
      "check-adoption-pack",
      "run-rapid-lite-report dry-run",
    ],
    results: [
      { command: "check-adoption-pack", result: "PASS" },
      { command: "run-rapid-lite-report dry-run", result: "PASS" },
    ],
    validation_results: ["PASS"],
    required_evidence: [
      "PR_head_SHA",
      "changed_files",
      "validation_commands",
      "validation_results",
      "control_state_completeness_report",
    ],
    changed_files_count: changedFiles.length,
    owner_confirmation_ref: artifacts.handoff?.owner_confirmation_ref ?? artifacts.adoptionIntake?.owner_confirmation_ref ?? null,
    external_only: true,
    not_committed_to_attested_head: true,
  };
}

function ownerDecisionEvidence({ input, artifacts }) {
  return {
    schema_version: "shirube-owner-decision/v1",
    decision: "APPROVED_EXACT_HEAD",
    approval_granted: true,
    exact_head_sha: input.actualHead,
    actor: artifacts.handoff?.owner?.actor ?? artifacts.adoptionIntake?.owner?.actor ?? "owner",
    decision_ref: "overlay-pilot-readiness://external-dry-run-owner-input",
    external_only: true,
    not_committed_to_attested_head: true,
    dry_run_only: true,
  };
}

function prBody({ validationPath, ownerDecisionPath }) {
  return [
    "execution_context_ref: .shirube/execution-context.yaml",
    "adoption_plan_ref: .shirube/adoption-intake.yaml",
    "existing_state_ref: .shirube/existing-state-scan.yaml",
    "repo_spec_ref: .shirube/repo-spec.yaml",
    "source_mirror_ref: .shirube/source-mirrors/control-issue.yaml",
    "lifecycle_state_ref: .shirube/lifecycle-state.yaml",
    "handoff_ref: .shirube/control-handoffs/CH-001.yaml",
    `validation_evidence_ref: ${validationPath}`,
    `owner_decision_ref: ${ownerDecisionPath}`,
    "enforcement_policy_ref: .shirube/enforcement-policy.yaml",
    "control_state_ref: .shirube/control-state-completeness.yaml",
    `matrix_ref: ${path.join(FRAMEWORK_ROOT, ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml")}`,
    `rule_pack_ref: ${path.join(FRAMEWORK_ROOT, ".shirube/design-rule-packs/shirube-default-design-rules.yaml")}`,
    "",
  ].join("\n");
}

function runNode(args, { cwd }) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  if (!stdout.trim()) {
    return JSON.stringify({
      schema: "shirube-overlay-pilot-command/v1",
      verdict: "FAILURE",
      report_failed: true,
      would_block: true,
      blockers: [{
        item_id: "OPR-CMD-001",
        code: "command_failed_without_json",
        message: result.stderr?.trim() || "Command produced no JSON output.",
      }],
      warnings: [],
    });
  }
  return stdout;
}

function commandReport(stdout, gate) {
  try {
    const report = JSON.parse(stdout);
    const reportFailed = report.report_failed === true || report.verdict === "FAILURE";
    const blockers = flattenReportBlockers(report);
    return {
      ...report,
      gate,
      report_failed: reportFailed,
      would_block: reportFailed || report.would_block === true || report.verdict === "BLOCKED",
      blockers,
      warnings: flattenReportWarnings(report),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schema: "shirube-overlay-pilot-command/v1",
      gate,
      verdict: "FAILURE",
      report_failed: true,
      would_block: true,
      blockers: [finding("OPR-003", { message, path: gate })],
      warnings: [],
    };
  }
}

function flattenReportBlockers(report) {
  const direct = [
    ...asArray(report.blockers),
    ...asArray(report.hard_blocks),
  ];
  const gateBlockers = asArray(report.gates).flatMap((gate) => [
    ...asArray(gate.blockers),
    ...asArray(gate.hard_blocks),
  ].map((item) => ({ ...item, source_gate: gate.gate })));
  return [...direct, ...gateBlockers];
}

function flattenReportWarnings(report) {
  const direct = asArray(report.warnings);
  const gateWarnings = asArray(report.gates).flatMap((gate) => asArray(gate.warnings).map((item) => ({ ...item, source_gate: gate.gate })));
  return [...direct, ...gateWarnings];
}

function gateBlockers(report, gateName) {
  return asArray(report.gates)
    .filter((gate) => gate.gate === gateName)
    .flatMap((gate) => asArray(gate.blockers));
}

function result({ input, verdict, adoptionPackCheck = null, rapidLiteDryRun = null, blockers = [], warnings = [] }) {
  const uniqueBlockers = uniqueFindings(blockers);
  const uniqueWarnings = uniqueFindings(warnings);
  const resolvedVerdict = verdict ?? (uniqueBlockers.length > 0 ? "BLOCKED" : uniqueWarnings.length > 0 ? "PASS_WITH_WARN" : "PASS");
  const wouldBlock = resolvedVerdict === "BLOCKED" || resolvedVerdict === "FAILURE";
  return {
    schema: SCHEMA,
    verdict: resolvedVerdict,
    would_block: wouldBlock,
    owner_must_not_merge: wouldBlock,
    target_repo: input.targetRepo ?? null,
    profile: input.profile ?? null,
    actual_head: input.actualHead ?? null,
    adoption_pack_check: summarizeNested(adoptionPackCheck),
    rapid_lite_dry_run: summarizeNested(rapidLiteDryRun),
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    required_next_actions: requiredNextActions(uniqueBlockers, uniqueWarnings),
  };
}

function summarizeNested(report) {
  if (!report) return null;
  return {
    schema: report.schema ?? null,
    verdict: report.verdict ?? null,
    state: report.state ?? null,
    would_block: report.would_block === true,
    owner_must_not_merge: report.owner_must_not_merge === true,
    report_failed: report.report_failed === true,
    blockers: report.blockers ?? [],
    warnings: report.warnings ?? [],
    result_dir: report.result_dir ?? null,
    changed_files_count: report.changed_files_count ?? report.changed_files?.length ?? null,
    gates: Array.isArray(report.gates) ? report.gates.map((gate) => ({
      gate: gate.gate,
      verdict: gate.verdict,
      would_block: gate.would_block,
      report_failed: gate.report_failed,
    })) : undefined,
  };
}

function finding(itemId, overrides = {}) {
  const [code, message] = FINDINGS[itemId];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? null,
    nested: overrides.nested ?? undefined,
  };
}

function requiredNextActions(blockers, warnings) {
  if (blockers.length === 0 && warnings.length === 0) return [];
  return [...blockers, ...warnings].map((item) => ({
    item_id: item.item_id ?? item.code ?? "finding",
    action: item.message ?? "Resolve overlay pilot readiness finding.",
  }));
}

function packFiles(packRoot) {
  return listFiles(packRoot)
    .map((file) => normalizePath(path.relative(packRoot, file)))
    .filter((file) => !file.startsWith(".shirube-rapid-lite/"))
    .sort((a, b) => a.localeCompare(b));
}

function readOptionalStructured(filePath) {
  if (!existsSync(filePath)) return null;
  return readStructuredFile(filePath);
}

function repoPattern() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
}

function sourceControlPattern() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9][0-9]*$/;
}

function firstPresent(...values) {
  return values.find((value) => !isPlaceholder(value));
}

function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^<[^>]+>$/.test(trimmed)) return true;
  return /^(pending|pending-.+|tbd|todo|null|none|n\/a|replace this.*)$/i.test(trimmed);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function stringOption(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function uniqueFindings(findings) {
  const seen = new Set();
  const result = [];
  for (const item of findings.filter(Boolean)) {
    const key = `${item.item_id ?? item.code}:${item.path ?? ""}:${item.message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildOverlayPilotReadiness(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
