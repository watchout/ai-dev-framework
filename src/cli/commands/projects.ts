/**
 * framework projects - Project registry management command
 *
 * Manages the global registry of projects that use the framework.
 *
 * Subcommands:
 *   framework projects register [path]   - Register a project
 *   framework projects list              - List registered projects
 *   framework projects unregister [path] - Unregister a project
 */
import { type Command } from "commander";
import {
  registerProject,
  listRegisteredProjects,
  unregisterProject,
} from "../lib/projects-engine.js";
import { logger } from "../lib/logger.js";

export function registerProjectsCommand(program: Command): void {
  const projects = program
    .command("projects")
    .description("Project registry management (register, list, unregister)");

  // framework projects register
  projects
    .command("register")
    .description("Register a project in the global registry")
    .argument("[path]", "Path to project (default: current directory)")
    .action((projectPath?: string) => {
      const targetPath = projectPath ?? process.cwd();

      try {
        const result = registerProject(targetPath);

        if (result.success) {
          logger.success(result.message);
        } else {
          logger.error(result.message);
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework projects list
  projects
    .command("list")
    .description("List all registered projects")
    .action(() => {
      try {
        const result = listRegisteredProjects();

        if (result.projects.length === 0) {
          logger.info("No projects registered.");
          logger.info("Use 'framework projects register [path]' to register a project.");
          return;
        }

        logger.header("Registered Projects");
        logger.info("");

        for (const project of result.projects) {
          logger.info(`  ${project.name}`);
          logger.dim(`    ${project.path}`);
          logger.dim(`    Registered: ${project.registeredAt}`);
        }

        logger.info("");
        logger.info(`  Total: ${result.projects.length} project(s)`);

        for (const warning of result.warnings) {
          logger.warn(warning);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });

  // framework projects unregister
  projects
    .command("unregister")
    .description("Unregister a project from the global registry")
    .argument("[path]", "Path to project (default: current directory)")
    .action((projectPath?: string) => {
      const targetPath = projectPath ?? process.cwd();

      try {
        const result = unregisterProject(targetPath);

        if (result.success) {
          logger.success(result.message);
        } else {
          logger.error(result.message);
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        }
        process.exit(1);
      }
    });
}
