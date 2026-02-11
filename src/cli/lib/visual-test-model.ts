/**
 * Visual test data model - Types, scoring, and report structure
 * Based on: 20_VISUAL_TEST.md
 *
 * Five-level visual testing:
 * - Level 1: Display Test (画面表示テスト)
 * - Level 2: Operation Flow Test (操作フローテスト)
 * - Level 3: State Display Test (状態表示テスト)
 * - Level 4: Responsive Test (レスポンシブテスト)
 * - Level 5: Performance Test (パフォーマンステスト)
 *
 * Six-axis scorecard for visual quality.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

export type VisualTestLevel = 1 | 2 | 3 | 4 | 5;

export interface VisualTestResult {
  level: VisualTestLevel;
  levelName: string;
  score: number;
  maxScore: number;
  checks: VisualCheck[];
}

export interface VisualCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VisualTestScorecard {
  displayAccuracy: number;
  flowAccuracy: number;
  stateDisplay: number;
  responsive: number;
  consoleErrors: number;
  performance: number;
  total: number;
}

export interface VisualTestReport {
  timestamp: string;
  levels: VisualTestResult[];
  scorecard: VisualTestScorecard;
  verdict: "pass" | "warning" | "fail";
  screenshots: string[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_DISPLAY_ACCURACY = 25;
const MAX_FLOW_ACCURACY = 25;
const MAX_STATE_DISPLAY = 20;
const MAX_RESPONSIVE = 15;
const MAX_CONSOLE_ERRORS = 10;
const MAX_PERFORMANCE = 5;

const LEVEL_NAMES: Record<VisualTestLevel, string> = {
  1: "画面表示テスト",
  2: "操作フローテスト",
  3: "状態表示テスト",
  4: "レスポンシブテスト",
  5: "パフォーマンステスト",
};

// ─────────────────────────────────────────────
// Level Name Lookup
// ─────────────────────────────────────────────

export function getVisualTestLevelName(level: VisualTestLevel): string {
  return LEVEL_NAMES[level];
}

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────

/**
 * Calculate visual test scorecard from level results
 */
export function calculateVisualScore(
  levels: VisualTestResult[],
): VisualTestScorecard {
  const getLevel = (n: VisualTestLevel): VisualTestResult | undefined =>
    levels.find((l) => l.level === n);

  const levelScore = (
    result: VisualTestResult | undefined,
    maxPoints: number,
  ): number => {
    if (!result) return 0;
    const ratio = result.maxScore > 0
      ? result.score / result.maxScore
      : 0;
    return Math.min(maxPoints, Math.round(ratio * maxPoints));
  };

  const displayAccuracy = levelScore(getLevel(1), MAX_DISPLAY_ACCURACY);
  const flowAccuracy = levelScore(getLevel(2), MAX_FLOW_ACCURACY);
  const stateDisplay = levelScore(getLevel(3), MAX_STATE_DISPLAY);
  const responsive = levelScore(getLevel(4), MAX_RESPONSIVE);
  const consoleErrors = levelScore(getLevel(5), MAX_CONSOLE_ERRORS);

  // Performance: bonus if all levels have passing checks
  const coveredLevels = levels.filter(
    (l) => l.checks.length > 0 && l.checks.some((c) => c.passed),
  ).length;
  const performance = Math.min(
    MAX_PERFORMANCE,
    Math.round((coveredLevels / 5) * MAX_PERFORMANCE),
  );

  const total = displayAccuracy + flowAccuracy + stateDisplay +
    responsive + consoleErrors + performance;

  return {
    displayAccuracy,
    flowAccuracy,
    stateDisplay,
    responsive,
    consoleErrors,
    performance,
    total,
  };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const AUDIT_DIR = ".framework/audits";

export function saveVisualTestReport(
  projectDir: string,
  report: VisualTestReport,
): string {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `visual-test-${timestamp}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadVisualTestReports(
  projectDir: string,
): VisualTestReport[] {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith("visual-test-") && f.endsWith(".json"),
  );
  const reports: VisualTestReport[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as VisualTestReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ─────────────────────────────────────────────
// Readiness Analysis
// ─────────────────────────────────────────────

/**
 * Analyze visual test infrastructure readiness
 */
export function analyzeVisualTestReadiness(projectDir: string): {
  hasPlaywright: boolean;
  hasBaseline: boolean;
  hasTests: boolean;
  readiness: number;
} {
  // Check for Playwright config
  const playwrightConfigs = [
    "playwright.config.ts",
    "playwright.config.js",
  ];
  const hasPlaywright = playwrightConfigs.some((f) =>
    fs.existsSync(path.join(projectDir, f)),
  );

  // Check for baseline screenshots directory
  const baselineDirs = [
    "e2e/screenshots",
    "tests/screenshots",
    "__screenshots__",
    ".visual-test/baseline",
  ];
  const hasBaseline = baselineDirs.some((d) =>
    fs.existsSync(path.join(projectDir, d)),
  );

  // Check for visual test files
  const testDirs = ["e2e", "tests", "src"];
  let hasTests = false;
  for (const dir of testDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      hasTests = hasVisualTestFiles(fullDir);
      if (hasTests) break;
    }
  }

  // Calculate readiness as percentage
  let readiness = 0;
  if (hasPlaywright) readiness += 40;
  if (hasBaseline) readiness += 30;
  if (hasTests) readiness += 30;

  return { hasPlaywright, hasBaseline, hasTests, readiness };
}

function hasVisualTestFiles(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasVisualTestFiles(fullPath)) return true;
    } else if (
      /visual|screenshot|snapshot/.test(entry.name) &&
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      return true;
    }
  }
  return false;
}
