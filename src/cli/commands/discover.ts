/**
 * framework discover - Interactive discovery flow command
 *
 * Reference: 08_DISCOVERY_FLOW.md
 *
 * Guides users through 5 stages of project discovery:
 * 1. Idea Core (~5 min)
 * 2. Problem Deep Dive (~10 min)
 * 3. Solution Design (~10 min)
 * 4. Market & Competition (~5 min)
 * 5. Business & Technical (~10 min)
 *
 * Supports pause/resume via .framework/discover-session.json
 */
import { type Command } from "commander";
import {
  runDiscoverEngine,
  createTerminalIO,
} from "../lib/discover-engine.js";
import { loadSession } from "../lib/discover-session.js";
import { loadProjectProfile } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description(
      "Start the interactive discovery flow to define your project",
    )
    .option(
      "--status",
      "Show current discovery session status without starting",
    )
    .option("--reset", "Reset existing discovery session and start fresh")
    .action(
      async (options: { status?: boolean; reset?: boolean }) => {
        const projectDir = process.cwd();

        try {
          // Status check mode
          if (options.status) {
            printSessionStatus(projectDir);
            return;
          }

          // Reset mode
          if (options.reset) {
            const fs = await import("node:fs");
            const path = await import("node:path");
            const sessionPath = path.join(
              projectDir,
              ".framework/discover-session.json",
            );
            if (fs.existsSync(sessionPath)) {
              fs.unlinkSync(sessionPath);
              logger.success("Discovery session reset.");
            } else {
              logger.info("No existing session to reset.");
            }
          }

          // Check if .framework directory exists
          const fs = await import("node:fs");
          const path = await import("node:path");
          const frameworkDir = path.join(projectDir, ".framework");
          if (!fs.existsSync(frameworkDir)) {
            logger.error(
              "No .framework directory found. Run 'framework init' first.",
            );
            process.exit(1);
          }

          // Load profile for stage filtering
          const profile = loadProjectProfile(projectDir);
          const enabledStages = profile?.discoveryStages;

          // Run discover engine
          const io = createTerminalIO();
          const result = await runDiscoverEngine({
            projectDir,
            io,
            enabledStages,
          });

          if (result.paused) {
            logger.info(
              "\nProgress saved. Run 'framework discover' to continue.",
            );
          } else if (result.completed) {
            logger.success("Discovery flow completed.");
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

function printSessionStatus(projectDir: string): void {
  const session = loadSession(projectDir);

  if (!session) {
    logger.info("No active discovery session.");
    logger.info("Run 'framework discover' to start.");
    return;
  }

  logger.header("Discovery Session Status");
  logger.info("");
  logger.info(`  Session ID: ${session.id}`);
  logger.info(`  Status: ${session.status}`);
  logger.info(`  Current Stage: ${session.currentStage} / 5`);
  logger.info(`  Started: ${session.startedAt}`);
  logger.info(`  Updated: ${session.updatedAt}`);
  if (session.completedAt) {
    logger.info(`  Completed: ${session.completedAt}`);
  }
  logger.info("");

  logger.info("  Stages:");
  for (const stage of session.stages) {
    const icon =
      stage.status === "confirmed"
        ? "+"
        : stage.status === "in_progress"
          ? ">"
          : " ";
    logger.info(
      `    [${icon}] Stage ${stage.stageNumber}: ${stage.status}`,
    );
  }

  logger.info("");
  logger.info(
    `  Questions answered: ${Object.keys(session.answers).length}`,
  );
  logger.info("");
}
