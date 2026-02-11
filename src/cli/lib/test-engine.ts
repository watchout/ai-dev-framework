/**
 * Test engine - runs test audit and generates scorecard
 * Based on: 18_TEST_FORMAT.md
 *
 * Pipeline:
 * 1. Scan src/ for source and test files
 * 2. Analyze test quality (naming, skip, TODO)
 * 3. Calculate coverage heuristic
 * 4. Build scorecard
 * 5. Print formatted results
 * 6. Save report
 */
import {
  type TestLevel,
  type TestReport,
  type TestCoverageInfo,
  type TestIssue,
  analyzeTestFiles,
  detectTestIssues,
  calculateTestScore,
  determineTestVerdict,
  saveTestReport,
  loadTestReports,
} from "./test-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface TestIO {
  print(message: string): void;
}

export function createTestTerminalIO(): TestIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run a test audit on the project
 */
export function runTestAudit(
  projectDir: string,
  options: { level?: TestLevel; status?: boolean },
  io: TestIO,
): TestReport {
  if (options.status) {
    printTestStatus(projectDir, io);
    return createEmptyReport();
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  TEST AUDIT");
  io.print(`${"━".repeat(38)}`);

  // 1. Analyze test files
  const analysis = analyzeTestFiles(projectDir);
  const testFileCount = analysis.testFiles.length;
  const sourceFileCount = analysis.sourceFiles.length;

  io.print(`  Source files: ${sourceFileCount}`);
  io.print(`  Test files: ${testFileCount}`);
  io.print("");

  // 2. Filter by level if specified
  const filteredTestFiles = options.level
    ? filterByLevel(analysis.testFiles, options.level)
    : analysis.testFiles;

  // 3. Detect issues
  const issues = detectTestIssues(projectDir);
  const levelIssues = options.level
    ? issues.filter((i) => filteredTestFiles.some(
        (f) => f.endsWith(i.file) || i.file.endsWith(f),
      ))
    : issues;

  // 4. Estimate test counts from file analysis
  const estimatedTests = estimateTestCounts(filteredTestFiles, projectDir);

  // 5. Build coverage heuristic
  const coverage = estimateCoverage(testFileCount, sourceFileCount);

  // 6. Calculate scorecard
  const scorecard = calculateTestScore(
    testFileCount,
    sourceFileCount,
    estimatedTests.passed,
    estimatedTests.failed,
    estimatedTests.skipped,
    coverage,
  );

  const verdict = determineTestVerdict(scorecard);

  // 7. Print results
  printScorecard(io, scorecard);
  printIssues(io, levelIssues);

  if (analysis.orphanedSources.length > 0) {
    io.print("  Untested source files:");
    for (const src of analysis.orphanedSources.slice(0, 10)) {
      io.print(`    - ${src}`);
    }
    if (analysis.orphanedSources.length > 10) {
      io.print(`    ... and ${analysis.orphanedSources.length - 10} more`);
    }
    io.print("");
  }

  const verdictLabel = verdict === "pass"
    ? "PASS"
    : verdict === "warning"
      ? "WARNING"
      : "FAIL";
  io.print(`  Verdict: ${verdictLabel} (${scorecard.total}/100)`);
  io.print("");

  // 8. Build and save report
  const report: TestReport = {
    timestamp: new Date().toISOString(),
    testFiles: testFileCount,
    testCases: estimatedTests.total,
    passed: estimatedTests.passed,
    failed: estimatedTests.failed,
    skipped: estimatedTests.skipped,
    coverage,
    scorecard,
    verdict,
    issues: levelIssues,
  };

  const filename = saveTestReport(projectDir, report);
  io.print(`  Report saved: .framework/audits/${filename}`);
  io.print("");

  return report;
}

// ─────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────

function filterByLevel(
  testFiles: string[],
  level: TestLevel,
): string[] {
  const levelPatterns: Record<TestLevel, RegExp> = {
    unit: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    integration: /\.(integration|int)\.(test|spec)\.(ts|tsx|js|jsx)$/,
    e2e: /\.(e2e|end-to-end)\.(test|spec)\.(ts|tsx|js|jsx)$/,
  };

  if (level === "unit") {
    // Unit tests = all test files except integration and e2e
    return testFiles.filter(
      (f) =>
        levelPatterns.unit.test(f) &&
        !levelPatterns.integration.test(f) &&
        !levelPatterns.e2e.test(f),
    );
  }

  return testFiles.filter((f) => levelPatterns[level].test(f));
}

import * as fs from "node:fs";

function estimateTestCounts(
  testFiles: string[],
  projectDir: string,
): { total: number; passed: number; failed: number; skipped: number } {
  let total = 0;
  let skipped = 0;

  for (const filePath of testFiles) {
    const fullPath = filePath.startsWith("/")
      ? filePath
      : `${projectDir}/${filePath}`;

    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");

    // Count it() / test() calls
    const itMatches = content.match(/\bit\s*\(/g) ?? [];
    const testMatches = content.match(/\btest\s*\(/g) ?? [];
    total += itMatches.length + testMatches.length;

    // Count skipped tests
    const skipMatches = content.match(/it\.skip|test\.skip/g) ?? [];
    skipped += skipMatches.length;
  }

  // Assume all non-skipped tests pass (static analysis cannot determine)
  const passed = total - skipped;
  return { total, passed, failed: 0, skipped };
}

function estimateCoverage(
  testFiles: number,
  sourceFiles: number,
): TestCoverageInfo {
  // Heuristic: test file ratio as proxy for coverage
  const ratio = sourceFiles > 0
    ? Math.min(100, Math.round((testFiles / sourceFiles) * 100))
    : 0;

  return {
    statements: ratio,
    branches: Math.max(0, ratio - 10),
    functions: ratio,
    lines: ratio,
  };
}

function printScorecard(io: TestIO, scorecard: TestReport["scorecard"]): void {
  io.print("  Scorecard:");
  io.print("  ┌───────────────────────┬─────┬────────┐");
  io.print("  │ Category              │ Max │ Earned │");
  io.print("  ├───────────────────────┼─────┼────────┤");

  const rows: [string, number, number][] = [
    ["SSOT Coverage", 30, scorecard.ssotCoverage],
    ["Execution Result", 25, scorecard.executionResult],
    ["Coverage Score", 15, scorecard.coverageScore],
    ["Test Quality", 15, scorecard.testQuality],
    ["Edge Cases", 10, scorecard.edgeCases],
    ["Maintainability", 5, scorecard.maintainability],
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

function printIssues(io: TestIO, issues: TestIssue[]): void {
  if (issues.length === 0) return;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  io.print(`  Issues: ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "[ERROR]" : "[WARN]";
    io.print(`    ${prefix} ${issue.file}: ${issue.message}`);
  }
  io.print("");
}

function printTestStatus(projectDir: string, io: TestIO): void {
  const reports = loadTestReports(projectDir);

  if (reports.length === 0) {
    io.print("  No test reports found. Run 'framework test' to audit.");
    return;
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  TEST STATUS");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  for (const report of reports.slice(0, 5)) {
    const verdictLabel = report.verdict.toUpperCase();
    io.print(
      `  [${verdictLabel}] ${report.scorecard.total}/100 - ` +
      `${report.testCases} tests, ${report.passed} passed ` +
      `(${report.timestamp})`,
    );
  }
  io.print("");
}

function createEmptyReport(): TestReport {
  return {
    timestamp: new Date().toISOString(),
    testFiles: 0,
    testCases: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    coverage: { statements: 0, branches: 0, functions: 0, lines: 0 },
    scorecard: {
      ssotCoverage: 0,
      executionResult: 0,
      coverageScore: 0,
      testQuality: 0,
      edgeCases: 0,
      maintainability: 0,
      total: 0,
    },
    verdict: "fail",
    issues: [],
  };
}
