/**
 * framework next  - Show the next task to work on (by seq order)
 * framework current - Show the currently in-progress task
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md
 * Issue: #15
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  loadRunState,
  getCurrentTask,
  getNextTaskBySeq,
} from "../lib/run-model.js";
import { logger } from "../lib/logger.js";

const AUDIT_LOG = ".framework/audit.log";

function appendAuditLog(projectDir: string, entry: object): void {
  const logPath = path.join(projectDir, AUDIT_LOG);
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
}

export function registerNextCommand(program: Command): void {
  // ── framework next ──────────────────────────────────────────────────────
  program
    .command("next")
    .description("Show the next task to work on (ordered by seq)")
    .option("--force", "Ignore in-progress tasks and return next todo anyway")
    .option("--json", "Output as JSON")
    .action(async (options: { force?: boolean; json?: boolean }) => {
      const projectDir = process.cwd();
      const state = loadRunState(projectDir);

      if (!state) {
        logger.error(
          "No run state found. Run 'framework run' to initialize.",
        );
        process.exit(1);
      }

      // Check for in-progress tasks
      const inProgress = state.tasks.filter(
        (t) => t.status === "in_progress",
      );

      if (inProgress.length > 0 && !options.force) {
        logger.warn("⚠️  作業中のタスクがあります。完了してから next を実行してください。");
        logger.info("");
        for (const t of inProgress) {
          logger.info(`  in_progress: ${t.taskId}${t.seq ? ` [${t.seq}]` : ""} — ${t.name}`);
        }
        logger.info("");
        logger.info("  強制的に次のタスクを取得するには: framework next --force");
        process.exit(1);
      }

      if (inProgress.length > 0 && options.force) {
        // Audit trail for --force usage
        const skipped = inProgress.map((t) => t.taskId);
        appendAuditLog(projectDir, {
          timestamp: new Date().toISOString(),
          command: "next --force",
          skipped,
        });
        logger.warn(
          `⚠️  --force: ${skipped.length} 件の in_progress タスクをスキップ (audit.log に記録済み)`,
        );
      }

      const next = getNextTaskBySeq(state);

      if (!next) {
        logger.info("✅ 全タスク完了。次のタスクはありません。");
        return;
      }

      if (options.json) {
        process.stdout.write(JSON.stringify(next, null, 2) + "\n");
        return;
      }

      logger.header("Next Task");
      logger.info("");
      logger.info(`  Task ID : ${next.taskId}`);
      if (next.seq) logger.info(`  Seq     : ${next.seq}`);
      logger.info(`  Feature : ${next.featureId}`);
      logger.info(`  Kind    : ${next.taskKind}`);
      logger.info(`  Name    : ${next.name}`);
      logger.info(`  Status  : ${next.status}`);
      logger.info("");
      logger.info(`  To start: framework run ${next.taskId}`);
      logger.info("");
    });

  // ── framework current ────────────────────────────────────────────────────
  program
    .command("current")
    .description("Show the currently in-progress task")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      const projectDir = process.cwd();
      const state = loadRunState(projectDir);

      if (!state) {
        logger.error(
          "No run state found. Run 'framework run' to initialize.",
        );
        process.exit(1);
      }

      const current = getCurrentTask(state);

      if (!current) {
        logger.info("作業中のタスクはありません。");
        logger.info("  次のタスクを確認するには: framework next");
        return;
      }

      if (options.json) {
        process.stdout.write(JSON.stringify(current, null, 2) + "\n");
        return;
      }

      logger.header("Current Task");
      logger.info("");
      logger.info(`  Task ID : ${current.taskId}`);
      if (current.seq) logger.info(`  Seq     : ${current.seq}`);
      logger.info(`  Feature : ${current.featureId}`);
      logger.info(`  Kind    : ${current.taskKind}`);
      logger.info(`  Name    : ${current.name}`);
      logger.info(`  Status  : ${current.status}`);
      if (current.startedAt) {
        logger.info(`  Started : ${current.startedAt}`);
      }
      logger.info("");
    });
}
