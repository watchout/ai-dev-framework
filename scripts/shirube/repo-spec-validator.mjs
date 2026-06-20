import { asArray, buildResult, isObject, present, verdictFromFindings } from "./lib.mjs";

const REQUIRED_TOP_LEVEL = [
  "schema_version",
  "repo",
  "canonical_core",
  "purpose",
  "non_goals",
  "design_principles",
  "development_flow",
  "required_gates",
  "roles",
  "codeowners_ref",
  "audit_responsibilities",
  "shared_terminology",
  "security_assumptions",
  "privacy_assumptions",
  "data_boundaries",
  "dependency_boundaries",
  "forbidden_actions",
  "ai_usage_classification",
  "soc2_categories",
  "iso42001_applicability",
  "agent_permission_boundary",
  "remediation",
];

const REQUIRED_ROLES = [
  "spec",
  "arc",
  "design_reviewer",
  "impl_runner",
  "impl_reviewer",
  "release_owner",
];

const REQUIRED_SOC2 = ["Security", "Confidentiality", "Processing Integrity"];

const REQUIRED_PERMISSION_ARRAYS = [
  "allowed_paths",
  "forbidden_paths",
  "allowed_commands",
  "forbidden_commands",
  "allowed_mcp_tools",
  "approval_required_mcp_tools",
  "forbidden_mcp_tools",
];

export function validateRepoSpec(spec, file = ".shirube/repo-spec.yaml") {
  const findings = [];
  if (!isObject(spec)) {
    findings.push({ severity: "BLOCK", code: "repo_spec_not_mapping", message: "Repo-spec root must be a mapping." });
    return result(file, findings);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) {
      findings.push({ severity: "BLOCK", code: "missing_required_key", field: key, message: `${key} is required.` });
    }
  }

  if (spec.schema_version !== "shirube-repo-spec/v1") {
    findings.push({
      severity: "BLOCK",
      code: "invalid_schema_version",
      field: "schema_version",
      message: "schema_version must be shirube-repo-spec/v1.",
    });
  }

  if (typeof spec.repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(spec.repo)) {
    findings.push({ severity: "BLOCK", code: "invalid_repo", field: "repo", message: "repo must be owner/name." });
  }

  if (typeof spec.canonical_core !== "string" || !/^[^@\s]+@[^@\s]+$/.test(spec.canonical_core)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_canonical_core",
      field: "canonical_core",
      message: "canonical_core must pin an owner/repo reference with @commit-or-tag.",
    });
  }

  if (!Array.isArray(spec.non_goals)) {
    findings.push({ severity: "BLOCK", code: "invalid_non_goals", field: "non_goals", message: "non_goals must be an array; it may be empty." });
  }
  requireNonEmptyArray(findings, spec.design_principles, "design_principles");
  requireNonEmptyArray(findings, spec.required_gates, "required_gates");
  requireNonEmptyArray(findings, spec.data_boundaries, "data_boundaries");
  requireNonEmptyArray(findings, spec.dependency_boundaries, "dependency_boundaries");
  requireNonEmptyArray(findings, spec.forbidden_actions, "forbidden_actions");

  if (!present(spec.development_flow) || Array.isArray(spec.development_flow)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_development_flow",
      field: "development_flow",
      message: "development_flow must be a standards document reference.",
    });
  }

  if (!isObject(spec.roles)) {
    findings.push({ severity: "BLOCK", code: "invalid_roles", field: "roles", message: "roles must be a mapping." });
  } else {
    for (const role of REQUIRED_ROLES) {
      if (!present(spec.roles[role])) {
        findings.push({ severity: "BLOCK", code: "missing_role_assignment", field: `roles.${role}`, message: `${role} must be assigned.` });
      }
    }
  }

  const soc2 = asArray(spec.soc2_categories);
  for (const category of REQUIRED_SOC2) {
    if (!soc2.includes(category)) {
      findings.push({ severity: "BLOCK", code: "missing_soc2_category", field: "soc2_categories", message: `${category} is required.` });
    }
  }

  if (!["none", "assisted", "agentic"].includes(spec.ai_usage_classification)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_ai_usage_classification",
      field: "ai_usage_classification",
      message: "ai_usage_classification must be none, assisted, or agentic.",
    });
  }

  if (typeof spec.iso42001_applicability !== "boolean") {
    findings.push({
      severity: "BLOCK",
      code: "invalid_iso42001_applicability",
      field: "iso42001_applicability",
      message: "iso42001_applicability must be boolean.",
    });
  }

  if (!isObject(spec.agent_permission_boundary)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_agent_permission_boundary",
      field: "agent_permission_boundary",
      message: "agent_permission_boundary must be a mapping.",
    });
  } else {
    for (const key of REQUIRED_PERMISSION_ARRAYS) {
      if (!Array.isArray(spec.agent_permission_boundary[key])) {
        findings.push({
          severity: "BLOCK",
          code: "invalid_agent_permission_boundary_array",
          field: `agent_permission_boundary.${key}`,
          message: `${key} must be an array.`,
        });
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(spec, "shared_terminology") && isObject(spec.shared_terminology) && Object.keys(spec.shared_terminology).length === 0) {
    findings.push({
      severity: "WARN",
      code: "empty_shared_terminology",
      field: "shared_terminology",
      message: "shared_terminology is present but empty.",
    });
  } else if (!isObject(spec.shared_terminology)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_shared_terminology",
      field: "shared_terminology",
      message: "shared_terminology must be a mapping.",
    });
  }

  if (!isObject(spec.remediation)) {
    findings.push({ severity: "BLOCK", code: "invalid_remediation", field: "remediation", message: "remediation must be a mapping." });
  }

  return result(file, findings);
}

function requireNonEmptyArray(findings, value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    findings.push({ severity: "BLOCK", code: "invalid_required_array", field, message: `${field} must be a non-empty array.` });
  }
}

function result(file, findings) {
  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "repo-spec",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Update .shirube/repo-spec.yaml to match schemas/shirube-repo-spec.schema.json and templates/shirube-repo-spec.yaml.",
      doc_ref: "templates/shirube-repo-spec.yaml",
    },
    checked_file: file,
  });
}
