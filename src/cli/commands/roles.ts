import { type Command } from "commander";
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
  validateCompanyDevOsRoleProfiles,
  type CompanyDevOsRoleProfileValidationResult,
} from "../lib/company-dev-os-role-profile.js";
import { logger } from "../lib/logger.js";

interface ValidateRolesOptions {
  json?: boolean;
  configDir?: string;
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
    .action(() => {
      const ready = doctorRoles(process.cwd());
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

function doctorRoles(projectDir: string): boolean {
  const result = resolveRequiredRoles(loadFrameworkConfig(projectDir));
  logger.header("Shirube Role Readiness");

  if (result.status === "ready") {
    const violations = validateRoleSeparation(result.bindings);
    if (violations.length > 0) {
      logger.error("Producer and gate/review/L3 authority roles are not separated.");
      for (const violation of violations) {
        logger.info(`  - ${formatRoleSeparationViolation(violation)}`);
      }
      logger.info("");
      logger.info("Use distinct targets before `shirube start --audit-level standard|strict`.");
      return false;
    }

    logger.success("All required orchestration roles are configured.");
    return true;
  }

  logger.error("Required orchestration roles are not ready.");
  if (result.missingRoles.length > 0) {
    logger.info(`  Missing roles: ${result.missingRoles.join(", ")}`);
  }
  if (result.placeholderRoles.length > 0) {
    logger.info(`  Placeholder roles: ${result.placeholderRoles.join(", ")}`);
  }
  logger.info("");
  logger.info("Configure roles before `shirube start --audit-level strict`:");
  logger.info("  shirube roles set auditor --type mcp_agent --id <agent-id>");
  return false;
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

function parseTargetType(value: string | undefined): RoleTargetType {
  if (value && (ROLE_TARGET_TYPES as readonly string[]).includes(value)) {
    return value as RoleTargetType;
  }
  logger.error(`Invalid role target type: ${value ?? "(missing)"}`);
  logger.info(`Valid types: ${ROLE_TARGET_TYPES.join(", ")}`);
  process.exit(1);
}
