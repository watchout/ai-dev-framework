/**
 * framework checkpoint - Create quality checkpoints
 * Reference: 25_VERIFICATION_LOOPS.md
 *
 * Scans the project, scores 5 quality axes, and persists
 * a checkpoint for tracking quality over time.
 *
 * Usage:
 *   framework checkpoint                Create checkpoint
 *   framework checkpoint --name <name>  Label the checkpoint
 *   framework checkpoint --compare <id> Compare with previous
 *   framework checkpoint --status       Show checkpoint history
 */
import { type Command } from "commander";
import {
  runCheckpoint,
  createCheckpointTerminalIO,
} from "../lib/checkpoint-engine.js";
import {
  loadCheckpointIndex,
  scoreLevel,
} from "../lib/verification-model.js";
import { logger } from "../lib/logger.js";

export function registerCheckpointCommand(program: Command): void {
  program
    .command("checkpoint")
    .description(
      "Create a quality checkpoint for the project",
    )
    .option("--name <name>", "Label for the checkpoint")
    .option(
      "--compare <id>",
      "Compare with a previous checkpoint (e.g. CP-001)",
    )
    .option("--status", "Show checkpoint history")
    .action(
      (options: {
        name?: string;
        compare?: string;
        status?: boolean;
      }) => {
        const projectDir = process.cwd();

        try {
          if (options.status) {
            printCheckpointStatus(projectDir);
            return;
          }

          const io = createCheckpointTerminalIO();
          const data = runCheckpoint(projectDir, options, io);

          const level = scoreLevel(data.scores.total);
          if (level === "pass") {
            logger.success(
              `Checkpoint ${data.id} created (${data.scores.total}/100)`,
            );
          } else if (level === "warning") {
            logger.warn(
              `Checkpoint ${data.id} created with warnings (${data.scores.total}/100)`,
            );
          } else {
            logger.error(
              `Checkpoint ${data.id}: quality below threshold (${data.scores.total}/100)`,
            );
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

function printCheckpointStatus(projectDir: string): void {
  const index = loadCheckpointIndex(projectDir);

  if (index.checkpoints.length === 0) {
    logger.info(
      "No checkpoints found. Run 'framework checkpoint' to create one.",
    );
    return;
  }

  logger.header("Checkpoint History");
  logger.info("");

  for (const cp of index.checkpoints.slice(-10)) {
    const level = scoreLevel(cp.totalScore);
    const label = level.toUpperCase().padEnd(7);
    const task = cp.task ? ` [${cp.task}]` : "";
    logger.info(
      `  ${cp.id} ${cp.name} - ${cp.totalScore}/100 ${label}${task} (${cp.timestamp})`,
    );
  }

  logger.info("");
  logger.info(
    `  Total: ${index.stats.totalCheckpoints} checkpoints, avg ${index.stats.averageScore}/100, trend: ${index.stats.trend}`,
  );
  logger.info("");
}
