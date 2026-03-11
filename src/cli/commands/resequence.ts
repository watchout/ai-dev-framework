/**
 * framework resequence - Re-assign WWWFFFFTTT numbers in 10-step intervals
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §5
 * Issue: #19
 */
import { type Command } from "commander";
import { runResequence } from "../lib/resequence-engine.js";
import { logger } from "../lib/logger.js";

export function registerResequenceCommand(program: Command): void {
  program
    .command("resequence")
    .description("Re-assign seq numbers in 10-step intervals")
    .option("--migrate", "Also assign seq to tasks without seq numbers")
    .action(async (options: { migrate?: boolean }) => {
      const projectDir = process.cwd();

      logger.header("Framework Resequence");
      logger.info("");

      const result = await runResequence(projectDir, options.migrate);

      if (!result.ok) {
        logger.error(`❌ Resequence failed: ${result.error}`);
        process.exit(1);
      }

      // Show warnings
      if (result.warnings.length > 0) {
        logger.warn("");
        for (const w of result.warnings) {
          logger.warn(w);
        }
      }

      logger.info("");
      logger.info(
        `✅ Resequence completed. ${result.resequenced} tasks updated.`,
      );
      if (result.migrated > 0) {
        logger.info(`   ${result.migrated} tasks migrated (seq assigned).`);
      }
      logger.info("");
    });
}
