/**
 * framework session-save / session-load - Session persistence commands
 *
 * Reference: 21_AI_ESCALATION.md Memory Persistence
 *
 * Save and restore session state for continuity between
 * AI coding sessions.
 */
import { type Command } from "commander";
import {
  runSessionSave,
  runSessionLoad,
  createSessionTerminalIO,
} from "../lib/session-engine.js";
import { logger } from "../lib/logger.js";

export function registerSessionCommands(program: Command): void {
  program
    .command("session-save")
    .description(
      "Save current session state for later restoration",
    )
    .action(() => {
      const projectDir = process.cwd();

      try {
        const io = createSessionTerminalIO();
        runSessionSave(projectDir, io);
        logger.success("Session saved");
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  program
    .command("session-load")
    .description(
      "Load previous session state and display summary",
    )
    .action(() => {
      const projectDir = process.cwd();

      try {
        const io = createSessionTerminalIO();
        const state = runSessionLoad(projectDir, io);

        if (state) {
          logger.success("Session loaded");
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });
}
