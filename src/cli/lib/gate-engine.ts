/**
 * Gate engine - Pre-Code Gate check logic
 * Based on: CLAUDE.md §Pre-Code Gate (A/B/C)
 *
 * Checks three gates before allowing implementation:
 * - Gate A: Development environment / infrastructure ready
 * - Gate B: Task decomposition and planning complete
 * - Gate C: SSOT completeness (§3-E/F/G/H sections)
 */
import * as fs from "node:fs";
import * as path from "node:path";
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
 * Verifies file existence for environment prerequisites.
 */
export function checkGateA(projectDir: string): GateCheck[] {
  const checks: GateCheck[] = [];

  // Check package.json
  checks.push(checkFileExists(
    projectDir,
    "package.json",
    "package.json exists",
    "package.json not found. Run 'npm init' or create package.json.",
  ));

  // Check node_modules
  checks.push(checkDirExists(
    projectDir,
    "node_modules",
    "Dependencies installed (node_modules/)",
    "node_modules/ not found. Run 'npm install' or 'pnpm install'.",
  ));

  // Check .env or .env.example
  const hasEnv = fs.existsSync(path.join(projectDir, ".env"));
  const hasEnvExample = fs.existsSync(path.join(projectDir, ".env.example"));
  checks.push({
    name: "Environment config (.env or .env.example)",
    passed: hasEnv || hasEnvExample,
    message: hasEnv || hasEnvExample
      ? "Environment config found"
      : ".env or .env.example not found. Create environment config.",
  });

  // Check docker-compose.yml (optional but flagged)
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

  // Check CI config
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

  // Check .framework/ directory
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
      : "No project profile. Run 'framework init' or 'framework retrofit'.",
  });

  return checks;
}

// ─────────────────────────────────────────────
// Gate C: SSOT Completeness Check
// ─────────────────────────────────────────────

/** Required SSOT sections per v3.4 */
const REQUIRED_SECTIONS = [
  { id: "§3-E", pattern: /§3-E|§ *3-E|### .*入出力例|## .*入出力例|input.*output.*example/i },
  { id: "§3-F", pattern: /§3-F|§ *3-F|### .*境界値|## .*境界値|boundary/i },
  { id: "§3-G", pattern: /§3-G|§ *3-G|### .*例外応答|## .*例外応答|exception.*response/i },
  { id: "§3-H", pattern: /§3-H|§ *3-H|### .*Gherkin|## .*Gherkin|Scenario:/i },
];

/**
 * Check SSOT files for §3-E/F/G/H completeness.
 * Scans all .md files under docs/ that look like SSOT feature specs.
 */
export function checkGateC(projectDir: string): SSOTCheck[] {
  const checks: SSOTCheck[] = [];

  // Find SSOT files in known locations
  const ssotPaths = findSSOTFiles(projectDir);

  if (ssotPaths.length === 0) {
    checks.push({
      name: "SSOT files found",
      passed: false,
      message: "No SSOT files found in docs/. Create feature specifications first.",
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

    for (const section of REQUIRED_SECTIONS) {
      if (!section.pattern.test(content)) {
        missingSections.push(section.id);
      }
    }

    // Also check that existing sections are not empty stubs
    for (const section of REQUIRED_SECTIONS) {
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
        ? `${relativePath}: All §3-E/F/G/H sections present`
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
): AllGatesResult {
  let state = loadGateState(projectDir) ?? createGateState();

  // Gate A
  io?.print("\n  [1/3] Gate A: Environment check...");
  const checksA = checkGateA(projectDir);
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
): AllGatesResult {
  let state = loadGateState(projectDir) ?? createGateState();

  switch (gateId) {
    case "A": {
      io?.print("\n  Gate A: Environment check...");
      const checks = checkGateA(projectDir);
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

/**
 * Find SSOT feature spec files.
 * Searches standard framework paths and project-specific paths.
 */
function findSSOTFiles(projectDir: string): string[] {
  const files: string[] = [];

  // Standard framework paths
  const searchDirs = [
    "docs/design/features",
    "docs/design/core",
    "docs/common-features",
    "docs/project-features",
    "docs/ssot",
    "docs/03_ssot",          // hotel-kanri style
    "docs/requirements",
  ];

  for (const dir of searchDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      collectMarkdownFiles(fullDir, files);
    }
  }

  return files;
}

/**
 * Recursively collect .md files
 */
function collectMarkdownFiles(dir: string, result: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, result);
    } else if (
      entry.name.endsWith(".md") &&
      !entry.name.startsWith("_") &&
      !entry.name.startsWith(".")
    ) {
      // Filter out index files and non-spec files
      const lower = entry.name.toLowerCase();
      if (
        lower !== "readme.md" &&
        lower !== "_index.md" &&
        lower !== "_template.md" &&
        lower !== "customization_log.md"
      ) {
        result.push(fullPath);
      }
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
    const icon = check.passed ? "  ✅" : "  ❌";
    io.print(`${icon} ${check.name}`);
    if (!check.passed) {
      io.print(`     → ${check.message}`);
    }
  }
}
