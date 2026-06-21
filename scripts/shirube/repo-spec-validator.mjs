import { asArray, buildResult, isObject, present, verdictFromFindings } from "./lib.mjs";

const HARD_REQUIRED_TOP_LEVEL = [
  "schema_version",
  "purpose",
];

const SOFT_REQUIRED_TOP_LEVEL = [
  "canonical_core",
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

  for (const key of HARD_REQUIRED_TOP_LEVEL) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) {
      findings.push({ severity: "BLOCK", code: "missing_required_key", field: key, message: `${key} is required.` });
    }
  }

  for (const key of SOFT_REQUIRED_TOP_LEVEL) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) {
      findings.push({
        severity: "WARN",
        code: "missing_recommended_key",
        field: key,
        message: `${key} is recommended by canonical shirube-repo-spec/v1 and will become stricter after migration.`,
      });
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

  const repoId = spec.repo_id ?? spec.repo;
  if (typeof repoId !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repoId)) {
    findings.push({ severity: "BLOCK", code: "invalid_repo_id", field: "repo_id", message: "repo_id or repo must be owner/name." });
  }
  if (present(spec.repo_id) && present(spec.repo) && spec.repo_id !== spec.repo) {
    findings.push({
      severity: "BLOCK",
      code: "repo_alias_mismatch",
      field: "repo",
      message: "repo and repo_id aliases must match when both are present.",
    });
  }
  if (!present(spec.repo_id) && present(spec.repo)) {
    findings.push({
      severity: "WARN",
      code: "repo_alias_without_repo_id",
      field: "repo_id",
      message: "repo is accepted as a compatibility alias, but repo_id is the canonical key for cross-repo scaffolds.",
    });
  }

  if (present(spec.canonical_core) && (typeof spec.canonical_core !== "string" || !/^[^@\s]+@[^@\s]+$/.test(spec.canonical_core))) {
    findings.push({
      severity: "WARN",
      code: "invalid_canonical_core",
      field: "canonical_core",
      message: "canonical_core should pin an owner/repo reference with @commit-or-tag.",
    });
  }

  if (present(spec.non_goals) && !Array.isArray(spec.non_goals)) {
    findings.push({ severity: "WARN", code: "invalid_non_goals", field: "non_goals", message: "non_goals should be an array; it may be empty." });
  }
  recommendNonEmptyArray(findings, spec.design_principles, "design_principles");
  recommendNonEmptyArray(findings, spec.required_gates, "required_gates");
  recommendNonEmptyArray(findings, spec.data_boundaries, "data_boundaries");
  recommendNonEmptyArray(findings, spec.dependency_boundaries, "dependency_boundaries");
  recommendNonEmptyArray(findings, spec.forbidden_actions, "forbidden_actions");

  if (present(spec.development_flow) && Array.isArray(spec.development_flow)) {
    findings.push({
      severity: "WARN",
      code: "invalid_development_flow",
      field: "development_flow",
      message: "development_flow should be a standards document reference.",
    });
  }

  if (present(spec.roles) && !isObject(spec.roles)) {
    findings.push({ severity: "WARN", code: "invalid_roles", field: "roles", message: "roles should be a mapping." });
  } else if (isObject(spec.roles)) {
    for (const role of REQUIRED_ROLES) {
      if (!present(spec.roles[role])) {
        findings.push({
          severity: "WARN",
          code: "missing_role_assignment",
          field: `roles.${role}`,
          message: `${role} should be assigned before strict enforcement.`,
        });
      }
    }
  }

  const soc2 = asArray(spec.soc2_categories);
  if (present(spec.soc2_categories)) {
    for (const category of REQUIRED_SOC2) {
      if (!soc2.includes(category)) {
        findings.push({ severity: "WARN", code: "missing_soc2_category", field: "soc2_categories", message: `${category} is recommended before strict enforcement.` });
      }
    }
  }

  if (present(spec.ai_usage_classification) && !["none", "assisted", "agentic"].includes(spec.ai_usage_classification)) {
    findings.push({
      severity: "WARN",
      code: "invalid_ai_usage_classification",
      field: "ai_usage_classification",
      message: "ai_usage_classification should be none, assisted, or agentic.",
    });
  }

  if (present(spec.iso42001_applicability) && typeof spec.iso42001_applicability !== "boolean") {
    findings.push({
      severity: "WARN",
      code: "invalid_iso42001_applicability",
      field: "iso42001_applicability",
      message: "iso42001_applicability should be boolean.",
    });
  }

  if (present(spec.agent_permission_boundary) && !isObject(spec.agent_permission_boundary)) {
    findings.push({
      severity: "WARN",
      code: "invalid_agent_permission_boundary",
      field: "agent_permission_boundary",
      message: "agent_permission_boundary should be a mapping.",
    });
  } else if (isObject(spec.agent_permission_boundary)) {
    for (const key of REQUIRED_PERMISSION_ARRAYS) {
      if (!Array.isArray(spec.agent_permission_boundary[key])) {
        findings.push({
          severity: "WARN",
          code: "invalid_agent_permission_boundary_array",
          field: `agent_permission_boundary.${key}`,
          message: `${key} should be an array before strict enforcement.`,
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
  } else if (present(spec.shared_terminology) && !isObject(spec.shared_terminology)) {
    findings.push({
      severity: "WARN",
      code: "invalid_shared_terminology",
      field: "shared_terminology",
      message: "shared_terminology should be a mapping.",
    });
  }

  if (present(spec.remediation) && !isObject(spec.remediation)) {
    findings.push({ severity: "WARN", code: "invalid_remediation", field: "remediation", message: "remediation should be a mapping." });
  }
  recommendMapping(findings, spec.operating_model, "operating_model");
  recommendMapping(findings, spec.gate_catalog, "gate_catalog");
  recommendMapping(findings, spec.required_evidence, "required_evidence");
  recommendMapping(findings, spec.risk_tier_policy, "risk_tier_policy");
  recommendMapping(findings, spec.waiver_policy, "waiver_policy");
  recommendMapping(findings, spec.post_merge_policy, "post_merge_policy");
  recommendMapping(findings, spec.remediation_contract, "remediation_contract");

  return result(file, findings);
}

function recommendNonEmptyArray(findings, value, field) {
  if (present(value) && (!Array.isArray(value) || value.length === 0)) {
    findings.push({ severity: "WARN", code: "invalid_recommended_array", field, message: `${field} should be a non-empty array before strict enforcement.` });
  }
}

function recommendMapping(findings, value, field) {
  if (present(value) && !isObject(value)) {
    findings.push({ severity: "WARN", code: "invalid_recommended_mapping", field, message: `${field} should be a mapping before strict enforcement.` });
  }
}

function result(file, findings) {
  const verdict = verdictFromFindings(findings);
  return buildResult({
    gate: "repo-spec",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Update .shirube/repo-spec.yaml toward schemas/shirube-repo-spec.schema.json and templates/shirube-repo-spec.yaml. Pilot v1 warnings are report-only for lightweight cross-repo scaffolds.",
      doc_ref: "templates/shirube-repo-spec.yaml",
    },
    checked_file: file,
  });
}
