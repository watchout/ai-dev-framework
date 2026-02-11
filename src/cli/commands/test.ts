/**
 * framework test - Test audit command
 *
 * Reference: 18_TEST_FORMAT.md
 *
 * Runs static analysis on test files and generates a scorecard:
 * - SSOT Coverage (30pts)
 * - Execution Result (25pts)
 * - Coverage Score (15pts)
 * - Test Quality (15pts)
 * - Edge Cases (10pts)
 * - Maintainability (5pts)
 */
import { type Command } from "commander";
import {
  type TestLevel,
  loadTestReports,
} from "../lib/test-model.js";
import {
  runTestAudit,
  createTestTerminalIO,
} from "../lib/test-engine.js";
import { logger } from "../lib/logger.js";

const VALID_LEVELS: TestLevel[] = ["unit", "integration", "e2e"];

export function registerTestCommand(program: Command): void {
  program
    .command("test")
    .description(
      "Run test audit - analyze test quality and coverage",
    )
    .option(
      "--level <level>",
      "Test level: unit | integration | e2e",
    )
    .option("--status", "Show recent test audit results")
    .action(
      (options: { level?: string; status?: boolean }) => {
        const projectDir = process.cwd();

        try {
          // Validate level if provided
          if (
            options.level &&
            !VALID_LEVELS.includes(options.level as TestLevel)
          ) {
            logger.error(
              `Invalid test level: ${options.level}. Use: unit, integration, or e2e`,
            );
            process.exit(1);
          }

          const io = createTestTerminalIO();
          const report = runTestAudit(
            projectDir,
            {
              level: options.level as TestLevel | undefined,
              status: options.status,
            },
            io,
          );

          if (options.status) return;

          logger.info("");
          if (report.verdict === "pass") {
            logger.success("Test audit passed!");
          } else if (report.verdict === "warning") {
            logger.warn(
              "Test audit has warnings - improve coverage and quality",
            );
          } else {
            logger.error(
              "Test audit failed - address issues before proceeding",
            );
          }
          logger.info("");

          if (report.verdict === "fail") {
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
