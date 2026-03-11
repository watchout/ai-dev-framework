/**
 * framework sync - Bidirectional sync between plan.json and GitHub Issues
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §8-9
 * Issue: #16
 */
import { type Command } from "commander";
import { runSync } from "../lib/sync-engine.js";
import { logger } from "../lib/logger.js";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync plan.json with GitHub Issues")
    .option("--keep-orphans", "Keep orphaned tasks in plan.json")
    .option("--commit <sha>", "Git commit SHA to record in sync meta")
    .action(
      async (options: { keepOrphans?: boolean; commit?: string }) => {
        const projectDir = process.cwd();

        logger.header("Framework Sync");
        logger.info("");

        const result = await runSync({
          projectDir,
          keepOrphans: options.keepOrphans,
          commitSha: options.commit,
        });

        if (!result.ok) {
          logger.error(`❌ Sync failed: ${result.error}`);
          process.exit(1);
        }

        // Show warnings
        if (result.warnings.length > 0) {
          logger.warn("");
          for (const w of result.warnings) {
            logger.warn(w);
          }
        }

        // Show orphans
        if (result.orphaned.length > 0) {
          logger.warn("");
          logger.warn(`⚠️  ${result.orphaned.length} orphaned tasks found:`);
          for (const o of result.orphaned) {
            logger.warn(
              `  - ${o.taskId}${o.seq ? ` [${o.seq}]` : ""}${o.issueNumber ? ` (#${o.issueNumber})` : ""}`,
            );
          }
        }

        logger.info("");
        logger.info(
          `✅ Sync completed. ${result.updated} tasks updated from GitHub.`,
        );
        logger.info("");
      },
    );
}
