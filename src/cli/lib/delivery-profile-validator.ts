export type DeliveryProfileMode = "warning" | "strict";
export type DeliveryProfileStatus = "PASS" | "WARNING" | "BLOCK";
export type DeliveryProfileFindingSeverity = "WARNING" | "BLOCK";

export interface DeliveryProfileDocument {
  path: string;
  content: string;
}

export interface DeliveryProfileOptions {
  mode?: DeliveryProfileMode;
}

export interface DeliveryProfileFinding {
  severity: DeliveryProfileFindingSeverity;
  path: string;
  type:
    | "parse_error"
    | "missing_field"
    | "invalid_field"
    | "unsupported_version"
    | "unknown_strategy"
    | "unsafe_risk_mapping"
    | "unsafe_runner_policy"
    | "runner_specific_contract"
    | "unsafe_merge_policy"
    | "unsafe_stop_policy";
  field?: string;
  riskClass?: DeliveryRiskClass;
  message: string;
}

export interface DeliveryProfileResult {
  status: DeliveryProfileStatus;
  mode: DeliveryProfileMode;
  findings: DeliveryProfileFinding[];
  checkedDocuments: string[];
  checkedProfiles: number;
}

type JsonObject = Record<string, unknown>;
type DeliveryRiskClass = (typeof RISK_CLASSES)[number];
type DeliveryStrategy = (typeof DELIVERY_STRATEGIES)[number];

const SUPPORTED_PROFILE_VERSION = "0.1.0";

const DELIVERY_STRATEGIES = [
  "pr_conveyor",
  "phase_conveyor",
  "release_train",
  "serial_gate",
  "design_only",
  "hotfix",
] as const;

const RISK_CLASSES = ["R0", "R1", "R2", "R3", "R4"] as const;

const AUDIT_TIMINGS = [
  "after_pr",
  "before_merge",
  "before_execution",
] as const;

const RUNNER_POLICIES = [
  "codex_native_fast_lane",
  "runner_agnostic_manual",
  "claude_bounded_work_order",
  "headless_ci_runner",
  "aun_dispatched_runner",
] as const;

const PR_MODES = [
  "normal",
  "draft_or_reference_until_owner_adopts",
  "blocked_until_approved",
] as const;

const REQUIRED_ROOT_FIELDS = [
  "profile_version",
  "profile_id",
  "default_delivery_strategy",
  "default_runner_policy",
  "allowed_delivery_strategies",
  "allowed_runner_policies",
  "strategy_by_risk",
  "runner_policy_by_risk",
  "runner_policies",
  "queue_states",
  "wip_policy",
  "work_order_required_fields",
  "runner_contract",
  "audit_contract",
  "merge_policy",
  "stop_policy",
] as const;

const HARD_REQUIRED_ROOT_FIELDS = new Set<string>(["stop_policy"]);

const REQUIRED_STRATEGY_FIELDS = [
  "delivery_strategy",
  "audit_timing",
  "pr_mode",
] as const;

const REQUIRED_QUEUE_STATES = [
  "backlog",
  "ready_for_spec",
  "ready_for_implementation",
  "implementing",
  "pr_opened_evidence_ready",
  "audit_pending",
  "changes_requested",
  "rework_implementing",
  "audit_passed",
  "merge_ready",
  "merged_closed",
] as const;

const REQUIRED_WIP_FIELDS = [
  "fast_lane_prs_per_repo",
  "governed_draft_prs_per_repo",
  "rework_prs_per_repo",
  "stop_lane_prs_without_approval",
  "max_runner_sessions_per_repo",
  "max_changed_files_per_work_order",
] as const;

const REQUIRED_WORK_ORDER_FIELDS = [
  "work_order_id",
  "repo",
  "product",
  "delivery_strategy",
  "runner_policy",
  "work_unit",
  "lane",
  "risk_class",
  "architecture_owner",
  "implementation_owner",
  "review_owner",
  "audit_owner",
  "merge_authority",
  "scope",
  "non_goals",
  "allowed_files",
  "allowed_actions",
  "forbidden_actions",
  "verification_commands",
  "pr_mode",
  "audit_timing",
  "stop_conditions",
  "fallback_next_work_policy",
] as const;

const REQUIRED_RUNNERS = [
  "human",
  "codex",
  "claude_code",
  "ci_headless_script",
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

const REQUIRED_RUNNER_EVIDENCE = [
  "runner_identity",
  "runtime_mode",
  "work_order_id",
  "branch_or_pr_ref",
  "changed_files",
  "verification_results",
  "residual_risk",
  "stop_conditions_encountered",
] as const;

const REQUIRED_MERGE_REQUIRES = [
  "audit_passed",
  "merge_authority",
  "green_required_checks",
  "no_active_stop_condition",
] as const;

const REQUIRED_PROTECTED_OPERATIONS = [
  "merge",
  "production_deploy",
  "secret_or_credential_change",
  "destructive_db_or_storage_operation",
  "customer_data_export",
  "external_send_to_real_users",
  "billing_or_value_transfer",
  "permission_broadening",
] as const;

export function validateDeliveryProfiles(
  documents: DeliveryProfileDocument[],
  options: DeliveryProfileOptions = {},
): DeliveryProfileResult {
  const mode = options.mode ?? "warning";
  const findings: DeliveryProfileFinding[] = [];
  let checkedProfiles = 0;

  for (const document of documents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document.content);
    } catch (error) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "parse_error",
        message: `Delivery profile JSON could not be parsed: ${error}`,
      });
      continue;
    }

    if (!isObject(parsed)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "$",
        message: "Delivery profile root must be a JSON object.",
      });
      continue;
    }

    checkedProfiles++;
    validateRequiredFields(
      findings,
      mode,
      document.path,
      parsed,
      REQUIRED_ROOT_FIELDS,
      "$",
      undefined,
      HARD_REQUIRED_ROOT_FIELDS,
    );
    validateRootFields(findings, document.path, parsed);

    const allowedStrategies = validateAllowedStrategies(findings, document.path, parsed);
    const allowedRunnerPolicies = validateAllowedRunnerPolicies(findings, document.path, parsed);
    validateStrategyByRisk(findings, mode, document.path, parsed, allowedStrategies);
    validateRunnerPolicyByRisk(findings, mode, document.path, parsed, allowedRunnerPolicies);
    validateRunnerPolicies(findings, mode, document.path, parsed.runner_policies);
    validateArrayIncludes(
      findings,
      mode,
      document.path,
      parsed.queue_states,
      REQUIRED_QUEUE_STATES,
      "queue_states",
    );
    validateWipPolicy(findings, mode, document.path, parsed.wip_policy);
    validateArrayIncludes(
      findings,
      mode,
      document.path,
      parsed.work_order_required_fields,
      REQUIRED_WORK_ORDER_FIELDS,
      "work_order_required_fields",
    );
    validateRunnerContract(findings, mode, document.path, parsed.runner_contract);
    validateAuditContract(findings, mode, document.path, parsed.audit_contract);
    validateMergePolicy(findings, mode, document.path, parsed.merge_policy);
    if ("stop_policy" in parsed) {
      validateStopPolicy(findings, mode, document.path, parsed.stop_policy);
    }
  }

  return {
    status: toStatus(findings),
    mode,
    findings,
    checkedDocuments: documents.map((document) => document.path),
    checkedProfiles,
  };
}

function validateRootFields(
  findings: DeliveryProfileFinding[],
  path: string,
  profile: JsonObject,
): void {
  if (profile.profile_version !== SUPPORTED_PROFILE_VERSION) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsupported_version",
      field: "profile_version",
      message: `Unsupported profile_version: ${String(profile.profile_version)}. Supported: ${SUPPORTED_PROFILE_VERSION}.`,
    });
  }

  if (!isNonEmptyString(profile.profile_id)) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "invalid_field",
      field: "profile_id",
      message: "profile_id must be a non-empty string.",
    });
  }

  validateStrategyValue(
    findings,
    path,
    profile.default_delivery_strategy,
    "default_delivery_strategy",
  );
  validateRunnerPolicyValue(
    findings,
    path,
    profile.default_runner_policy,
    "default_runner_policy",
  );
}

function validateAllowedStrategies(
  findings: DeliveryProfileFinding[],
  path: string,
  profile: JsonObject,
): Set<string> {
  const allowed = new Set<string>();
  if (!Array.isArray(profile.allowed_delivery_strategies)) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "invalid_field",
      field: "allowed_delivery_strategies",
      message: "allowed_delivery_strategies must be a non-empty array.",
    });
    return allowed;
  }

  if (profile.allowed_delivery_strategies.length === 0) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "invalid_field",
      field: "allowed_delivery_strategies",
      message: "allowed_delivery_strategies must not be empty.",
    });
  }

  for (const [index, value] of profile.allowed_delivery_strategies.entries()) {
    const field = `allowed_delivery_strategies[${index}]`;
    if (validateStrategyValue(findings, path, value, field)) {
      allowed.add(value);
    }
  }

  return allowed;
}

function validateAllowedRunnerPolicies(
  findings: DeliveryProfileFinding[],
  path: string,
  profile: JsonObject,
): Set<string> {
  const allowed = new Set<string>();
  if (!Array.isArray(profile.allowed_runner_policies)) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "invalid_field",
      field: "allowed_runner_policies",
      message: "allowed_runner_policies must be a non-empty array.",
    });
    return allowed;
  }

  if (profile.allowed_runner_policies.length === 0) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "invalid_field",
      field: "allowed_runner_policies",
      message: "allowed_runner_policies must not be empty.",
    });
  }

  for (const [index, value] of profile.allowed_runner_policies.entries()) {
    const field = `allowed_runner_policies[${index}]`;
    if (validateRunnerPolicyValue(findings, path, value, field)) {
      allowed.add(value);
    }
  }

  return allowed;
}

function validateStrategyByRisk(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  profile: JsonObject,
  allowedStrategies: Set<string>,
): void {
  const strategyByRisk = profile.strategy_by_risk;
  if (!isObject(strategyByRisk)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "strategy_by_risk",
      message: "strategy_by_risk must be an object keyed by R0-R4.",
    });
    return;
  }

  for (const riskClass of RISK_CLASSES) {
    const entry = strategyByRisk[riskClass];
    const fieldPrefix = `strategy_by_risk.${riskClass}`;
    if (!isObject(entry)) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_field",
        field: fieldPrefix,
        riskClass,
        message: `${fieldPrefix} must define delivery_strategy, audit_timing, and pr_mode.`,
      });
      continue;
    }

    validateRequiredFields(
      findings,
      mode,
      path,
      entry,
      REQUIRED_STRATEGY_FIELDS,
      fieldPrefix,
      riskClass,
    );

    const strategy = validateStrategyValue(
      findings,
      path,
      entry.delivery_strategy,
      `${fieldPrefix}.delivery_strategy`,
      riskClass,
    )
      ? entry.delivery_strategy
      : undefined;
    if (strategy && allowedStrategies.size > 0 && !allowedStrategies.has(strategy)) {
      findings.push({
        severity: "BLOCK",
        path,
        type: "unknown_strategy",
        field: `${fieldPrefix}.delivery_strategy`,
        riskClass,
        message: `${strategy} is not listed in allowed_delivery_strategies.`,
      });
    }

    const auditTiming = validateEnumValue(
      findings,
      path,
      entry.audit_timing,
      `${fieldPrefix}.audit_timing`,
      AUDIT_TIMINGS,
      "invalid_field",
      riskClass,
    )
      ? entry.audit_timing
      : undefined;
    const prMode = validateEnumValue(
      findings,
      path,
      entry.pr_mode,
      `${fieldPrefix}.pr_mode`,
      PR_MODES,
      "invalid_field",
      riskClass,
    )
      ? entry.pr_mode
      : undefined;

    validateRiskSafety(findings, path, riskClass, strategy, auditTiming, prMode);
  }
}

function validateRunnerPolicyByRisk(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  profile: JsonObject,
  allowedRunnerPolicies: Set<string>,
): void {
  const runnerPolicyByRisk = profile.runner_policy_by_risk;
  if (!isObject(runnerPolicyByRisk)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "runner_policy_by_risk",
      message: "runner_policy_by_risk must be an object keyed by R0-R4.",
    });
    return;
  }

  for (const riskClass of RISK_CLASSES) {
    const field = `runner_policy_by_risk.${riskClass}`;
    const value = runnerPolicyByRisk[riskClass];
    const runnerPolicy = validateRunnerPolicyValue(findings, path, value, field, riskClass)
      ? value
      : undefined;

    if (
      runnerPolicy &&
      allowedRunnerPolicies.size > 0 &&
      !allowedRunnerPolicies.has(runnerPolicy)
    ) {
      findings.push({
        severity: "BLOCK",
        path,
        type: "unsafe_runner_policy",
        field,
        riskClass,
        message: `${runnerPolicy} is not listed in allowed_runner_policies.`,
      });
    }

    if ((riskClass === "R3" || riskClass === "R4") && runnerPolicy === "codex_native_fast_lane") {
      findings.push({
        severity: "BLOCK",
        path,
        type: "unsafe_runner_policy",
        field,
        riskClass,
        message: `${riskClass} work must not use codex_native_fast_lane.`,
      });
    }
  }
}

function validateRunnerPolicies(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "runner_policies",
      message: "runner_policies must be an object.",
    });
    return;
  }

  const codexFastLane = value.codex_native_fast_lane;
  if (!isObject(codexFastLane)) {
    pushModeFinding(findings, mode, {
      path,
      type: "missing_field",
      field: "runner_policies.codex_native_fast_lane",
      message: "runner_policies.codex_native_fast_lane must define fast-lane boundaries.",
    });
    return;
  }

  validateArrayIncludes(
    findings,
    "strict",
    path,
    codexFastLane.eligible_risk_classes,
    ["R0", "R1", "R2"],
    "runner_policies.codex_native_fast_lane.eligible_risk_classes",
  );
  validateArrayIncludes(
    findings,
    "strict",
    path,
    codexFastLane.forbidden_risk_classes,
    ["R3", "R4"],
    "runner_policies.codex_native_fast_lane.forbidden_risk_classes",
  );

  if (codexFastLane.aun_coupling !== "minimal_async_optional") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_runner_policy",
      field: "runner_policies.codex_native_fast_lane.aun_coupling",
      message: "codex_native_fast_lane must keep AUN coupling minimal_async_optional.",
    });
  }

  validateArrayIncludes(
    findings,
    "strict",
    path,
    codexFastLane.aun_forbidden_roles,
    [
      "select_next_work_order",
      "dispatch_runner",
      "approve_execution",
      "merge",
      "override_stop_policy",
    ],
    "runner_policies.codex_native_fast_lane.aun_forbidden_roles",
  );

  if (codexFastLane.queue_source_of_truth !== "github_issue_pr_labels") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_runner_policy",
      field: "runner_policies.codex_native_fast_lane.queue_source_of_truth",
      message: "codex_native_fast_lane must use GitHub issue/PR labels as queue SSOT.",
    });
  }

  if (codexFastLane.evidence_source_of_truth !== "github_pr_body_or_comment") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_runner_policy",
      field: "runner_policies.codex_native_fast_lane.evidence_source_of_truth",
      message: "codex_native_fast_lane evidence must remain in GitHub PR body/comment.",
    });
  }
}

function validateRiskSafety(
  findings: DeliveryProfileFinding[],
  path: string,
  riskClass: DeliveryRiskClass,
  strategy: DeliveryStrategy | undefined,
  auditTiming: string | undefined,
  prMode: string | undefined,
): void {
  if (riskClass === "R3") {
    if (auditTiming === "after_pr") {
      findings.push({
        severity: "BLOCK",
        path,
        type: "unsafe_risk_mapping",
        field: "strategy_by_risk.R3.audit_timing",
        riskClass,
        message: "R3 work must require audit before merge or owner adoption, not after PR creation.",
      });
    }

    if (prMode === "normal") {
      findings.push({
        severity: "BLOCK",
        path,
        type: "unsafe_risk_mapping",
        field: "strategy_by_risk.R3.pr_mode",
        riskClass,
        message: "R3 work must remain governed as draft_or_reference_until_owner_adopts, not normal PR mode.",
      });
    }
  }

  if (riskClass !== "R4") return;

  if (strategy === "pr_conveyor" || auditTiming === "after_pr") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_risk_mapping",
      field: "strategy_by_risk.R4",
      riskClass,
      message:
        "R4 work must not use pr_conveyor or after_pr audit timing; approval/audit is required before execution.",
    });
  }

  if (strategy && strategy !== "serial_gate") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_risk_mapping",
      field: "strategy_by_risk.R4.delivery_strategy",
      riskClass,
      message: "R4 work must default to serial_gate.",
    });
  }

  if (auditTiming && auditTiming !== "before_execution") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_risk_mapping",
      field: "strategy_by_risk.R4.audit_timing",
      riskClass,
      message: "R4 work must require approval/audit before execution.",
    });
  }

  if (prMode && prMode !== "blocked_until_approved") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_risk_mapping",
      field: "strategy_by_risk.R4.pr_mode",
      riskClass,
      message: "R4 work must remain blocked_until_approved.",
    });
  }
}

function validateWipPolicy(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "wip_policy",
      message: "wip_policy must be an object.",
    });
    return;
  }

  validateRequiredFields(findings, mode, path, value, REQUIRED_WIP_FIELDS, "wip_policy");

  for (const field of REQUIRED_WIP_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "number" || !Number.isInteger(fieldValue) || fieldValue < 0) {
      pushModeFinding(findings, mode, {
        path,
        type: "invalid_field",
        field: `wip_policy.${field}`,
        message: `${field} must be a non-negative integer.`,
      });
    }
  }

  if (value.stop_lane_prs_without_approval !== 0) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_stop_policy",
      field: "wip_policy.stop_lane_prs_without_approval",
      message: "Stop Lane WIP without approval must be 0.",
    });
  }
}

function validateRunnerContract(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "runner_contract",
      message: "runner_contract must be an object.",
    });
    return;
  }

  if (value.runner_agnostic !== true) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "runner_specific_contract",
      field: "runner_contract.runner_agnostic",
      message: "runner_contract.runner_agnostic must be true; the profile must not be Codex-only.",
    });
  }

  validateArrayIncludes(
    findings,
    mode,
    path,
    value.allowed_runners,
    REQUIRED_RUNNERS,
    "runner_contract.allowed_runners",
  );
  validateArrayIncludes(
    findings,
    mode,
    path,
    value.required_result_states,
    REQUIRED_RESULT_STATES,
    "runner_contract.required_result_states",
  );
  validateArrayIncludes(
    findings,
    mode,
    path,
    value.required_evidence,
    REQUIRED_RUNNER_EVIDENCE,
    "runner_contract.required_evidence",
  );
}

function validateAuditContract(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "audit_contract",
      message: "audit_contract must be an object.",
    });
    return;
  }

  validateRequiredFields(
    findings,
    mode,
    path,
    value,
    ["fast_lane", "governed_lane", "stop_lane"] as const,
    "audit_contract",
  );
}

function validateMergePolicy(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "merge_policy",
      message: "merge_policy must be an object.",
    });
    return;
  }

  if (value.automatic_merge_allowed !== false) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_merge_policy",
      field: "merge_policy.automatic_merge_allowed",
      message: "automatic_merge_allowed must be false.",
    });
  }

  if (value.implementation_runner_may_merge !== false) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_merge_policy",
      field: "merge_policy.implementation_runner_may_merge",
      message: "implementation_runner_may_merge must be false.",
    });
  }

  validateArrayIncludes(
    findings,
    mode,
    path,
    value.merge_requires,
    REQUIRED_MERGE_REQUIRES,
    "merge_policy.merge_requires",
  );
}

function validateStopPolicy(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "stop_policy",
      message: "stop_policy must be an object.",
    });
    return;
  }

  if (value.no_run_sentinel_required !== true) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_stop_policy",
      field: "stop_policy.no_run_sentinel_required",
      message: "no_run_sentinel_required must be true.",
    });
  }

  if (value.hard_stop_blocks_new_work_orders !== true) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_stop_policy",
      field: "stop_policy.hard_stop_blocks_new_work_orders",
      message: "hard_stop_blocks_new_work_orders must be true.",
    });
  }

  validateArrayIncludes(
    findings,
    mode,
    path,
    value.protected_operations_require_approval,
    REQUIRED_PROTECTED_OPERATIONS,
    "stop_policy.protected_operations_require_approval",
  );
}

function validateArrayIncludes(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: unknown,
  requiredValues: readonly string[],
  field: string,
): void {
  if (!Array.isArray(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field,
      message: `${field} must be an array.`,
    });
    return;
  }

  const actual = new Set(value.filter((item): item is string => typeof item === "string"));
  for (const required of requiredValues) {
    if (!actual.has(required)) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_field",
        field,
        message: `${field} must include ${required}.`,
      });
    }
  }
}

function validateRequiredFields(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  path: string,
  value: JsonObject,
  fields: readonly string[],
  prefix: string,
  riskClass?: DeliveryRiskClass,
  hardRequiredFields: ReadonlySet<string> = new Set(),
): void {
  for (const field of fields) {
    if (!(field in value)) {
      const finding = {
        path,
        type: "missing_field",
        field: prefix === "$" ? field : `${prefix}.${field}`,
        riskClass,
        message: `Missing delivery profile field: ${prefix === "$" ? field : `${prefix}.${field}`}`,
      } satisfies Omit<DeliveryProfileFinding, "severity">;
      if (hardRequiredFields.has(field)) {
        findings.push({ ...finding, severity: "BLOCK" });
      } else {
        pushModeFinding(findings, mode, finding);
      }
    }
  }
}

function validateStrategyValue(
  findings: DeliveryProfileFinding[],
  path: string,
  value: unknown,
  field: string,
  riskClass?: DeliveryRiskClass,
): value is DeliveryStrategy {
  return validateEnumValue(
    findings,
    path,
    value,
    field,
    DELIVERY_STRATEGIES,
    "unknown_strategy",
    riskClass,
  );
}

function validateRunnerPolicyValue(
  findings: DeliveryProfileFinding[],
  path: string,
  value: unknown,
  field: string,
  riskClass?: DeliveryRiskClass,
): value is (typeof RUNNER_POLICIES)[number] {
  return validateEnumValue(
    findings,
    path,
    value,
    field,
    RUNNER_POLICIES,
    "unsafe_runner_policy",
    riskClass,
  );
}

function validateEnumValue<T extends readonly string[]>(
  findings: DeliveryProfileFinding[],
  path: string,
  value: unknown,
  field: string,
  allowed: T,
  type: DeliveryProfileFinding["type"],
  riskClass?: DeliveryRiskClass,
): value is T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    findings.push({
      severity: "BLOCK",
      path,
      type,
      field,
      riskClass,
      message: `${field} must be one of: ${allowed.join(", ")}.`,
    });
    return false;
  }
  return true;
}

function pushModeFinding(
  findings: DeliveryProfileFinding[],
  mode: DeliveryProfileMode,
  finding: Omit<DeliveryProfileFinding, "severity">,
): void {
  findings.push({
    ...finding,
    severity: mode === "strict" ? "BLOCK" : "WARNING",
  });
}

function toStatus(findings: DeliveryProfileFinding[]): DeliveryProfileStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
