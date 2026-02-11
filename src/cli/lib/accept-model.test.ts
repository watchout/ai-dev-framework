import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type AcceptanceCheck,
  type AcceptanceReport,
  type AcceptanceScorecard,
  calculateAcceptanceScore,
  determineAcceptanceVerdict,
  saveAcceptanceReport,
  loadAcceptanceReports,
  analyzeFeatureCompleteness,
} from "./accept-model.js";

function makeCheck(overrides?: Partial<AcceptanceCheck>): AcceptanceCheck {
  return {
    category: "must-requirements",
    name: "Test check",
    passed: true,
    detail: "Check passed",
    points: 10,
    maxPoints: 10,
    ...overrides,
  };
}

function makeReport(
  overrides?: Partial<AcceptanceReport>,
): AcceptanceReport {
  return {
    featureId: "AUTH-001",
    featureName: "User Authentication",
    timestamp: "2026-02-03T00:00:00.000Z",
    checks: [],
    scorecard: {
      mustRequirements: 30,
      userFlowE2E: 25,
      errorFlows: 20,
      nonFunctional: 15,
      integration: 10,
      total: 100,
    },
    verdict: "accepted",
    rejectionReasons: [],
    ...overrides,
  };
}

describe("accept-model", () => {
  describe("calculateAcceptanceScore", () => {
    it("returns zero scorecard for empty checks", () => {
      const score = calculateAcceptanceScore([]);
      expect(score.mustRequirements).toBe(0);
      expect(score.userFlowE2E).toBe(0);
      expect(score.errorFlows).toBe(0);
      expect(score.nonFunctional).toBe(0);
      expect(score.integration).toBe(0);
      expect(score.total).toBe(0);
    });

    it("sums points by category for must-requirements", () => {
      const checks = [
        makeCheck({ category: "must-requirements", points: 10 }),
        makeCheck({ category: "must-requirements", points: 10 }),
        makeCheck({ category: "must-requirements", points: 10 }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.mustRequirements).toBe(30);
    });

    it("caps must-requirements at 30", () => {
      const checks = [
        makeCheck({ category: "must-requirements", points: 20 }),
        makeCheck({ category: "must-requirements", points: 20 }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.mustRequirements).toBe(30);
    });

    it("sums points for user-flow-e2e category", () => {
      const checks = [
        makeCheck({ category: "user-flow-e2e", points: 15 }),
        makeCheck({ category: "user-flow-e2e", points: 10 }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.userFlowE2E).toBe(25);
    });

    it("caps user-flow-e2e at 25", () => {
      const checks = [
        makeCheck({ category: "user-flow-e2e", points: 30 }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.userFlowE2E).toBe(25);
    });

    it("sums points across all categories", () => {
      const checks = [
        makeCheck({ category: "must-requirements", points: 30 }),
        makeCheck({ category: "user-flow-e2e", points: 25 }),
        makeCheck({ category: "error-flows", points: 20 }),
        makeCheck({ category: "non-functional", points: 15 }),
        makeCheck({ category: "integration", points: 10 }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.total).toBe(100);
    });

    it("calculates total as sum of all categories", () => {
      const checks = [
        makeCheck({ category: "must-requirements", points: 15 }),
        makeCheck({ category: "user-flow-e2e", points: 10 }),
        makeCheck({ category: "error-flows", points: 5 }),
      ];
      const score = calculateAcceptanceScore(checks);
      const expected = score.mustRequirements + score.userFlowE2E +
        score.errorFlows + score.nonFunctional + score.integration;
      expect(score.total).toBe(expected);
    });

    it("handles zero-point checks correctly", () => {
      const checks = [
        makeCheck({ category: "must-requirements", points: 0, passed: false }),
      ];
      const score = calculateAcceptanceScore(checks);
      expect(score.mustRequirements).toBe(0);
    });
  });

  describe("determineAcceptanceVerdict", () => {
    it("returns accepted when total is 100", () => {
      const scorecard: AcceptanceScorecard = {
        mustRequirements: 30,
        userFlowE2E: 25,
        errorFlows: 20,
        nonFunctional: 15,
        integration: 10,
        total: 100,
      };
      expect(determineAcceptanceVerdict(scorecard)).toBe("accepted");
    });

    it("returns rejected when total is 99", () => {
      const scorecard: AcceptanceScorecard = {
        mustRequirements: 30,
        userFlowE2E: 25,
        errorFlows: 20,
        nonFunctional: 15,
        integration: 9,
        total: 99,
      };
      expect(determineAcceptanceVerdict(scorecard)).toBe("rejected");
    });

    it("returns rejected when total is 0", () => {
      const scorecard: AcceptanceScorecard = {
        mustRequirements: 0,
        userFlowE2E: 0,
        errorFlows: 0,
        nonFunctional: 0,
        integration: 0,
        total: 0,
      };
      expect(determineAcceptanceVerdict(scorecard)).toBe("rejected");
    });

    it("returns rejected when total is 50", () => {
      const scorecard: AcceptanceScorecard = {
        mustRequirements: 20,
        userFlowE2E: 15,
        errorFlows: 10,
        nonFunctional: 5,
        integration: 0,
        total: 50,
      };
      expect(determineAcceptanceVerdict(scorecard)).toBe("rejected");
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-accept-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads acceptance reports", () => {
      const report = makeReport();
      saveAcceptanceReport(tmpDir, report);

      const reports = loadAcceptanceReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].featureId).toBe("AUTH-001");
      expect(reports[0].verdict).toBe("accepted");
    });

    it("creates audits directory on save", () => {
      saveAcceptanceReport(tmpDir, makeReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "audits")),
      ).toBe(true);
    });

    it("returns empty array when no reports exist", () => {
      expect(loadAcceptanceReports(tmpDir)).toHaveLength(0);
    });

    it("returns reports sorted by timestamp descending", () => {
      saveAcceptanceReport(
        tmpDir,
        makeReport({ timestamp: "2026-01-01T00:00:00Z" }),
      );
      saveAcceptanceReport(
        tmpDir,
        makeReport({ timestamp: "2026-02-01T00:00:00Z" }),
      );

      const reports = loadAcceptanceReports(tmpDir);
      expect(reports).toHaveLength(2);
      expect(reports[0].timestamp).toBe("2026-02-01T00:00:00Z");
    });

    it("round-trips rejection reasons accurately", () => {
      const report = makeReport({
        verdict: "rejected",
        rejectionReasons: [
          "Missing e2e tests",
          "Error handling incomplete",
        ],
      });
      saveAcceptanceReport(tmpDir, report);

      const loaded = loadAcceptanceReports(tmpDir);
      expect(loaded[0].rejectionReasons).toHaveLength(2);
      expect(loaded[0].rejectionReasons[0]).toBe("Missing e2e tests");
    });
  });

  describe("analyzeFeatureCompleteness", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-accept-feature-"));
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns checks for all five categories", () => {
      const checks = analyzeFeatureCompleteness(tmpDir, "auth");
      const categories = [...new Set(checks.map((c) => c.category))];
      expect(categories).toContain("must-requirements");
      expect(categories).toContain("user-flow-e2e");
      expect(categories).toContain("error-flows");
      expect(categories).toContain("non-functional");
      expect(categories).toContain("integration");
    });

    it("detects source files for feature", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "auth-login.ts"),
        "export function login() {}",
      );

      const checks = analyzeFeatureCompleteness(tmpDir, "auth");
      const sourceCheck = checks.find((c) => c.name === "Source implementation exists");
      expect(sourceCheck?.passed).toBe(true);
    });

    it("detects test files for feature", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "auth-login.test.ts"),
        'it("works", () => {});',
      );

      const checks = analyzeFeatureCompleteness(tmpDir, "auth");
      const testCheck = checks.find((c) => c.name === "Test files exist");
      expect(testCheck?.passed).toBe(true);
    });

    it("detects feature in plan state", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".framework", "plan.json"),
        JSON.stringify({
          waves: [{ features: [{ id: "AUTH", name: "Authentication" }] }],
        }),
      );

      const checks = analyzeFeatureCompleteness(tmpDir, "auth");
      const planCheck = checks.find((c) => c.name === "Feature tracked in plan");
      expect(planCheck?.passed).toBe(true);
    });

    it("fails checks when no artifacts exist", () => {
      const checks = analyzeFeatureCompleteness(tmpDir, "nonexistent");
      const failedChecks = checks.filter((c) => !c.passed);
      expect(failedChecks.length).toBeGreaterThan(0);
    });

    it("checks for tsconfig strict mode", () => {
      fs.writeFileSync(
        path.join(tmpDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true } }),
      );

      const checks = analyzeFeatureCompleteness(tmpDir, "auth");
      const strictCheck = checks.find((c) => c.name === "TypeScript strict mode");
      expect(strictCheck?.passed).toBe(true);
    });

    it("awards zero points for failed checks", () => {
      const checks = analyzeFeatureCompleteness(tmpDir, "nonexistent");
      const failedChecks = checks.filter((c) => !c.passed);
      for (const check of failedChecks) {
        expect(check.points).toBe(0);
      }
    });
  });
});
