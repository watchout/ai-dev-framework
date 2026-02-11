/**
 * Visual test engine - checks visual testing infrastructure and generates report
 * Based on: 20_VISUAL_TEST.md
 *
 * Pipeline:
 * 1. Check Playwright / visual test infrastructure
 * 2. Analyze visual test readiness
 * 3. For each level (1-5), check corresponding tests/configs
 * 4. Generate scorecard
 * 5. Print formatted results
 * 6. Save report
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type VisualTestLevel,
  type VisualTestResult,
  type VisualCheck,
  type VisualTestReport,
  getVisualTestLevelName,
  calculateVisualScore,
  analyzeVisualTestReadiness,
  saveVisualTestReport,
  loadVisualTestReports,
} from "./visual-test-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface VisualTestIO {
  print(message: string): void;
}

export function createVisualTestTerminalIO(): VisualTestIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run visual test audit
 */
export function runVisualTest(
  projectDir: string,
  options: { level?: VisualTestLevel; status?: boolean },
  io: VisualTestIO,
): VisualTestReport {
  if (options.status) {
    printVisualTestStatus(projectDir, io);
    return createEmptyReport();
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  VISUAL TEST AUDIT");
  io.print(`${"━".repeat(38)}`);

  // 1. Check infrastructure readiness
  const readiness = analyzeVisualTestReadiness(projectDir);
  io.print(`  Playwright: ${readiness.hasPlaywright ? "Found" : "Not found"}`);
  io.print(`  Baseline screenshots: ${readiness.hasBaseline ? "Found" : "Not found"}`);
  io.print(`  Visual tests: ${readiness.hasTests ? "Found" : "Not found"}`);
  io.print(`  Readiness: ${readiness.readiness}%`);
  io.print("");

  // 2. Run level checks
  const allLevels: VisualTestLevel[] = [1, 2, 3, 4, 5];
  const levelsToCheck = options.level
    ? [options.level]
    : allLevels;

  const levelResults: VisualTestResult[] = [];
  for (const level of levelsToCheck) {
    const result = checkLevel(projectDir, level, readiness);
    levelResults.push(result);
  }

  // 3. Calculate scorecard
  const scorecard = calculateVisualScore(levelResults);

  const verdict = scorecard.total === 100
    ? "pass" as const
    : scorecard.total >= 60
      ? "warning" as const
      : "fail" as const;

  // 4. Print results
  printLevelResults(io, levelResults);
  printScorecard(io, scorecard);

  const verdictLabel = verdict === "pass"
    ? "PASS"
    : verdict === "warning"
      ? "WARNING"
      : "FAIL";
  io.print(`  Verdict: ${verdictLabel} (${scorecard.total}/100)`);
  io.print("");

  // 5. Build and save report
  const report: VisualTestReport = {
    timestamp: new Date().toISOString(),
    levels: levelResults,
    scorecard,
    verdict,
    screenshots: findScreenshots(projectDir),
  };

  const filename = saveVisualTestReport(projectDir, report);
  io.print(`  Report saved: .framework/audits/${filename}`);
  io.print("");

  return report;
}

// ─────────────────────────────────────────────
// Level Checks
// ─────────────────────────────────────────────

interface ReadinessInfo {
  hasPlaywright: boolean;
  hasBaseline: boolean;
  hasTests: boolean;
  readiness: number;
}

function checkLevel(
  projectDir: string,
  level: VisualTestLevel,
  readiness: ReadinessInfo,
): VisualTestResult {
  const levelName = getVisualTestLevelName(level);
  const checks: VisualCheck[] = [];

  switch (level) {
    case 1:
      checks.push(...checkDisplayTests(projectDir, readiness));
      break;
    case 2:
      checks.push(...checkFlowTests(projectDir, readiness));
      break;
    case 3:
      checks.push(...checkStateTests(projectDir, readiness));
      break;
    case 4:
      checks.push(...checkResponsiveTests(projectDir, readiness));
      break;
    case 5:
      checks.push(...checkPerformanceTests(projectDir, readiness));
      break;
  }

  const maxScore = checks.length;
  const score = checks.filter((c) => c.passed).length;

  return { level, levelName, score, maxScore, checks };
}

function checkDisplayTests(
  _projectDir: string,
  readiness: ReadinessInfo,
): VisualCheck[] {
  return [
    {
      name: "Playwright configured",
      passed: readiness.hasPlaywright,
      detail: readiness.hasPlaywright
        ? "playwright.config found"
        : "No playwright.config.ts found",
    },
    {
      name: "Visual test files exist",
      passed: readiness.hasTests,
      detail: readiness.hasTests
        ? "Visual test files found"
        : "No visual test files found",
    },
    {
      name: "Baseline screenshots",
      passed: readiness.hasBaseline,
      detail: readiness.hasBaseline
        ? "Baseline directory found"
        : "No baseline screenshots directory",
    },
  ];
}

function checkFlowTests(
  projectDir: string,
  readiness: ReadinessInfo,
): VisualCheck[] {
  const hasE2eDir = fs.existsSync(path.join(projectDir, "e2e"));
  return [
    {
      name: "E2E test directory",
      passed: hasE2eDir,
      detail: hasE2eDir ? "e2e/ directory found" : "No e2e/ directory",
    },
    {
      name: "Test infrastructure ready",
      passed: readiness.hasPlaywright,
      detail: readiness.hasPlaywright
        ? "Playwright available for flow tests"
        : "Playwright needed for flow tests",
    },
  ];
}

function checkStateTests(
  projectDir: string,
  _readiness: ReadinessInfo,
): VisualCheck[] {
  const hasStorybook = fs.existsSync(
    path.join(projectDir, ".storybook"),
  );
  const hasComponentTests = fs.existsSync(
    path.join(projectDir, "src", "components"),
  );
  return [
    {
      name: "Component directory exists",
      passed: hasComponentTests,
      detail: hasComponentTests
        ? "src/components/ found"
        : "No src/components/ directory",
    },
    {
      name: "Storybook configured",
      passed: hasStorybook,
      detail: hasStorybook
        ? ".storybook/ directory found"
        : "No .storybook/ configuration",
    },
  ];
}

function checkResponsiveTests(
  projectDir: string,
  readiness: ReadinessInfo,
): VisualCheck[] {
  // Check for viewport configurations in Playwright config
  let hasViewports = false;
  if (readiness.hasPlaywright) {
    const configPath = path.join(projectDir, "playwright.config.ts");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      hasViewports = /viewport|devices|mobile/i.test(content);
    }
  }

  return [
    {
      name: "Viewport configurations",
      passed: hasViewports,
      detail: hasViewports
        ? "Viewport settings found in Playwright config"
        : "No viewport configurations found",
    },
    {
      name: "Responsive test infrastructure",
      passed: readiness.hasPlaywright,
      detail: readiness.hasPlaywright
        ? "Playwright available for responsive tests"
        : "Playwright needed for responsive tests",
    },
  ];
}

function checkPerformanceTests(
  projectDir: string,
  _readiness: ReadinessInfo,
): VisualCheck[] {
  const hasLighthouse = fs.existsSync(
    path.join(projectDir, "lighthouserc.js"),
  ) || fs.existsSync(
    path.join(projectDir, ".lighthouserc.json"),
  );

  return [
    {
      name: "Performance testing tool",
      passed: hasLighthouse,
      detail: hasLighthouse
        ? "Lighthouse configuration found"
        : "No Lighthouse configuration found",
    },
  ];
}

// ─────────────────────────────────────────────
// Output Helpers
// ─────────────────────────────────────────────

function printLevelResults(
  io: VisualTestIO,
  results: VisualTestResult[],
): void {
  for (const result of results) {
    io.print(`  Level ${result.level}: ${result.levelName} (${result.score}/${result.maxScore})`);
    for (const check of result.checks) {
      const icon = check.passed ? "[PASS]" : "[FAIL]";
      io.print(`    ${icon} ${check.name}: ${check.detail}`);
    }
    io.print("");
  }
}

function printScorecard(
  io: VisualTestIO,
  scorecard: VisualTestReport["scorecard"],
): void {
  io.print("  Scorecard:");
  io.print("  ┌───────────────────────┬─────┬────────┐");
  io.print("  │ Category              │ Max │ Earned │");
  io.print("  ├───────────────────────┼─────┼────────┤");

  const rows: [string, number, number][] = [
    ["Display Accuracy", 25, scorecard.displayAccuracy],
    ["Flow Accuracy", 25, scorecard.flowAccuracy],
    ["State Display", 20, scorecard.stateDisplay],
    ["Responsive", 15, scorecard.responsive],
    ["Console Errors", 10, scorecard.consoleErrors],
    ["Performance", 5, scorecard.performance],
  ];

  for (const [name, max, earned] of rows) {
    const paddedName = name.padEnd(21);
    const paddedMax = String(max).padStart(3);
    const paddedEarned = String(earned).padStart(6);
    io.print(`  │ ${paddedName} │ ${paddedMax} │ ${paddedEarned} │`);
  }

  io.print("  └───────────────────────┴─────┴────────┘");
  io.print(`  Total: ${scorecard.total}/100`);
  io.print("");
}

function findScreenshots(projectDir: string): string[] {
  const screenshotDirs = [
    "e2e/screenshots",
    "tests/screenshots",
    "__screenshots__",
    ".visual-test/baseline",
  ];
  const screenshots: string[] = [];

  for (const dir of screenshotDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      const files = fs.readdirSync(fullDir).filter(
        (f) => /\.(png|jpg|jpeg|webp)$/i.test(f),
      );
      screenshots.push(...files.map((f) => path.join(dir, f)));
    }
  }

  return screenshots;
}

function printVisualTestStatus(
  projectDir: string,
  io: VisualTestIO,
): void {
  const reports = loadVisualTestReports(projectDir);

  if (reports.length === 0) {
    io.print("  No visual test reports found. Run 'framework visual-test' to audit.");
    return;
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  VISUAL TEST STATUS");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  for (const report of reports.slice(0, 5)) {
    const verdictLabel = report.verdict.toUpperCase();
    const levelCount = report.levels.length;
    io.print(
      `  [${verdictLabel}] ${report.scorecard.total}/100 - ` +
      `${levelCount} levels checked (${report.timestamp})`,
    );
  }
  io.print("");
}

function createEmptyReport(): VisualTestReport {
  return {
    timestamp: new Date().toISOString(),
    levels: [],
    scorecard: {
      displayAccuracy: 0,
      flowAccuracy: 0,
      stateDisplay: 0,
      responsive: 0,
      consoleErrors: 0,
      performance: 0,
      total: 0,
    },
    verdict: "fail",
    screenshots: [],
  };
}
