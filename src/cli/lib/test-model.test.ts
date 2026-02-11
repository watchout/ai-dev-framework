import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type TestReport,
  type TestCoverageInfo,
  type TestScorecard,
  calculateTestScore,
  determineTestVerdict,
  saveTestReport,
  loadTestReports,
  analyzeTestFiles,
  detectTestIssues,
} from "./test-model.js";

function makeReport(overrides?: Partial<TestReport>): TestReport {
  return {
    timestamp: "2026-02-03T00:00:00.000Z",
    testFiles: 10,
    testCases: 50,
    passed: 48,
    failed: 1,
    skipped: 1,
    coverage: {
      statements: 80,
      branches: 70,
      functions: 85,
      lines: 80,
    },
    scorecard: {
      ssotCoverage: 25,
      executionResult: 20,
      coverageScore: 12,
      testQuality: 12,
      edgeCases: 8,
      maintainability: 4,
      total: 81,
    },
    verdict: "warning",
    issues: [],
    ...overrides,
  };
}

function makeCoverage(overrides?: Partial<TestCoverageInfo>): TestCoverageInfo {
  return {
    statements: 80,
    branches: 70,
    functions: 85,
    lines: 80,
    ...overrides,
  };
}

describe("test-model", () => {
  describe("calculateTestScore", () => {
    it("returns zero scores for zero inputs", () => {
      const score = calculateTestScore(
        0, 0, 0, 0, 0,
        { statements: 0, branches: 0, functions: 0, lines: 0 },
      );
      expect(score.ssotCoverage).toBe(0);
      expect(score.executionResult).toBe(0);
      expect(score.coverageScore).toBe(0);
      expect(score.testQuality).toBe(0);
      expect(score.edgeCases).toBe(0);
      expect(score.maintainability).toBe(0);
      expect(score.total).toBe(0);
    });

    it("gives full ssotCoverage when test files >= source files", () => {
      const score = calculateTestScore(
        10, 10, 50, 0, 0, makeCoverage(),
      );
      expect(score.ssotCoverage).toBe(30);
    });

    it("caps ssotCoverage at 30", () => {
      const score = calculateTestScore(
        20, 10, 100, 0, 0, makeCoverage(),
      );
      expect(score.ssotCoverage).toBe(30);
    });

    it("proportionally scores ssotCoverage", () => {
      const score = calculateTestScore(
        5, 10, 25, 0, 0, makeCoverage(),
      );
      expect(score.ssotCoverage).toBe(15);
    });

    it("gives full executionResult when all tests pass", () => {
      const score = calculateTestScore(
        10, 10, 50, 0, 0, makeCoverage(),
      );
      expect(score.executionResult).toBe(25);
    });

    it("penalizes failed tests in executionResult", () => {
      const score = calculateTestScore(
        10, 10, 45, 5, 0, makeCoverage(),
      );
      expect(score.executionResult).toBeLessThan(25);
    });

    it("penalizes skipped tests in executionResult", () => {
      const noSkip = calculateTestScore(
        10, 10, 50, 0, 0, makeCoverage(),
      );
      const withSkip = calculateTestScore(
        10, 10, 45, 0, 5, makeCoverage(),
      );
      expect(withSkip.executionResult).toBeLessThan(noSkip.executionResult);
    });

    it("scores coverage based on average of all metrics", () => {
      const fullCoverage = calculateTestScore(
        10, 10, 50, 0, 0,
        { statements: 100, branches: 100, functions: 100, lines: 100 },
      );
      expect(fullCoverage.coverageScore).toBe(15);
    });

    it("calculates total as sum of all axes", () => {
      const score = calculateTestScore(
        10, 10, 50, 0, 0,
        { statements: 100, branches: 100, functions: 100, lines: 100 },
      );
      const expectedTotal = score.ssotCoverage + score.executionResult +
        score.coverageScore + score.testQuality + score.edgeCases +
        score.maintainability;
      expect(score.total).toBe(expectedTotal);
    });

    it("does not exceed 100 total", () => {
      const score = calculateTestScore(
        100, 10, 500, 0, 0,
        { statements: 100, branches: 100, functions: 100, lines: 100 },
      );
      expect(score.total).toBeLessThanOrEqual(100);
    });

    it("awards maintainability when ratio >= 0.8", () => {
      const score = calculateTestScore(
        8, 10, 40, 0, 0, makeCoverage(),
      );
      expect(score.maintainability).toBe(5);
    });
  });

  describe("determineTestVerdict", () => {
    it("returns pass when total is 100", () => {
      const scorecard: TestScorecard = {
        ssotCoverage: 30,
        executionResult: 25,
        coverageScore: 15,
        testQuality: 15,
        edgeCases: 10,
        maintainability: 5,
        total: 100,
      };
      expect(determineTestVerdict(scorecard)).toBe("pass");
    });

    it("returns warning when total is 70-99", () => {
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 70 })).toBe("warning");
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 99 })).toBe("warning");
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 85 })).toBe("warning");
    });

    it("returns fail when total is below 70", () => {
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 69 })).toBe("fail");
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 0 })).toBe("fail");
      expect(determineTestVerdict({ ...makeReport().scorecard, total: 50 })).toBe("fail");
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-test-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads test reports", () => {
      const report = makeReport();
      saveTestReport(tmpDir, report);

      const reports = loadTestReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].testFiles).toBe(10);
      expect(reports[0].verdict).toBe("warning");
    });

    it("creates audits directory on save", () => {
      saveTestReport(tmpDir, makeReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "audits")),
      ).toBe(true);
    });

    it("returns empty array when no reports exist", () => {
      expect(loadTestReports(tmpDir)).toHaveLength(0);
    });

    it("returns reports sorted by timestamp descending", () => {
      saveTestReport(tmpDir, makeReport({ timestamp: "2026-01-01T00:00:00Z" }));
      saveTestReport(tmpDir, makeReport({ timestamp: "2026-02-01T00:00:00Z" }));

      const reports = loadTestReports(tmpDir);
      expect(reports).toHaveLength(2);
      expect(reports[0].timestamp).toBe("2026-02-01T00:00:00Z");
    });

    it("round-trips report data accurately", () => {
      const report = makeReport({
        issues: [
          {
            category: "skipped-test",
            file: "src/test.ts",
            message: "2 skipped tests",
            severity: "warning",
          },
        ],
      });
      saveTestReport(tmpDir, report);

      const loaded = loadTestReports(tmpDir);
      expect(loaded[0].issues).toHaveLength(1);
      expect(loaded[0].issues[0].category).toBe("skipped-test");
      expect(loaded[0].scorecard.ssotCoverage).toBe(25);
    });
  });

  describe("analyzeTestFiles", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-test-analyze-"));
      fs.mkdirSync(path.join(tmpDir, "src", "lib"), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("finds test files and source files", () => {
      fs.writeFileSync(path.join(tmpDir, "src", "lib", "utils.ts"), "export const x = 1;");
      fs.writeFileSync(path.join(tmpDir, "src", "lib", "utils.test.ts"), "it('works', () => {});");

      const result = analyzeTestFiles(tmpDir);
      expect(result.sourceFiles).toHaveLength(1);
      expect(result.testFiles).toHaveLength(1);
    });

    it("identifies orphaned source files without tests", () => {
      fs.writeFileSync(path.join(tmpDir, "src", "lib", "utils.ts"), "export const x = 1;");
      fs.writeFileSync(path.join(tmpDir, "src", "lib", "helper.ts"), "export const y = 2;");
      fs.writeFileSync(path.join(tmpDir, "src", "lib", "utils.test.ts"), "it('works', () => {});");

      const result = analyzeTestFiles(tmpDir);
      expect(result.orphanedSources).toHaveLength(1);
      expect(result.orphanedSources[0]).toContain("helper.ts");
    });

    it("returns empty arrays when src does not exist", () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-test-empty-"));
      const result = analyzeTestFiles(emptyDir);
      expect(result.testFiles).toHaveLength(0);
      expect(result.sourceFiles).toHaveLength(0);
      expect(result.orphanedSources).toHaveLength(0);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  describe("detectTestIssues", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-test-issues-"));
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects skipped tests", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "example.test.ts"),
        'it.skip("should work", () => { expect(1).toBe(1); });',
      );

      const issues = detectTestIssues(tmpDir);
      expect(issues.some((i) => i.category === "skipped-test")).toBe(true);
    });

    it("detects TODO comments in tests", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "example.test.ts"),
        '// TODO: add more tests\nit("works", () => {});',
      );

      const issues = detectTestIssues(tmpDir);
      expect(issues.some((i) => i.category === "todo-in-test")).toBe(true);
    });

    it("detects empty test bodies", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "example.test.ts"),
        'it("empty test", () => {})',
      );

      const issues = detectTestIssues(tmpDir);
      expect(issues.some((i) => i.category === "empty-test")).toBe(true);
      expect(issues.find((i) => i.category === "empty-test")?.severity).toBe("error");
    });

    it("returns no issues for clean test files", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "example.test.ts"),
        'import { expect } from "vitest";\nit("works", () => { expect(1).toBe(1); });',
      );

      const issues = detectTestIssues(tmpDir);
      expect(issues).toHaveLength(0);
    });
  });
});
