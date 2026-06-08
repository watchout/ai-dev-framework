import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const COMPANY_DEV_OS_ROLE_PROFILE_SCHEMA =
  "shirube-company-dev-os-role-profile/v1";
export const COMPANY_DEV_OS_ROLE_PROFILE_VALIDATION_SCHEMA =
  "shirube-company-dev-os-role-profile-validation/v1";

export const COMPANY_DEV_OS_ROLE_NAMES = [
  "spec",
  "arc",
  "implementation",
  "audit",
  "qa",
  "check",
  "cto",
] as const;

export type CompanyDevOsRoleName =
  (typeof COMPANY_DEV_OS_ROLE_NAMES)[number];

const COMPANY_DEV_OS_LLMS = ["codex", "claude", "repo_specific"] as const;

type CompanyDevOsLlm = (typeof COMPANY_DEV_OS_LLMS)[number];

const AUTHORITY_FIELDS = [
  "can_edit_files",
  "can_commit",
  "can_create_pr",
  "can_apply_fixes",
  "can_merge",
  "can_approve",
] as const;

type AuthorityField = (typeof AUTHORITY_FIELDS)[number];

type CompanyDevOsAuthority = Record<AuthorityField, boolean> & {
  can_go_no_go?: boolean;
};

export interface CompanyDevOsRoleProfile {
  schema: typeof COMPANY_DEV_OS_ROLE_PROFILE_SCHEMA;
  role: CompanyDevOsRoleName;
  llm: CompanyDevOsLlm;
  purpose: string;
  may: string[];
  must_not: string[];
  required_input: string[];
  required_output: string[];
  authority: CompanyDevOsAuthority;
  required_skills: string[];
  runtime_entrypoints: string[];
  handoff_targets: string[];
}

export interface CompanyDevOsRoleProfileFinding {
  severity: "block";
  code:
    | "missing_profile"
    | "invalid_json"
    | "invalid_schema"
    | "invalid_role"
    | "missing_field"
    | "invalid_field"
    | "forbidden_authority"
    | "forbidden_self_approval"
    | "forbidden_merge";
  role?: string;
  path?: string;
  field?: string;
  message: string;
}

export interface CompanyDevOsValidatedProfile {
  role: CompanyDevOsRoleName;
  path: string;
  role_profile_hash: string;
}

export interface CompanyDevOsRoleProfileValidationResult {
  schema: typeof COMPANY_DEV_OS_ROLE_PROFILE_VALIDATION_SCHEMA;
  passed: boolean;
  config_dir: string;
  required_roles: CompanyDevOsRoleName[];
  profiles: CompanyDevOsValidatedProfile[];
  findings: CompanyDevOsRoleProfileFinding[];
}

export interface ValidateCompanyDevOsRoleProfilesOptions {
  configDir?: string;
}

export function validateCompanyDevOsRoleProfiles(
  projectDir: string,
  options: ValidateCompanyDevOsRoleProfilesOptions = {},
): CompanyDevOsRoleProfileValidationResult {
  const configDir = path.resolve(
    projectDir,
    options.configDir ?? ".shirube/company-dev-os",
  );
  const rolesDir = path.join(configDir, "roles");
  const findings: CompanyDevOsRoleProfileFinding[] = [];
  const profiles: CompanyDevOsValidatedProfile[] = [];

  for (const role of COMPANY_DEV_OS_ROLE_NAMES) {
    const profilePath = path.join(rolesDir, `${role}.role.json`);
    if (!fs.existsSync(profilePath)) {
      findings.push({
        severity: "block",
        code: "missing_profile",
        role,
        path: profilePath,
        message: `Missing Company Dev OS role profile for ${role}`,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    } catch (error) {
      findings.push({
        severity: "block",
        code: "invalid_json",
        role,
        path: profilePath,
        message: `Invalid JSON for ${role}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const roleFindings = validateCompanyDevOsRoleProfile(parsed, role, profilePath);
    findings.push(...roleFindings);
    if (roleFindings.length === 0) {
      profiles.push({
        role,
        path: path.relative(projectDir, profilePath),
        role_profile_hash: hashCompanyDevOsRoleProfile(
          parsed as CompanyDevOsRoleProfile,
        ),
      });
    }
  }

  return {
    schema: COMPANY_DEV_OS_ROLE_PROFILE_VALIDATION_SCHEMA,
    passed: findings.length === 0,
    config_dir: path.relative(projectDir, configDir) || ".",
    required_roles: [...COMPANY_DEV_OS_ROLE_NAMES],
    profiles,
    findings,
  };
}

export function validateCompanyDevOsRoleProfile(
  value: unknown,
  expectedRole: CompanyDevOsRoleName,
  profilePath?: string,
): CompanyDevOsRoleProfileFinding[] {
  const findings: CompanyDevOsRoleProfileFinding[] = [];
  if (!isRecord(value)) {
    return [
      {
        severity: "block",
        code: "invalid_field",
        role: expectedRole,
        path: profilePath,
        message: "Role profile must be a JSON object",
      },
    ];
  }

  requireLiteral(
    findings,
    value,
    "schema",
    COMPANY_DEV_OS_ROLE_PROFILE_SCHEMA,
    expectedRole,
    profilePath,
  );

  if (value.role !== expectedRole) {
    findings.push({
      severity: "block",
      code: typeof value.role === "string" ? "invalid_role" : "missing_field",
      role: expectedRole,
      path: profilePath,
      field: "role",
      message: `Role profile role must be ${expectedRole}`,
    });
  }

  requireEnum(
    findings,
    value,
    "llm",
    COMPANY_DEV_OS_LLMS,
    expectedRole,
    profilePath,
  );
  requireNonEmptyString(findings, value, "purpose", expectedRole, profilePath);

  for (const field of [
    "may",
    "must_not",
    "required_input",
    "required_output",
    "required_skills",
    "runtime_entrypoints",
    "handoff_targets",
  ]) {
    requireStringArray(findings, value, field, expectedRole, profilePath);
  }

  validateAuthority(findings, value.authority, expectedRole, profilePath);

  return findings;
}

export function hashCompanyDevOsRoleProfile(
  profile: CompanyDevOsRoleProfile,
): string {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(profile), "utf-8")
    .digest("hex");
}

function validateAuthority(
  findings: CompanyDevOsRoleProfileFinding[],
  value: unknown,
  role: CompanyDevOsRoleName,
  profilePath?: string,
): void {
  if (!isRecord(value)) {
    findings.push({
      severity: "block",
      code: "missing_field",
      role,
      path: profilePath,
      field: "authority",
      message: "authority must be present",
    });
    return;
  }

  for (const field of AUTHORITY_FIELDS) {
    if (typeof value[field] !== "boolean") {
      findings.push({
        severity: "block",
        code: value[field] === undefined ? "missing_field" : "invalid_field",
        role,
        path: profilePath,
        field: `authority.${field}`,
        message: `authority.${field} must be boolean`,
      });
    }
  }

  if (
    value.can_go_no_go !== undefined &&
    typeof value.can_go_no_go !== "boolean"
  ) {
    findings.push({
      severity: "block",
      code: "invalid_field",
      role,
      path: profilePath,
      field: "authority.can_go_no_go",
      message: "authority.can_go_no_go must be boolean when present",
    });
  }

  if (role !== "implementation") {
    for (const field of [
      "can_edit_files",
      "can_apply_fixes",
      "can_commit",
      "can_create_pr",
      "can_merge",
    ] as const) {
      if (value[field] === true) {
        findings.push({
          severity: "block",
          code: "forbidden_authority",
          role,
          path: profilePath,
          field: `authority.${field}`,
          message: `${role} must not have ${field}=true`,
        });
      }
    }
  }

  if (role === "implementation" && value.can_approve === true) {
    findings.push({
      severity: "block",
      code: "forbidden_self_approval",
      role,
      path: profilePath,
      field: "authority.can_approve",
      message: "implementation must not self-approve audit, QA, check, or CTO gates",
    });
  }

  if (value.can_merge === true) {
    findings.push({
      severity: "block",
      code: "forbidden_merge",
      role,
      path: profilePath,
      field: "authority.can_merge",
      message: `${role} must not have merge authority`,
    });
  }
}

function requireLiteral(
  findings: CompanyDevOsRoleProfileFinding[],
  value: Record<string, unknown>,
  field: string,
  expected: string,
  role: CompanyDevOsRoleName,
  profilePath?: string,
): void {
  if (value[field] !== expected) {
    findings.push({
      severity: "block",
      code: value[field] === undefined ? "missing_field" : "invalid_schema",
      role,
      path: profilePath,
      field,
      message: `${field} must be ${expected}`,
    });
  }
}

function requireEnum<T extends readonly string[]>(
  findings: CompanyDevOsRoleProfileFinding[],
  value: Record<string, unknown>,
  field: string,
  allowed: T,
  role: CompanyDevOsRoleName,
  profilePath?: string,
): void {
  if (typeof value[field] !== "string" || !allowed.includes(value[field])) {
    findings.push({
      severity: "block",
      code: value[field] === undefined ? "missing_field" : "invalid_field",
      role,
      path: profilePath,
      field,
      message: `${field} must be one of ${allowed.join(", ")}`,
    });
  }
}

function requireNonEmptyString(
  findings: CompanyDevOsRoleProfileFinding[],
  value: Record<string, unknown>,
  field: string,
  role: CompanyDevOsRoleName,
  profilePath?: string,
): void {
  if (typeof value[field] !== "string" || value[field].trim() === "") {
    findings.push({
      severity: "block",
      code: value[field] === undefined ? "missing_field" : "invalid_field",
      role,
      path: profilePath,
      field,
      message: `${field} must be a non-empty string`,
    });
  }
}

function requireStringArray(
  findings: CompanyDevOsRoleProfileFinding[],
  value: Record<string, unknown>,
  field: string,
  role: CompanyDevOsRoleName,
  profilePath?: string,
): void {
  const candidate = value[field];
  if (
    !Array.isArray(candidate) ||
    !candidate.every((entry) => typeof entry === "string" && entry.trim() !== "")
  ) {
    findings.push({
      severity: "block",
      code: candidate === undefined ? "missing_field" : "invalid_field",
      role,
      path: profilePath,
      field,
      message: `${field} must be an array of non-empty strings`,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}
