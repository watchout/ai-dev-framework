import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import { loadProfileType } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

type QualityMode = "single-agent" | "multi-agent";

interface StartOptions {
  feature?: string;
  qualityMode?: string;
  dryRun?: boolean;
}

interface SessionState {
  mode: "framework-led";
  startedAt: string;
  feature: string | null;
  qualityMode: QualityMode;
  phase: "ready";
  authority: {
    producerCanApproveGate: false;
    gateApprovalRequires: Array<"/gate-design" | "/gate-quality" | "/review">;
    userApprovalRequiredBeforeGate: true;
  };
  nextAction: string;
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
      "single-agent",
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
    logger.info("  Single-agent is allowed only with mandatory phase stops.");
    logger.info("  The same agent must stop before gate/review and report Producer Self-check.");
    logger.info("  Gate/review verdicts require an explicit /gate-design, /gate-quality, or /review step.");
  } else {
    logger.info("  Multi-agent mode expects producer and gate/review roles to be separate.");
    logger.info("  The producer prepares evidence; the gate/review role issues PASS/BLOCK.");
  }
  logger.info("");

  logger.info("Next action:");
  logger.info(`  ${state.nextAction}`);
}

function mark(ok: boolean): string {
  return ok ? "[ok]" : "[missing]";
}
