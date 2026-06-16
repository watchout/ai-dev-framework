import * as path from "node:path";
import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import {
  DEFAULT_PROJECT_STATE_CONFIG_PATH,
  formatProjectStateValidationResult,
  validateGeneratedProjectState,
  writeGeneratedProjectState,
} from "../lib/project-state-generator.js";

export function registerRegenerateProjectStateCommand(program: Command): void {
  program
    .command("regenerate-project-state [path]")
    .description(
      "Regenerate or validate .framework/project.json from a generator config",
    )
    .option(
      "--config <path>",
      "Generator config path",
      DEFAULT_PROJECT_STATE_CONFIG_PATH,
    )
    .option("--check", "Validate drift without writing .framework/project.json")
    .option("--json", "Output machine-readable JSON")
    .action(
      (
        targetPath: string | undefined,
        options: {
          config: string;
          check?: boolean;
          json?: boolean;
        },
      ) => {
        const projectDir = path.resolve(process.cwd(), targetPath ?? ".");

        try {
          if (options.check) {
            const result = validateGeneratedProjectState(
              projectDir,
              options.config,
            );
            if (options.json) {
              process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            } else {
              process.stdout.write(formatProjectStateValidationResult(result));
            }
            if (!result.ok) process.exit(1);
            return;
          }

          const result = writeGeneratedProjectState(projectDir, options.config);
          if (options.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          } else {
            logger.success(
              `Regenerated .framework/project.json from ${result.configPath}`,
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (options.json) {
            process.stdout.write(
              `${JSON.stringify({ ok: false, error: message }, null, 2)}\n`,
            );
          } else {
            logger.error(message);
          }
          process.exit(1);
        }
      },
    );
}
