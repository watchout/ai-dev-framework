/**
 * Framework fetch utility - Provides framework documents from unified repo
 *
 * Used by `framework init` and `framework update` to obtain framework
 * specification documents, templates, and skills.
 *
 * SSOT principle: This repository IS the source of truth (unified repo).
 * When running locally, uses local templates/. When installed via npm,
 * falls back to cloning the repo.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const FRAMEWORK_REPO =
  "https://github.com/watchout/ai-dev-framework.git";
const FRAMEWORK_STATE_FILE = "framework.json";

/**
 * Find the framework root directory (for unified repo usage)
 * Returns null if not running from within the framework repo
 */
export function findFrameworkRoot(): string | null {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Walk up looking for CLAUDE.md and templates/
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    const claudeMd = path.join(current, "CLAUDE.md");
    const templates = path.join(current, "templates");
    if (fs.existsSync(claudeMd) && fs.existsSync(templates)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FrameworkFetchResult {
  copiedFiles: string[];
  version: string;
  errors: string[];
}

export interface FrameworkState {
  repo: string;
  version: string;
  fetchedAt: string;
  files: string[];
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Fetch framework docs from ai-dev-framework repo into target project.
 *
 * @param targetDir  Root of the target project
 * @param options.force  Overwrite existing docs/standards/ (used by update)
 * @param options.sourceDir  Skip git clone; copy from this dir instead (for testing)
 */
export async function fetchFrameworkDocs(
  targetDir: string,
  options?: { force?: boolean; sourceDir?: string },
): Promise<FrameworkFetchResult> {
  const errors: string[] = [];
  const copiedFiles: string[] = [];
  let version = "unknown";

  const standardsDir = path.join(targetDir, "docs/standards");

  // Guard: non-empty target without --force
  if (!options?.force && fs.existsSync(standardsDir)) {
    const contents = fs.readdirSync(standardsDir).filter(
      (f) => !f.startsWith("."),
    );
    if (contents.length > 0) {
      errors.push(
        "docs/standards/ already exists and is not empty. " +
          "Use framework update to overwrite.",
      );
      return { copiedFiles, version, errors };
    }
  }

  // Determine source: provided directory, local framework repo, or git clone
  let cloneDir: string | null = null;
  let sourceDir = options?.sourceDir ?? null;

  if (!sourceDir) {
    // First, check if we're running from within the framework repo
    const frameworkRoot = findFrameworkRoot();
    if (frameworkRoot) {
      // Use local templates/ directory
      const localTemplates = path.join(frameworkRoot, "templates");
      if (fs.existsSync(localTemplates)) {
        sourceDir = localTemplates;
        // Get version from local git
        try {
          const { stdout } = await execFileAsync("git", [
            "-C",
            frameworkRoot,
            "rev-parse",
            "HEAD",
          ]);
          version = `local:${stdout.trim().slice(0, 8)}`;
        } catch {
          version = "local:unknown";
        }
      }
    }
  }

  // Fall back to git clone if no local source available
  if (!sourceDir) {
    cloneDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "framework-fetch-"),
    );
    try {
      await execFileAsync("git", [
        "clone",
        "--depth",
        "1",
        FRAMEWORK_REPO,
        cloneDir,
      ]);
      const { stdout } = await execFileAsync("git", [
        "-C",
        cloneDir,
        "rev-parse",
        "HEAD",
      ]);
      version = stdout.trim();
      sourceDir = cloneDir;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "unknown error";
      errors.push(`Failed to clone framework repository: ${msg}`);
      fs.rmSync(cloneDir, { recursive: true, force: true });
      return { copiedFiles, version, errors };
    }
  }

  try {
    // Clear existing if force mode
    if (options?.force && fs.existsSync(standardsDir)) {
      fs.rmSync(standardsDir, { recursive: true, force: true });
    }

    // Ensure target directory exists
    if (!fs.existsSync(standardsDir)) {
      fs.mkdirSync(standardsDir, { recursive: true });
    }

    // Copy framework files
    copyDirRecursive(sourceDir, standardsDir, copiedFiles, targetDir);

    // Save framework state
    saveFrameworkState(targetDir, {
      repo: FRAMEWORK_REPO,
      version,
      fetchedAt: new Date().toISOString(),
      files: copiedFiles,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "unknown error";
    errors.push(`Failed to install framework docs: ${msg}`);
  } finally {
    // Cleanup temp clone
    if (cloneDir) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    }
  }

  return { copiedFiles, version, errors };
}

/**
 * Load framework state from .framework/framework.json
 */
export function loadFrameworkState(
  projectDir: string,
): FrameworkState | null {
  const statePath = path.join(
    projectDir,
    ".framework",
    FRAMEWORK_STATE_FILE,
  );
  if (!fs.existsSync(statePath)) return null;

  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw) as FrameworkState;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function saveFrameworkState(
  projectDir: string,
  state: FrameworkState,
): void {
  const frameworkDir = path.join(projectDir, ".framework");
  if (!fs.existsSync(frameworkDir)) {
    fs.mkdirSync(frameworkDir, { recursive: true });
  }
  const statePath = path.join(frameworkDir, FRAMEWORK_STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Directories in templates/ that should NOT be copied to docs/standards/.
 * These are distribution templates handled separately by init/update/hooks.
 */
const EXCLUDED_TEMPLATE_DIRS = new Set([
  "ci",
  "hooks",
  "profiles",
  "project",
  "skills",
]);

/**
 * Recursively copy directory contents, skipping .git, .DS_Store,
 * and distribution-only template directories.
 */
function copyDirRecursive(
  src: string,
  dest: string,
  copiedFiles: string[],
  projectDir: string,
  isTopLevel = true,
): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === ".DS_Store") continue;

    // Skip distribution-only directories at top level of templates/
    if (
      isTopLevel &&
      entry.isDirectory() &&
      EXCLUDED_TEMPLATE_DIRS.has(entry.name)
    ) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyDirRecursive(srcPath, destPath, copiedFiles, projectDir, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(path.relative(projectDir, destPath));
    }
  }
}
