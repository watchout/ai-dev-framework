export type ActionProfileMode = "warning" | "strict";
export type ActionProfileStatus = "PASS" | "WARNING" | "BLOCK";
export type ActionProfileFindingSeverity = "WARNING" | "BLOCK";

export interface ActionProfileDocument {
  path: string;
  content: string;
}

export interface ActionProfileOptions {
  mode?: ActionProfileMode;
}

export interface ActionProfileFinding {
  severity: ActionProfileFindingSeverity;
  path: string;
  type:
    | "parse_error"
    | "missing_field"
    | "invalid_field"
    | "unsupported_version"
    | "forbidden_coupling"
    | "missing_revalidation"
    | "missing_audit";
  field?: string;
  surfaceId?: string;
  message: string;
}

export interface ActionProfileResult {
  status: ActionProfileStatus;
  mode: ActionProfileMode;
  findings: ActionProfileFinding[];
  checkedDocuments: string[];
  checkedSurfaces: number;
}

type JsonObject = Record<string, unknown>;

const SUPPORTED_PROFILE_VERSION = "0.1.0";

const SURFACE_TYPES = [
  "mcp_tool",
  "api_endpoint",
  "ui_action",
  "cli_command",
  "job",
  "webhook",
  "agent_action",
] as const;

const CAPABILITY_CLASSES = [
  "read",
  "reveal",
  "write",
  "delete",
  "action",
  "external_send",
  "admin",
  "execute_code",
] as const;

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const INTEROP_MODES = [
  "none",
  "contract_ref",
  "event",
  "projection",
  "command_request",
  "artifact_ref",
  "manual_handoff",
] as const;

const REQUIRED_ROOT_FIELDS = [
  "profile_version",
  "product",
  "owner_repo",
  "surfaces",
] as const;

const REQUIRED_SURFACE_FIELDS = [
  "surface_id",
  "surface_type",
  "display_name",
  "description",
  "capability_classes",
  "risk_level",
  "boundary",
  "resource_scope",
  "identity_requirements",
  "context_requirements",
  "memory_requirements",
  "approval_policy",
  "audit_policy",
  "rollback_policy",
  "execution_policy",
] as const;

const REQUIRED_BOUNDARY_FIELDS = [
  "standalone_required",
  "state_owner",
  "execution_owner",
  "policy_owner",
  "audit_owner",
  "interop_modes",
  "allowed_dependencies",
  "forbidden_dependencies",
  "direct_db_access_to_other_products",
  "receiving_product_revalidates",
] as const;

const REQUIRED_RESOURCE_SCOPE_FIELDS = [
  "tenant_scoped",
  "resource_patterns",
  "data_categories",
] as const;

const REQUIRED_IDENTITY_FIELDS = [
  "actor_required",
  "agent_id_required",
  "human_user_required",
  "service_account_allowed",
] as const;

const REQUIRED_CONTEXT_FIELDS = [
  "context_pack_required",
  "required_labels",
  "denied_labels",
  "prompt_injection_check_required",
] as const;

const REQUIRED_MEMORY_FIELDS = [
  "recovery_pack_required",
  "approval_note_required",
  "human_intent_ref_required",
] as const;

const REQUIRED_APPROVAL_FIELDS = [
  "approval_required",
  "approver_role",
  "approval_ttl_seconds",
  "reuse_allowed",
] as const;

const REQUIRED_AUDIT_FIELDS = [
  "audit_required",
  "input_summary_required",
  "output_summary_required",
  "mutation_summary_required",
  "egress_summary_required",
  "redaction_required",
] as const;

const REQUIRED_ROLLBACK_FIELDS = [
  "rollback_required",
  "rollback_kind",
  "replay_supported",
] as const;

const REQUIRED_EXECUTION_FIELDS = [
  "dry_run_supported",
  "idempotency_key_required",
  "rate_limit_policy",
  "timeout_seconds",
] as const;

const REQUIRED_FORBIDDEN_DEPENDENCIES = [
  "direct_db_write",
  "shared_internal_state",
  "shared_credentials",
] as const;

export function validateActionProfiles(
  documents: ActionProfileDocument[],
  options: ActionProfileOptions = {},
): ActionProfileResult {
  const mode = options.mode ?? "warning";
  const findings: ActionProfileFinding[] = [];
  let checkedSurfaces = 0;

  for (const document of documents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document.content);
    } catch (error) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "parse_error",
        message: `Profile JSON could not be parsed: ${error}`,
      });
      continue;
    }

    if (!isObject(parsed)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "$",
        message: "Profile root must be a JSON object.",
      });
      continue;
    }

    validateRequiredFields(
      findings,
      mode,
      document.path,
      parsed,
      REQUIRED_ROOT_FIELDS,
      "$",
    );

    if (parsed.profile_version !== SUPPORTED_PROFILE_VERSION) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "unsupported_version",
        field: "profile_version",
        message: `Unsupported profile_version: ${String(parsed.profile_version)}. Supported: ${SUPPORTED_PROFILE_VERSION}.`,
      });
    }

    if (!isNonEmptyString(parsed.product)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "product",
        message: "product must be a non-empty string.",
      });
    }

    if (!isNonEmptyString(parsed.owner_repo)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "owner_repo",
        message: "owner_repo must be a non-empty string.",
      });
    }

    if (!Array.isArray(parsed.surfaces) || parsed.surfaces.length === 0) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "surfaces",
        message: "surfaces must be a non-empty array.",
      });
      continue;
    }

    parsed.surfaces.forEach((surface, index) => {
      checkedSurfaces++;
      validateSurface(findings, mode, document.path, surface, index);
    });
  }

  return {
    status: toStatus(findings),
    mode,
    findings,
    checkedDocuments: documents.map((document) => document.path),
    checkedSurfaces,
  };
}

function validateSurface(
  findings: ActionProfileFinding[],
  mode: ActionProfileMode,
  path: string,
  surface: unknown,
  index: number,
): void {
  const surfacePath = `surfaces[${index}]`;
  if (!isObject(surface)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: surfacePath,
      message: "surface entry must be an object.",
    });
    return;
  }

  const surfaceId = isNonEmptyString(surface.surface_id)
    ? surface.surface_id
    : `${surfacePath}`;

  validateRequiredFields(
    findings,
    mode,
    path,
    surface,
    REQUIRED_SURFACE_FIELDS,
    surfacePath,
    surfaceId,
  );

  if (!isNonEmptyString(surface.surface_id)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.surface_id`,
      message: "surface_id must be a non-empty string.",
    });
  }

  if (!isEnumValue(surface.surface_type, SURFACE_TYPES)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.surface_type`,
      message: `surface_type must be one of: ${SURFACE_TYPES.join(", ")}.`,
    });
  }

  if (!isCapabilityArray(surface.capability_classes)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.capability_classes`,
      message: `capability_classes must be a non-empty array of: ${CAPABILITY_CLASSES.join(", ")}.`,
    });
  }

  const riskLevel = isEnumValue(surface.risk_level, RISK_LEVELS)
    ? surface.risk_level
    : null;
  if (!riskLevel) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.risk_level`,
      message: `risk_level must be one of: ${RISK_LEVELS.join(", ")}.`,
    });
  }

  validateNestedObject(
    findings,
    mode,
    path,
    surface.boundary,
    REQUIRED_BOUNDARY_FIELDS,
    `${surfacePath}.boundary`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.resource_scope,
    REQUIRED_RESOURCE_SCOPE_FIELDS,
    `${surfacePath}.resource_scope`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.identity_requirements,
    REQUIRED_IDENTITY_FIELDS,
    `${surfacePath}.identity_requirements`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.context_requirements,
    REQUIRED_CONTEXT_FIELDS,
    `${surfacePath}.context_requirements`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.memory_requirements,
    REQUIRED_MEMORY_FIELDS,
    `${surfacePath}.memory_requirements`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.approval_policy,
    REQUIRED_APPROVAL_FIELDS,
    `${surfacePath}.approval_policy`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.audit_policy,
    REQUIRED_AUDIT_FIELDS,
    `${surfacePath}.audit_policy`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.rollback_policy,
    REQUIRED_ROLLBACK_FIELDS,
    `${surfacePath}.rollback_policy`,
    surfaceId,
  );
  validateNestedObject(
    findings,
    mode,
    path,
    surface.execution_policy,
    REQUIRED_EXECUTION_FIELDS,
    `${surfacePath}.execution_policy`,
    surfaceId,
  );

  if (isObject(surface.boundary)) {
    validateBoundary(findings, mode, path, surface.boundary, surfacePath, surfaceId);
  }

  if (
    (riskLevel === "high" || riskLevel === "critical") &&
    (!isObject(surface.audit_policy) || surface.audit_policy.audit_required !== true)
  ) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "missing_audit",
      field: `${surfacePath}.audit_policy.audit_required`,
      message: "high and critical surfaces must require audit evidence.",
    });
  }
}

function validateBoundary(
  findings: ActionProfileFinding[],
  mode: ActionProfileMode,
  path: string,
  boundary: JsonObject,
  surfacePath: string,
  surfaceId: string,
): void {
  if (boundary.standalone_required !== true) {
    findings.push({
      severity: "BLOCK",
      path,
      surfaceId,
      type: "forbidden_coupling",
      field: `${surfacePath}.boundary.standalone_required`,
      message: "standalone_required must be true.",
    });
  }

  if (boundary.direct_db_access_to_other_products !== false) {
    findings.push({
      severity: "BLOCK",
      path,
      surfaceId,
      type: "forbidden_coupling",
      field: `${surfacePath}.boundary.direct_db_access_to_other_products`,
      message: "direct_db_access_to_other_products must be false.",
    });
  }

  if (!isArrayOfStrings(boundary.interop_modes)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.boundary.interop_modes`,
      message: `interop_modes must be a non-empty array of: ${INTEROP_MODES.join(", ")}.`,
    });
  } else {
    for (const interopMode of boundary.interop_modes) {
      if (!isEnumValue(interopMode, INTEROP_MODES)) {
        pushModeFinding(findings, mode, {
          path,
          surfaceId,
          type: "invalid_field",
          field: `${surfacePath}.boundary.interop_modes`,
          message: `Invalid interop mode: ${interopMode}.`,
        });
      }
    }

    if (
      boundary.interop_modes.includes("command_request") &&
      boundary.receiving_product_revalidates !== true
    ) {
      findings.push({
        severity: "BLOCK",
        path,
        surfaceId,
        type: "missing_revalidation",
        field: `${surfacePath}.boundary.receiving_product_revalidates`,
        message:
          "command_request surfaces must require receiving-product revalidation.",
      });
    }
  }

  if (!isArrayOfStrings(boundary.forbidden_dependencies)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "invalid_field",
      field: `${surfacePath}.boundary.forbidden_dependencies`,
      message: "forbidden_dependencies must be an array of strings.",
    });
    return;
  }

  for (const dependency of REQUIRED_FORBIDDEN_DEPENDENCIES) {
    if (!boundary.forbidden_dependencies.includes(dependency)) {
      findings.push({
        severity: "BLOCK",
        path,
        surfaceId,
        type: "forbidden_coupling",
        field: `${surfacePath}.boundary.forbidden_dependencies`,
        message: `forbidden_dependencies must include ${dependency}.`,
      });
    }
  }
}

function validateNestedObject(
  findings: ActionProfileFinding[],
  mode: ActionProfileMode,
  path: string,
  value: unknown,
  fields: readonly string[],
  prefix: string,
  surfaceId: string,
): void {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      surfaceId,
      type: "missing_field",
      field: prefix,
      message: `${prefix} must be an object.`,
    });
    return;
  }

  validateRequiredFields(findings, mode, path, value, fields, prefix, surfaceId);
}

function validateRequiredFields(
  findings: ActionProfileFinding[],
  mode: ActionProfileMode,
  path: string,
  value: JsonObject,
  fields: readonly string[],
  prefix: string,
  surfaceId?: string,
): void {
  for (const field of fields) {
    if (!(field in value)) {
      pushModeFinding(findings, mode, {
        path,
        surfaceId,
        type: "missing_field",
        field: `${prefix}.${field}`,
        message: `Missing action profile field: ${prefix}.${field}`,
      });
    }
  }
}

function pushModeFinding(
  findings: ActionProfileFinding[],
  mode: ActionProfileMode,
  finding: Omit<ActionProfileFinding, "severity">,
): void {
  findings.push({
    severity: mode === "strict" ? "BLOCK" : "WARNING",
    ...finding,
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCapabilityArray(value: unknown): value is string[] {
  return (
    isArrayOfStrings(value) &&
    value.length > 0 &&
    value.every((item) => isEnumValue(item, CAPABILITY_CLASSES))
  );
}

function isEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

function toStatus(findings: ActionProfileFinding[]): ActionProfileStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
