import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import { loadProfileType } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";
import { activateFrameworkMode, getFrameworkMode } from "../lib/framework-mode.js";
import {
  formatRoleSeparationViolation,
  loadFrameworkConfig,
  resolveRequiredRoles,
  validateRoleSeparation,
  type RequiredRoleName,
  type RoleSeparationViolation,
} from "../lib/workflow-config.js";

type QualityMode = "single-agent" | "multi-agent";
type AuditLevel = "minimal" | "standard" | "strict";

interface StartOptions {
  feature?: string;
  qualityMode?: string;
  auditLevel?: string;
  dryRun?: boolean;
  resume?: boolean;
  force?: boolean;
}

interface SessionState {
  version: 1;
  mode: "framework-led";
  startedAt: string;
  feature: string | null;
  qualityMode: QualityMode;
  auditLevel: AuditLevel;
  reviewChain: ReviewLayer[];
  readiness: StartReadiness;
  phase: "ready";
  authority: {
    producerCanApproveGate: false;
    gateApprovalRequires: Array<"/gate-design" | "/gate-quality" | "/review">;
    userApprovalRequiredBeforeGate: true;
  };
  nextAction: string;
}

interface StartReadiness {
  status: "ready" | "warning" | "blocked";
  missingRoles: RequiredRoleName[];
  placeholderRoles: RequiredRoleName[];
  roleSeparationViolations: RoleSeparationViolation[];
  message: string;
}

interface ReviewLayer {
  layer: "L0" | "L1" | "L2" | "L3" | "L4";
  owner: string;
  purpose: string;
  required: boolean;
  canBlock: boolean;
}

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start framework-led development in an applied Shirube project")
    .argument("[path]", "Path to project (default: current directory)")
    .option("--feature <id>", "Feature/task identifier to start with")
    .option(
      "--quality-mode <mode>",
      "Quality mode: single-agent or multi-agent",
      "multi-agent",
    )
    .option(
      "--audit-level <level>",
      "Audit depth: minimal, standard, or strict",
      "standard",
    )
    .option("--resume", "Resume the existing framework-led session")
    .option("--force", "Replace an existing framework-led session")
    .option("--dry-run", "Show start state without writing .framework/current-session.json")
    .action(async (targetPath: string | undefined, options: StartOptions) => {
      const projectDir = targetPath
        ? path.resolve(process.cwd(), targetPath)
        : process.cwd();

      const qualityMode = parseQualityMode(options.qualityMode);
      if (!qualityMode) {
        logger.error("--quality-mode must be single-agent or multi-agent");
        process.exit(1);
      }
      const auditLevel = parseAuditLevel(options.auditLevel);
      if (!auditLevel) {
        logger.error("--audit-level must be minimal, standard, or strict");
        process.exit(1);
      }
      if (qualityMode === "single-agent" && auditLevel === "strict") {
        logger.error("--quality-mode single-agent cannot be used with --audit-level strict");
        logger.info("Use --quality-mode multi-agent for strict framework, spec, cross-cutting, or merge-authority changes.");
        process.exit(1);
      }

      const frameworkDir = path.join(projectDir, ".framework");
      const projectJsonPath = path.join(frameworkDir, "project.json");
      const sessionPath = path.join(frameworkDir, "current-session.json");
      if (!fs.existsSync(projectJsonPath)) {
        logger.header("Framework Start");
        logger.warn("This project is not applied to Shirube yet.");
        logger.info("");
        logger.info("Apply the framework first:");
        logger.info(`  framework retrofit ${projectDir} --generate`);
        logger.info("");
        logger.info("Then start framework-led development:");
        logger.info(`  framework start ${projectDir}${options.feature ? ` --feature ${options.feature}` : ""}`);
        process.exit(1);
      }

      if (options.resume && options.force) {
        logger.error("--resume and --force cannot be used together");
        process.exit(1);
      }

      if (options.resume && !fs.existsSync(sessionPath)) {
        logger.header("Framework Start");
        logger.warn("No framework-led session exists to resume.");
        logger.info("");
        logger.info("Start a new session:");
        logger.info(`  framework start ${projectDir}${options.feature ? ` --feature ${options.feature}` : " --feature <id>"}`);
        process.exit(1);
      }

      if (fs.existsSync(sessionPath) && options.resume) {
        const existing = loadSessionState(sessionPath);
        const readiness = evaluateStartReadiness(projectDir, existing.auditLevel);
        if (readiness.status === "blocked") {
          printReadinessBlock(readiness);
          process.exit(1);
        }
        existing.readiness = readiness;
        const activation = await ensureFrameworkModeActive(options.dryRun ?? false);
        if (!activation.ok) {
          printActivationBlock(activation.message);
          process.exit(1);
        }
        printStartSummary(projectDir, existing, options.dryRun ?? false, "resumed", activation.message);
        return;
      }

      if (fs.existsSync(sessionPath) && !options.force) {
        logger.header("Framework Start");
        logger.warn("A framework-led session already exists.");
        logger.info("");
        logger.info("Resume the current session:");
        logger.info(`  framework start ${projectDir} --resume`);
        logger.info("");
        logger.info("Replace it with a new session:");
        logger.info(`  framework start ${projectDir}${options.feature ? ` --feature ${options.feature}` : ""} --force`);
        process.exit(1);
      }

      const feature = options.feature ?? null;
      const nextAction = feature
        ? `/design ${feature}`
        : "/design <feature-id>";
      const state: SessionState = {
        version: 1,
        mode: "framework-led",
        startedAt: new Date().toISOString(),
        feature,
        qualityMode,
        auditLevel,
        reviewChain: buildReviewChain(auditLevel),
        readiness: evaluateStartReadiness(projectDir, auditLevel),
        phase: "ready",
        authority: {
          producerCanApproveGate: false,
          gateApprovalRequires: ["/gate-design", "/gate-quality", "/review"],
          userApprovalRequiredBeforeGate: true,
        },
        nextAction,
      };

      if (state.readiness.status === "blocked") {
        printReadinessBlock(state.readiness);
        process.exit(1);
      }

      const activation = await ensureFrameworkModeActive(options.dryRun ?? false);
      if (!activation.ok) {
        printActivationBlock(activation.message);
        process.exit(1);
      }

      if (!options.dryRun) {
        fs.mkdirSync(frameworkDir, { recursive: true });
        fs.writeFileSync(
          sessionPath,
          JSON.stringify(state, null, 2) + "\n",
          "utf-8",
        );
      }

      printStartSummary(
        projectDir,
        state,
        options.dryRun ?? false,
        options.force ? "replaced" : "started",
        activation.message,
      );
    });
}

function loadSessionState(sessionPath: string): SessionState {
  const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf-8")) as SessionState;
  if (parsed.mode !== "framework-led") {
    throw new Error(".framework/current-session.json is not a framework-led session");
  }
  parsed.version ??= 1;
  parsed.readiness ??= {
    status: "warning",
    missingRoles: [],
    placeholderRoles: [],
    roleSeparationViolations: [],
    message: "legacy session without readiness metadata",
  };
  parsed.readiness.roleSeparationViolations ??= [];
  return parsed;
}

function evaluateStartReadiness(
  projectDir: string,
  auditLevel: AuditLevel,
): StartReadiness {
  const roles = resolveRequiredRoles(loadFrameworkConfig(projectDir));
  if (roles.status === "ready") {
    const roleSeparationViolations = validateRoleSeparation(roles.bindings);
    if (roleSeparationViolations.length > 0) {
      return {
        status: auditLevel === "minimal" ? "warning" : "blocked",
        missingRoles: [],
        placeholderRoles: [],
        roleSeparationViolations,
        message: "producer and gate/review roles are not separated",
      };
    }

    return {
      status: "ready",
      missingRoles: [],
      placeholderRoles: [],
      roleSeparationViolations: [],
      message: "required orchestration roles configured",
    };
  }

  const message = "required orchestration roles are not fully configured";
  if (auditLevel === "strict") {
    return {
      status: "blocked",
      missingRoles: roles.missingRoles,
      placeholderRoles: roles.placeholderRoles,
      roleSeparationViolations: [],
      message,
    };
  }

  return {
    status: "warning",
    missingRoles: roles.missingRoles,
    placeholderRoles: roles.placeholderRoles,
    roleSeparationViolations: [],
    message,
  };
}

function printReadinessBlock(readiness: StartReadiness): void {
  logger.header("Framework Start Blocked");
  logger.error(readiness.message);
  logger.info("");
  logger.info("MCP-quality starts require concrete role bindings and separated producer/review authority.");
  printRoleReadiness(readiness);
  logger.info("");
  logger.info("Configure .framework/config.json roles.bindings or use a lower audit level only for non-public lightweight work.");
}

function printRoleReadiness(readiness: StartReadiness): void {
  logger.info(`  Readiness: ${readiness.status}`);
  if (readiness.missingRoles.length > 0) {
    logger.info(`  Missing roles: ${readiness.missingRoles.join(", ")}`);
  }
  if (readiness.placeholderRoles.length > 0) {
    logger.info(`  Placeholder roles: ${readiness.placeholderRoles.join(", ")}`);
  }
  if (readiness.roleSeparationViolations.length > 0) {
    logger.info("  Role separation violations:");
    for (const violation of readiness.roleSeparationViolations) {
      logger.info(`    - ${formatRoleSeparationViolation(violation)}`);
    }
  }
}

interface ActivationStatus {
  ok: boolean;
  message: string;
}

async function ensureFrameworkModeActive(dryRun: boolean): Promise<ActivationStatus> {
  if (dryRun) {
    return { ok: true, message: "dry-run, activation skipped" };
  }

  const mode = await getFrameworkMode();
  if (mode === "active") {
    return { ok: true, message: "active" };
  }

  const result = await activateFrameworkMode();
  if (result.ok) {
    return {
      ok: true,
      message: result.alreadyActive
        ? "active"
        : "activated (framework-managed topic)",
    };
  }

  return { ok: false, message: result.error ?? "unknown" };
}

function printActivationBlock(message: string): void {
  logger.header("Framework Start Blocked");
  logger.error(`Framework mode activation failed: ${message}`);
  logger.info("");
  logger.info("A non-dry-run start cannot create or resume a framework-led session unless framework mode is active.");
  logger.info("Fix GitHub CLI/repository access, or use --dry-run only for planning.");
}

function parseQualityMode(value: string | undefined): QualityMode | null {
  if (value === "single-agent" || value === "multi-agent") {
    return value;
  }
  return null;
}

function parseAuditLevel(value: string | undefined): AuditLevel | null {
  if (value === "minimal" || value === "standard" || value === "strict") {
    return value;
  }
  return null;
}

function buildReviewChain(auditLevel: AuditLevel): ReviewLayer[] {
  const layers: ReviewLayer[] = [
    {
      layer: "L0",
      owner: "ci",
      purpose: "Automated checks: typecheck, lint, tests, breaking-change detection",
      required: true,
      canBlock: true,
    },
    {
      layer: "L1",
      owner: "lead",
      purpose: "Spec fit, task scope, PR description, and producer self-check review",
      required: true,
      canBlock: true,
    },
    {
      layer: "L2",
      owner: "auditor",
      purpose: "Independent 6-axis audit: design intent, scope, hidden risks, regression, SSOT, honesty",
      required: auditLevel !== "minimal",
      canBlock: true,
    },
    {
      layer: "L3",
      owner: "cto",
      purpose: "Governance, cross-cutting architecture, framework integrity, merge authority",
      required: auditLevel === "strict",
      canBlock: true,
    },
    {
      layer: "L4",
      owner: "ceo",
      purpose: "Strategic approval for route:ceo-approval or critical product decisions",
      required: false,
      canBlock: true,
    },
  ];

  return layers;
}

function printStartSummary(
  projectDir: string,
  state: SessionState,
  dryRun: boolean,
  action: "started" | "resumed" | "replaced",
  modeStatus: string,
): void {
  const profileType = loadProfileType(projectDir) ?? "unknown";
  const hasClaudeMd = fs.existsSync(path.join(projectDir, "CLAUDE.md"));
  const hasSkills = fs.existsSync(path.join(projectDir, ".claude/skills"));
  const hasHook = fs.existsSync(path.join(projectDir, ".claude/hooks/pre-code-gate.sh"));
  const hasGateWorkflow = fs.existsSync(path.join(projectDir, ".github/workflows/gate-checks.yml"));
  const hasConfig = fs.existsSync(path.join(projectDir, ".framework/config.json"));

  logger.header(`Framework-led Development ${capitalize(action)}`);
  logger.info(`  Project:      ${projectDir}`);
  logger.info(`  Profile:      ${profileType}`);
  logger.info(`  Feature:      ${state.feature ?? "(not set)"}`);
  logger.info(`  Quality mode: ${state.qualityMode}`);
  logger.info(`  Audit level:  ${state.auditLevel}`);
  logger.info(`  Readiness:    ${state.readiness.status}`);
  logger.info(`  Session file: ${dryRun ? "(dry-run)" : ".framework/current-session.json"}`);
  logger.info(`  Mode status:  ${modeStatus}`);
  logger.info("");

  logger.info("Applied components:");
  logger.info(`  ${mark(hasClaudeMd)} CLAUDE.md framework instructions`);
  logger.info(`  ${mark(hasSkills)} .claude/skills phase skills`);
  logger.info(`  ${mark(hasHook)} Pre-Code Gate hook`);
  logger.info(`  ${mark(hasGateWorkflow)} GitHub gate workflow`);
  logger.info(`  ${mark(hasConfig)} .framework/config.json role/workflow config`);
  logger.info("");

  if (state.readiness.status !== "ready") {
    logger.info("Role readiness:");
    logger.info(`  ${state.readiness.message}`);
    printRoleReadiness(state.readiness);
    logger.info("");
  }

  logger.info("Start boundary:");
  logger.info("  Framework-led development begins at this session file.");
  logger.info("  Producer phases may self-check, but cannot approve gates.");
  logger.info("  PASS/BLOCK authority is limited to /gate-design, /gate-quality, and /review.");
  logger.info("");

  logger.info("Quality guarantee:");
  if (state.qualityMode === "single-agent") {
    logger.info("  Single-agent is an explicit lightweight mode for minimal/small-change work.");
    logger.info("  The same agent must stop before gate/review and report Producer Self-check.");
    logger.info("  Required audit layers must still be executed as separate authority passes.");
  } else {
    logger.info("  Multi-agent orchestration is the default Shirube quality model.");
    logger.info("  Producer and gate/review roles must be separate for standard and strict work.");
    logger.info("  The producer prepares evidence; the gate/review role issues PASS/BLOCK.");
  }
  logger.info("");

  logger.info("Audit chain:");
  for (const layer of state.reviewChain) {
    const required = layer.required ? "required" : "conditional";
    logger.info(`  ${layer.layer} ${required}: ${layer.owner} - ${layer.purpose}`);
  }
  logger.info("");

  logger.info("Next action:");
  logger.info(`  ${state.nextAction}`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mark(ok: boolean): string {
  return ok ? "[ok]" : "[missing]";
}
