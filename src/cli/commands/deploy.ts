/**
 * framework deploy - Deployment command
 *
 * Reference: 23_DEPLOY_RELEASE.md
 *
 * Deploys to staging or production environments.
 * Supports --dry-run, --rollback, --status modes.
 */
import { type Command } from "commander";
import { type Environment } from "../lib/deploy-model.js";
import {
  runDeploy,
  createDeployTerminalIO,
} from "../lib/deploy-engine.js";
import { logger } from "../lib/logger.js";

const VALID_ENVIRONMENTS: Environment[] = ["staging", "production"];

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description("Deploy to staging or production")
    .argument(
      "<environment>",
      "Target environment: staging | production",
    )
    .option("--dry-run", "Show deploy plan without executing")
    .option("--version <ver>", "Specific version to deploy")
    .option("--rollback", "Show rollback procedure")
    .option("--status", "Show deploy history for environment")
    .action(
      async (
        environment: string,
        options: {
          dryRun?: boolean;
          version?: string;
          rollback?: boolean;
          status?: boolean;
        },
      ) => {
        const projectDir = process.cwd();

        try {
          if (
            !VALID_ENVIRONMENTS.includes(environment as Environment)
          ) {
            logger.error(
              `Invalid environment: ${environment}. Use: ${VALID_ENVIRONMENTS.join(", ")}`,
            );
            process.exit(1);
          }

          const io = createDeployTerminalIO();
          const report = await runDeploy(
            projectDir,
            environment as Environment,
            {
              dryRun: options.dryRun,
              version: options.version,
              rollback: options.rollback,
              status: options.status,
            },
            io,
          );

          if (
            !report.success &&
            !options.status &&
            !options.rollback &&
            !options.dryRun
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
