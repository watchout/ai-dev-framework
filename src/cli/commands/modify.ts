/**
 * framework modify - Modification instruction → Differential SSOT update
 *
 * Usage:
 *   framework modify [path]             Analyze modification and generate SSOT diffs
 *   framework modify --status           Show modification status
 *   framework modify --approve [id]     Approve and apply modification diffs
 *   framework modify --dry-run          Preview without writing files
 */
import { type Command } from "commander";
import {
  runModify,
  approveModify,
  printModifyStatus,
  createModifyTerminalIO,
} from "../lib/modify-engine.js";
import { logger } from "../lib/logger.js";

export function registerModifyCommand(program: Command): void {
  program
    .command("modify")
    .description(
      "Apply modification instructions as differential SSOT updates",
    )
    .argument(
      "[path]",
      "Path to modification instruction file or directory (default: docs/inbox/)",
    )
    .option("--status", "Show modification records status")
    .option("--approve [id]", "Approve and apply modification diffs to SSOTs")
    .option("--dry-run", "Preview what would be changed without writing files")
    .action(
      async (
        inputPath: string | undefined,
        options: {
          status?: boolean;
          approve?: string | boolean;
          dryRun?: boolean;
        },
      ) => {
        const projectDir = process.cwd();
        const io = createModifyTerminalIO();

        try {
          // Status mode
          if (options.status) {
            printModifyStatus(projectDir, io);
            return;
          }

          // Approve mode
          if (options.approve !== undefined) {
            const modificationId = typeof options.approve === "string"
              ? options.approve
              : undefined;

            const result = await approveModify({
              projectDir,
              modificationId,
              dryRun: options.dryRun,
              io,
            });

            if (result.errors.length > 0) {
              for (const err of result.errors) {
                logger.error(err);
              }
              process.exit(1);
            }

            logger.success(
              `Approved ${result.approved.length} modification(s).`,
            );
            return;
          }

          // Modify mode (default)
          const result = await runModify({
            projectDir,
            inputPath,
            dryRun: options.dryRun,
            io,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            if (result.modifications.length === 0) {
              process.exit(1);
            }
          }

          if (result.modifications.length > 0) {
            logger.success(
              `Generated ${result.modifications.length} modification(s). Review diffs, then: framework modify --approve`,
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
