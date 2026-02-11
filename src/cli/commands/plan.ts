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
    .action(
      async (options: { status?: boolean; output?: string }) => {
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
          logger.info("  3. framework audit   <- Verify SSOT quality");
          logger.info("  4. framework run     <- Start auto-development");
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
