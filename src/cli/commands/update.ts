/**
 * framework update - Update framework docs from ai-dev-framework repository
 *
 * Fetches the latest framework specification documents from the SSOT
 * repository and updates the project's docs/standards/ directory.
 *
 * Usage:
 *   framework update [path]           Update framework docs
 *   framework update [path] --status  Show current framework version
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
import { logger } from "../lib/logger.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description(
      "Update framework docs from ai-dev-framework repository",
    )
    .argument(
      "[path]",
      "Path to project (default: current directory)",
    )
    .option("--status", "Show current framework version info")
    .action(
      async (
        targetPath: string | undefined,
        options: { status?: boolean },
      ) => {
        const projectDir = targetPath
          ? path.resolve(process.cwd(), targetPath)
          : process.cwd();

        try {
          // Show current status
          if (options.status) {
            const state = loadFrameworkState(projectDir);
            if (!state) {
              logger.info(
                "No framework state found. Run 'framework init' or 'framework update' first.",
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

          const totalSteps = 7;
          logger.info("");
          logger.step(1, totalSteps, "Fetching latest framework docs...");

          const result = await fetchFrameworkDocs(projectDir, {
            force: true,
          });

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              logger.error(err);
            }
            process.exit(1);
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

          logger.step(7, totalSteps, "Update complete.");
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
