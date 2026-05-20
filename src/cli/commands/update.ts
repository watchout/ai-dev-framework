/**
 * shirube update - Update Shirube docs from the upstream repository
 *
 * Fetches the latest framework specification documents from the SSOT
 * repository and updates the project's docs/standards/ directory.
 *
 * Usage:
 *   shirube update [path]           Update framework docs
 *   shirube update [path] --status  Show current framework version
 *   shirube update --all            Update all registered projects
 */
import * as path from "node:path";
import { type Command } from "commander";
import {
  fetchFrameworkDocs,
  loadFrameworkState,
  findFrameworkRoot,
  FRAMEWORK_REPO,
} from "../lib/framework-fetch.js";
import {
  updateAgentTemplates,
  updateSkillTemplates,
} from "../lib/update-engine.js";
import { updateClaudeMdSkillSection } from "../lib/claudemd-updater.js";
import { installClaudeCodeHook } from "../lib/hooks-installer.js";
import { installMcpJson } from "../lib/mcp-installer.js";
import { installGitHubTemplates } from "../lib/github-templates.js";
import { checkAllGates } from "../lib/gate-engine.js";
import { loadProfileType, type ProfileType } from "../lib/profile-model.js";
import { logger } from "../lib/logger.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description(
      "Update Shirube docs from the upstream repository",
    )
    .argument(
      "[path]",
      "Path to project (default: current directory)",
    )
    .option("--status", "Show current framework version info")
    .option("--all", "Update all registered projects")
    .action(
      async (
        targetPath: string | undefined,
        options: { status?: boolean; all?: boolean },
      ) => {
        // --all: update all registered projects
        if (options.all) {
          try {
            const { listRegisteredProjects } = await import(
              "../lib/projects-engine.js"
            );
            const { projects, warnings } = listRegisteredProjects();

            if (projects.length === 0) {
              logger.info("No registered projects. Use 'shirube projects register' first.");
              return;
            }

            for (const w of warnings) {
              logger.warn(w);
            }

            logger.header("Update All Registered Projects");
            logger.info("");

            let successCount = 0;
            let failCount = 0;

            for (const project of projects) {
              logger.info(`  Updating: ${project.name} (${project.path})`);
              try {
                const profileType = loadProfileType(project.path) ?? undefined;
                const result = await fetchFrameworkDocs(project.path, {
                  force: true,
                  profileType,
                  backupExisting: true,
                });
                if (result.errors.length > 0) {
                  for (const err of result.errors) {
                    logger.error(`    ${err}`);
                  }
                  failCount++;
                } else {
                  updateReusableProjectFiles(project.path, profileType);
                  logger.success(`    Updated ${result.copiedFiles.length} files`);
                  if (result.archivedPath) {
                    logger.info(`    Previous standards archived: ${result.archivedPath}`);
                  }
                  successCount++;
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : "unknown error";
                logger.error(`    Failed: ${msg}`);
                failCount++;
              }
            }

            logger.info("");
            logger.info(`  Results: ${successCount} succeeded, ${failCount} failed`);
            if (failCount > 0) {
              process.exit(1);
            }
          } catch (error) {
            if (error instanceof Error) {
              logger.error(error.message);
            }
            process.exit(1);
          }
          return;
        }

        const projectDir = targetPath
          ? path.resolve(process.cwd(), targetPath)
          : process.cwd();

        try {
          // Show current status
          if (options.status) {
            const state = loadFrameworkState(projectDir);
            if (!state) {
              logger.info(
                "No framework state found. Run 'shirube init' or 'shirube update' first.",
              );
              return;
            }

            logger.header("  Framework Status");
            logger.info(`  Repository: ${state.repo}`);
            logger.info(`  Version:    ${state.version.slice(0, 8)}`);
            logger.info(`  Fetched:    ${state.fetchedAt}`);
            logger.info(`  Files:      ${state.files.length}`);
            return;
          }

          // Run update
          logger.info("");
          logger.info("━".repeat(38));
          logger.info("  FRAMEWORK UPDATE");
          logger.info("━".repeat(38));
          logger.info(`  Source: ${FRAMEWORK_REPO}`);
          logger.info(`  Target: ${projectDir}`);

          const existing = loadFrameworkState(projectDir);
          if (existing) {
            logger.info(
              `  Current version: ${existing.version.slice(0, 8)}`,
            );
          }

          const totalSteps = 9;
          const profileType = loadProfileType(projectDir) ?? undefined;
          logger.info("");
          logger.step(1, totalSteps, "Fetching latest framework docs...");

          const result = await fetchFrameworkDocs(projectDir, {
            force: true,
            profileType,
            backupExisting: true,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
          }

          if (result.archivedPath) {
            logger.info(`  Previous standards archived: ${result.archivedPath}`);
          }

          logger.step(2, totalSteps, "Updating Agent Teams templates...");
          const agentUpdates = updateAgentTemplates(projectDir);
          if (agentUpdates > 0) {
            logger.success(
              `Updated ${agentUpdates} agent templates`,
            );
          } else {
            logger.info("  Agent templates up to date (or not present)");
          }

          logger.step(3, totalSteps, "Updating skill templates...");
          const fwRoot = findFrameworkRoot();
          const skillUpdates = fwRoot
            ? updateSkillTemplates(projectDir, fwRoot)
            : 0;
          if (skillUpdates > 0) {
            logger.success(
              `Updated ${skillUpdates} skill templates`,
            );
          } else {
            logger.info("  Skill templates up to date (or not present)");
          }

          logger.step(
            4,
            totalSteps,
            "Updating CLAUDE.md skill section...",
          );
          const claudeMdResult = updateClaudeMdSkillSection(projectDir);
          if (claudeMdResult.updated) {
            logger.success(claudeMdResult.reason);
          } else {
            logger.info(`  ${claudeMdResult.reason}`);
          }

          logger.step(
            5,
            totalSteps,
            "Updating hooks (skill-tracker + pre-code-gate)...",
          );
          const hookResult = installClaudeCodeHook(projectDir);
          if (hookResult.files.length > 0) {
            logger.success(
              `Updated ${hookResult.files.length} hook files`,
            );
          }
          for (const w of hookResult.warnings) {
            logger.warn(w);
          }

          logger.step(
            6,
            totalSteps,
            "Updating .mcp.json (Playwright MCP)...",
          );
          const mcpResult = installMcpJson(projectDir);
          if (mcpResult.installed) {
            logger.success("Playwright MCP configured (.mcp.json)");
          } else {
            logger.info(`  ${mcpResult.reason}`);
          }

          logger.step(7, totalSteps, "Updating GitHub templates...");
          const ghResult = updateGitHubTemplates(projectDir, profileType);
          if (ghResult.installed.length > 0) {
            logger.success(`Updated ${ghResult.installed.length} GitHub templates`);
          } else {
            logger.info("  GitHub templates up to date (or template source unavailable)");
          }
          for (const w of ghResult.skipped) {
            logger.info(`  Skipped: ${w}`);
          }
          for (const err of ghResult.errors) {
            logger.warn(`GitHub templates: ${err}`);
          }

          logger.step(8, totalSteps, "Regenerating .framework/gates.json...");
          const gateResult = checkAllGates(projectDir, undefined, profileType);
          if (gateResult.allPassed) {
            logger.success("Gates regenerated: all passed");
          } else {
            logger.warn("Gates regenerated with failures; inspect .framework/gates.json");
          }

          logger.step(9, totalSteps, "Update complete.");
          logger.info("");
          logger.success(
            `Updated ${result.copiedFiles.length} framework docs`,
          );
          if (agentUpdates > 0) {
            logger.success(
              `Updated ${agentUpdates} agent templates`,
            );
          }
          if (skillUpdates > 0) {
            logger.success(
              `Updated ${skillUpdates} skill templates`,
            );
          }
          if (claudeMdResult.updated) {
            logger.success("CLAUDE.md skill section updated");
          }
          if (hookResult.files.length > 0) {
            logger.success("Hooks updated (skill-tracker + pre-code-gate)");
          }
          if (mcpResult.installed) {
            logger.success("Playwright MCP configured (.mcp.json)");
          }
          if (ghResult.installed.length > 0) {
            logger.success("GitHub templates updated");
          }
          logger.info(
            `  Version: ${result.version.slice(0, 8)}`,
          );
          logger.info("");
        } catch (error) {
          if (error instanceof Error) {
            logger.error(error.message);
          }
          process.exit(1);
        }
      },
    );
}

function updateReusableProjectFiles(
  projectDir: string,
  profileType?: ProfileType,
): void {
  const fwRoot = findFrameworkRoot();
  updateAgentTemplates(projectDir);
  if (fwRoot) {
    updateSkillTemplates(projectDir, fwRoot);
    updateGitHubTemplates(projectDir, profileType);
  }
  updateClaudeMdSkillSection(projectDir);
  installClaudeCodeHook(projectDir);
  installMcpJson(projectDir);
  checkAllGates(projectDir, undefined, profileType);
}

function updateGitHubTemplates(
  projectDir: string,
  profileType?: ProfileType,
) {
  const fwRoot = findFrameworkRoot();
  if (!fwRoot || !profileType) {
    return { installed: [], skipped: [], errors: [] };
  }
  return installGitHubTemplates(projectDir, profileType, fwRoot, {
    projectName: path.basename(projectDir),
    force: true,
    pruneObsolete: true,
  });
}
