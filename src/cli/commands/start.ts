import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import { loadProfileType } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

type QualityMode = "single-agent" | "multi-agent";
type AuditLevel = "minimal" | "standard" | "strict";

interface StartOptions {
  feature?: string;
  qualityMode?: string;
  auditLevel?: string;
  dryRun?: boolean;
}

interface SessionState {
  mode: "framework-led";
  startedAt: string;
  feature: string | null;
  qualityMode: QualityMode;
  auditLevel: AuditLevel;
  reviewChain: ReviewLayer[];
  phase: "ready";
  authority: {
    producerCanApproveGate: false;
    gateApprovalRequires: Array<"/gate-design" | "/gate-quality" | "/review">;
    userApprovalRequiredBeforeGate: true;
  };
  nextAction: string;
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
    .option("--dry-run", "Show start state without writing .framework/current-session.json")
    .action((targetPath: string | undefined, options: StartOptions) => {
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

      const feature = options.feature ?? null;
      const nextAction = feature
        ? `/design ${feature}`
        : "/design <feature-id>";
      const state: SessionState = {
        mode: "framework-led",
        startedAt: new Date().toISOString(),
        feature,
        qualityMode,
        auditLevel,
        reviewChain: buildReviewChain(auditLevel),
        phase: "ready",
        authority: {
          producerCanApproveGate: false,
          gateApprovalRequires: ["/gate-design", "/gate-quality", "/review"],
          userApprovalRequiredBeforeGate: true,
        },
        nextAction,
      };

      if (!options.dryRun) {
        fs.mkdirSync(frameworkDir, { recursive: true });
        fs.writeFileSync(
          path.join(frameworkDir, "current-session.json"),
          JSON.stringify(state, null, 2) + "\n",
          "utf-8",
        );
      }

      printStartSummary(projectDir, state, options.dryRun ?? false);
    });
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
): void {
  const profileType = loadProfileType(projectDir) ?? "unknown";
  const hasClaudeMd = fs.existsSync(path.join(projectDir, "CLAUDE.md"));
  const hasSkills = fs.existsSync(path.join(projectDir, ".claude/skills"));
  const hasHook = fs.existsSync(path.join(projectDir, ".claude/hooks/pre-code-gate.sh"));
  const hasGateWorkflow = fs.existsSync(path.join(projectDir, ".github/workflows/gate-checks.yml"));
  const hasConfig = fs.existsSync(path.join(projectDir, ".framework/config.json"));

  logger.header("Framework-led Development Started");
  logger.info(`  Project:      ${projectDir}`);
  logger.info(`  Profile:      ${profileType}`);
  logger.info(`  Feature:      ${state.feature ?? "(not set)"}`);
  logger.info(`  Quality mode: ${state.qualityMode}`);
  logger.info(`  Audit level:  ${state.auditLevel}`);
  logger.info(`  Session file: ${dryRun ? "(dry-run)" : ".framework/current-session.json"}`);
  logger.info("");

  logger.info("Applied components:");
  logger.info(`  ${mark(hasClaudeMd)} CLAUDE.md framework instructions`);
  logger.info(`  ${mark(hasSkills)} .claude/skills phase skills`);
  logger.info(`  ${mark(hasHook)} Pre-Code Gate hook`);
  logger.info(`  ${mark(hasGateWorkflow)} GitHub gate workflow`);
  logger.info(`  ${mark(hasConfig)} .framework/config.json role/workflow config`);
  logger.info("");

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

function mark(ok: boolean): string {
  return ok ? "[ok]" : "[missing]";
}
