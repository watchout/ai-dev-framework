/**
 * framework init - Core logic (separated for testability)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  PROJECT_DIRECTORIES,
  DOC_PLACEHOLDERS,
} from "../lib/project-structure.js";
import {
  generateClaudeMd,
  generateCursorRules,
  generateGitignore,
  generateReadme,
  generateStartHere,
  generateDocsIndex,
  generateProjectState,
  AGENT_TEMPLATES,
  type ProjectConfig,
} from "../lib/templates.js";
import { fetchFrameworkDocs } from "../lib/framework-fetch.js";
import {
  type ProfileType,
  getProfile,
  isTemplateEnabled,
} from "../lib/profile-model.js";
import {
  createGateState,
  saveGateState,
} from "../lib/gate-model.js";
import { installAllHooks } from "../lib/hooks-installer.js";
import { logger } from "../lib/logger.js";

export interface InitOptions {
  projectName: string;
  description: string;
  targetDir: string;
  skipGit: boolean;
  /** Project type profile */
  profileType?: ProfileType;
  /** Skip git clone of framework repo (for testing) */
  frameworkSourceDir?: string;
}

export interface InitResult {
  projectPath: string;
  createdFiles: string[];
  errors: string[];
}

export async function initProject(options: InitOptions): Promise<InitResult> {
  const projectPath = path.resolve(options.targetDir, options.projectName);
  const createdFiles: string[] = [];
  const errors: string[] = [];

  const totalSteps = 10;

  // Check if directory already exists and is non-empty
  if (fs.existsSync(projectPath)) {
    const contents = fs.readdirSync(projectPath);
    if (contents.length > 0) {
      throw new Error(
        `Directory "${options.projectName}" already exists and is not empty. ` +
          `Choose a different name or remove the existing directory.`,
      );
    }
  }

  const profileType = options.profileType ?? "app";
  const profile = getProfile(profileType);

  const config: ProjectConfig = {
    projectName: options.projectName,
    description: options.description,
    profileType,
  };

  // Step 1: Create directory structure (profile-aware)
  logger.step(1, totalSteps, "Creating directory structure...");
  const directories = buildDirectoryList(profile.directories);
  for (const dir of directories) {
    const dirPath = path.join(projectPath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Step 2: Fetch framework docs from ai-dev-framework
  logger.step(2, totalSteps, "Fetching framework docs from ai-dev-framework...");
  const fetchResult = await fetchFrameworkDocs(projectPath, {
    sourceDir: options.frameworkSourceDir,
  });
  if (fetchResult.errors.length > 0) {
    for (const err of fetchResult.errors) {
      logger.warn(`Framework fetch: ${err}`);
    }
    errors.push(...fetchResult.errors);
  } else {
    logger.success(`Installed ${fetchResult.copiedFiles.length} framework docs`);
    createdFiles.push(...fetchResult.copiedFiles);
  }

  // Step 3: Create CLAUDE.md and .cursorrules
  logger.step(3, totalSteps, "Generating CLAUDE.md and .cursorrules...");
  const claudeMdPath = path.join(projectPath, "CLAUDE.md");
  fs.writeFileSync(claudeMdPath, generateClaudeMd(config), "utf-8");
  createdFiles.push("CLAUDE.md");

  const cursorRulesPath = path.join(projectPath, ".cursorrules");
  fs.writeFileSync(cursorRulesPath, generateCursorRules(config), "utf-8");
  createdFiles.push(".cursorrules");

  const startHerePath = path.join(projectPath, "START_HERE.md");
  fs.writeFileSync(startHerePath, generateStartHere(config), "utf-8");
  createdFiles.push("START_HERE.md");

  // Step 4: Create document placeholders (profile-filtered)
  logger.step(4, totalSteps, "Creating document placeholders...");
  for (const doc of DOC_PLACEHOLDERS) {
    // Skip docs/standards/ placeholders — they come from framework fetch
    if (doc.path.startsWith("docs/standards/")) continue;

    // Skip templates not enabled for this profile
    if (!isTemplateEnabled(profile, doc.path)) continue;

    const docPath = path.join(projectPath, doc.path);
    const docDir = path.dirname(docPath);
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }
    fs.writeFileSync(docPath, "", "utf-8");
    createdFiles.push(doc.path);
  }

  // Step 5: Create docs/INDEX.md
  logger.step(5, totalSteps, "Generating docs/INDEX.md...");
  const indexPath = path.join(projectPath, "docs/INDEX.md");
  fs.writeFileSync(indexPath, generateDocsIndex(), "utf-8");
  createdFiles.push("docs/INDEX.md");

  // Step 6: Create root files
  logger.step(6, totalSteps, "Creating root files...");
  const gitignorePath = path.join(projectPath, ".gitignore");
  fs.writeFileSync(gitignorePath, generateGitignore(), "utf-8");
  createdFiles.push(".gitignore");

  const readmePath = path.join(projectPath, "README.md");
  fs.writeFileSync(readmePath, generateReadme(config), "utf-8");
  createdFiles.push("README.md");

  // Step 7: Create Agent Teams templates (.claude/agents/)
  logger.step(7, totalSteps, "Creating Agent Teams templates...");
  for (const agent of AGENT_TEMPLATES) {
    const agentPath = path.join(projectPath, ".claude/agents", agent.filename);
    const agentDir = path.dirname(agentPath);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    fs.writeFileSync(agentPath, agent.generate(config), "utf-8");
    createdFiles.push(`.claude/agents/${agent.filename}`);
  }
  logger.success(`Created ${AGENT_TEMPLATES.length} agent definitions`);

  // Step 8: Copy skill templates (.claude/skills/)
  logger.step(8, totalSteps, "Installing skill templates...");
  const SKILL_DIRS = ["discovery", "design", "implement", "review"];
  const frameworkRoot = options.frameworkSourceDir
    ? options.frameworkSourceDir
    : path.join(projectPath, ".framework/tmp");
  let skillsCopied = 0;
  for (const skillName of SKILL_DIRS) {
    const srcPath = path.join(frameworkRoot, "templates/skills", skillName, "SKILL.md");
    const destDir = path.join(projectPath, ".claude/skills", skillName);
    const destPath = path.join(destDir, "SKILL.md");
    if (fs.existsSync(srcPath)) {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      createdFiles.push(`.claude/skills/${skillName}/SKILL.md`);
      skillsCopied++;
    }
  }
  // Also copy _INDEX.md
  const indexSrc = path.join(frameworkRoot, ".claude/skills/_INDEX.md");
  const indexDest = path.join(projectPath, ".claude/skills/_INDEX.md");
  if (fs.existsSync(indexSrc)) {
    const skillsDir = path.join(projectPath, ".claude/skills");
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    fs.copyFileSync(indexSrc, indexDest);
    createdFiles.push(".claude/skills/_INDEX.md");
  }
  logger.success(`Installed ${skillsCopied} skill templates`);

  // Step 9: Create framework state
  logger.step(9, totalSteps, "Initializing framework state...");
  const statePath = path.join(projectPath, ".framework/project.json");
  fs.writeFileSync(statePath, generateProjectState(config), "utf-8");
  createdFiles.push(".framework/project.json");

  // Initialize gate state (all pending)
  const gateState = createGateState();
  saveGateState(projectPath, gateState);
  createdFiles.push(".framework/gates.json");

  // Step 10: Install Pre-Code Gate hooks
  logger.step(10, totalSteps, "Installing Pre-Code Gate hooks...");
  const hooksResult = installAllHooks(projectPath);
  createdFiles.push(...hooksResult.files);
  for (const w of hooksResult.warnings) {
    logger.warn(w);
  }
  if (hooksResult.claudeHookInstalled) {
    logger.success("Claude Code hook installed (PreToolUse → Edit/Write)");
  }
  if (hooksResult.gitHookInstalled) {
    logger.success("Git pre-commit hook installed");
  }

  return { projectPath, createdFiles, errors };
}

/**
 * Build directory list from profile directories.
 * Profile directories are top-level (e.g. "src", "docs/idea").
 * For entries that match a prefix of PROJECT_DIRECTORIES, we expand
 * to include the detailed subdirectories from PROJECT_DIRECTORIES.
 * Always includes .framework dirs.
 */
function buildDirectoryList(profileDirs: string[]): string[] {
  if (profileDirs.length === 0) {
    return [...PROJECT_DIRECTORIES];
  }

  const result = new Set<string>();

  for (const profileDir of profileDirs) {
    // Add the profile dir itself
    result.add(profileDir);

    // Expand: include any PROJECT_DIRECTORIES entry under this prefix
    for (const projDir of PROJECT_DIRECTORIES) {
      if (projDir.startsWith(profileDir + "/") || projDir === profileDir) {
        result.add(projDir);
      }
    }
  }

  // Always include .framework directories
  for (const projDir of PROJECT_DIRECTORIES) {
    if (projDir.startsWith(".framework")) {
      result.add(projDir);
    }
  }

  return [...result];
}
