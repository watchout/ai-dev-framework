export type RunnerPackMode = "warning" | "strict";
export type RunnerPackStatus = "PASS" | "WARNING" | "BLOCK";

export interface RunnerPackDocument {
  path: string;
  content: string;
}

export interface RunnerPackOptions {
  mode?: RunnerPackMode;
}

export interface RunnerPackFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "parse_error"
    | "missing_field"
    | "invalid_field"
    | "missing_runner"
    | "missing_contract_item"
    | "unsafe_runner_boundary";
  field?: string;
  runner?: string;
  message: string;
}

export interface RunnerPackResult {
  status: RunnerPackStatus;
  mode: RunnerPackMode;
  findings: RunnerPackFinding[];
  checkedDocuments: string[];
  checkedPacks: number;
}

type JsonObject = Record<string, unknown>;

const PACK_VERSION = "runner-instruction-pack/v1";

const REQUIRED_ROOT_FIELDS = [
  "pack_version",
  "profile_id",
  "runner_agnostic",
  "common_contract",
  "runner_packs",
] as const;

const REQUIRED_RUNNERS = [
  "human",
  "codex",
  "claude_code",
  "ci_headless_script",
  "aun_dispatched_runner",
] as const;

const REQUIRED_STEPS = [
  "read_work_order",
  "verify_authority_and_lane_risk",
  "execute_allowed_files_actions_only",
  "run_verification",
  "open_or_update_pr_or_report_no_pr_needed",
  "write_pr_evidence",
  "return_result_state",
] as const;

const REQUIRED_RESULT_STATES = [
  "completed_pr_opened",
  "completed_no_pr_needed",
  "blocked_requires_input",
  "blocked_requires_audit",
  "blocked_requires_approval",
  "failed_verification",
  "skipped_not_authorized",
] as const;

const REQUIRED_EVIDENCE = [
  "runner_identity",
  "runtime_mode",
  "work_order_id",
  "branch_or_pr_ref",
  "changed_files",
  "verification_results",
  "residual_risk",
  "stop_conditions_encountered",
] as const;

const REQUIRED_FORBIDDEN_INTERFACES = [
  "codex_goal_required",
  "aun_live_dispatch_required",
] as const;

export function validateRunnerInstructionPacks(
  documents: RunnerPackDocument[],
  options: RunnerPackOptions = {},
): RunnerPackResult {
  const mode = options.mode ?? "warning";
  const findings: RunnerPackFinding[] = [];
  let checkedPacks = 0;

  for (const document of documents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document.content);
    } catch (error) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "parse_error",
        message: `Runner instruction pack JSON could not be parsed: ${error}`,
      });
      continue;
    }

    if (!isObject(parsed)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "$",
        message: "Runner instruction pack root must be a JSON object.",
      });
      continue;
    }

    checkedPacks++;
    validateRoot(findings, mode, document.path, parsed);
    validateCommonContract(findings, mode, document.path, parsed.common_contract);
    validateRunnerPacks(findings, mode, document.path, parsed.runner_packs);
  }

  return {
    status: toStatus(findings),
    mode,
    findings,
    checkedDocuments: documents.map((document) => document.path),
    checkedPacks,
  };
}

function validateRoot(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  path: string,
  pack: JsonObject,
): void {
  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in pack)) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_field",
        field,
        message: `Missing runner instruction pack field: ${field}`,
      });
    }
  }

  if (pack.pack_version !== PACK_VERSION) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "pack_version",
      message: `pack_version must be ${PACK_VERSION}.`,
    });
  }

  if (pack.runner_agnostic !== true) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_runner_boundary",
      field: "runner_agnostic",
      message: "runner_agnostic must be true; the pack must not be Codex-only.",
    });
  }
}

function validateCommonContract(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "common_contract",
      message: "common_contract must be an object.",
    });
    return;
  }

  validateArrayIncludes(
    findings,
    mode,
    path,
    value.required_steps,
    REQUIRED_STEPS,
    "common_contract.required_steps",
  );
  validateArrayIncludes(
    findings,
    mode,
    path,
    value.result_states,
    REQUIRED_RESULT_STATES,
    "common_contract.result_states",
  );
  validateArrayIncludes(
    findings,
    mode,
    path,
    value.required_evidence,
    REQUIRED_EVIDENCE,
    "common_contract.required_evidence",
  );
  validateArrayIncludes(
    findings,
    mode,
    path,
    value.forbidden_interfaces,
    REQUIRED_FORBIDDEN_INTERFACES,
    "common_contract.forbidden_interfaces",
  );

  if (normalizeValue(value.stop_behavior) !== "record_blocker_and_stop") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_runner_boundary",
      field: "common_contract.stop_behavior",
      message: "stop_behavior must be record_blocker_and_stop.",
    });
  }
}

function validateRunnerPacks(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  path: string,
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "runner_packs",
      message: "runner_packs must be an array.",
    });
    return;
  }

  const packsByRunner = new Map<string, JsonObject>();
  for (const pack of value) {
    if (!isObject(pack) || typeof pack.runner !== "string") continue;
    packsByRunner.set(normalizeValue(pack.runner), pack);
  }

  for (const runner of REQUIRED_RUNNERS) {
    if (!packsByRunner.has(runner)) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_runner",
        runner,
        field: "runner_packs",
        message: `Missing runner instruction pack: ${runner}`,
      });
    }
  }

  for (const [runner, pack] of packsByRunner) {
    validateRunnerPack(findings, mode, path, runner, pack);
  }
}

function validateRunnerPack(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  path: string,
  runner: string,
  pack: JsonObject,
): void {
  validateArrayIncludes(
    findings,
    mode,
    path,
    pack.required_steps,
    REQUIRED_STEPS,
    `runner_packs.${runner}.required_steps`,
    runner,
  );

  validateExplicitFalseSafetyFlag(
    findings,
    path,
    runner,
    pack,
    "requires_codex_goal",
    "Runner packs must not require Codex-specific /goal semantics.",
  );

  validateExplicitFalseSafetyFlag(
    findings,
    path,
    runner,
    pack,
    "live_aun_dispatch_enabled",
    "Runner packs must not enable live AUN dispatch in this slice.",
  );

  if (
    runner === "aun_dispatched_runner" &&
    normalizeValue(pack.activation_condition) !== "after_safety_stack_acceptance"
  ) {
    findings.push({
      severity: "BLOCK",
      path,
      runner,
      type: "unsafe_runner_boundary",
      field: "runner_packs.aun_dispatched_runner.activation_condition",
      message: "AUN dispatched runner pack must stay inactive until safety stack acceptance.",
    });
  }
}

function validateExplicitFalseSafetyFlag(
  findings: RunnerPackFinding[],
  path: string,
  runner: string,
  pack: JsonObject,
  field: "requires_codex_goal" | "live_aun_dispatch_enabled",
  message: string,
): void {
  if (pack[field] === false) return;
  findings.push({
    severity: "BLOCK",
    path,
    runner,
    type: "unsafe_runner_boundary",
    field: `runner_packs.${runner}.${field}`,
    message: `${message} The safety flag must be explicit boolean false.`,
  });
}

function validateArrayIncludes(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  path: string,
  value: unknown,
  requiredValues: readonly string[],
  field: string,
  runner?: string,
): void {
  if (!Array.isArray(value)) {
    pushModeFinding(findings, mode, {
      path,
      runner,
      type: "invalid_field",
      field,
      message: `${field} must be an array.`,
    });
    return;
  }

  const normalizedValues = new Set(
    value.filter((item): item is string => typeof item === "string").map(normalizeValue),
  );
  for (const requiredValue of requiredValues) {
    if (!normalizedValues.has(requiredValue)) {
      pushModeFinding(findings, mode, {
        path,
        runner,
        type: "missing_contract_item",
        field,
        message: `${field} must include ${requiredValue}.`,
      });
    }
  }
}

function normalizeValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushModeFinding(
  findings: RunnerPackFinding[],
  mode: RunnerPackMode,
  finding: Omit<RunnerPackFinding, "severity">,
): void {
  findings.push({
    ...finding,
    severity: mode === "strict" ? "BLOCK" : "WARNING",
  });
}

function toStatus(findings: RunnerPackFinding[]): RunnerPackStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
