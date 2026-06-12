import { type Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  formatRoleSeparationViolation,
  loadFrameworkConfig,
  REQUIRED_ROLE_NAMES,
  resolveRequiredRoles,
  ROLE_TARGET_TYPES,
  saveFrameworkConfig,
  validateRoleSeparation,
  type RequiredRoleName,
  type RoleBinding,
  type RoleTargetType,
} from "../lib/workflow-config.js";
import {
  COMPANY_DEV_OS_ROLE_NAMES,
  type CompanyDevOsRoleName,
  validateCompanyDevOsRoleProfiles,
  type CompanyDevOsRoleProfileValidationResult,
} from "../lib/company-dev-os-role-profile.js";
import {
  driftCheckCompanyDevOsRoleEvidence,
  renderCompanyDevOsRoleEvidence,
  type CompanyDevOsRoleEvidenceDriftCheckResult,
  type CompanyDevOsRoleEvidenceRenderResult,
} from "../lib/company-dev-os-role-evidence.js";
import {
  doctorCompanyDevOsRuntimeBindings,
  type CompanyDevOsRuntimeBindingDoctorResult,
} from "../lib/company-dev-os-runtime-binding.js";
import { logger } from "../lib/logger.js";

interface ValidateRolesOptions {
  json?: boolean;
  configDir?: string;
}

interface DoctorRolesOptions {
  json?: boolean;
  companyDevOs?: boolean;
  configDir?: string;
}

interface RoleEvidenceOptions {
  json?: boolean;
  configDir?: string;
  repo?: string;
  pr?: string;
  head?: string;
  recordedBy?: string;
  recordedAt?: string;
}

interface RoleDriftCheckOptions {
  json?: boolean;
  configDir?: string;
  evidenceFile?: string;
  repo?: string;
  pr?: string;
  head?: string;
  requireHead?: boolean;
}

interface SetRoleOptions {
  type?: string;
  id?: string;
  reason?: string;
}

interface UnsetRoleOptions {
  reason?: string;
}

export function registerRolesCommand(program: Command): void {
  const roles = program
    .command("roles")
    .description("Manage Shirube orchestration role bindings");

  roles
    .command("list")
    .description("List configured role bindings")
    .action(() => {
      listRoles(process.cwd());
    });

  roles
    .command("doctor")
    .description("Check whether required orchestration roles are ready")
    .option("--json", "Emit machine-readable JSON")
    .option("--company-dev-os", "Require Company Dev OS runtime binding checks")
    .option(
      "--config-dir <path>",
      "Company Dev OS config directory",
      ".shirube/company-dev-os",
    )
    .action((options: DoctorRolesOptions) => {
      const ready = doctorRoles(process.cwd(), options);
      if (!ready) process.exit(1);
    });

  roles
    .command("validate")
    .description("Validate Company Dev OS role profiles")
    .option("--json", "Emit machine-readable JSON")
    .option(
      "--config-dir <path>",
      "Company Dev OS config directory",
      ".shirube/company-dev-os",
    )
    .action((options: ValidateRolesOptions) => {
      const passed = validateCompanyDevOsRoles(process.cwd(), options);
      if (!passed) process.exit(1);
    });

  roles
    .command("evidence")
    .description("Emit a Company Dev OS role evidence block")
    .argument("<role>", `Company Dev OS role (${COMPANY_DEV_OS_ROLE_NAMES.join("|")})`)
    .requiredOption("--repo <repo>", "Repository full name")
    .requiredOption("--head <sha>", "Exact head SHA for the evidence")
    .requiredOption("--recorded-by <actor>", "Actor recording the evidence")
    .option("--pr <number>", "Pull request number")
    .option("--recorded-at <iso8601>", "Evidence timestamp")
    .option("--json", "Emit machine-readable JSON")
    .option(
      "--config-dir <path>",
      "Company Dev OS config directory",
      ".shirube/company-dev-os",
    )
    .action((roleInput: string, options: RoleEvidenceOptions) => {
      const passed = emitCompanyDevOsRoleEvidence(process.cwd(), roleInput, options);
      if (!passed) process.exit(1);
    });

  roles
    .command("drift-check")
    .description("Check Company Dev OS role evidence against current role and skill hashes")
    .requiredOption("--evidence-file <path>", "Markdown or JSON role evidence fixture")
    .option("--repo <repo>", "Expected repository full name")
    .option("--pr <number>", "Expected pull request number")
    .option("--head <sha>", "Expected exact head SHA")
    .option("--require-head", "Block evidence without exact head")
    .option("--json", "Emit machine-readable JSON")
    .option(
      "--config-dir <path>",
      "Company Dev OS config directory",
      ".shirube/company-dev-os",
    )
    .action((options: RoleDriftCheckOptions) => {
      const passed = driftCheckCompanyDevOsRoles(process.cwd(), options);
      if (!passed) process.exit(1);
    });

  roles
    .command("set")
    .description("Set one role binding")
    .argument("<role>", `Role name (${REQUIRED_ROLE_NAMES.join("|")})`)
    .requiredOption("--type <type>", `Target type (${ROLE_TARGET_TYPES.join("|")})`)
    .requiredOption("--id <id>", "Target identifier")
    .option("--reason <reason>", "Reason for changing the role binding")
    .action((role: string, options: SetRoleOptions) => {
      setRole(process.cwd(), role, options);
    });

  roles
    .command("unset")
    .description("Unset one role binding back to a placeholder")
    .argument("<role>", `Role name (${REQUIRED_ROLE_NAMES.join("|")})`)
    .option("--reason <reason>", "Reason for changing the role binding")
    .action((role: string, options: UnsetRoleOptions) => {
      unsetRole(process.cwd(), role, options);
    });
}

function listRoles(projectDir: string): void {
  const config = loadFrameworkConfig(projectDir);
  const bindings = config.roles?.bindings ?? {};

  logger.header("Shirube Roles");
  for (const role of REQUIRED_ROLE_NAMES) {
    const binding = bindings[role];
    if (!binding) {
      logger.info(`  ${role}: missing`);
      continue;
    }
    const placeholder = binding.placeholder ? " placeholder" : "";
    logger.info(`  ${role}: ${binding.type}:${binding.id}${placeholder}`);
  }
}

function doctorRoles(projectDir: string, options: DoctorRolesOptions = {}): boolean {
  const readiness = evaluateRoleReadiness(projectDir);
  const shouldRunCompanyDevOs =
    options.companyDevOs === true || hasCompanyDevOsConfigDir(projectDir, options.configDir);
  const companyDevOs = shouldRunCompanyDevOs
    ? doctorCompanyDevOsRuntimeBindings(projectDir, { configDir: options.configDir })
    : null;
  const passed = readiness.passed && (companyDevOs?.passed ?? true);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        schema: "shirube-roles-doctor/v1",
        passed,
        orchestration: readiness,
        company_dev_os: companyDevOs,
      }, null, 2)}\n`,
    );
    return passed;
  }

  printRoleReadiness(readiness);
  if (companyDevOs) {
    printCompanyDevOsRuntimeDoctor(companyDevOs);
  }
  return passed;
}

function evaluateRoleReadiness(projectDir: string): {
  passed: boolean;
  status: "ready" | "not_ready";
  missing_roles: RequiredRoleName[];
  placeholder_roles: RequiredRoleName[];
  separation_violations: string[];
} {
  const result = resolveRequiredRoles(loadFrameworkConfig(projectDir));
  if (result.status !== "ready") {
    return {
      passed: false,
      status: "not_ready",
      missing_roles: result.missingRoles,
      placeholder_roles: result.placeholderRoles,
      separation_violations: [],
    };
  }

  const violations = validateRoleSeparation(result.bindings);
  return {
    passed: violations.length === 0,
    status: "ready",
    missing_roles: [],
    placeholder_roles: [],
    separation_violations: violations.map(formatRoleSeparationViolation),
  };
}

function printRoleReadiness(readiness: ReturnType<typeof evaluateRoleReadiness>): void {
  logger.header("Shirube Role Readiness");

  if (readiness.passed) {
    logger.success("All required orchestration roles are configured.");
    return;
  }

  if (readiness.separation_violations.length > 0) {
    logger.error("Producer and gate/review/L3 authority roles are not separated.");
    for (const violation of readiness.separation_violations) {
      logger.info(`  - ${violation}`);
    }
    logger.info("");
    logger.info("Use distinct targets before `shirube start --audit-level standard|strict`.");
    return;
  }

  logger.error("Required orchestration roles are not ready.");
  if (readiness.missing_roles.length > 0) {
    logger.info(`  Missing roles: ${readiness.missing_roles.join(", ")}`);
  }
  if (readiness.placeholder_roles.length > 0) {
    logger.info(`  Placeholder roles: ${readiness.placeholder_roles.join(", ")}`);
  }
  logger.info("");
  logger.info("Configure roles before `shirube start --audit-level strict`:");
  logger.info("  shirube roles set auditor --type mcp_agent --id <agent-id>");
}

function printCompanyDevOsRuntimeDoctor(result: CompanyDevOsRuntimeBindingDoctorResult): void {
  logger.header("Company Dev OS Runtime Bindings");
  logger.info(`  Config: ${result.config_dir}`);
  logger.info(`  Bindings: ${result.bindings_path}`);

  if (result.passed) {
    logger.success("Company Dev OS runtime bindings are valid.");
    for (const repository of result.repositories) {
      logger.info(`  ${repository.repo}: ${repository.files.length} runtime file(s) checked`);
    }
    return;
  }

  logger.error("Company Dev OS runtime bindings are invalid.");
  for (const finding of result.findings) {
    const repo = finding.repo ? `${finding.repo}: ` : "";
    const filePath = finding.path ? ` (${finding.path})` : "";
    logger.info(`  - ${repo}${finding.code}${filePath}: ${finding.message}`);
  }
}

function hasCompanyDevOsConfigDir(projectDir: string, configDir = ".shirube/company-dev-os"): boolean {
  return fs.existsSync(path.resolve(projectDir, configDir));
}

function validateCompanyDevOsRoles(
  projectDir: string,
  options: ValidateRolesOptions,
): boolean {
  const result = validateCompanyDevOsRoleProfiles(projectDir, {
    configDir: options.configDir,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.passed;
  }

  printCompanyDevOsRoleValidation(result);
  return result.passed;
}

function printCompanyDevOsRoleValidation(
  result: CompanyDevOsRoleProfileValidationResult,
): void {
  logger.header("Company Dev OS Role Profiles");
  logger.info(`  Config: ${result.config_dir}`);
  logger.info(`  Required roles: ${result.required_roles.join(", ")}`);

  if (result.passed) {
    logger.success("All Company Dev OS role profiles are valid.");
    for (const profile of result.profiles) {
      logger.info(
        `  ${profile.role}: ${profile.path} ${profile.role_profile_hash.slice(0, 12)}`,
      );
    }
    return;
  }

  logger.error("Company Dev OS role profiles are invalid.");
  for (const finding of result.findings) {
    const role = finding.role ? `${finding.role}: ` : "";
    const field = finding.field ? ` (${finding.field})` : "";
    logger.info(`  - ${role}${finding.code}${field}: ${finding.message}`);
  }
}

function emitCompanyDevOsRoleEvidence(
  projectDir: string,
  roleInput: string,
  options: RoleEvidenceOptions,
): boolean {
  const role = parseCompanyDevOsRole(roleInput);
  const result = renderCompanyDevOsRoleEvidence(projectDir, {
    configDir: options.configDir,
    repo: options.repo ?? "",
    pr: options.pr,
    head: options.head ?? "",
    role,
    recordedBy: options.recordedBy ?? "",
    recordedAt: options.recordedAt,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.passed;
  }

  printCompanyDevOsRoleEvidence(result);
  return result.passed;
}

function driftCheckCompanyDevOsRoles(
  projectDir: string,
  options: RoleDriftCheckOptions,
): boolean {
  const result = driftCheckCompanyDevOsRoleEvidence(projectDir, {
    configDir: options.configDir,
    evidenceFile: options.evidenceFile,
    expectedRepo: options.repo,
    expectedPr: options.pr,
    expectedHead: options.head,
    requireHead: options.requireHead,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.passed;
  }

  printCompanyDevOsRoleDriftCheck(result);
  return result.passed;
}

function printCompanyDevOsRoleEvidence(
  result: CompanyDevOsRoleEvidenceRenderResult,
): void {
  if (result.passed && result.markdown) {
    process.stdout.write(result.markdown);
    return;
  }

  logger.header("Company Dev OS Role Evidence");
  logger.error("Role evidence could not be emitted.");
  for (const finding of result.findings) {
    const role = finding.role ? `${finding.role}: ` : "";
    const field = finding.field ? ` (${finding.field})` : "";
    logger.info(`  - ${role}${finding.code}${field}: ${finding.message}`);
  }
}

function printCompanyDevOsRoleDriftCheck(
  result: CompanyDevOsRoleEvidenceDriftCheckResult,
): void {
  logger.header("Company Dev OS Role Evidence Drift Check");

  if (result.passed) {
    logger.success("Role evidence matches current role profiles and skill bindings.");
    for (const evidence of result.evidence) {
      logger.info(`  ${evidence.role ?? "unknown"}: ${evidence.repo ?? "unknown repo"}`);
    }
    return;
  }

  logger.error("Role evidence is missing, stale, or authority-invalid.");
  for (const finding of result.findings) {
    const role = finding.role ? `${finding.role}: ` : "";
    const field = finding.field ? ` (${finding.field})` : "";
    logger.info(`  - ${role}${finding.code}${field}: ${finding.message}`);
  }
}

function setRole(
  projectDir: string,
  roleInput: string,
  options: SetRoleOptions,
): void {
  const role = parseRole(roleInput);
  const type = parseTargetType(options.type);
  const id = options.id?.trim();
  if (!id) {
    logger.error("--id is required");
    process.exit(1);
  }

  const config = loadFrameworkConfig(projectDir);
  config.roles ??= {};
  config.roles.bindings ??= {};
  const binding: RoleBinding = { type, id };
  config.roles.bindings[role] = binding;
  saveFrameworkConfig(projectDir, config);

  logger.success(`Set ${role} -> ${type}:${id}`);
  if (options.reason) {
    logger.info(`  Reason: ${options.reason}`);
  }
  doctorRoles(projectDir);
}

function unsetRole(
  projectDir: string,
  roleInput: string,
  options: UnsetRoleOptions,
): void {
  const role = parseRole(roleInput);
  const config = loadFrameworkConfig(projectDir);
  config.roles ??= {};
  config.roles.bindings ??= {};
  config.roles.bindings[role] = {
    type: "external",
    id: `todo-${role.split("_").join("-")}`,
    placeholder: true,
  };
  saveFrameworkConfig(projectDir, config);

  logger.success(`Unset ${role}`);
  if (options.reason) {
    logger.info(`  Reason: ${options.reason}`);
  }
  doctorRoles(projectDir);
}

function parseRole(value: string): RequiredRoleName {
  if ((REQUIRED_ROLE_NAMES as readonly string[]).includes(value)) {
    return value as RequiredRoleName;
  }
  logger.error(`Invalid role: ${value}`);
  logger.info(`Valid roles: ${REQUIRED_ROLE_NAMES.join(", ")}`);
  process.exit(1);
}

function parseCompanyDevOsRole(value: string): CompanyDevOsRoleName {
  if ((COMPANY_DEV_OS_ROLE_NAMES as readonly string[]).includes(value)) {
    return value as CompanyDevOsRoleName;
  }
  logger.error(`Invalid Company Dev OS role: ${value}`);
  logger.info(`Valid roles: ${COMPANY_DEV_OS_ROLE_NAMES.join(", ")}`);
  process.exit(1);
}

function parseTargetType(value: string | undefined): RoleTargetType {
  if (value && (ROLE_TARGET_TYPES as readonly string[]).includes(value)) {
    return value as RoleTargetType;
  }
  logger.error(`Invalid role target type: ${value ?? "(missing)"}`);
  logger.info(`Valid types: ${ROLE_TARGET_TYPES.join(", ")}`);
  process.exit(1);
}
