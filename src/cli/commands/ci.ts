/**
 * framework ci - CI/PR pipeline command
 *
 * Reference: 19_CI_PR_STANDARDS.md
 *
 * Runs CI checks: lint, unit-test, integration-test, build, e2e, security
 * Supports --status (history) and --checklist (PR readiness) modes.
 */
import { type Command } from "commander";
import { type CIStage } from "../lib/ci-model.js";
import { runCI, createCITerminalIO } from "../lib/ci-engine.js";
import { logger } from "../lib/logger.js";

const VALID_STAGES: CIStage[] = [
  "lint",
  "unit-test",
  "integration-test",
  "build",
  "e2e",
  "security",
];

export function registerCICommand(program: Command): void {
  program
    .command("ci")
    .description("Run CI pipeline checks (lint, test, build, security)")
    .option(
      "--stage <stage>",
      "Run a specific stage: lint, unit-test, integration-test, build, e2e, security",
    )
    .option("--status", "Show recent CI results")
    .option("--checklist", "Show PR readiness checklist")
    .action(
      (options: {
        stage?: string;
        status?: boolean;
        checklist?: boolean;
      }) => {
        const projectDir = process.cwd();

        try {
          // Validate stage if provided
          if (
            options.stage &&
            !VALID_STAGES.includes(options.stage as CIStage)
          ) {
            logger.error(
              `Invalid stage: ${options.stage}. Valid stages: ${VALID_STAGES.join(", ")}`,
            );
            process.exit(1);
          }

          const io = createCITerminalIO();
          const report = runCI(
            projectDir,
            {
              stage: options.stage as CIStage | undefined,
              status: options.status,
              checklist: options.checklist,
            },
            io,
          );

          if (
            report.verdict === "not_ready" &&
            !options.status &&
            !options.checklist
          ) {
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
