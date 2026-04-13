/**
 * Gate engine - Pre-Code Gate check logic
 * Based on: CLAUDE.md §Pre-Code Gate (A/B/C)
 *
 * Checks three gates before allowing implementation:
 * - Gate A: Development environment / infrastructure ready
 * - Gate B: Task decomposition and planning complete
 * - Gate C: SSOT completeness (§3-E/F/G/H sections)
 *
 * v4.0: Gate C is profile-aware and filters non-feature-spec files.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadSyncState } from "./github-model.js";
import {
  type GateState,
  type GateCheck,
  type SSOTCheck,
  type AllGatesResult,
  createGateState,
  updateGateA,
  updateGateB,
  updateGateC,
  buildAllGatesResult,
  loadGateState,
  saveGateState,
} from "./gate-model.js";
import { loadPlan } from "./plan-model.js";
import {
  GATE_A_REQUIREMENTS,
  loadProfileType,
  type ProfileType,
} from "./profile-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface GateIO {
  print(message: string): void;
}

export function createGateTerminalIO(): GateIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Gate A: Environment Check
// ─────────────────────────────────────────────

/**
 * Check development environment readiness.
 *
 * Profile-aware: the GATE_A_REQUIREMENTS table (profile-model.ts)
 * declares which infrastructure checks apply to a given profile.
 * Skipped checks emit an informational "skipped" entry that passes
 * without requiring the file/directory to exist.
 *
 * Profile resolution order:
 *   1. Explicit `profile` argument (e.g., CLI --profile flag)
 *   2. `.framework/project.json` profileType
 *   3. Default: "app" (backward-compat with pre-profile behavior)
 */
export function checkGateA(
  projectDir: string,
  profile?: ProfileType,
): GateCheck[] {
  const effectiveProfile: ProfileType =
    profile ?? loadProfileType(projectDir) ?? "app";
  const reqs = GATE_A_REQUIREMENTS[effectiveProfile];
  const checks: GateCheck[] = [];

  // package.json — required for ALL profiles (Node.js project assumption)
  checks.push(checkFileExists(
    projectDir,
    "package.json",
    "package.json exists",
    "package.json not found. Run 'npm init' or create package.json.",
  ));

  // node_modules — required for ALL profiles
  checks.push(checkDirExists(
    projectDir,
    "node_modules",
    "Dependencies installed (node_modules/)",
    "node_modules/ not found. Run 'npm install' or 'pnpm install'.",
  ));

  // .env / .env.example — conditional on profile
  if (reqs.envExample) {
    const hasEnv = fs.existsSync(path.join(projectDir, ".env"));
    const hasEnvExample = fs.existsSync(path.join(projectDir, ".env.example"));
    checks.push({
      name: "Environment config (.env or .env.example)",
      passed: hasEnv || hasEnvExample,
      message: hasEnv || hasEnvExample
        ? "Environment config found"
        : ".env or .env.example not found. Create environment config.",
    });
  } else {
    checks.push({
      name: "Environment config (.env or .env.example)",
      passed: true,
      message: `Skipped for profile '${effectiveProfile}' (no environment variables expected)`,
    });
  }

  // docker-compose — conditional on profile
  if (reqs.dockerCompose) {
    const hasDockerCompose =
      fs.existsSync(path.join(projectDir, "docker-compose.yml")) ||
      fs.existsSync(path.join(projectDir, "docker-compose.yaml")) ||
      fs.existsSync(path.join(projectDir, "compose.yml")) ||
      fs.existsSync(path.join(projectDir, "compose.yaml"));
    checks.push({
      name: "Docker Compose config",
      passed: hasDockerCompose,
      message: hasDockerCompose
        ? "Docker Compose config found"
        : "docker-compose.yml not found. DB/Redis may not be available.",
    });
  } else {
    checks.push({
      name: "Docker Compose config",
      passed: true,
      message: `Skipped for profile '${effectiveProfile}' (no local infra services required)`,
    });
  }

  // DB migration — conditional on profile. Accepts any of the common layouts.
  //
  // Policy (CEO 2026-04-13 directive): for profiles where DB is expected
  // (app/api/lp/hp), a missing migrations directory emits a **WARNING only**
  // (passed: true) rather than failing Gate A. Rationale: existing adopter
  // repos (hotel-kanri, haishin-puls-hub, etc.) have not been verified to
  // conform to the canonical layouts; failing them unannounced is the same
  // class of breaking change as PR #164 (S2-A fallback removal). The check
  // will be promoted to required in a follow-up PR after all adopters are
  // audited and migrated.
  if (reqs.dbMigration) {
    const hasMigrations =
      fs.existsSync(path.join(projectDir, "prisma/migrations")) ||
      fs.existsSync(path.join(projectDir, "migrations")) ||
      fs.existsSync(path.join(projectDir, "db/migrations")) ||
      fs.existsSync(path.join(projectDir, "supabase/migrations")) ||
      fs.existsSync(path.join(projectDir, "drizzle"));
    checks.push({
      name: "Database migrations directory",
      passed: true,
      message: hasMigrations
        ? "Migrations directory found"
        : "WARNING: No migrations directory found (prisma/migrations, migrations/, db/migrations/, supabase/migrations/, or drizzle/). Consider adding one. (non-blocking pending framework-wide audit)",
    });
  } else {
    checks.push({
      name: "Database migrations directory",
      passed: true,
      message: `Skipped for profile '${effectiveProfile}' (no database expected)`,
    });
  }

  // CI config — required for ALL profiles per CEO-approved matrix
  if (reqs.ciConfig) {
    const hasCIConfig =
      fs.existsSync(path.join(projectDir, ".github/workflows")) ||
      fs.existsSync(path.join(projectDir, ".github/workflows/ci.yml")) ||
      fs.existsSync(path.join(projectDir, ".github/workflows/ci.yaml"));
    checks.push({
      name: "CI configuration (.github/workflows/)",
      passed: hasCIConfig,
      message: hasCIConfig
        ? "CI configuration found"
        : ".github/workflows/ not found. Run 'framework ci' to set up CI.",
    });
  } else {
    // Reserved for future profiles; no current profile skips CI.
    checks.push({
      name: "CI configuration (.github/workflows/)",
      passed: true,
      message: `Skipped for profile '${effectiveProfile}'`,
    });
  }

  // .framework/ directory — required for ALL profiles
  checks.push(checkDirExists(
    projectDir,
    ".framework",
    "Framework management (.framework/)",
    ".framework/ not found. Run 'framework retrofit' or 'framework init'.",
  ));

  return checks;
}

// ─────────────────────────────────────────────
// Gate B: Planning Check
// ─────────────────────────────────────────────

/**
 * Check that task decomposition and planning is complete.
 */
export function checkGateB(projectDir: string): GateCheck[] {
  const checks: GateCheck[] = [];

  // Check .framework/plan.json exists
  const plan = loadPlan(projectDir);
  checks.push({
    name: "Implementation plan (.framework/plan.json)",
    passed: plan !== null,
    message: plan !== null
      ? `Plan found: ${plan.waves.length} waves, status=${plan.status}`
      : "No plan found. Run 'framework plan' to generate.",
  });

  // Check plan has waves/features
  if (plan) {
    const totalFeatures = plan.waves.reduce(
      (sum, w) => sum + w.features.length,
      0,
    );
    checks.push({
      name: "Plan contains features",
      passed: totalFeatures > 0,
      message: totalFeatures > 0
        ? `${totalFeatures} features across ${plan.waves.length} waves`
        : "Plan has no features. Re-run 'framework plan'.",
    });
  } else {
    checks.push({
      name: "Plan contains features",
      passed: false,
      message: "Cannot check features — no plan exists.",
    });
  }

  // Check .framework/project.json exists (profile configured)
  const hasProject = fs.existsSync(
    path.join(projectDir, ".framework/project.json"),
  );
  checks.push({
    name: "Project profile configured (.framework/project.json)",
    passed: hasProject,
    message: hasProject
      ? "Project profile found"
      : "No project profile. Run 'framework retrofit' again to generate .framework/project.json.",
  });

  // Check GitHub Issues sync (informational — does not fail Gate B)
  const syncState = loadSyncState(projectDir);
  if (syncState && plan) {
    const totalFeatures = plan.waves.reduce(
      (sum, w) => sum + w.features.length,
      0,
    );
    const syncedFeatures = syncState.featureIssues.length;
    checks.push({
      name: "GitHub Issues synced (informational)",
      passed: true, // Always passes — informational only
      message: syncedFeatures >= totalFeatures
        ? `All ${syncedFeatures} features synced to GitHub Issues`
        : `${syncedFeatures}/${totalFeatures} features synced. Run 'framework plan --sync' to sync remaining.`,
    });
  }

  return checks;
}

// ─────────────────────────────────────────────
// Gate C: SSOT Completeness Check
// ─────────────────────────────────────────────

/** All possible SSOT sections */
const ALL_SECTIONS = [
  { id: "§3-E", pattern: /§3-E|§ *3-E|### .*入出力例|## .*入出力例|input.*output.*example/i },
  { id: "§3-F", pattern: /§3-F|§ *3-F|### .*境界値|## .*境界値|boundary/i },
  { id: "§3-G", pattern: /§3-G|§ *3-G|### .*例外応答|## .*例外応答|exception.*response/i },
  { id: "§3-H", pattern: /§3-H|§ *3-H|### .*Gherkin|## .*Gherkin|Scenario:/i },
];

/**
 * Get required sections based on project profile type.
 * - lp, hp: Gate C auto-passes (no feature specs needed)
 * - api, cli: §3-E/G/H required (§3-F boundary values optional)
 * - app: all sections required
 */
function getRequiredSections(profileType?: ProfileType) {
  if (profileType === "api" || profileType === "cli") {
    return ALL_SECTIONS.filter((s) => s.id !== "§3-F");
  }
  return ALL_SECTIONS;
}

/**
 * Check SSOT files for §3-E/F/G/H completeness.
 *
 * v4.0 improvements:
 * - Profile-aware: lp/hp profiles auto-pass Gate C
 * - Excludes non-feature-spec files (core definitions, PRDs, reports, etc.)
 * - Skips empty/stub files (< 10 lines)
 * - Filters out archived and non-SSOT paths
 * - Recognizes new-format SSOT (SSOT-0~5) as complete
 */
export function checkGateC(projectDir: string): SSOTCheck[] {
  const checks: SSOTCheck[] = [];
  const profileType = loadProfileType(projectDir);

  // LP and HP profiles don't require feature specs — auto-pass
  if (profileType === "lp" || profileType === "hp") {
    checks.push({
      name: "Gate C (profile: " + profileType + ")",
      passed: true,
      message: `Profile '${profileType}' does not require feature spec completeness. Gate C auto-passed.`,
      filePath: "",
      missingSections: [],
    });
    return checks;
  }

  // New-format SSOT (SSOT-0~5) auto-passes Gate C
  const newFormatFiles = findNewFormatSSOTFiles(projectDir);
  if (newFormatFiles.length > 0) {
    const fileList = newFormatFiles.map((f) => path.relative(projectDir, f));
    checks.push({
      name: "Gate C (new-format SSOT-0~5)",
      passed: true,
      message: `New-format SSOT detected (${newFormatFiles.length} files: ${fileList.join(", ")}). Gate C auto-passed.`,
      filePath: "",
      missingSections: [],
    });
    return checks;
  }

  const requiredSections = getRequiredSections(profileType ?? undefined);

  // Find SSOT files in known locations
  const ssotPaths = findSSOTFiles(projectDir);

  if (ssotPaths.length === 0) {
    checks.push({
      name: "SSOT files found",
      passed: false,
      message: "No SSOT feature spec files found in docs/. Create feature specifications first.",
      filePath: "",
      missingSections: [],
    });
    return checks;
  }

  // Check each SSOT file
  for (const ssotPath of ssotPaths) {
    const relativePath = path.relative(projectDir, ssotPath);
    const content = fs.readFileSync(ssotPath, "utf-8");
    const missingSections: string[] = [];

    for (const section of requiredSections) {
      if (!section.pattern.test(content)) {
        missingSections.push(section.id);
      }
    }

    // Also check that existing sections are not empty stubs
    for (const section of requiredSections) {
      if (missingSections.includes(section.id)) continue;
      if (isSectionEmpty(content, section.id)) {
        missingSections.push(`${section.id}(empty)`);
      }
    }

    const passed = missingSections.length === 0;
    checks.push({
      name: `${relativePath}`,
      passed,
      message: passed
        ? `${relativePath}: All required sections present`
        : `${relativePath}: Missing ${missingSections.join(", ")}`,
      filePath: relativePath,
      missingSections,
    });
  }

  return checks;
}

// ─────────────────────────────────────────────
// Integrated Gate Check
// ─────────────────────────────────────────────

/**
 * Run all gates and persist the result.
 */
export function checkAllGates(
  projectDir: string,
  io?: GateIO,
  profile?: ProfileType,
): AllGatesResult {
  let state = loadGateState(projectDir) ?? createGateState();

  // Gate A
  io?.print("\n  [1/3] Gate A: Environment check...");
  const checksA = checkGateA(projectDir, profile);
  updateGateA(state, checksA);
  printChecks(io, checksA);

  // Gate B
  io?.print("\n  [2/3] Gate B: Planning check...");
  const checksB = checkGateB(projectDir);
  updateGateB(state, checksB);
  printChecks(io, checksB);

  // Gate C
  io?.print("\n  [3/3] Gate C: SSOT completeness check...");
  const checksC = checkGateC(projectDir);
  updateGateC(state, checksC);
  printChecks(io, checksC);

  // Save
  saveGateState(projectDir, state);

  return buildAllGatesResult(state);
}

/**
 * Run a single gate and persist the result.
 */
export function checkSingleGate(
  projectDir: string,
  gateId: "A" | "B" | "C",
  io?: GateIO,
  profile?: ProfileType,
): AllGatesResult {
  let state = loadGateState(projectDir) ?? createGateState();

  switch (gateId) {
    case "A": {
      io?.print("\n  Gate A: Environment check...");
      const checks = checkGateA(projectDir, profile);
      updateGateA(state, checks);
      printChecks(io, checks);
      break;
    }
    case "B": {
      io?.print("\n  Gate B: Planning check...");
      const checks = checkGateB(projectDir);
      updateGateB(state, checks);
      printChecks(io, checks);
      break;
    }
    case "C": {
      io?.print("\n  Gate C: SSOT completeness check...");
      const checks = checkGateC(projectDir);
      updateGateC(state, checks);
      printChecks(io, checks);
      break;
    }
  }

  saveGateState(projectDir, state);
  return buildAllGatesResult(state);
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function checkFileExists(
  projectDir: string,
  relativePath: string,
  name: string,
  failMessage: string,
): GateCheck {
  const exists = fs.existsSync(path.join(projectDir, relativePath));
  return {
    name,
    passed: exists,
    message: exists ? `${name}: found` : failMessage,
  };
}

function checkDirExists(
  projectDir: string,
  relativePath: string,
  name: string,
  failMessage: string,
): GateCheck {
  const dirPath = path.join(projectDir, relativePath);
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  return {
    name,
    passed: exists,
    message: exists ? `${name}: found` : failMessage,
  };
}

/** Pattern matching new-format SSOT file names (SSOT-0 through SSOT-5) */
const NEW_FORMAT_SSOT_PATTERN = /^SSOT-[0-5]_.*\.md$/;

/**
 * Find new-format SSOT files (SSOT-0~5) across known directories.
 * These files use a structured format that replaces §3-E/F/G/H sections.
 */
function findNewFormatSSOTFiles(projectDir: string): string[] {
  const files: string[] = [];
  const searchDirs = [
    "docs",
    "docs/requirements",
    "docs/design/core",
    "docs/core",
    "docs/ssot",
  ];

  for (const dir of searchDirs) {
    const fullDir = path.join(projectDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && NEW_FORMAT_SSOT_PATTERN.test(entry.name)) {
          const fullPath = path.join(fullDir, entry.name);
          // Skip empty/stub files (< 10 lines)
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.split("\n").length >= 10) {
              files.push(fullPath);
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  // Deduplicate (docs/ root overlaps with more specific paths)
  return [...new Set(files)];
}

/**
 * Find SSOT feature spec files.
 *
 * v4.0: Only search directories that contain actual feature specifications.
 * Excludes core definitions (SSOT-2 through SSOT-5) and requirements (PRD, Feature Catalog).
 * These are NOT feature specs and should not require §3-E/F/G/H sections.
 */
function findSSOTFiles(projectDir: string): string[] {
  const files: string[] = [];

  // Only feature spec directories — NOT core or requirements
  const searchDirs = [
    "docs/design/features",
    "docs/common-features",
    "docs/project-features",
    "docs/ssot",
    "docs/03_ssot",          // hotel-kanri style
  ];

  for (const dir of searchDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      collectFeatureSpecFiles(fullDir, files, projectDir);
    }
  }

  // Legacy: pick SSOT_*.md files from docs/ root (non-recursive)
  const legacyDocsDir = path.join(projectDir, "docs");
  if (fs.existsSync(legacyDocsDir)) {
    const entries = fs.readdirSync(legacyDocsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isFile() &&
        entry.name.startsWith("SSOT_") &&
        entry.name.endsWith(".md") &&
        !NON_SPEC_PATTERNS.test(entry.name)
      ) {
        const fullPath = path.join(legacyDocsDir, entry.name);
        // Skip empty/stub files (< 10 lines)
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lineCount = content.split("\n").length;
          if (lineCount >= 10) {
            files.push(fullPath);
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  return files;
}

/** File name patterns that indicate non-feature-spec documents */
const NON_SPEC_PATTERNS = /^(REPORT|GUIDE|ANALYSIS|CHECKLIST|PROGRESS|RULES|WORKFLOW|TEMPLATE|INDEX|VISION|DEPLOYMENT|SSOT-[0-5]_)/i;

/** Directory name patterns to skip */
const SKIP_DIR_PATTERNS = /^(_non_ssot|_archived|_archived_progress|reports|drafts|phase0_)/i;

/**
 * Recursively collect .md files that look like feature specifications.
 *
 * v4.0 filters:
 * - Skips files starting with _ or .
 * - Skips index, readme, template, customization log
 * - Skips files matching NON_SPEC_PATTERNS (reports, guides, etc.)
 * - Skips directories matching SKIP_DIR_PATTERNS (_non_ssot, archived, etc.)
 * - Skips files with fewer than 10 lines (empty stubs)
 */
function collectFeatureSpecFiles(
  dir: string,
  result: string[],
  projectDir: string,
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip archived/non-SSOT directories
      if (SKIP_DIR_PATTERNS.test(entry.name)) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      collectFeatureSpecFiles(fullPath, result, projectDir);
    } else if (
      entry.name.endsWith(".md") &&
      !entry.name.startsWith("_") &&
      !entry.name.startsWith(".")
    ) {
      const lower = entry.name.toLowerCase();

      // Skip known non-spec files
      if (
        lower === "readme.md" ||
        lower === "_index.md" ||
        lower === "_template.md" ||
        lower === "customization_log.md"
      ) {
        continue;
      }

      // Skip files matching non-spec patterns
      if (NON_SPEC_PATTERNS.test(entry.name)) continue;

      // Skip empty/stub files (< 10 lines)
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lineCount = content.split("\n").length;
        if (lineCount < 10) continue;
      } catch {
        continue;
      }

      result.push(fullPath);
    }
  }
}

/**
 * Heuristic: check if a section heading exists but has no content
 * (just a placeholder like "TBD" or empty)
 */
function isSectionEmpty(content: string, sectionId: string): boolean {
  // Find the section heading
  const sectionPattern = new RegExp(
    `(${sectionId}|${sectionId.replace("-", " *-")}).*\\n([\\s\\S]*?)(?=\\n##|\\n§|$)`,
    "i",
  );
  const match = content.match(sectionPattern);
  if (!match) return false;

  const sectionContent = match[2].trim();
  if (sectionContent.length === 0) return true;

  // Check for common placeholders
  const placeholders = ["tbd", "todo", "[要確認]", "未定", "（未記入）", "TBD", "N/A"];
  const lower = sectionContent.toLowerCase();
  return placeholders.some((p) => lower === p.toLowerCase());
}

function printChecks(io: GateIO | undefined, checks: GateCheck[]): void {
  if (!io) return;
  for (const check of checks) {
    const isWarning =
      check.passed && check.message.startsWith("WARNING");
    const icon = !check.passed ? "  ❌" : isWarning ? "  ⚠️ " : "  ✅";
    io.print(`${icon} ${check.name}`);
    if (!check.passed || isWarning) {
      io.print(`     → ${check.message}`);
    }
  }
}
