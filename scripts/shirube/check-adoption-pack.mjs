#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  isMain,
  isObject,
  listFiles,
  parseArgs,
  readStructuredFile,
} from "./lib.mjs";

const SCHEMA = "shirube-adoption-pack-check/v1";
const SUPPORTED_PROFILES = ["hotel-lite"];

const REQUIRED_FILES = [
  ".shirube/execution-context.yaml",
  ".shirube/adoption-intake.yaml",
  ".shirube/existing-state-scan.yaml",
  ".shirube/repo-spec.yaml",
  ".shirube/control-handoffs/CH-001.yaml",
  ".shirube/lifecycle-state.yaml",
  ".shirube/source-mirrors/control-issue.yaml",
  ".shirube/enforcement-policy.yaml",
  ".shirube/control-state-completeness.yaml",
  "docs/shirube/README.md",
];

const FORBIDDEN_PATTERNS = [
  "scripts/shirube/**",
  "src/**",
  "app/**",
  "api/**",
  "lib/**",
  "db/**",
  "migrations/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env*",
  "deploy/**",
  "deployment/**",
  ".github/branch-protection/**",
  ".github/rulesets/**",
];

const ALLOWED_OVERLAY_PATTERNS = [
  ".shirube/**",
  "docs/shirube/**",
];

const RUNTIME_OR_PACKAGE_PATTERNS = [
  "src/**",
  "app/**",
  "api/**",
  "lib/**",
  "db/**",
  "migrations/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env*",
  "deploy/**",
  "deployment/**",
];

const REQUIRED_CONTROL_STATE_INVENTORY = [
  "execution_context_report",
  "repo_spec",
  "source_mirror",
  "adoption_report",
  "lifecycle_report",
  "gate_contract_report",
  "design_rule_report",
  "enforcement_policy_report",
  "handoff",
  "validation_evidence",
  "owner_exact_head_decision",
  "post_merge_evidence_before_complete",
];

const README_REQUIRED_PHRASES = [
  "LLM output is not authority",
  "report_only` is not the final enforcement state",
  "BLOCKED` or `would_block=true` means the owner must not merge unless an explicit exact-head pilot exception is recorded",
  "The adoption PR must not mix runtime, API, DB, package",
  "Full control requires the Control State Completeness gate to pass",
];

const FINDINGS = {
  "ADOPT-PACK-001": ["missing_required_file", "Required adoption pack file is missing."],
  "ADOPT-PACK-002": ["forbidden_target_file_present", "Adoption pack includes a forbidden target-repo file."],
  "ADOPT-PACK-003": ["invalid_yaml", "Generated YAML is not parseable."],
  "ADOPT-PACK-004": ["target_repo_mismatch", "Pack artifact target repo does not match --target-repo."],
  "ADOPT-PACK-005": ["missing_execution_context", "Execution context is missing or incomplete."],
  "ADOPT-PACK-006": ["source_mirror_claims_truth", "Source mirror must declare mirror_is_truth=false."],
  "ADOPT-PACK-007": ["enforcement_not_report_only", "Enforcement policy must start as report_only and owner-observed."],
  "ADOPT-PACK-008": ["missing_control_state_completeness_config", "Control State Completeness config is missing required inventory."],
  "ADOPT-PACK-009": ["missing_owner_exact_head_policy", "Owner exact-head decision policy is required before merge."],
  "ADOPT-PACK-010": ["docs_missing_non_authority_language", "docs/shirube/README.md is missing required authority and scope language."],
  "ADOPT-PACK-011": ["full_control_claim_without_readiness", "Full-control claims require readiness evidence."],
  "ADOPT-PACK-012": ["runtime_or_package_scope_detected", "Adoption pack contains or allows runtime/package/non-overlay scope."],
};

export function buildAdoptionPackCheck(options) {
  const input = normalizeInput(options);
  const invocationErrors = validateInvocation(input);
  if (invocationErrors.length > 0) {
    return result({
      input,
      verdict: "FAILURE",
      inventory: baseInventory(input, []),
      blockers: invocationErrors,
    });
  }

  const files = packFiles(input.packRoot);
  const inventory = baseInventory(input, files);
  const blockers = [];
  const warnings = [];

  for (const requiredFile of REQUIRED_FILES) {
    if (!files.includes(requiredFile)) {
      blockers.push(finding("ADOPT-PACK-001", {
        path: requiredFile,
        message: `Missing required file: ${requiredFile}`,
      }));
      if (requiredFile === ".shirube/execution-context.yaml") {
        blockers.push(finding("ADOPT-PACK-005", { path: requiredFile }));
      }
    }
  }

  const forbiddenFiles = files.filter((file) => FORBIDDEN_PATTERNS.some((pattern) => matchesPattern(file, pattern)));
  for (const file of forbiddenFiles) {
    blockers.push(finding("ADOPT-PACK-002", { path: file }));
  }

  const outsideOverlay = files.filter((file) => !ALLOWED_OVERLAY_PATTERNS.some((pattern) => matchesPattern(file, pattern)));
  const runtimeOrPackageFiles = files.filter((file) => RUNTIME_OR_PACKAGE_PATTERNS.some((pattern) => matchesPattern(file, pattern)));
  for (const file of uniqueStrings([...outsideOverlay, ...runtimeOrPackageFiles])) {
    blockers.push(finding("ADOPT-PACK-012", {
      path: file,
      message: `Adoption pack file is outside the allowed overlay scope: ${file}`,
    }));
  }

  const parsedResult = parseYamlArtifacts(input.packRoot, files);
  inventory.yaml = {
    parsed_files: Object.keys(parsedResult.parsed).sort((a, b) => a.localeCompare(b)),
    invalid_files: parsedResult.invalid.map((item) => item.path),
  };
  if (parsedResult.invalid.length > 0) {
    return result({
      input,
      verdict: "FAILURE",
      inventory,
      blockers: [...blockers, ...parsedResult.invalid.map((item) => finding("ADOPT-PACK-003", {
        path: item.path,
        message: item.message,
      }))],
      warnings,
    });
  }

  const artifacts = artifactMap(parsedResult.parsed);
  enrichInventory(inventory, artifacts);

  blockers.push(...targetRepoFindings(input, artifacts));
  blockers.push(...executionContextFindings(artifacts.executionContext));
  blockers.push(...sourceMirrorFindings(artifacts.sourceMirror));
  blockers.push(...adoptionStatusFindings(artifacts));
  blockers.push(...enforcementFindings(artifacts.enforcementPolicy));
  blockers.push(...controlStateCompletenessFindings(artifacts.controlStateCompleteness));
  blockers.push(...ownerExactHeadPolicyFindings(artifacts));
  blockers.push(...artifactScopeClaimFindings(artifacts));
  blockers.push(...readmeFindings(input.packRoot, files));

  const uniqueBlockers = uniqueFindings(blockers);
  const uniqueWarnings = uniqueFindings(warnings);
  const verdict = uniqueBlockers.length > 0 ? "BLOCKED" : uniqueWarnings.length > 0 ? "PASS_WITH_WARN" : "PASS";

  return result({
    input,
    verdict,
    inventory,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  });
}

function normalizeInput(options) {
  return {
    packRoot: stringOption(options["pack-root"]),
    targetRepo: stringOption(options["target-repo"]),
    profile: stringOption(options.profile),
    format: stringOption(options.format),
  };
}

function validateInvocation(input) {
  const blockers = [];
  if (!input.packRoot) {
    blockers.push(finding("ADOPT-PACK-001", { path: "pack-root", message: "--pack-root is required." }));
  }
  if (!repoPattern().test(input.targetRepo ?? "")) {
    blockers.push(finding("ADOPT-PACK-004", { path: "target-repo", message: "--target-repo must be owner/repo." }));
  }
  if (!SUPPORTED_PROFILES.includes(input.profile)) {
    blockers.push(finding("ADOPT-PACK-004", { path: "profile", message: "--profile must be hotel-lite." }));
  }
  if (input.format !== "json") {
    blockers.push(finding("ADOPT-PACK-003", { path: "format", message: "--format json is required." }));
  }
  return blockers;
}

function packFiles(packRoot) {
  if (!packRoot || !existsSync(packRoot)) return [];
  return listFiles(packRoot)
    .map((file) => normalizePath(path.relative(packRoot, file)))
    .sort((a, b) => a.localeCompare(b));
}

function parseYamlArtifacts(packRoot, files) {
  const parsed = {};
  const invalid = [];
  for (const file of files.filter((entry) => entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
    try {
      parsed[file] = readStructuredFile(path.join(packRoot, file));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      invalid.push({ path: file, message });
    }
  }
  return { parsed, invalid };
}

function artifactMap(parsed) {
  return {
    executionContext: parsed[".shirube/execution-context.yaml"],
    adoptionIntake: parsed[".shirube/adoption-intake.yaml"],
    repoSpec: parsed[".shirube/repo-spec.yaml"],
    handoff: parsed[".shirube/control-handoffs/CH-001.yaml"],
    lifecycleState: parsed[".shirube/lifecycle-state.yaml"],
    sourceMirror: parsed[".shirube/source-mirrors/control-issue.yaml"],
    enforcementPolicy: parsed[".shirube/enforcement-policy.yaml"],
    controlStateCompleteness: parsed[".shirube/control-state-completeness.yaml"],
  };
}

function targetRepoFindings(input, artifacts) {
  const findings = [];
  const checks = [
    [".shirube/execution-context.yaml", artifacts.executionContext?.primary?.repo],
    [".shirube/repo-spec.yaml", artifacts.repoSpec?.repo],
    [".shirube/adoption-intake.yaml", artifacts.adoptionIntake?.repo],
    [".shirube/control-handoffs/CH-001.yaml", artifacts.handoff?.repo],
    [".shirube/lifecycle-state.yaml", artifacts.lifecycleState?.repo],
    [".shirube/source-mirrors/control-issue.yaml", artifacts.sourceMirror?.target_repo ?? artifacts.sourceMirror?.extracted_fields?.target_repo],
    [".shirube/enforcement-policy.yaml", artifacts.enforcementPolicy?.repo],
    [".shirube/control-state-completeness.yaml", artifacts.controlStateCompleteness?.repo],
  ];
  for (const [artifactPath, repo] of checks) {
    if (repo && repo !== input.targetRepo) {
      findings.push(finding("ADOPT-PACK-004", {
        path: artifactPath,
        message: `${artifactPath} targets ${repo}; expected ${input.targetRepo}.`,
      }));
    }
  }
  for (const [artifactPath, profile] of [
    [".shirube/execution-context.yaml", artifacts.executionContext?.profile],
    [".shirube/adoption-intake.yaml", artifacts.adoptionIntake?.profile],
    [".shirube/control-handoffs/CH-001.yaml", artifacts.handoff?.profile],
    [".shirube/enforcement-policy.yaml", artifacts.enforcementPolicy?.profile],
    [".shirube/control-state-completeness.yaml", artifacts.controlStateCompleteness?.profile],
  ]) {
    if (profile && profile !== input.profile) {
      findings.push(finding("ADOPT-PACK-004", {
        path: artifactPath,
        message: `${artifactPath} profile is ${profile}; expected ${input.profile}.`,
      }));
    }
  }
  return findings;
}

function executionContextFindings(executionContext) {
  const findings = [];
  if (!isObject(executionContext)) return findings;
  if (!executionContext.primary?.repo) {
    findings.push(finding("ADOPT-PACK-005", { path: ".shirube/execution-context.yaml:primary.repo" }));
  }
  if (!["lead", "dev"].includes(executionContext.active_role)) {
    findings.push(finding("ADOPT-PACK-005", {
      path: ".shirube/execution-context.yaml:active_role",
      message: "Execution context active_role must be lead or dev.",
    }));
  }
  if (!Array.isArray(executionContext.repo_relations) || executionContext.repo_relations.length === 0) {
    findings.push(finding("ADOPT-PACK-005", {
      path: ".shirube/execution-context.yaml:repo_relations",
      message: "Execution context must declare repo_relations.",
    }));
  }
  return findings;
}

function sourceMirrorFindings(sourceMirror) {
  if (!isObject(sourceMirror)) return [];
  if (sourceMirror.mirror_is_truth !== false) {
    return [finding("ADOPT-PACK-006", { path: ".shirube/source-mirrors/control-issue.yaml:mirror_is_truth" })];
  }
  return [];
}

function adoptionStatusFindings(artifacts) {
  const adoption = artifacts.adoptionIntake;
  const repoSpec = artifacts.repoSpec;
  const findings = [];
  if (!isObject(adoption)) return findings;

  const currentStatus = String(adoption.current_status ?? "");
  const targetStatus = String(adoption.target_status_after_merge ?? "");
  const allowedStatuses = ["PARTIAL_SHIRUBE_PILOT", "RAPID_LITE_REPORT_ONLY"];
  const fullControlClaimed = [currentStatus, targetStatus, repoSpec?.readiness_state, repoSpec?.control_status]
    .filter(Boolean)
    .some((value) => fullControlClaim(String(value)));

  if (currentStatus && !allowedStatuses.includes(currentStatus) && !fullControlClaim(currentStatus)) {
    findings.push(finding("ADOPT-PACK-011", {
      path: ".shirube/adoption-intake.yaml:current_status",
      message: `Unsupported adoption current_status: ${currentStatus}`,
    }));
  }

  if (fullControlClaimed && !hasReadinessEvidence(artifacts)) {
    findings.push(finding("ADOPT-PACK-011", {
      path: ".shirube/adoption-intake.yaml",
      message: "Pack claims full control without readiness evidence.",
    }));
  }

  return findings;
}

function enforcementFindings(enforcementPolicy) {
  const findings = [];
  if (!isObject(enforcementPolicy)) return findings;
  if (
    enforcementPolicy.mode !== "report_only" ||
    enforcementPolicy.owner_observed !== true ||
    enforcementPolicy.required_checks?.enabled !== false ||
    enforcementPolicy.branch_protection?.unchanged !== true
  ) {
    findings.push(finding("ADOPT-PACK-007", { path: ".shirube/enforcement-policy.yaml" }));
  }
  return findings;
}

function controlStateCompletenessFindings(controlState) {
  const findings = [];
  if (!isObject(controlState)) {
    return findings;
  }
  const inventory = Array.isArray(controlState.required_inventory) ? controlState.required_inventory : [];
  const missing = REQUIRED_CONTROL_STATE_INVENTORY.filter((item) => !inventory.includes(item));
  if (missing.length > 0) {
    findings.push(finding("ADOPT-PACK-008", {
      path: ".shirube/control-state-completeness.yaml:required_inventory",
      message: `Control State Completeness required_inventory is missing: ${missing.join(", ")}`,
      missing,
    }));
  }
  if (controlState.rules?.post_merge_evidence_required_before_complete !== true) {
    findings.push(finding("ADOPT-PACK-008", {
      path: ".shirube/control-state-completeness.yaml:rules.post_merge_evidence_required_before_complete",
      message: "Control State Completeness must require post-merge evidence before COMPLETE.",
    }));
  }
  return findings;
}

function ownerExactHeadPolicyFindings(artifacts) {
  const handoff = artifacts.handoff;
  const controlState = artifacts.controlStateCompleteness;
  const findings = [];
  const allowedVerdicts = Array.isArray(handoff?.owner_decision?.allowed_verdicts) ? handoff.owner_decision.allowed_verdicts : [];
  const requiredEvidence = Array.isArray(handoff?.validation?.required_evidence) ? handoff.validation.required_evidence : [];
  const requiredInventory = Array.isArray(controlState?.required_inventory) ? controlState.required_inventory : [];
  if (
    handoff?.owner_decision?.required_before_merge !== true ||
    !allowedVerdicts.includes("APPROVED_EXACT_HEAD") ||
    !requiredEvidence.includes("owner_decision") ||
    !requiredInventory.includes("owner_exact_head_decision")
  ) {
    findings.push(finding("ADOPT-PACK-009", { path: ".shirube/control-handoffs/CH-001.yaml:owner_decision" }));
  }
  return findings;
}

function artifactScopeClaimFindings(artifacts) {
  const findings = [];
  const allowedPathSources = [
    [".shirube/repo-spec.yaml:agent_permission_boundary.allowed_paths", artifacts.repoSpec?.agent_permission_boundary?.allowed_paths],
    [".shirube/control-handoffs/CH-001.yaml:cell.allowed_paths", artifacts.handoff?.cell?.allowed_paths],
  ];
  for (const [sourcePath, allowedPaths] of allowedPathSources) {
    if (!Array.isArray(allowedPaths)) continue;
    const unsafe = allowedPaths.filter((entry) => runtimeOrPackageScope(String(entry)));
    if (unsafe.length > 0) {
      findings.push(finding("ADOPT-PACK-012", {
        path: sourcePath,
        message: `${sourcePath} allows runtime/package scope: ${unsafe.join(", ")}`,
      }));
    }
  }
  return findings;
}

function readmeFindings(packRoot, files) {
  const readmePath = "docs/shirube/README.md";
  if (!files.includes(readmePath)) return [];
  const readme = readFileSync(path.join(packRoot, readmePath), "utf8");
  const missing = README_REQUIRED_PHRASES.filter((phrase) => !readme.includes(phrase));
  if (missing.length === 0) return [];
  return [finding("ADOPT-PACK-010", {
    path: readmePath,
    message: `README is missing required language: ${missing.join("; ")}`,
    missing,
  })];
}

function baseInventory(input, files) {
  return {
    pack_root: input.packRoot,
    target_repo: input.targetRepo,
    profile: input.profile,
    files: {
      total: files.length,
      required: REQUIRED_FILES.map((file) => ({ path: file, present: files.includes(file) })),
      forbidden_present: files.filter((file) => FORBIDDEN_PATTERNS.some((pattern) => matchesPattern(file, pattern))),
      outside_overlay_scope: files.filter((file) => !ALLOWED_OVERLAY_PATTERNS.some((pattern) => matchesPattern(file, pattern))),
    },
    yaml: {
      parsed_files: [],
      invalid_files: [],
    },
  };
}

function enrichInventory(inventory, artifacts) {
  inventory.execution_context = {
    present: isObject(artifacts.executionContext),
    primary_repo: artifacts.executionContext?.primary?.repo ?? null,
    active_role: artifacts.executionContext?.active_role ?? null,
    repo_relations: Array.isArray(artifacts.executionContext?.repo_relations)
      ? artifacts.executionContext.repo_relations.map((relation) => relation.relation).filter(Boolean)
      : [],
  };
  inventory.repo_spec = {
    present: isObject(artifacts.repoSpec),
    repo: artifacts.repoSpec?.repo ?? null,
    mirror_is_truth: artifacts.repoSpec?.source_of_truth_policy?.mirror_is_truth ?? null,
    llm_final_authority: artifacts.repoSpec?.source_of_truth_policy?.llm_final_authority ?? null,
  };
  inventory.adoption_intake = {
    present: isObject(artifacts.adoptionIntake),
    current_status: artifacts.adoptionIntake?.current_status ?? null,
    target_status_after_merge: artifacts.adoptionIntake?.target_status_after_merge ?? null,
    disposition: artifacts.adoptionIntake?.disposition ?? null,
  };
  inventory.source_mirror = {
    present: isObject(artifacts.sourceMirror),
    source_type: artifacts.sourceMirror?.source_type ?? null,
    mirror_is_truth: artifacts.sourceMirror?.mirror_is_truth ?? null,
  };
  inventory.enforcement_policy = {
    present: isObject(artifacts.enforcementPolicy),
    mode: artifacts.enforcementPolicy?.mode ?? null,
    owner_observed: artifacts.enforcementPolicy?.owner_observed ?? null,
    required_checks_enabled: artifacts.enforcementPolicy?.required_checks?.enabled ?? null,
  };
  inventory.control_state_completeness = {
    present: isObject(artifacts.controlStateCompleteness),
    required_inventory: Array.isArray(artifacts.controlStateCompleteness?.required_inventory)
      ? artifacts.controlStateCompleteness.required_inventory
      : [],
  };
}

function result({ input, verdict, inventory, blockers = [], warnings = [] }) {
  const uniqueBlockers = uniqueFindings(blockers);
  const uniqueWarnings = uniqueFindings(warnings);
  return {
    schema: SCHEMA,
    verdict,
    would_block: verdict === "BLOCKED" || verdict === "FAILURE",
    owner_must_not_merge: verdict === "BLOCKED" || verdict === "FAILURE",
    target_repo: input.targetRepo,
    profile: input.profile,
    inventory,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    required_next_actions: requiredNextActions(uniqueBlockers, uniqueWarnings, verdict),
  };
}

function finding(itemId, overrides = {}) {
  const [code, defaultMessage] = FINDINGS[itemId];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? defaultMessage,
    path: overrides.path ?? null,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["message", "path"].includes(key))),
  };
}

function requiredNextActions(blockers, warnings, verdict) {
  if (verdict === "PASS") return [];
  const findings = blockers.length > 0 ? blockers : warnings;
  return uniqueStrings(findings.map((item) => item.message));
}

function matchesPattern(file, pattern) {
  const normalized = normalizePath(file);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith("**/") && normalizedPattern.endsWith("/**")) {
    const fragment = normalizedPattern.slice(3, -3);
    return normalized.includes(`/${fragment}/`) || normalized.startsWith(`${fragment}/`);
  }
  if (normalizedPattern.endsWith("*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalized.startsWith(prefix) || path.posix.basename(normalized).startsWith(prefix);
  }
  return normalized === normalizedPattern;
}

function runtimeOrPackageScope(value) {
  return RUNTIME_OR_PACKAGE_PATTERNS.some((pattern) => matchesPattern(value, pattern));
}

function fullControlClaim(value) {
  const normalized = value.toUpperCase();
  return normalized.includes("FULL_CONTROL") ||
    normalized.includes("FULLY_CONTROLLED") ||
    normalized.includes("V3_COMPLETE") ||
    normalized.includes("REQUIRED_CHECK") ||
    normalized === "ENFORCED";
}

function hasReadinessEvidence(artifacts) {
  const adoption = artifacts.adoptionIntake;
  const repoSpec = artifacts.repoSpec;
  const controlState = artifacts.controlStateCompleteness;
  return Boolean(
    adoption?.readiness_evidence_ref ||
    adoption?.full_control_readiness_ref ||
    repoSpec?.readiness_evidence_ref ||
    controlState?.full_adoption_readiness_report_ref,
  );
}

function uniqueFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const item of findings) {
    const key = `${item.item_id}:${item.path ?? ""}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPattern() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
}

function stringOption(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const report = buildAdoptionPackCheck(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "FAILURE" ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main();
}
