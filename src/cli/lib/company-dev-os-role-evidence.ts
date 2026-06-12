import * as fs from "node:fs";
import * as path from "node:path";
import {
  COMPANY_DEV_OS_ROLE_NAMES,
  hashCompanyDevOsRoleProfile,
  validateCompanyDevOsRoleProfile,
  type CompanyDevOsRoleName,
  type CompanyDevOsRoleProfile,
} from "./company-dev-os-role-profile.js";
import { doctorCompanyDevOsRuntimeBindings } from "./company-dev-os-runtime-binding.js";

export const COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER = "shirube:role-evidence/v1";
export const COMPANY_DEV_OS_ROLE_EVIDENCE_RENDER_SCHEMA =
  "shirube-company-dev-os-role-evidence-render/v1";
export const COMPANY_DEV_OS_ROLE_EVIDENCE_DRIFT_CHECK_SCHEMA =
  "shirube-company-dev-os-role-evidence-drift-check/v1";

const ROLE_EVIDENCE_FIELD_ORDER = [
  "repo",
  "pr",
  "head",
  "role",
  "llm",
  "role_profile",
  "role_profile_hash",
  "skill_bindings",
  "runtime_entrypoints",
  "authority_can_edit_files",
  "authority_can_apply_fixes",
  "authority_can_commit",
  "authority_can_create_pr",
  "authority_can_merge",
  "recorded_by",
  "recorded_at",
] as const;

const REQUIRED_EVIDENCE_FIELDS = [
  "repo",
  "head",
  "role",
  "llm",
  "role_profile",
  "role_profile_hash",
  "skill_bindings",
  "runtime_entrypoints",
  "authority_can_edit_files",
  "authority_can_apply_fixes",
  "authority_can_commit",
  "authority_can_create_pr",
  "authority_can_merge",
  "recorded_by",
  "recorded_at",
] as const;

const AUTHORITY_EVIDENCE_FIELDS = [
  "authority_can_edit_files",
  "authority_can_apply_fixes",
  "authority_can_commit",
  "authority_can_create_pr",
  "authority_can_merge",
] as const;

type EvidenceBooleanField = (typeof AUTHORITY_EVIDENCE_FIELDS)[number];

export interface CompanyDevOsRoleEvidence {
  repo: string;
  pr?: string;
  head: string;
  role: CompanyDevOsRoleName;
  llm: CompanyDevOsRoleProfile["llm"];
  role_profile: string;
  role_profile_hash: string;
  skill_bindings: string;
  runtime_entrypoints: string;
  authority_can_edit_files: boolean;
  authority_can_apply_fixes: boolean;
  authority_can_commit: boolean;
  authority_can_create_pr: boolean;
  authority_can_merge: boolean;
  recorded_by: string;
  recorded_at: string;
}

export type ParsedCompanyDevOsRoleEvidence = Partial<CompanyDevOsRoleEvidence> & {
  raw?: Record<string, unknown>;
};

export type CompanyDevOsRoleEvidenceFindingCode =
  | "missing_profile"
  | "invalid_json"
  | "invalid_role"
  | "invalid_profile"
  | "runtime_doctor_failed"
  | "missing_skill_binding"
  | "missing_evidence"
  | "missing_field"
  | "invalid_field"
  | "profile_hash_mismatch"
  | "skill_hash_mismatch"
  | "missing_head"
  | "stale_head"
  | "repo_mismatch"
  | "pr_mismatch"
  | "forbidden_authority";

export interface CompanyDevOsRoleEvidenceFinding {
  severity: "block";
  code: CompanyDevOsRoleEvidenceFindingCode;
  role?: string;
  path?: string;
  field?: string;
  message: string;
}

export interface RenderCompanyDevOsRoleEvidenceOptions {
  configDir?: string;
  repo: string;
  pr?: string | number;
  head: string;
  role: CompanyDevOsRoleName;
  recordedBy: string;
  recordedAt?: string;
}

export interface CompanyDevOsRoleEvidenceRenderResult {
  schema: typeof COMPANY_DEV_OS_ROLE_EVIDENCE_RENDER_SCHEMA;
  passed: boolean;
  evidence?: CompanyDevOsRoleEvidence;
  markdown?: string;
  findings: CompanyDevOsRoleEvidenceFinding[];
}

export interface DriftCheckCompanyDevOsRoleEvidenceOptions {
  configDir?: string;
  evidenceFile?: string;
  markdown?: string;
  evidence?: ParsedCompanyDevOsRoleEvidence | ParsedCompanyDevOsRoleEvidence[];
  expectedRepo?: string;
  expectedPr?: string | number;
  expectedHead?: string;
  requireHead?: boolean;
}

export interface CompanyDevOsRoleEvidenceDriftCheckResult {
  schema: typeof COMPANY_DEV_OS_ROLE_EVIDENCE_DRIFT_CHECK_SCHEMA;
  passed: boolean;
  evidence: ParsedCompanyDevOsRoleEvidence[];
  findings: CompanyDevOsRoleEvidenceFinding[];
}

export function renderCompanyDevOsRoleEvidence(
  projectDir: string,
  options: RenderCompanyDevOsRoleEvidenceOptions,
): CompanyDevOsRoleEvidenceRenderResult {
  const findings: CompanyDevOsRoleEvidenceFinding[] = [];
  const profileRecord = loadRoleProfile(projectDir, options.role, options.configDir, findings);
  if (!profileRecord) return renderResult(findings);

  const roleFindings = validateCompanyDevOsRoleProfile(
    profileRecord.profile,
    options.role,
    profileRecord.path,
  );
  if (roleFindings.length > 0) {
    for (const finding of roleFindings) {
      findings.push({
        severity: "block",
        code: "invalid_profile",
        role: finding.role,
        path: finding.path,
        field: finding.field,
        message: finding.message,
      });
    }
    return renderResult(findings);
  }

  const runtime = doctorCompanyDevOsRuntimeBindings(projectDir, {
    configDir: options.configDir,
  });
  if (!runtime.passed) {
    findings.push({
      severity: "block",
      code: "runtime_doctor_failed",
      message: "Company Dev OS runtime bindings must pass before role evidence is emitted",
    });
    return renderResult(findings);
  }

  const skillBindings = collectSkillBindings(
    profileRecord.profile.required_skills,
    runtime.repositories.flatMap((repository) => repository.files),
    findings,
  );
  if (findings.length > 0) return renderResult(findings);

  const evidence: CompanyDevOsRoleEvidence = {
    repo: options.repo,
    pr: options.pr === undefined ? undefined : String(options.pr),
    head: options.head,
    role: options.role,
    llm: profileRecord.profile.llm,
    role_profile: profileRecord.relativePath,
    role_profile_hash: hashCompanyDevOsRoleProfile(profileRecord.profile),
    skill_bindings: skillBindings,
    runtime_entrypoints: profileRecord.profile.runtime_entrypoints.join(","),
    authority_can_edit_files: profileRecord.profile.authority.can_edit_files,
    authority_can_apply_fixes: profileRecord.profile.authority.can_apply_fixes,
    authority_can_commit: profileRecord.profile.authority.can_commit,
    authority_can_create_pr: profileRecord.profile.authority.can_create_pr,
    authority_can_merge: profileRecord.profile.authority.can_merge,
    recorded_by: options.recordedBy,
    recorded_at: options.recordedAt ?? new Date().toISOString(),
  };

  return {
    schema: COMPANY_DEV_OS_ROLE_EVIDENCE_RENDER_SCHEMA,
    passed: true,
    evidence,
    markdown: formatCompanyDevOsRoleEvidence(evidence),
    findings: [],
  };
}

export function formatCompanyDevOsRoleEvidence(evidence: CompanyDevOsRoleEvidence): string {
  const lines = [`<!-- ${COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER} -->`];
  for (const field of ROLE_EVIDENCE_FIELD_ORDER) {
    const value = evidence[field];
    if (value === undefined) continue;
    lines.push(`${field}: ${String(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseCompanyDevOsRoleEvidenceMarkdown(
  markdown: string,
): ParsedCompanyDevOsRoleEvidence[] {
  const blocks: ParsedCompanyDevOsRoleEvidence[] = [];
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== `<!-- ${COMPANY_DEV_OS_ROLE_EVIDENCE_MARKER} -->`) {
      continue;
    }

    const raw: Record<string, unknown> = {};
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() === "" || line.trim().startsWith("<!--")) break;
      const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!match) break;
      raw[match[1]] = match[2];
    }
    blocks.push(normalizeRoleEvidenceRecord(raw));
  }

  return blocks;
}

export function parseCompanyDevOsRoleEvidenceJson(
  value: unknown,
): ParsedCompanyDevOsRoleEvidence[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRoleEvidenceRecord(entry));
  }
  if (isRecord(value) && Array.isArray(value.evidences)) {
    return value.evidences.map((entry) => normalizeRoleEvidenceRecord(entry));
  }
  if (isRecord(value) && isRecord(value.evidence)) {
    return [normalizeRoleEvidenceRecord(value.evidence)];
  }
  return [normalizeRoleEvidenceRecord(value)];
}

export function driftCheckCompanyDevOsRoleEvidence(
  projectDir: string,
  options: DriftCheckCompanyDevOsRoleEvidenceOptions,
): CompanyDevOsRoleEvidenceDriftCheckResult {
  const findings: CompanyDevOsRoleEvidenceFinding[] = [];
  const evidence = loadEvidence(projectDir, options, findings);
  if (evidence.length === 0) {
    findings.push({
      severity: "block",
      code: "missing_evidence",
      message: "No Company Dev OS role evidence block was found",
    });
  }

  const runtime = doctorCompanyDevOsRuntimeBindings(projectDir, {
    configDir: options.configDir,
  });
  if (!runtime.passed) {
    findings.push({
      severity: "block",
      code: "runtime_doctor_failed",
      message: "Company Dev OS runtime bindings must pass before role evidence drift can be checked",
    });
  }

  const runtimeFiles = runtime.repositories.flatMap((repository) => repository.files);
  for (const item of evidence) {
    checkEvidenceFields(item, options, findings);
    if (!item.role || !isCompanyDevOsRoleName(item.role)) continue;

    const profileRecord = loadRoleProfile(projectDir, item.role, options.configDir, findings);
    if (!profileRecord) continue;

    const currentProfileHash = hashCompanyDevOsRoleProfile(profileRecord.profile);
    if (item.role_profile_hash && item.role_profile_hash !== currentProfileHash) {
      findings.push({
        severity: "block",
        code: "profile_hash_mismatch",
        role: item.role,
        field: "role_profile_hash",
        path: profileRecord.relativePath,
        message: `Role profile hash drift for ${item.role}`,
      });
    }

    checkSkillBindings(item, runtimeFiles, findings);
    checkAuthorityClaims(item, findings);
  }

  return {
    schema: COMPANY_DEV_OS_ROLE_EVIDENCE_DRIFT_CHECK_SCHEMA,
    passed: findings.length === 0,
    evidence,
    findings,
  };
}

function renderResult(
  findings: CompanyDevOsRoleEvidenceFinding[],
): CompanyDevOsRoleEvidenceRenderResult {
  return {
    schema: COMPANY_DEV_OS_ROLE_EVIDENCE_RENDER_SCHEMA,
    passed: false,
    findings,
  };
}

function loadRoleProfile(
  projectDir: string,
  role: CompanyDevOsRoleName,
  configDirOption: string | undefined,
  findings: CompanyDevOsRoleEvidenceFinding[],
): { profile: CompanyDevOsRoleProfile; path: string; relativePath: string } | null {
  const configDir = path.resolve(projectDir, configDirOption ?? ".shirube/company-dev-os");
  const profilePath = path.join(configDir, "roles", `${role}.role.json`);
  const relativePath = path.relative(projectDir, profilePath);
  if (!fs.existsSync(profilePath)) {
    findings.push({
      severity: "block",
      code: "missing_profile",
      role,
      path: relativePath,
      message: `Missing Company Dev OS role profile for ${role}`,
    });
    return null;
  }

  try {
    return {
      profile: JSON.parse(fs.readFileSync(profilePath, "utf-8")) as CompanyDevOsRoleProfile,
      path: profilePath,
      relativePath,
    };
  } catch (error) {
    findings.push({
      severity: "block",
      code: "invalid_json",
      role,
      path: relativePath,
      message: `Invalid role profile JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  }
}

function collectSkillBindings(
  requiredSkills: string[],
  runtimeFiles: Array<{ kind: string; id?: string; sha256?: string }>,
  findings: CompanyDevOsRoleEvidenceFinding[],
): string {
  const bindings: string[] = [];
  for (const skill of requiredSkills) {
    const file = runtimeFiles.find(
      (candidate) => candidate.kind === "skill" && candidate.id === skill,
    );
    if (!file?.sha256) {
      findings.push({
        severity: "block",
        code: "missing_skill_binding",
        field: "skill_bindings",
        message: `Missing runtime skill binding hash for ${skill}`,
      });
      continue;
    }
    bindings.push(`${skill}:${file.sha256}`);
  }
  return bindings.join(",");
}

function loadEvidence(
  projectDir: string,
  options: DriftCheckCompanyDevOsRoleEvidenceOptions,
  findings: CompanyDevOsRoleEvidenceFinding[],
): ParsedCompanyDevOsRoleEvidence[] {
  if (options.evidence) {
    return Array.isArray(options.evidence) ? options.evidence : [options.evidence];
  }
  if (options.markdown) {
    return parseCompanyDevOsRoleEvidenceMarkdown(options.markdown);
  }
  if (!options.evidenceFile) return [];

  const evidencePath = path.resolve(projectDir, options.evidenceFile);
  let content: string;
  try {
    content = fs.readFileSync(evidencePath, "utf-8");
  } catch (error) {
    findings.push({
      severity: "block",
      code: "missing_evidence",
      path: options.evidenceFile,
      message: `Unable to read evidence file: ${error instanceof Error ? error.message : String(error)}`,
    });
    return [];
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseCompanyDevOsRoleEvidenceJson(JSON.parse(content));
    } catch (error) {
      findings.push({
        severity: "block",
        code: "invalid_json",
        path: options.evidenceFile,
        message: `Invalid role evidence JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      return [];
    }
  }
  return parseCompanyDevOsRoleEvidenceMarkdown(content);
}

function normalizeRoleEvidenceRecord(value: unknown): ParsedCompanyDevOsRoleEvidence {
  if (!isRecord(value)) return { raw: {} };
  const evidence: ParsedCompanyDevOsRoleEvidence = { raw: value };

  for (const field of ROLE_EVIDENCE_FIELD_ORDER) {
    const raw = value[field];
    if (raw === undefined || raw === null) continue;
    if (isEvidenceBooleanField(field)) {
      evidence[field] = parseEvidenceBoolean(raw);
      continue;
    }
    if (field === "role") {
      evidence.role = typeof raw === "string" && isCompanyDevOsRoleName(raw) ? raw : undefined;
      continue;
    }
    evidence[field] = String(raw).trim() as never;
  }

  return evidence;
}

function checkEvidenceFields(
  evidence: ParsedCompanyDevOsRoleEvidence,
  options: DriftCheckCompanyDevOsRoleEvidenceOptions,
  findings: CompanyDevOsRoleEvidenceFinding[],
): void {
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (field === "head" && !evidence.head && !requiresHead(evidence, options)) {
      continue;
    }
    if (evidence[field] === undefined || evidence[field] === "") {
      findings.push({
        severity: "block",
        code: field === "head" ? "missing_head" : "missing_field",
        role: evidence.role,
        field,
        message: field === "head" ? "Role evidence is missing exact head" : `Role evidence missing ${field}`,
      });
    }
  }

  if (evidence.raw?.role !== undefined && !evidence.role) {
    findings.push({
      severity: "block",
      code: "invalid_role",
      field: "role",
      message: `Role evidence has invalid role: ${String(evidence.raw.role)}`,
    });
  }

  if (options.expectedRepo && evidence.repo && evidence.repo !== options.expectedRepo) {
    findings.push({
      severity: "block",
      code: "repo_mismatch",
      role: evidence.role,
      field: "repo",
      message: `Role evidence repo ${evidence.repo} does not match ${options.expectedRepo}`,
    });
  }

  if (
    options.expectedPr !== undefined &&
    evidence.pr &&
    evidence.pr !== String(options.expectedPr)
  ) {
    findings.push({
      severity: "block",
      code: "pr_mismatch",
      role: evidence.role,
      field: "pr",
      message: `Role evidence PR ${evidence.pr} does not match ${String(options.expectedPr)}`,
    });
  }

  if (options.expectedHead) {
    if (!evidence.head) {
      findings.push({
        severity: "block",
        code: "missing_head",
        role: evidence.role,
        field: "head",
        message: "Role evidence is missing exact head",
      });
    } else if (evidence.head !== options.expectedHead) {
      findings.push({
        severity: "block",
        code: "stale_head",
        role: evidence.role,
        field: "head",
        message: `Role evidence head ${evidence.head} does not match ${options.expectedHead}`,
      });
    }
  }
}

function checkSkillBindings(
  evidence: ParsedCompanyDevOsRoleEvidence,
  runtimeFiles: Array<{ kind: string; id?: string; sha256?: string }>,
  findings: CompanyDevOsRoleEvidenceFinding[],
): void {
  if (!evidence.skill_bindings) return;
  for (const binding of evidence.skill_bindings.split(",").filter(Boolean)) {
    const [id, hash] = binding.split(":");
    const runtimeFile = runtimeFiles.find(
      (candidate) => candidate.kind === "skill" && candidate.id === id,
    );
    if (!id || !hash || !runtimeFile?.sha256) {
      findings.push({
        severity: "block",
        code: "missing_skill_binding",
        role: evidence.role,
        field: "skill_bindings",
        message: `Missing current skill binding for ${id || binding}`,
      });
      continue;
    }
    if (runtimeFile.sha256 !== hash) {
      findings.push({
        severity: "block",
        code: "skill_hash_mismatch",
        role: evidence.role,
        field: "skill_bindings",
        message: `Skill binding hash drift for ${id}`,
      });
    }
  }
}

function checkAuthorityClaims(
  evidence: ParsedCompanyDevOsRoleEvidence,
  findings: CompanyDevOsRoleEvidenceFinding[],
): void {
  for (const field of AUTHORITY_EVIDENCE_FIELDS) {
    if (evidence[field] !== true) continue;
    if (evidence.role !== "implementation" || field === "authority_can_merge") {
      findings.push({
        severity: "block",
        code: "forbidden_authority",
        role: evidence.role,
        field,
        message: `${evidence.role ?? "unknown role"} evidence must not claim ${field}=true`,
      });
    }
  }
}

function requiresHead(
  evidence: ParsedCompanyDevOsRoleEvidence,
  options: DriftCheckCompanyDevOsRoleEvidenceOptions,
): boolean {
  return options.requireHead === true || options.expectedHead !== undefined || evidence.pr !== undefined;
}

function parseEvidenceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  if (value.trim() === "true") return true;
  if (value.trim() === "false") return false;
  return undefined;
}

function isEvidenceBooleanField(field: string): field is EvidenceBooleanField {
  return (AUTHORITY_EVIDENCE_FIELDS as readonly string[]).includes(field);
}

function isCompanyDevOsRoleName(value: string): value is CompanyDevOsRoleName {
  return (COMPANY_DEV_OS_ROLE_NAMES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
