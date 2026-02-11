/**
 * framework accept - Feature acceptance command
 *
 * Reference: 22_FEATURE_ACCEPTANCE.md
 *
 * Runs acceptance checks on a feature:
 * - MUST Requirements (30pts)
 * - User Flow E2E (25pts)
 * - Error Flows (20pts)
 * - Non-Functional (15pts)
 * - Integration (10pts)
 *
 * Must score 100/100 for acceptance.
 */
import { type Command } from "commander";
import {
  runAcceptance,
  createAcceptTerminalIO,
} from "../lib/accept-engine.js";
import { logger } from "../lib/logger.js";

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept")
    .description(
      "Run feature acceptance check (100/100 required)",
    )
    .argument("<feature-id>", "Feature ID to check acceptance")
    .option("--status", "Show recent acceptance results")
    .action(
      (
        featureId: string,
        options: { status?: boolean },
      ) => {
        const projectDir = process.cwd();

        try {
          const io = createAcceptTerminalIO();
          const report = runAcceptance(
            projectDir,
            featureId,
            { status: options.status },
            io,
          );

          if (options.status) return;

          logger.info("");
          if (report.verdict === "accepted") {
            logger.success(
              `Feature ${featureId} accepted!`,
            );
          } else {
            logger.error(
              `Feature ${featureId} rejected - ` +
              `${report.rejectionReasons.length} issue(s) to resolve`,
            );
          }
          logger.info("");

          if (report.verdict === "rejected") {
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
