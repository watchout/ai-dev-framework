/**
 * framework plan - Implementation plan generation command
 *
 * Reference: 14_IMPLEMENTATION_ORDER.md
 *
 * Generates an implementation plan from the feature catalog:
 * - Dependency graph analysis
 * - Topological sort into waves
 * - Task decomposition (6 tasks per feature)
 * - Markdown plan output
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  runPlanEngine,
  createPlanTerminalIO,
  generatePlanMarkdown,
} from "../lib/plan-engine.js";
import { loadPlan } from "../lib/plan-model.js";
import {
  loadGateState,
  createGateState,
  updateGateB,
  saveGateState,
} from "../lib/gate-model.js";
import { checkGateB } from "../lib/gate-engine.js";
import {
  isGhAvailable,
  syncPlanToGitHub,
  hasProjectScope,
  listProjects,
  createProjectBoard,
  configureProjectBoard,
} from "../lib/github-engine.js";
import {
  loadSyncState,
} from "../lib/github-model.js";
import { logger } from "../lib/logger.js";

export function registerPlanCommand(program: Command): void {
  program
    .command("plan")
    .description(
      "Generate an implementation plan from the feature catalog",
    )
    .option("--status", "Show current plan status")
    .option(
      "--output <path>",
      "Write plan to a markdown file",
    )
    .option(
      "--sync",
      "Sync plan to GitHub Issues after generation",
    )
    .action(
      async (options: {
        status?: boolean;
        output?: string;
        sync?: boolean;
      }) => {
        const projectDir = process.cwd();

        try {
          if (options.status) {
            printPlanStatus(projectDir);
            return;
          }

          // Check .framework directory
          const frameworkDir = path.join(projectDir, ".framework");
          if (!fs.existsSync(frameworkDir)) {
            logger.error(
              "No .framework directory found. Run 'framework init' first.",
            );
            process.exit(1);
          }

          const io = createPlanTerminalIO();
          const result = await runPlanEngine({ projectDir, io });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          // Output markdown file if requested
          if (options.output) {
            const markdown = generatePlanMarkdown(result.plan);
            const outputPath = path.resolve(projectDir, options.output);
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, markdown, "utf-8");
            logger.success(`Plan written to ${options.output}`);
          }

          // Auto-pass Gate B after successful plan generation
          const gateState = loadGateState(projectDir) ?? createGateState();
          const gateBChecks = checkGateB(projectDir);
          updateGateB(gateState, gateBChecks);
          saveGateState(projectDir, gateState);

          if (gateState.gateB.status === "passed") {
            logger.success("Gate B (Planning) automatically passed.");
          }

          // Sync to GitHub Issues if requested
          if (options.sync) {
            const ghAvailable = await isGhAvailable();
            if (!ghAvailable) {
              logger.warn(
                "gh CLI not available or not authenticated. " +
                  "Run 'gh auth login' first.",
              );
            } else {
              logger.info("");
              logger.header("Syncing to GitHub Issues...");

              // Detect or create GitHub Project board
              let projectNumber: number | undefined;
              const existingSyncState = loadSyncState(projectDir);
              if (existingSyncState?.projectNumber) {
                projectNumber = existingSyncState.projectNumber;
              } else {
                const canProject = await hasProjectScope();
                if (canProject) {
                  const projects = await listProjects(existingSyncState?.repo ?? "");
                  if (projects.length > 0) {
                    projectNumber = projects[0].number;
                    logger.info(`  Using GitHub Project: "${projects[0].title}" (#${projectNumber})`);
                  } else {
                    const projectName = path.basename(projectDir);
                    projectNumber = await createProjectBoard(
                      existingSyncState?.repo ?? "",
                      `${projectName} - Development`,
                    ) ?? undefined;
                    if (projectNumber) {
                      logger.success(`  Created GitHub Project: #${projectNumber}`);
                      // Configure board columns: Backlog → Todo → In Progress → In Review → Done
                      const boardResult = await configureProjectBoard(
                        existingSyncState?.repo ?? "",
                        projectNumber,
                      );
                      if (boardResult.configured) {
                        logger.success("  Board columns configured: Backlog → Todo → In Progress → In Review → Done");
                      } else {
                        logger.warn(`  Board column setup: ${boardResult.error ?? "unknown error"} (set manually in GitHub)`);
                      }
                    }
                  }
                } else {
                  logger.info("  GitHub Projects: skipped (run 'gh auth refresh -h github.com -s read:project,project' to enable)");
                }
              }

              const syncResult = await syncPlanToGitHub(
                projectDir,
                result.plan,
                {
                  onProgress: (msg) => logger.info(msg),
                  projectNumber,
                },
              );
              if (syncResult.errors.length > 0) {
                for (const err of syncResult.errors) {
                  logger.warn(`  GitHub sync: ${err}`);
                }
              }
              logger.success(
                `GitHub Issues: ${syncResult.created} created, ${syncResult.skipped} skipped`,
              );
              if (projectNumber) {
                logger.success(
                  `GitHub Project: Issues linked to Project #${projectNumber}`,
                );
                // Configure board columns if this is a newly synced project
                if (!existingSyncState?.projectNumber) {
                  const boardResult = await configureProjectBoard(
                    syncResult.errors.length === 0
                      ? (loadSyncState(projectDir)?.repo ?? "")
                      : "",
                    projectNumber,
                  );
                  if (boardResult.configured) {
                    logger.success("  Board columns configured: Backlog → Todo → In Progress → In Review → Done");
                  } else if (boardResult.error) {
                    logger.info(`  Board columns: configure manually (${boardResult.error})`);
                  }
                }
              }
            }
          }

          // Print summary
          const totalFeatures = result.plan.waves.reduce(
            (sum, w) => sum + w.features.length,
            0,
          );
          logger.info("");
          logger.header("Plan Generated");
          logger.info(`  Waves: ${result.plan.waves.length}`);
          logger.info(`  Features: ${totalFeatures}`);
          logger.info(`  Tasks: ~${totalFeatures * 6}`);
          if (result.plan.circularDependencies.length > 0) {
            logger.warn(
              `  Circular deps: ${result.plan.circularDependencies.length} (needs resolution)`,
            );
          }
          logger.info("");
          logger.header("Next steps:");
          logger.info("  1. Review the plan");
          logger.info("  2. framework plan --output docs/PLAN.md  <- Export plan");
          if (!options.sync) {
            logger.info("  3. framework plan --sync  <- Sync to GitHub Issues");
            logger.info("  4. framework gate check   <- Verify all gates");
            logger.info("  5. framework run          <- Start auto-development");
          } else {
            logger.info("  3. framework gate check  <- Verify all gates");
            logger.info("  4. framework run         <- Start auto-development");
          }
          logger.info("");
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}

function printPlanStatus(projectDir: string): void {
  const plan = loadPlan(projectDir);

  if (!plan) {
    logger.info("No plan found. Run 'framework plan' to generate.");
    return;
  }

  logger.header("Plan Status");
  logger.info("");
  logger.info(`  Status: ${plan.status}`);
  logger.info(`  Generated: ${plan.generatedAt}`);
  logger.info(`  Updated: ${plan.updatedAt}`);
  logger.info("");

  for (const wave of plan.waves) {
    const phaseLabel =
      wave.phase === "common"
        ? `Phase 1, Layer ${wave.layer}`
        : "Phase 2";
    logger.info(`  ${wave.title} (${phaseLabel})`);
    for (const feature of wave.features) {
      logger.info(
        `    ${feature.id}: ${feature.name} (${feature.priority}, ${feature.size})`,
      );
    }
    logger.info("");
  }

  const totalFeatures = plan.waves.reduce(
    (sum, w) => sum + w.features.length,
    0,
  );
  logger.info(`  Total: ${totalFeatures} features, ${plan.waves.length} waves`);
  logger.info("");
}
