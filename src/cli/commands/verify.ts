/**
 * framework verify - Run targeted quality verification
 * Reference: 25_VERIFICATION_LOOPS.md
 *
 * Verifies individual quality axes or all combined:
 * ssot, code, tests, types, or all (default).
 *
 * Usage:
 *   framework verify              Verify all targets
 *   framework verify code         Verify code quality only
 *   framework verify types        Verify type safety only
 *   framework verify --strict     Warnings become failures
 *   framework verify --fix        Placeholder for auto-fix
 */
import { type Command } from "commander";
import {
  type VerifyTarget,
} from "../lib/verification-model.js";
import {
  runVerify,
  createVerifyTerminalIO,
} from "../lib/verify-engine.js";
import { logger } from "../lib/logger.js";

const VALID_TARGETS: VerifyTarget[] = [
  "ssot", "code", "tests", "types", "all",
];

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .description(
      "Run targeted quality verification (ssot, code, tests, types, all)",
    )
    .argument(
      "[target]",
      "Verify target: ssot | code | tests | types | all",
      "all",
    )
    .option("--strict", "Treat warnings as failures")
    .option("--fix", "Attempt auto-fix (placeholder)")
    .action(
      async (
        target: string,
        options: { strict?: boolean; fix?: boolean },
      ) => {
        const projectDir = process.cwd();

        try {
          if (!VALID_TARGETS.includes(target as VerifyTarget)) {
            logger.error(
              `Invalid target: ${target}. Use: ${VALID_TARGETS.join(", ")}`,
            );
            process.exit(1);
          }

          const io = createVerifyTerminalIO();
          const result = await runVerify(
            projectDir,
            target as VerifyTarget,
            options,
            io,
          );

          if (result.verdict === "pass") {
            logger.success("Verification passed!");
          } else if (result.verdict === "warning") {
            logger.warn(
              "Verification passed with warnings - review issues",
            );
          } else {
            logger.error(
              "Verification failed - address issues before proceeding",
            );
          }

          if (result.verdict === "fail") {
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
