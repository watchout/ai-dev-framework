/**
 * framework visual-test - Visual test audit command
 *
 * Reference: 20_VISUAL_TEST.md
 *
 * Analyzes visual test infrastructure and readiness:
 * - Level 1: Display Test (画面表示テスト)
 * - Level 2: Operation Flow Test (操作フローテスト)
 * - Level 3: State Display Test (状態表示テスト)
 * - Level 4: Responsive Test (レスポンシブテスト)
 * - Level 5: Performance Test (パフォーマンステスト)
 */
import { type Command } from "commander";
import { type VisualTestLevel } from "../lib/visual-test-model.js";
import {
  runVisualTest,
  createVisualTestTerminalIO,
} from "../lib/visual-test-engine.js";
import { logger } from "../lib/logger.js";

const VALID_LEVELS: VisualTestLevel[] = [1, 2, 3, 4, 5];

export function registerVisualTestCommand(program: Command): void {
  program
    .command("visual-test")
    .description(
      "Run visual test audit - analyze visual testing readiness",
    )
    .option(
      "--level <level>",
      "Visual test level: 1-5",
    )
    .option("--status", "Show recent visual test results")
    .action(
      (options: { level?: string; status?: boolean }) => {
        const projectDir = process.cwd();

        try {
          // Validate level if provided
          let parsedLevel: VisualTestLevel | undefined;
          if (options.level) {
            const num = parseInt(options.level, 10);
            if (!VALID_LEVELS.includes(num as VisualTestLevel)) {
              logger.error(
                `Invalid visual test level: ${options.level}. Use: 1, 2, 3, 4, or 5`,
              );
              process.exit(1);
            }
            parsedLevel = num as VisualTestLevel;
          }

          const io = createVisualTestTerminalIO();
          const report = runVisualTest(
            projectDir,
            {
              level: parsedLevel,
              status: options.status,
            },
            io,
          );

          if (options.status) return;

          logger.info("");
          if (report.verdict === "pass") {
            logger.success("Visual test audit passed!");
          } else if (report.verdict === "warning") {
            logger.warn(
              "Visual test audit has warnings - improve coverage",
            );
          } else {
            logger.error(
              "Visual test audit failed - set up visual testing infrastructure",
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
