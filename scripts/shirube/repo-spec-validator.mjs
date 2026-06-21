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
  validateAuditAssignment(findings, spec.audit_assignment);
  validateConfirmationEvidence(findings, spec.confirmation_evidence);

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

function validateAuditAssignment(findings, assignment) {
  if (!present(assignment)) {
    findings.push({
      severity: "WARN",
      code: "missing_audit_assignment",
      field: "audit_assignment",
      message: "audit_assignment should encode formal audit routing before premise confirmation.",
    });
    return;
  }
  if (!isObject(assignment)) {
    findings.push({
      severity: "WARN",
      code: "invalid_audit_assignment",
      field: "audit_assignment",
      message: "audit_assignment should be a mapping.",
    });
    return;
  }

  warnUnless(findings, assignment.schema_version === "shirube-audit-assignment/v1", "invalid_audit_assignment_schema_version", "audit_assignment.schema_version", "audit_assignment.schema_version should be shirube-audit-assignment/v1.");
  warnUnless(findings, assignment.author_must_not_audit_own_artifact === true, "invalid_author_audit_boundary", "audit_assignment.author_must_not_audit_own_artifact", "author_must_not_audit_own_artifact must be true.");

  const roles = isObject(assignment.roles) ? assignment.roles : {};
  warnUnless(findings, roles.spec?.may_audit === false, "invalid_spec_audit_role", "audit_assignment.roles.spec.may_audit", "spec is dispatch author only and must not audit.");
  warnUnless(findings, roles.arc?.may_audit === false, "invalid_arc_audit_role", "audit_assignment.roles.arc.may_audit", "arc is design input / encode only and must not be the formal audit gate.");
  warnUnless(findings, roles.codex_audit?.may_audit === true, "invalid_codex_audit_role", "audit_assignment.roles.codex_audit.may_audit", "codex-audit must be the formal audit gate.");

  const artifacts = isObject(assignment.artifacts) ? assignment.artifacts : {};
  for (const artifact of ["premise_rps", "feature_spec", "cell", "impl_to_code"]) {
    warnUnless(findings, artifacts[artifact]?.audit_role === "codex-audit", "invalid_artifact_audit_role", `audit_assignment.artifacts.${artifact}.audit_role`, `${artifact} must route formal audit to codex-audit.`);
  }
  warnUnless(findings, artifacts.premise_rps?.author_role === "spec", "invalid_premise_author_role", "audit_assignment.artifacts.premise_rps.author_role", "premise_rps author_role should remain spec.");
  warnUnless(findings, artifacts.premise_rps?.design_input_role === "arc", "invalid_premise_design_input_role", "audit_assignment.artifacts.premise_rps.design_input_role", "premise_rps design_input_role should be arc.");
  warnUnless(findings, artifacts.bridge_admissibility?.audit_role === "codex-audit", "invalid_bridge_audit_role", "audit_assignment.artifacts.bridge_admissibility.audit_role", "Bridge admissibility audit must route to codex-audit.");
  warnUnless(findings, artifacts.bridge_admissibility?.machine_gate === "bridge", "invalid_bridge_machine_gate", "audit_assignment.artifacts.bridge_admissibility.machine_gate", "Bridge admissibility must name bridge as the machine gate.");
  warnUnless(findings, asArray(artifacts.route_ceo_approval?.authority_roles).includes("CEO"), "missing_ceo_approval_authority", "audit_assignment.artifacts.route_ceo_approval.authority_roles", "route:ceo-approval must include CEO authority.");
  warnUnless(findings, asArray(artifacts.enforce?.authority_roles).includes("CEO"), "missing_enforce_authority", "audit_assignment.artifacts.enforce.authority_roles", "enforce must include CEO authority.");
}

function validateConfirmationEvidence(findings, confirmationEvidence) {
  if (!present(confirmationEvidence)) {
    findings.push({
      severity: "WARN",
      code: "missing_confirmation_evidence",
      field: "confirmation_evidence",
      message: "confirmation_evidence.rps_readiness should define the owner/CEO confirmation record contract.",
    });
    return;
  }
  if (!isObject(confirmationEvidence)) {
    findings.push({
      severity: "WARN",
      code: "invalid_confirmation_evidence",
      field: "confirmation_evidence",
      message: "confirmation_evidence should be a mapping.",
    });
    return;
  }

  const readiness = confirmationEvidence.rps_readiness;
  if (!isObject(readiness)) {
    findings.push({
      severity: "WARN",
      code: "missing_rps_readiness_confirmation",
      field: "confirmation_evidence.rps_readiness",
      message: "confirmation_evidence.rps_readiness should define the RPS readiness confirmation contract.",
    });
    return;
  }

  warnUnless(findings, readiness.required === true, "invalid_rps_readiness_required", "confirmation_evidence.rps_readiness.required", "rps_readiness confirmation must be required.");
  warnUnless(findings, readiness.authority_role === "CEO", "invalid_rps_readiness_authority_role", "confirmation_evidence.rps_readiness.authority_role", "rps_readiness authority_role must be CEO.");
  warnUnless(findings, readiness.authority_actor === "watchout", "invalid_rps_readiness_authority_actor", "confirmation_evidence.rps_readiness.authority_actor", "rps_readiness authority_actor must be watchout.");
  warnUnless(findings, readiness.canonical_artifact_path === ".shirube/evidence/rps-confirmation.yaml", "invalid_rps_readiness_path", "confirmation_evidence.rps_readiness.canonical_artifact_path", "rps_readiness must name .shirube/evidence/rps-confirmation.yaml as the canonical artifact path.");
  warnUnless(findings, asArray(readiness.accepted_sinks).includes("repository_file") || asArray(readiness.accepted_sinks).includes("github_issue_comment") || asArray(readiness.accepted_sinks).includes("github_pr_comment"), "missing_rps_readiness_sink", "confirmation_evidence.rps_readiness.accepted_sinks", "rps_readiness must name at least one accepted sink.");
  warnUnless(findings, readiness.github_marker === "shirube:rps-confirmation/v1", "invalid_rps_readiness_marker", "confirmation_evidence.rps_readiness.github_marker", "rps_readiness must name the shirube:rps-confirmation/v1 GitHub marker.");

  for (const field of ["schema_version", "record_id", "repo", "rps_id", "source_pr", "exact_head_sha", "authority_role", "authority_actor", "verdict", "created_at", "evidence_refs"]) {
    warnUnless(findings, asArray(readiness.required_fields).includes(field), "missing_rps_readiness_required_field", `confirmation_evidence.rps_readiness.required_fields.${field}`, `rps_readiness required_fields must include ${field}.`);
  }
  for (const verdict of ["CONFIRMED", "CHANGES_REQUIRED", "BLOCKED"]) {
    warnUnless(findings, asArray(readiness.valid_verdicts).includes(verdict), "missing_rps_readiness_verdict", `confirmation_evidence.rps_readiness.valid_verdicts.${verdict}`, `rps_readiness valid_verdicts must include ${verdict}.`);
  }
}

function warnUnless(findings, condition, code, field, message) {
  if (!condition) {
    findings.push({ severity: "WARN", code, field, message });
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
