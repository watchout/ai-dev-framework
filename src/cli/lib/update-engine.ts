/**
 * update-engine.ts - Business logic for `framework update`
 *
 * Extracted from commands/update.ts for testability.
 * Handles agent template updates, skill template updates,
 * and deprecated directory cleanup.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { AGENT_TEMPLATES, type ProjectConfig } from "./templates.js";

// ─────────────────────────────────────────────
// Agent Templates
// ─────────────────────────────────────────────

/**
 * Update .claude/agents/ templates if the directory exists.
 * Only updates existing agent files — does not create new ones
 * unless the agents directory already exists.
 *
 * Returns the number of updated files.
 */
export function updateAgentTemplates(projectDir: string): number {
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

// ─────────────────────────────────────────────
// Skill Templates
// ─────────────────────────────────────────────

export const SKILL_DIRS = [
  "discovery",
  "design",
  "implement",
  "review",
] as const;

const DEPRECATED_SKILL_DIRS = [
  "business",
  "product",
  "technical",
  "implementation",
  "review-council",
  "deliberation",
];

/**
 * Update .claude/skills/ templates from a given source directory.
 * Copies SKILL.md files for each skill directory + _INDEX.md.
 * Removes deprecated v3 skill directories.
 *
 * @param projectDir  Root of the target project
 * @param frameworkRoot  Root of the framework repo (source of templates)
 * @returns the number of updated/created/removed items
 */
export function updateSkillTemplates(
  projectDir: string,
  frameworkRoot: string,
): number {
  const skillsDir = path.join(projectDir, ".claude/skills");
  if (!fs.existsSync(skillsDir)) {
    return 0;
  }

  let updated = 0;

  for (const skillName of SKILL_DIRS) {
    const srcPath = path.join(
      frameworkRoot,
      "templates/skills",
      skillName,
      "SKILL.md",
    );
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
  for (const dirName of DEPRECATED_SKILL_DIRS) {
    const deprecatedDir = path.join(skillsDir, dirName);
    if (fs.existsSync(deprecatedDir)) {
      fs.rmSync(deprecatedDir, { recursive: true, force: true });
      updated++;
    }
  }

  return updated;
}
