import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type VisualTestLevel,
  type VisualTestResult,
  type VisualTestReport,
  getVisualTestLevelName,
  calculateVisualScore,
  saveVisualTestReport,
  loadVisualTestReports,
  analyzeVisualTestReadiness,
} from "./visual-test-model.js";

function makeResult(
  level: VisualTestLevel,
  score: number,
  maxScore: number,
): VisualTestResult {
  return {
    level,
    levelName: getVisualTestLevelName(level),
    score,
    maxScore,
    checks: Array.from({ length: maxScore }, (_, i) => ({
      name: `Check ${i + 1}`,
      passed: i < score,
      detail: `Detail for check ${i + 1}`,
    })),
  };
}

function makeReport(
  overrides?: Partial<VisualTestReport>,
): VisualTestReport {
  return {
    timestamp: "2026-02-03T00:00:00.000Z",
    levels: [
      makeResult(1, 2, 3),
      makeResult(2, 1, 2),
    ],
    scorecard: {
      displayAccuracy: 17,
      flowAccuracy: 13,
      stateDisplay: 0,
      responsive: 0,
      consoleErrors: 0,
      performance: 2,
      total: 32,
    },
    verdict: "fail",
    screenshots: [],
    ...overrides,
  };
}

describe("visual-test-model", () => {
  describe("getVisualTestLevelName", () => {
    it("returns correct name for Level 1", () => {
      expect(getVisualTestLevelName(1)).toBe("画面表示テスト");
    });

    it("returns correct name for Level 2", () => {
      expect(getVisualTestLevelName(2)).toBe("操作フローテスト");
    });

    it("returns correct name for Level 3", () => {
      expect(getVisualTestLevelName(3)).toBe("状態表示テスト");
    });

    it("returns correct name for Level 4", () => {
      expect(getVisualTestLevelName(4)).toBe("レスポンシブテスト");
    });

    it("returns correct name for Level 5", () => {
      expect(getVisualTestLevelName(5)).toBe("パフォーマンステスト");
    });
  });

  describe("calculateVisualScore", () => {
    it("returns zero scorecard for empty levels", () => {
      const score = calculateVisualScore([]);
      expect(score.displayAccuracy).toBe(0);
      expect(score.flowAccuracy).toBe(0);
      expect(score.stateDisplay).toBe(0);
      expect(score.responsive).toBe(0);
      expect(score.consoleErrors).toBe(0);
      expect(score.performance).toBe(0);
      expect(score.total).toBe(0);
    });

    it("scores displayAccuracy from Level 1 results", () => {
      const levels = [makeResult(1, 3, 3)];
      const score = calculateVisualScore(levels);
      expect(score.displayAccuracy).toBe(25);
    });

    it("proportionally scores partial Level 1 results", () => {
      const levels = [makeResult(1, 1, 3)];
      const score = calculateVisualScore(levels);
      expect(score.displayAccuracy).toBe(8);
    });

    it("scores flowAccuracy from Level 2 results", () => {
      const levels = [makeResult(2, 2, 2)];
      const score = calculateVisualScore(levels);
      expect(score.flowAccuracy).toBe(25);
    });

    it("scores stateDisplay from Level 3 results", () => {
      const levels = [makeResult(3, 2, 2)];
      const score = calculateVisualScore(levels);
      expect(score.stateDisplay).toBe(20);
    });

    it("scores responsive from Level 4 results", () => {
      const levels = [makeResult(4, 2, 2)];
      const score = calculateVisualScore(levels);
      expect(score.responsive).toBe(15);
    });

    it("scores consoleErrors from Level 5 results", () => {
      const levels = [makeResult(5, 1, 1)];
      const score = calculateVisualScore(levels);
      expect(score.consoleErrors).toBe(10);
    });

    it("awards performance bonus for full level coverage", () => {
      const levels = [
        makeResult(1, 3, 3),
        makeResult(2, 2, 2),
        makeResult(3, 2, 2),
        makeResult(4, 2, 2),
        makeResult(5, 1, 1),
      ];
      const score = calculateVisualScore(levels);
      expect(score.performance).toBe(5);
    });

    it("calculates total as sum of all axes", () => {
      const levels = [makeResult(1, 3, 3), makeResult(2, 2, 2)];
      const score = calculateVisualScore(levels);
      const expected = score.displayAccuracy + score.flowAccuracy +
        score.stateDisplay + score.responsive + score.consoleErrors +
        score.performance;
      expect(score.total).toBe(expected);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-visual-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads visual test reports", () => {
      const report = makeReport();
      saveVisualTestReport(tmpDir, report);

      const reports = loadVisualTestReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].levels).toHaveLength(2);
      expect(reports[0].verdict).toBe("fail");
    });

    it("creates audits directory on save", () => {
      saveVisualTestReport(tmpDir, makeReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "audits")),
      ).toBe(true);
    });

    it("returns empty array when no reports exist", () => {
      expect(loadVisualTestReports(tmpDir)).toHaveLength(0);
    });

    it("returns reports sorted by timestamp descending", () => {
      saveVisualTestReport(
        tmpDir,
        makeReport({ timestamp: "2026-01-01T00:00:00Z" }),
      );
      saveVisualTestReport(
        tmpDir,
        makeReport({ timestamp: "2026-02-01T00:00:00Z" }),
      );

      const reports = loadVisualTestReports(tmpDir);
      expect(reports).toHaveLength(2);
      expect(reports[0].timestamp).toBe("2026-02-01T00:00:00Z");
    });

    it("round-trips scorecard data accurately", () => {
      const report = makeReport({
        scorecard: {
          displayAccuracy: 20,
          flowAccuracy: 15,
          stateDisplay: 10,
          responsive: 8,
          consoleErrors: 5,
          performance: 3,
          total: 61,
        },
      });
      saveVisualTestReport(tmpDir, report);

      const loaded = loadVisualTestReports(tmpDir);
      expect(loaded[0].scorecard.displayAccuracy).toBe(20);
      expect(loaded[0].scorecard.total).toBe(61);
    });
  });

  describe("analyzeVisualTestReadiness", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-visual-ready-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects Playwright config", () => {
      fs.writeFileSync(
        path.join(tmpDir, "playwright.config.ts"),
        "export default {};",
      );

      const readiness = analyzeVisualTestReadiness(tmpDir);
      expect(readiness.hasPlaywright).toBe(true);
      expect(readiness.readiness).toBeGreaterThanOrEqual(40);
    });

    it("detects baseline screenshots directory", () => {
      fs.mkdirSync(path.join(tmpDir, "e2e", "screenshots"), { recursive: true });

      const readiness = analyzeVisualTestReadiness(tmpDir);
      expect(readiness.hasBaseline).toBe(true);
    });

    it("returns zero readiness for empty project", () => {
      const readiness = analyzeVisualTestReadiness(tmpDir);
      expect(readiness.hasPlaywright).toBe(false);
      expect(readiness.hasBaseline).toBe(false);
      expect(readiness.hasTests).toBe(false);
      expect(readiness.readiness).toBe(0);
    });

    it("returns 100% readiness when all infrastructure exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, "playwright.config.ts"),
        "export default {};",
      );
      fs.mkdirSync(path.join(tmpDir, "e2e", "screenshots"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "e2e"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "e2e", "visual-screenshot.test.ts"),
        'test("visual", () => {});',
      );

      const readiness = analyzeVisualTestReadiness(tmpDir);
      expect(readiness.hasPlaywright).toBe(true);
      expect(readiness.hasBaseline).toBe(true);
      expect(readiness.hasTests).toBe(true);
      expect(readiness.readiness).toBe(100);
    });
  });
});
