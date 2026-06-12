import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const COMPANY_DEV_OS_RUNTIME_BINDINGS_SCHEMA =
  "shirube-company-dev-os-runtime-bindings/v1";
export const COMPANY_DEV_OS_RUNTIME_BINDING_DOCTOR_SCHEMA =
  "shirube-company-dev-os-runtime-binding-doctor/v1";

export interface CompanyDevOsSkillBinding {
  id: string;
  path: string;
  source_path?: string;
  expected_hash?: string;
}

export interface CompanyDevOsRepositoryRuntimeBinding {
  repo: string;
  codex_entrypoints?: string[];
  claude_entrypoints?: string[];
  routing_entrypoints?: string[];
  required_skills?: CompanyDevOsSkillBinding[];
  expected_hashes?: Record<string, string>;
}

export interface CompanyDevOsRuntimeBindings {
  schema: typeof COMPANY_DEV_OS_RUNTIME_BINDINGS_SCHEMA;
  repositories: CompanyDevOsRepositoryRuntimeBinding[];
  restart_requirement?: {
    must_survive_session_restart?: boolean;
    must_survive_context_compaction?: boolean;
    startup_recovery_required?: boolean;
  };
}

export type CompanyDevOsRuntimeBindingFindingCode =
  | "missing_bindings_file"
  | "invalid_json"
  | "invalid_schema"
  | "missing_repository"
  | "missing_field"
  | "invalid_field"
  | "missing_entrypoint"
  | "unreadable_entrypoint"
  | "missing_skill"
  | "unreadable_skill"
  | "hash_mismatch";

export interface CompanyDevOsRuntimeBindingFinding {
  severity: "block";
  code: CompanyDevOsRuntimeBindingFindingCode;
  repo?: string;
  path?: string;
  field?: string;
  message: string;
}

export interface CompanyDevOsRuntimeCheckedFile {
  kind: "codex_entrypoint" | "claude_entrypoint" | "routing_entrypoint" | "skill" | "skill_source";
  id?: string;
  path: string;
  exists: boolean;
  readable: boolean;
  sha256?: string;
  expected_hash?: string;
}

export interface CompanyDevOsRuntimeRepositoryReport {
  repo: string;
  files: CompanyDevOsRuntimeCheckedFile[];
}

export interface CompanyDevOsRuntimeBindingDoctorResult {
  schema: typeof COMPANY_DEV_OS_RUNTIME_BINDING_DOCTOR_SCHEMA;
  passed: boolean;
  config_dir: string;
  bindings_path: string;
  repositories: CompanyDevOsRuntimeRepositoryReport[];
  findings: CompanyDevOsRuntimeBindingFinding[];
}

export interface DoctorCompanyDevOsRuntimeBindingsOptions {
  configDir?: string;
}

export function doctorCompanyDevOsRuntimeBindings(
  projectDir: string,
  options: DoctorCompanyDevOsRuntimeBindingsOptions = {},
): CompanyDevOsRuntimeBindingDoctorResult {
  const configDir = path.resolve(
    projectDir,
    options.configDir ?? ".shirube/company-dev-os",
  );
  const bindingsPath = path.join(configDir, "runtime-bindings.json");
  const findings: CompanyDevOsRuntimeBindingFinding[] = [];
  const repositories: CompanyDevOsRuntimeRepositoryReport[] = [];

  const missingResult = (): CompanyDevOsRuntimeBindingDoctorResult => ({
    schema: COMPANY_DEV_OS_RUNTIME_BINDING_DOCTOR_SCHEMA,
    passed: false,
    config_dir: path.relative(projectDir, configDir) || ".",
    bindings_path: path.relative(projectDir, bindingsPath),
    repositories,
    findings,
  });

  if (!fs.existsSync(bindingsPath)) {
    findings.push({
      severity: "block",
      code: "missing_bindings_file",
      path: bindingsPath,
      message: "Missing Company Dev OS runtime bindings file",
    });
    return missingResult();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(bindingsPath, "utf-8"));
  } catch (error) {
    findings.push({
      severity: "block",
      code: "invalid_json",
      path: bindingsPath,
      message: `Invalid runtime bindings JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    return missingResult();
  }

  if (!isRecord(parsed)) {
    findings.push({
      severity: "block",
      code: "invalid_field",
      path: bindingsPath,
      message: "Runtime bindings must be a JSON object",
    });
    return missingResult();
  }

  if (parsed.schema !== COMPANY_DEV_OS_RUNTIME_BINDINGS_SCHEMA) {
    findings.push({
      severity: "block",
      code: "invalid_schema",
      path: bindingsPath,
      field: "schema",
      message: `Runtime bindings schema must be ${COMPANY_DEV_OS_RUNTIME_BINDINGS_SCHEMA}`,
    });
  }

  if (!Array.isArray(parsed.repositories) || parsed.repositories.length === 0) {
    findings.push({
      severity: "block",
      code: "missing_repository",
      path: bindingsPath,
      field: "repositories",
      message: "Runtime bindings must declare at least one repository",
    });
  } else {
    for (const repository of parsed.repositories) {
      repositories.push(checkRepositoryRuntimeBinding(projectDir, repository, findings));
    }
  }

  return {
    schema: COMPANY_DEV_OS_RUNTIME_BINDING_DOCTOR_SCHEMA,
    passed: findings.length === 0,
    config_dir: path.relative(projectDir, configDir) || ".",
    bindings_path: path.relative(projectDir, bindingsPath),
    repositories,
    findings,
  };
}

export function hashNormalizedText(content: string): string {
  return crypto
    .createHash("sha256")
    .update(content.replace(/\r\n/g, "\n"), "utf-8")
    .digest("hex");
}

function checkRepositoryRuntimeBinding(
  projectDir: string,
  value: unknown,
  findings: CompanyDevOsRuntimeBindingFinding[],
): CompanyDevOsRuntimeRepositoryReport {
  if (!isRecord(value)) {
    findings.push({
      severity: "block",
      code: "invalid_field",
      message: "Repository runtime binding must be an object",
    });
    return { repo: "(invalid)", files: [] };
  }

  const repo = typeof value.repo === "string" && value.repo.trim()
    ? value.repo.trim()
    : "(missing)";
  if (repo === "(missing)") {
    findings.push({
      severity: "block",
      code: "missing_field",
      field: "repo",
      message: "Repository runtime binding requires repo",
    });
  }

  const expectedHashes = isStringRecord(value.expected_hashes) ? value.expected_hashes : {};
  const files: CompanyDevOsRuntimeCheckedFile[] = [];

  for (const item of collectEntryPoints(value, "codex_entrypoints")) {
    files.push(checkFile(projectDir, repo, item, "codex_entrypoint", expectedHashes[item], findings));
  }
  for (const item of collectEntryPoints(value, "claude_entrypoints")) {
    files.push(checkFile(projectDir, repo, item, "claude_entrypoint", expectedHashes[item], findings));
  }
  for (const item of collectEntryPoints(value, "routing_entrypoints")) {
    files.push(checkFile(projectDir, repo, item, "routing_entrypoint", expectedHashes[item], findings));
  }

  if (Array.isArray(value.required_skills)) {
    for (const skill of value.required_skills) {
      files.push(...checkSkill(projectDir, repo, skill, findings));
    }
  } else {
    findings.push({
      severity: "block",
      code: value.required_skills === undefined ? "missing_field" : "invalid_field",
      repo,
      field: "required_skills",
      message: "Repository runtime binding requires required_skills array",
    });
  }

  return { repo, files };
}

function checkSkill(
  projectDir: string,
  repo: string,
  value: unknown,
  findings: CompanyDevOsRuntimeBindingFinding[],
): CompanyDevOsRuntimeCheckedFile[] {
  if (!isRecord(value)) {
    findings.push({
      severity: "block",
      code: "invalid_field",
      repo,
      field: "required_skills",
      message: "Skill binding must be an object",
    });
    return [];
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : undefined;
  const skillPath = typeof value.path === "string" ? value.path : "";
  const sourcePath = typeof value.source_path === "string" ? value.source_path : undefined;
  const expectedHash = typeof value.expected_hash === "string" ? value.expected_hash : undefined;

  if (!id) {
    findings.push({
      severity: "block",
      code: "missing_field",
      repo,
      field: "required_skills.id",
      message: "Skill binding requires id",
    });
  }
  if (!skillPath) {
    findings.push({
      severity: "block",
      code: "missing_field",
      repo,
      field: "required_skills.path",
      message: "Skill binding requires path",
    });
    return [];
  }

  const files = [
    checkFile(projectDir, repo, skillPath, "skill", expectedHash, findings, id),
  ];
  if (sourcePath) {
    files.push(checkFile(projectDir, repo, sourcePath, "skill_source", undefined, findings, id));
  }
  return files;
}

function checkFile(
  projectDir: string,
  repo: string,
  filePath: string,
  kind: CompanyDevOsRuntimeCheckedFile["kind"],
  expectedHash: string | undefined,
  findings: CompanyDevOsRuntimeBindingFinding[],
  id?: string,
): CompanyDevOsRuntimeCheckedFile {
  const relativePath = filePath.trim();
  const absolutePath = path.resolve(projectDir, relativePath);
  const missingCode = kind === "skill" || kind === "skill_source" ? "missing_skill" : "missing_entrypoint";
  const unreadableCode = kind === "skill" || kind === "skill_source" ? "unreadable_skill" : "unreadable_entrypoint";

  if (!relativePath || !fs.existsSync(absolutePath)) {
    findings.push({
      severity: "block",
      code: missingCode,
      repo,
      path: relativePath || filePath,
      message: `Missing ${kind} file: ${relativePath || filePath}`,
    });
    return {
      kind,
      id,
      path: relativePath || filePath,
      exists: false,
      readable: false,
      expected_hash: expectedHash,
    };
  }

  try {
    fs.accessSync(absolutePath, fs.constants.R_OK);
  } catch {
    findings.push({
      severity: "block",
      code: unreadableCode,
      repo,
      path: relativePath,
      message: `Unreadable ${kind} file: ${relativePath}`,
    });
    return {
      kind,
      id,
      path: relativePath,
      exists: true,
      readable: false,
      expected_hash: expectedHash,
    };
  }

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    findings.push({
      severity: "block",
      code: unreadableCode,
      repo,
      path: relativePath,
      message: `Unreadable ${kind} file: ${relativePath}`,
    });
    return {
      kind,
      id,
      path: relativePath,
      exists: true,
      readable: false,
      expected_hash: expectedHash,
    };
  }

  const sha256 = hashNormalizedText(content);
  if (expectedHash && expectedHash !== sha256) {
    findings.push({
      severity: "block",
      code: "hash_mismatch",
      repo,
      path: relativePath,
      message: `Hash mismatch for ${relativePath}`,
    });
  }

  return {
    kind,
    id,
    path: relativePath,
    exists: true,
    readable: true,
    sha256,
    expected_hash: expectedHash,
  };
}

function collectEntryPoints(value: Record<string, unknown>, field: string): string[] {
  const raw = value[field];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
