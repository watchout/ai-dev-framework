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
import * as fs from "node:fs";
import * as path from "node:path";
import { type Command } from "commander";
import {
  fetchFrameworkDocs,
  loadFrameworkState,
  findFrameworkRoot,
  FRAMEWORK_REPO,
} from "../lib/framework-fetch.js";
import { AGENT_TEMPLATES, type ProjectConfig } from "../lib/templates.js";
import { updateClaudeMdSkillSection } from "../lib/claudemd-updater.js";
import { installClaudeCodeHook } from "../lib/hooks-installer.js";
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

          const totalSteps = 6;
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
          const skillUpdates = updateSkillTemplates(projectDir);
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

          logger.step(6, totalSteps, "Update complete.");
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

/**
 * Update .claude/agents/ templates if the directory exists.
 * Only updates existing agent files — does not create new ones
 * unless the agents directory already exists.
 *
 * Returns the number of updated files.
 */
function updateAgentTemplates(projectDir: string): number {
  const agentsDir = path.join(projectDir, ".claude/agents");
  if (!fs.existsSync(agentsDir)) {
    return 0;
  }

  // Read project name from .framework/project.json
  let projectName = path.basename(projectDir);
  try {
    const stateFile = path.join(projectDir, ".framework/project.json");
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      if (state.name) projectName = state.name;
    }
  } catch {
    // Fall back to directory name
  }

  const config: ProjectConfig = {
    projectName,
    description: "",
  };

  let updated = 0;
  for (const agent of AGENT_TEMPLATES) {
    const agentPath = path.join(agentsDir, agent.filename);
    const newContent = agent.generate(config);

    // Only update if file exists or agents dir was explicitly created
    if (fs.existsSync(agentPath)) {
      const existing = fs.readFileSync(agentPath, "utf-8");
      if (existing !== newContent) {
        fs.writeFileSync(agentPath, newContent, "utf-8");
        updated++;
      }
    } else {
      // Create missing agent files in existing agents directory
      fs.writeFileSync(agentPath, newContent, "utf-8");
      updated++;
    }
  }

  return updated;
}

const SKILL_DIRS = ["discovery", "design", "implement", "review"] as const;

/**
 * Update .claude/skills/ templates from the framework source.
 * Copies SKILL.md files for each skill directory + _INDEX.md.
 *
 * Returns the number of updated files.
 */
function updateSkillTemplates(projectDir: string): number {
  const skillsDir = path.join(projectDir, ".claude/skills");
  if (!fs.existsSync(skillsDir)) {
    return 0;
  }

  const frameworkRoot = findFrameworkRoot();
  if (!frameworkRoot) {
    return 0;
  }

  let updated = 0;

  for (const skillName of SKILL_DIRS) {
    const srcPath = path.join(frameworkRoot, "templates/skills", skillName, "SKILL.md");
    if (!fs.existsSync(srcPath)) continue;

    const destDir = path.join(skillsDir, skillName);
    const destPath = path.join(destDir, "SKILL.md");
    const newContent = fs.readFileSync(srcPath, "utf-8");

    if (fs.existsSync(destPath)) {
      const existing = fs.readFileSync(destPath, "utf-8");
      if (existing !== newContent) {
        fs.writeFileSync(destPath, newContent, "utf-8");
        updated++;
      }
    } else {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.writeFileSync(destPath, newContent, "utf-8");
      updated++;
    }
  }

  // Also update _INDEX.md
  const indexSrc = path.join(frameworkRoot, ".claude/skills/_INDEX.md");
  const indexDest = path.join(skillsDir, "_INDEX.md");
  if (fs.existsSync(indexSrc)) {
    const newContent = fs.readFileSync(indexSrc, "utf-8");
    if (fs.existsSync(indexDest)) {
      const existing = fs.readFileSync(indexDest, "utf-8");
      if (existing !== newContent) {
        fs.writeFileSync(indexDest, newContent, "utf-8");
        updated++;
      }
    } else {
      fs.writeFileSync(indexDest, newContent, "utf-8");
      updated++;
    }
  }

  // Remove deprecated skill directories (v3 → v4 migration)
  const DEPRECATED_SKILL_DIRS = [
    "business", "product", "technical", "implementation",
    "review-council", "deliberation",
  ];
  for (const dirName of DEPRECATED_SKILL_DIRS) {
    const deprecatedDir = path.join(skillsDir, dirName);
    if (fs.existsSync(deprecatedDir)) {
      fs.rmSync(deprecatedDir, { recursive: true, force: true });
      updated++;
    }
  }

  return updated;
}
