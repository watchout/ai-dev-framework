/**
 * framework status - Display project progress
 *
 * Reference: SSOT-3 §2.7, SSOT-2 §4.1-4.2
 *
 * Aggregates state from all pipeline stages and displays:
 * - Current phase and overall progress
 * - Document completeness percentages
 * - Task execution states
 * - Recent audit scores
 */
import * as fs from "node:fs";
import { type Command } from "commander";
import {
  collectStatus,
  printStatus,
  createStatusTerminalIO,
} from "../lib/status-engine.js";
import { logger } from "../lib/logger.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show project progress and status")
    .action(() => {
      const projectDir = process.cwd();

      try {
        const frameworkDir = `${projectDir}/.framework`;
        if (!fs.existsSync(frameworkDir)) {
          logger.error(
            "Not a framework project. Run 'framework init' first.",
          );
          process.exit(1);
        }

        const io = createStatusTerminalIO();
        const result = collectStatus(projectDir);
        printStatus(io, result);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });
}
