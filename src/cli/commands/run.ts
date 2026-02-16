/**
 * framework run - Execute implementation tasks
 *
 * Reference: SSOT-3 §2.5, 21_AI_ESCALATION.md
 *
 * Executes the next pending task from the implementation plan.
 * Generates prompts, handles escalation, runs auto-audit.
 */
import { type Command } from "commander";
import {
  runTask,
  createRunTerminalIO,
  completeTaskNonInteractive,
} from "../lib/run-engine.js";
import {
  loadRunState,
  calculateProgress,
} from "../lib/run-model.js";
import {
  loadGateState,
  areAllGatesPassed,
  collectFailures,
} from "../lib/gate-model.js";
import { logger } from "../lib/logger.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Execute next implementation task")
    .argument("[taskId]", "Specific task ID to execute")
    .option("--dry-run", "Preview without executing")
    .option(
      "--auto-commit",
      "Auto-commit generated code",
    )
    .option("--status", "Show current run state")
    .option(
      "--complete",
      "Mark specified task as done (non-interactive)",
    )
    .action(
      async (
        taskId: string | undefined,
        options: {
          dryRun?: boolean;
          autoCommit?: boolean;
          status?: boolean;
          complete?: boolean;
        },
      ) => {
        const projectDir = process.cwd();

        try {
          if (options.status) {
            printRunStatus(projectDir);
            return;
          }

          // Non-interactive completion: framework run <taskId> --complete
          if (options.complete) {
            if (!taskId) {
              logger.error(
                "Task ID required. Usage: framework run <taskId> --complete",
              );
              process.exit(1);
            }
            const result = await completeTaskNonInteractive(
              projectDir,
              taskId,
            );
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(`Task ${taskId}: completed (${result.progress}%)`);
            if (result.issueClosed) {
              logger.info(`  GitHub Issue closed for ${taskId}`);
            }
            return;
          }

          // ── Pre-Code Gate enforcement ──
          const gateState = loadGateState(projectDir);
          if (!gateState || !areAllGatesPassed(gateState)) {
            logger.error(
              "❌ Pre-Code Gate 未通過。実装を開始できません。",
            );
            logger.info("");
            if (!gateState) {
              logger.info(
                "  Gate 状態が見つかりません。まず 'framework gate check' を実行してください。",
              );
            } else {
              const failures = collectFailures(gateState);
              for (const failure of failures) {
                logger.error(`  ${failure.gate}:`);
                for (const detail of failure.details) {
                  logger.info(`    → ${detail}`);
                }
              }
            }
            logger.info("");
            logger.info(
              "  → 'framework gate check' で詳細を確認してください。",
            );
            logger.info(
              "  → 全ての Gate が PASSED になるまで 'framework run' は実行できません。",
            );
            process.exit(1);
          }

          const io = createRunTerminalIO();
          const result = await runTask({
            projectDir,
            io,
            taskId,
            dryRun: options.dryRun,
            autoCommit: options.autoCommit,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          if (
            result.status === "completed" ||
            result.status === "dry_run"
          ) {
            if (result.taskId) {
              logger.success(
                `Task ${result.taskId}: ${result.status}`,
              );
            }
          } else if (result.status === "escalated") {
            logger.warn(
              `Task ${result.taskId}: escalated - awaiting input`,
            );
          } else {
            logger.error(`Task ${result.taskId}: ${result.status}`);
            process.exit(1);
          }
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}

function printRunStatus(projectDir: string): void {
  const state = loadRunState(projectDir);

  if (!state) {
    logger.info(
      "No run state found. Run 'framework run' to start.",
    );
    return;
  }

  logger.header("Run Status");
  logger.info("");
  logger.info(`  Status: ${state.status}`);
  logger.info(
    `  Progress: ${calculateProgress(state)}%`,
  );
  logger.info("");

  const backlog = state.tasks.filter(
    (t) => t.status === "backlog",
  ).length;
  const inProgress = state.tasks.filter(
    (t) => t.status === "in_progress",
  ).length;
  const waiting = state.tasks.filter(
    (t) => t.status === "waiting_input",
  ).length;
  const done = state.tasks.filter(
    (t) => t.status === "done",
  ).length;
  const failed = state.tasks.filter(
    (t) => t.status === "failed",
  ).length;

  logger.info(
    `  Tasks: ${state.tasks.length} total`,
  );
  logger.info(
    `    Backlog:     ${backlog}`,
  );
  logger.info(
    `    In Progress: ${inProgress}`,
  );
  logger.info(
    `    Waiting:     ${waiting}`,
  );
  logger.info(
    `    Done:        ${done}`,
  );
  if (failed > 0) {
    logger.info(`    Failed:      ${failed}`);
  }
  logger.info("");

  if (state.currentTaskId) {
    logger.info(
      `  Current: ${state.currentTaskId}`,
    );
    logger.info("");
  }
}
