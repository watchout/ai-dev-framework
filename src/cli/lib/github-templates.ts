/**
 * GitHub template installer — copies .github/ templates (CI, PR, Issue, CODEOWNERS)
 * Based on: specs/05_IMPLEMENTATION.md Part 3-4
 *
 * Installs:
 * - .github/workflows/ci.yml (from templates/ci/{profileType}.yml)
 * - .github/PULL_REQUEST_TEMPLATE.md
 * - .github/ISSUE_TEMPLATE/ (feature-db, feature-api, feature-ui, feature-test, bug)
 * - .github/CODEOWNERS
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ProfileType } from "./profile-model.js";

export interface GitHubTemplateResult {
  installed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Install all .github/ templates into a project directory.
 *
 * @param projectDir Target project directory
 * @param profileType Project profile (app, api, cli, lp, hp) — determines CI workflow
 * @param frameworkRoot Root of the ai-dev-framework repo (for template source)
 * @param options.projectName Used for CI workflow {{PROJECT_NAME}} replacement
 * @param options.force Overwrite existing files (default: false)
 */
export function installGitHubTemplates(
  projectDir: string,
  profileType: ProfileType,
  frameworkRoot: string,
  options?: { projectName?: string; force?: boolean },
): GitHubTemplateResult {
  const installed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const force = options?.force ?? false;
  const projectName = options?.projectName ?? path.basename(projectDir);

  // Ensure directories exist
  const dirs = [
    ".github/workflows",
    ".github/ISSUE_TEMPLATE",
  ];
  for (const dir of dirs) {
    const dirPath = path.join(projectDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // 1. CI workflow (profile-specific)
  const ciSrc = path.join(frameworkRoot, "templates/ci", `${profileType}.yml`);
  const ciDest = path.join(projectDir, ".github/workflows/ci.yml");
  if (fs.existsSync(ciSrc)) {
    if (!fs.existsSync(ciDest) || force) {
      let content = fs.readFileSync(ciSrc, "utf-8");
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      fs.writeFileSync(ciDest, content, "utf-8");
      installed.push(".github/workflows/ci.yml");
    } else {
      skipped.push(".github/workflows/ci.yml (exists)");
    }
  } else {
    // Fallback to common.yml
    const commonSrc = path.join(frameworkRoot, "templates/ci/common.yml");
    if (fs.existsSync(commonSrc)) {
      if (!fs.existsSync(ciDest) || force) {
        let content = fs.readFileSync(commonSrc, "utf-8");
        content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
        fs.writeFileSync(ciDest, content, "utf-8");
        installed.push(".github/workflows/ci.yml (common fallback)");
      } else {
        skipped.push(".github/workflows/ci.yml (exists)");
      }
    } else {
      errors.push(`CI template not found for profile: ${profileType}`);
    }
  }

  // 2. PR Template
  const prTemplateSrc = path.join(frameworkRoot, "templates/github/PULL_REQUEST_TEMPLATE.md");
  const prTemplateDest = path.join(projectDir, ".github/PULL_REQUEST_TEMPLATE.md");
  copyTemplateFile(prTemplateSrc, prTemplateDest, force, installed, skipped, errors);

  // 3. Issue Templates
  const issueTemplates = [
    "feature-db.md",
    "feature-api.md",
    "feature-ui.md",
    "feature-test.md",
    "bug.md",
  ];
  for (const tmpl of issueTemplates) {
    const src = path.join(frameworkRoot, "templates/github/ISSUE_TEMPLATE", tmpl);
    const dest = path.join(projectDir, ".github/ISSUE_TEMPLATE", tmpl);
    copyTemplateFile(src, dest, force, installed, skipped, errors);
  }

  // 4. CODEOWNERS
  const codeownersSrc = path.join(frameworkRoot, "templates/github/CODEOWNERS");
  const codeownersDest = path.join(projectDir, ".github/CODEOWNERS");
  copyTemplateFile(codeownersSrc, codeownersDest, force, installed, skipped, errors);

  return { installed, skipped, errors };
}

function copyTemplateFile(
  src: string,
  dest: string,
  force: boolean,
  installed: string[],
  skipped: string[],
  errors: string[],
): void {
  const relativeDest = dest.includes(".github/")
    ? ".github/" + dest.split(".github/")[1]
    : path.basename(dest);

  if (!fs.existsSync(src)) {
    errors.push(`Template not found: ${src}`);
    return;
  }

  if (fs.existsSync(dest) && !force) {
    skipped.push(`${relativeDest} (exists)`);
    return;
  }

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.copyFileSync(src, dest);
  installed.push(relativeDest);
}
