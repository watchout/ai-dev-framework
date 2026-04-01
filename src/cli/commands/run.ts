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
  completeFeatureNonInteractive,
  completeWaveNonInteractive,
  startTaskNonInteractive,
  heartbeatTaskNonInteractive,
  failTaskNonInteractive,
  syncRunStateFromGitHub,
  formatNextTaskProposal,
} from "../lib/run-engine.js";
import {
  loadRunState,
  calculateProgress,
  getCurrentExecutionHealth,
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
    .option("--json", "Output machine-readable JSON")
    .option(
      "--auto-commit",
      "Auto-commit generated code",
    )
    .option("--status", "Show current run state")
    .option(
      "--complete",
      "Mark specified task as done (non-interactive)",
    )
    .option(
      "--complete-feature",
      "Mark all tasks for a feature as done",
    )
    .option(
      "--complete-wave",
      "Mark all tasks in a wave as done (argument = wave number)",
    )
    .option(
      "--start-only",
      "Start a task non-interactively and return prompt/lease info",
    )
    .option(
      "--heartbeat",
      "Refresh heartbeat/lease for the current or specified task",
    )
    .option(
      "--fail-task",
      "Mark the current or specified task as failed (non-interactive)",
    )
    .option(
      "--reason <reason>",
      "Failure reason for --fail-task",
    )
    .option(
      "--detail <detail>",
      "Detailed failure context for --fail-task",
    )
    .option(
      "--parallel <tasks...>",
      "Run multiple tasks in parallel using git worktrees",
    )
    .option(
      "--max-workers <n>",
      "Max parallel workers (default: 3, max: 5)",
      "3",
    )
    .option(
      "--auto-fix",
      "Enable auto-remediation for gate failures",
    )
    .option(
      "--skip-install",
      "Skip npm install in worktrees",
    )
    .option(
      "--base-branch <branch>",
      "Base branch for worktrees",
      "main",
    )
    .option(
      "--cleanup",
      "Remove all worktrees and release lock",
    )
    .action(
      async (
        taskId: string | undefined,
        options: {
          dryRun?: boolean;
          json?: boolean;
          autoCommit?: boolean;
          status?: boolean;
          complete?: boolean;
          completeFeature?: boolean;
          completeWave?: boolean;
          startOnly?: boolean;
          heartbeat?: boolean;
          failTask?: boolean;
          reason?: string;
          detail?: string;
          parallel?: string[];
          maxWorkers?: string;
          autoFix?: boolean;
          skipInstall?: boolean;
          baseBranch?: string;
          cleanup?: boolean;
        },
      ) => {
        const projectDir = process.cwd();

        try {
          // --cleanup: remove all worktrees
          if (options.cleanup) {
            const { cleanupWorktrees } = await import("../lib/worktree-manager.js");
            const cleaned = cleanupWorktrees(projectDir);
            logger.success(`Cleaned up ${cleaned} worktree(s).`);
            return;
          }

          // --parallel: run tasks in parallel worktrees
          if (options.parallel && options.parallel.length > 0) {
            const { runParallel, formatParallelStatus, capMaxWorkers } = await import("../lib/worktree-manager.js");
            const maxWorkers = capMaxWorkers(parseInt(options.maxWorkers ?? "3", 10));

            logger.header("Parallel Run");
            logger.info(`  Tasks: ${options.parallel.join(", ")}`);
            logger.info(`  Workers: ${maxWorkers}`);
            logger.info(`  Base branch: ${options.baseBranch ?? "main"}`);
            if (options.autoFix) logger.info("  Auto-fix: enabled");
            if (options.skipInstall) logger.info("  npm install: skipped");
            logger.info("");

            const result = await runParallel(
              {
                tasks: options.parallel,
                maxWorkers,
                autoFix: options.autoFix ?? false,
                skipInstall: options.skipInstall ?? false,
                baseBranch: options.baseBranch ?? "main",
              },
              projectDir,
              {
                onSessionUpdate: (session) => {
                  logger.info(`  [${session.status}] ${session.taskId}${session.error ? `: ${session.error}` : ""}`);
                },
                onComplete: (res) => {
                  logger.info(formatParallelStatus(res.sessions, res.elapsed));
                  if (res.failed > 0) {
                    logger.warn(`  ${res.failed} task(s) failed.`);
                  }
                  logger.success(`  ${res.succeeded}/${res.sessions.length} tasks completed.`);
                },
              },
            );

            if (result.failed > 0) {
              process.exit(1);
            }
            return;
          }

          if (options.status) {
            printRunStatus(projectDir, options.json ?? false);
            return;
          }

          if (options.heartbeat) {
            const result = heartbeatTaskNonInteractive(projectDir, taskId);
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(`Task ${result.taskId}: heartbeat refreshed`);
            logger.info(`  Lease: ${result.leaseExpiresAt}`);
            return;
          }

          if (options.failTask) {
            if (!taskId) {
              logger.error(
                "Task ID required. Usage: framework run <taskId> --fail-task",
              );
              process.exit(1);
            }
            const result = await failTaskNonInteractive(
              projectDir,
              taskId,
              options.reason,
              options.detail,
            );
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(`Task ${taskId}: failed (${result.progress}%)`);
            if (result.issueLabeled) {
              logger.info(`  GitHub Issue labeled failed for ${taskId}`);
            }
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
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(`Task ${taskId}: completed (${result.progress}%)`);
            if (result.issueClosed) {
              logger.info(`  GitHub Issue closed for ${taskId}`);
            }
            if (result.parentClosed) {
              logger.info(`  GitHub parent Issue closed (all feature tasks done)`);
            }
            if (result.nextProposal) {
              logger.info("");
              logger.info(formatNextTaskProposal(result.nextProposal, result.progress, result.totalTasks, result.doneTasks));
            } else if (result.progress === 100) {
              logger.info("");
              logger.info("[提案] 全タスク完了。framework audit code でコード監査を実行してください。");
            }
            return;
          }

          // Batch feature completion: framework run <featureId> --complete-feature
          if (options.completeFeature) {
            if (!taskId) {
              logger.error(
                "Feature ID required. Usage: framework run <featureId> --complete-feature",
              );
              process.exit(1);
            }
            const result = await completeFeatureNonInteractive(
              projectDir,
              taskId,
            );
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(
              `Feature ${taskId}: ${result.completed} tasks completed, ${result.skipped} skipped (${result.progress}%)`,
            );
            if (result.issuesClosed > 0) {
              logger.info(`  ${result.issuesClosed} GitHub Issues closed`);
            }
            if (result.parentClosed) {
              logger.info(`  GitHub parent Issue closed for ${taskId}`);
            }
            return;
          }

          // Batch wave completion: framework run <waveNumber> --complete-wave
          if (options.completeWave) {
            if (!taskId) {
              logger.error(
                "Wave number required. Usage: framework run <waveNumber> --complete-wave",
              );
              process.exit(1);
            }
            const waveNum = parseInt(taskId, 10);
            if (isNaN(waveNum)) {
              logger.error(`Invalid wave number: ${taskId}`);
              process.exit(1);
            }
            const result = await completeWaveNonInteractive(
              projectDir,
              waveNum,
            );
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(
              `Wave ${waveNum}: ${result.completed} tasks completed, ${result.skipped} skipped (${result.progress}%)`,
            );
            if (result.issuesClosed > 0) {
              logger.info(`  ${result.issuesClosed} GitHub Issues closed`);
            }
            if (result.parentClosed) {
              logger.info(`  GitHub parent Issue(s) closed`);
            }
            return;
          }

          // ── Pre-run: sync GitHub → run-state (graceful) ──
          try {
            const syncResult = await syncRunStateFromGitHub(projectDir);
            if (syncResult.updated > 0) {
              logger.info(
                `  GitHub sync: ${syncResult.updated} tasks updated from GitHub`,
              );
            }
          } catch {
            // Silently ignore — GitHub sync is optional
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

          if (options.startOnly) {
            const result = await startTaskNonInteractive(projectDir, taskId);
            if (options.json) {
              process.stdout.write(JSON.stringify(result, null, 2) + "\n");
              if (result.error) process.exit(1);
              return;
            }
            if (result.error) {
              logger.error(result.error);
              process.exit(1);
            }
            logger.success(`Task ${result.taskId}: started (${result.progress}%)`);
            if (result.leaseExpiresAt) {
              logger.info(`  Lease expires: ${result.leaseExpiresAt}`);
            }
            if (result.prompt) {
              logger.info("");
              logger.info(result.prompt);
            }
            return;
          }

          const io = createRunTerminalIO();
          const result = await runTask({
            projectDir,
            io,
            taskId,
            dryRun: options.dryRun,
            autoCommit: options.autoCommit,
          });

          if (options.json) {
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
            if (result.errors.length > 0 || result.status === "failed") {
              process.exit(1);
            }
            return;
          }

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

function printRunStatus(projectDir: string, asJson = false): void {
  const state = loadRunState(projectDir);

  if (!state) {
    if (asJson) {
      process.stdout.write(JSON.stringify({ error: "No run state found." }, null, 2) + "\n");
      return;
    }
    logger.info(
      "No run state found. Run 'framework run' to start.",
    );
    return;
  }

  const health = getCurrentExecutionHealth(state);

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          status: state.status,
          progress: calculateProgress(state),
          currentTaskId: state.currentTaskId,
          execution: health,
          tasks: state.tasks,
        },
        null,
        2,
      ) + "\n",
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
    if (health) {
      logger.info(
        `  Execution: ${health.expired ? "EXPIRED" : "HEALTHY"}`,
      );
      if (health.reason) {
        logger.info(`  Stop reason: ${health.reason}`);
      }
      if (health.detail) {
        logger.info(`  Detail: ${health.detail}`);
      }
    }
    logger.info("");
  }
}
