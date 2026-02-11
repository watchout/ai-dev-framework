/**
 * Test data model - Types, scoring, and report structure
 * Based on: 18_TEST_FORMAT.md
 *
 * Six-axis scorecard for test quality:
 * - SSOT Coverage (30pts)
 * - Execution Result (25pts)
 * - Coverage Score (15pts)
 * - Test Quality (15pts)
 * - Edge Cases (10pts)
 * - Maintainability (5pts)
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

export type TestLevel = "unit" | "integration" | "e2e";
export type TestVerdict = "pass" | "warning" | "fail";

export interface TestCaseResult {
  name: string;
  level: TestLevel;
  passed: boolean;
  duration: number;
  file: string;
}

export interface TestCoverageInfo {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface TestScorecard {
  ssotCoverage: number;
  executionResult: number;
  coverageScore: number;
  testQuality: number;
  edgeCases: number;
  maintainability: number;
  total: number;
}

export interface TestReport {
  timestamp: string;
  testFiles: number;
  testCases: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage: TestCoverageInfo;
  scorecard: TestScorecard;
  verdict: TestVerdict;
  issues: TestIssue[];
}

export interface TestIssue {
  category: string;
  file: string;
  message: string;
  severity: "error" | "warning";
}

// ─────────────────────────────────────────────
// Scorecard Constants
// ─────────────────────────────────────────────

const MAX_SSOT_COVERAGE = 30;
const MAX_EXECUTION_RESULT = 25;
const MAX_COVERAGE_SCORE = 15;
const MAX_TEST_QUALITY = 15;
const MAX_EDGE_CASES = 10;
const MAX_MAINTAINABILITY = 5;

// ─────────────────────────────────────────────
// Scoring Functions
// ─────────────────────────────────────────────

/**
 * Calculate the 6-axis test scorecard
 */
export function calculateTestScore(
  testFiles: number,
  sourceFiles: number,
  passed: number,
  failed: number,
  skipped: number,
  coverage: TestCoverageInfo,
): TestScorecard {
  const totalTests = passed + failed + skipped;

  // 1. SSOT Coverage (30pts) - ratio of test files to source files
  const testRatio = sourceFiles > 0 ? testFiles / sourceFiles : 0;
  const ssotCoverage = Math.min(
    MAX_SSOT_COVERAGE,
    Math.round(testRatio * MAX_SSOT_COVERAGE),
  );

  // 2. Execution Result (25pts) - pass rate
  const passRate = totalTests > 0 ? passed / totalTests : 0;
  const failPenalty = failed * 5;
  const skipPenalty = skipped * 2;
  const executionResult = Math.max(
    0,
    Math.min(
      MAX_EXECUTION_RESULT,
      Math.round(passRate * MAX_EXECUTION_RESULT) - failPenalty - skipPenalty,
    ),
  );

  // 3. Coverage Score (15pts) - statement coverage threshold
  const avgCoverage =
    (coverage.statements + coverage.branches +
      coverage.functions + coverage.lines) / 4;
  const coverageScore = Math.min(
    MAX_COVERAGE_SCORE,
    Math.round((avgCoverage / 100) * MAX_COVERAGE_SCORE),
  );

  // 4. Test Quality (15pts) - heuristic based on test count per file
  const testsPerFile = testFiles > 0 ? totalTests / testFiles : 0;
  const qualityRatio = Math.min(1, testsPerFile / 5);
  const testQuality = Math.min(
    MAX_TEST_QUALITY,
    Math.round(qualityRatio * MAX_TEST_QUALITY),
  );

  // 5. Edge Cases (10pts) - heuristic: more tests = likely more edge cases
  const edgeCaseRatio = Math.min(1, totalTests / Math.max(1, sourceFiles * 3));
  const edgeCases = Math.min(
    MAX_EDGE_CASES,
    Math.round(edgeCaseRatio * MAX_EDGE_CASES),
  );

  // 6. Maintainability (5pts) - test-to-source ratio quality
  const maintainability = Math.min(
    MAX_MAINTAINABILITY,
    testRatio >= 0.8 ? MAX_MAINTAINABILITY : Math.round(testRatio * MAX_MAINTAINABILITY),
  );

  const total = ssotCoverage + executionResult + coverageScore +
    testQuality + edgeCases + maintainability;

  return {
    ssotCoverage,
    executionResult,
    coverageScore,
    testQuality,
    edgeCases,
    maintainability,
    total,
  };
}

/**
 * Determine verdict from scorecard total
 * 100 = pass, 70-99 = warning, <70 = fail
 */
export function determineTestVerdict(scorecard: TestScorecard): TestVerdict {
  if (scorecard.total === 100) return "pass";
  if (scorecard.total >= 70) return "warning";
  return "fail";
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const AUDIT_DIR = ".framework/audits";

export function saveTestReport(
  projectDir: string,
  report: TestReport,
): string {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `test-${timestamp}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadTestReports(projectDir: string): TestReport[] {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith("test-") && f.endsWith(".json"),
  );
  const reports: TestReport[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as TestReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ─────────────────────────────────────────────
// Test File Analysis
// ─────────────────────────────────────────────

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/;
const IGNORED_DIRS = ["node_modules", ".next", "dist", "coverage", ".framework"];

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Analyze project for test files and source files
 */
export function analyzeTestFiles(projectDir: string): {
  testFiles: string[];
  sourceFiles: string[];
  orphanedSources: string[];
} {
  const srcDir = path.join(projectDir, "src");
  const allFiles = walkDir(srcDir, SOURCE_FILE_PATTERN);

  const testFiles = allFiles.filter((f) => TEST_FILE_PATTERN.test(f));
  const sourceFiles = allFiles.filter((f) => !TEST_FILE_PATTERN.test(f));

  // Find source files without corresponding test files
  const testBaseNames = new Set(
    testFiles.map((f) =>
      path.basename(f).replace(TEST_FILE_PATTERN, ""),
    ),
  );

  const orphanedSources = sourceFiles.filter((f) => {
    const baseName = path.basename(f).replace(SOURCE_FILE_PATTERN, "");
    return !testBaseNames.has(baseName);
  });

  return { testFiles, sourceFiles, orphanedSources };
}

/**
 * Detect common test issues
 */
export function detectTestIssues(projectDir: string): TestIssue[] {
  const issues: TestIssue[] = [];
  const srcDir = path.join(projectDir, "src");
  const testFiles = walkDir(srcDir, TEST_FILE_PATTERN);

  for (const filePath of testFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(projectDir, filePath);

    // Check for skipped tests
    const skipMatches = content.match(/it\.skip|test\.skip|xit\(/g);
    if (skipMatches) {
      issues.push({
        category: "skipped-test",
        file: relPath,
        message: `${skipMatches.length} skipped test(s) found`,
        severity: "warning",
      });
    }

    // Check for TODO/FIXME in tests
    const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/g);
    if (todoMatches) {
      issues.push({
        category: "todo-in-test",
        file: relPath,
        message: `${todoMatches.length} TODO/FIXME comment(s) found`,
        severity: "warning",
      });
    }

    // Check for hardcoded test data (magic strings/numbers in assertions)
    const hardcodedMatches = content.match(
      /expect\([^)]+\)\.(toBe|toEqual)\(\s*["'][^"']{20,}["']/g,
    );
    if (hardcodedMatches) {
      issues.push({
        category: "hardcoded-data",
        file: relPath,
        message: `${hardcodedMatches.length} hardcoded assertion(s) - consider using constants`,
        severity: "warning",
      });
    }

    // Check for empty test bodies
    const emptyTests = content.match(/it\([^,]+,\s*\(\)\s*=>\s*\{\s*\}\)/g);
    if (emptyTests) {
      issues.push({
        category: "empty-test",
        file: relPath,
        message: `${emptyTests.length} empty test(s) found`,
        severity: "error",
      });
    }
  }

  return issues;
}
