/**
 * framework prune - Remove orphaned tasks from plan.json
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §9
 * Issue: #18
 */
import { type Command } from "commander";
import { pruneTask, listPlanTasks } from "../lib/prune-engine.js";
import { logger } from "../lib/logger.js";

export function registerPruneCommand(program: Command): void {
  program
    .command("prune <taskIds...>")
    .description("Remove orphaned tasks from plan.json")
    .option("--list", "List all tasks in plan.json")
    .action(
      async (taskIds: string[], options: { list?: boolean }) => {
        const projectDir = process.cwd();

        if (options.list) {
          const tasks = listPlanTasks(projectDir);
          if (tasks.length === 0) {
            logger.info("No tasks in plan.json");
            return;
          }
          logger.header("Tasks in plan.json");
          logger.info("");
          for (const t of tasks) {
            logger.info(`  ${t.taskId}${t.seq ? ` [${t.seq}]` : ""}`);
          }
          logger.info("");
          return;
        }

        if (!taskIds || taskIds.length === 0) {
          logger.error("❌ Please specify at least one task ID to prune");
          process.exit(1);
        }

        logger.header("Framework Prune");
        logger.info("");

        const result = await pruneTask(projectDir, taskIds);

        if (!result.ok) {
          logger.error(`❌ Prune failed: ${result.error}`);
          process.exit(1);
        }

        if (result.notFound.length > 0) {
          logger.warn("");
          logger.warn(`⚠️  ${result.notFound.length} tasks not found:`);
          for (const id of result.notFound) {
            logger.warn(`  - ${id}`);
          }
        }

        logger.info("");
        logger.info(`✅ ${result.removed.length} tasks removed from plan.json`);
        for (const id of result.removed) {
          logger.info(`  - ${id}`);
        }
        logger.info("");
      },
    );
}
