/**
 * framework compact - Strategic context compaction
 *
 * Reference: 21_AI_ESCALATION.md Strategic Compact
 *
 * Analyzes context priority (P1-P4) and compacts by archiving
 * lower-priority items to free up context space.
 */
import { type Command } from "commander";
import {
  runCompact,
  createCompactTerminalIO,
} from "../lib/compact-engine.js";
import { logger } from "../lib/logger.js";

export function registerCompactCommand(program: Command): void {
  program
    .command("compact")
    .description(
      "Analyze and compact context (P1-P4 priority system)",
    )
    .option("--auto", "Automatically archive P3 and discard P4 items")
    .option("--status", "Show current context usage only")
    .action(
      (options: { auto?: boolean; status?: boolean }) => {
        const projectDir = process.cwd();

        try {
          const io = createCompactTerminalIO();
          const status = runCompact(projectDir, options, io);

          if (status.recommendation === "compact_now") {
            logger.warn(
              "Context needs compaction. Run 'framework compact --auto' to compact.",
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
