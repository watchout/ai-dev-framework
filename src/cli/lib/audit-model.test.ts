import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type AuditReport,
  SSOT_CATEGORIES,
  PROMPT_CATEGORIES,
  CODE_CATEGORIES,
  createScorecard,
  applyDeduction,
  calculateTotalScore,
  determineVerdict,
  saveAuditReport,
  loadAuditReports,
  generateAuditMarkdown,
} from "./audit-model.js";

function makeReport(overrides?: Partial<AuditReport>): AuditReport {
  return {
    mode: "ssot",
    target: {
      id: "TEST-001",
      name: "test.md",
      path: "docs/test.md",
      auditDate: "2026-02-03T00:00:00Z",
      iteration: 1,
    },
    scorecard: createScorecard(SSOT_CATEGORIES),
    totalScore: 100,
    verdict: "pass",
    absoluteConditions: [],
    findings: [],
    ...overrides,
  };
}

describe("audit-model", () => {
  describe("category definitions", () => {
    it("SSOT categories sum to 100", () => {
      const total = SSOT_CATEGORIES.reduce((s, c) => s + c.maxPoints, 0);
      expect(total).toBe(100);
    });

    it("Prompt categories sum to 100", () => {
      const total = PROMPT_CATEGORIES.reduce((s, c) => s + c.maxPoints, 0);
      expect(total).toBe(100);
    });

    it("Code categories sum to 100", () => {
      const total = CODE_CATEGORIES.reduce((s, c) => s + c.maxPoints, 0);
      expect(total).toBe(100);
    });

    it("SSOT has 10 categories", () => {
      expect(SSOT_CATEGORIES).toHaveLength(10);
    });

    it("Prompt has 8 categories", () => {
      expect(PROMPT_CATEGORIES).toHaveLength(8);
    });

    it("Code has 8 categories", () => {
      expect(CODE_CATEGORIES).toHaveLength(8);
    });
  });

  describe("createScorecard", () => {
    it("creates scorecard with full marks", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      expect(scorecard).toHaveLength(10);
      expect(scorecard[0].category).toBe("Completeness");
      expect(scorecard[0].maxPoints).toBe(15);
      expect(scorecard[0].earned).toBe(15);
      expect(scorecard[0].deductions).toHaveLength(0);
    });

    it("all earned equal maxPoints initially", () => {
      const scorecard = createScorecard(CODE_CATEGORIES);
      for (const cat of scorecard) {
        expect(cat.earned).toBe(cat.maxPoints);
      }
    });
  });

  describe("applyDeduction", () => {
    it("deducts from the correct category", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      applyDeduction(scorecard, "Completeness", "Missing §3", 3);
      expect(scorecard[0].earned).toBe(12);
      expect(scorecard[0].deductions).toHaveLength(1);
    });

    it("does not deduct below zero", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      applyDeduction(scorecard, "Document Quality", "Bad format", 999);
      const cat = scorecard.find((c) => c.category === "Document Quality");
      expect(cat!.earned).toBe(0);
    });

    it("ignores unknown category", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      applyDeduction(scorecard, "NONEXISTENT", "test", 5);
      const total = calculateTotalScore(scorecard);
      expect(total).toBe(100);
    });

    it("records deduction amount capped to earned", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      applyDeduction(scorecard, "Document Quality", "Bad", 10);
      const cat = scorecard.find((c) => c.category === "Document Quality");
      expect(cat!.deductions[0].amount).toBe(5);
    });
  });

  describe("calculateTotalScore", () => {
    it("returns 100 for untouched scorecard", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      expect(calculateTotalScore(scorecard)).toBe(100);
    });

    it("reflects deductions", () => {
      const scorecard = createScorecard(SSOT_CATEGORIES);
      applyDeduction(scorecard, "Completeness", "missing", 5);
      applyDeduction(scorecard, "Clarity", "ambiguous", 3);
      expect(calculateTotalScore(scorecard)).toBe(92);
    });
  });

  describe("determineVerdict", () => {
    it("SSOT: pass at 95+", () => {
      expect(determineVerdict("ssot", 95, [{ name: "t", passed: true }])).toBe("pass");
      expect(determineVerdict("ssot", 100, [{ name: "t", passed: true }])).toBe("pass");
    });

    it("SSOT: conditional at 90-94", () => {
      expect(determineVerdict("ssot", 90, [{ name: "t", passed: true }])).toBe("conditional");
      expect(determineVerdict("ssot", 94, [{ name: "t", passed: true }])).toBe("conditional");
    });

    it("SSOT: fail below 90", () => {
      expect(determineVerdict("ssot", 89, [{ name: "t", passed: true }])).toBe("fail");
    });

    it("SSOT: fail when absolute condition fails", () => {
      expect(determineVerdict("ssot", 100, [{ name: "TBD=0", passed: false }])).toBe("fail");
    });

    it("Prompt: pass only at 100", () => {
      expect(determineVerdict("prompt", 100, [{ name: "t", passed: true }])).toBe("pass");
      expect(determineVerdict("prompt", 99, [{ name: "t", passed: true }])).toBe("conditional");
    });

    it("Code: pass only at 100", () => {
      expect(determineVerdict("code", 100, [{ name: "t", passed: true }])).toBe("pass");
      expect(determineVerdict("code", 95, [{ name: "t", passed: true }])).toBe("conditional");
    });

    it("Code: fail below 90", () => {
      expect(determineVerdict("code", 85, [{ name: "t", passed: true }])).toBe("fail");
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-audit-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads audit reports", () => {
      const report = makeReport();
      saveAuditReport(tmpDir, report);

      const reports = loadAuditReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].mode).toBe("ssot");
      expect(reports[0].target.id).toBe("TEST-001");
    });

    it("filters by mode", () => {
      saveAuditReport(tmpDir, makeReport({ mode: "ssot" }));
      saveAuditReport(tmpDir, makeReport({ mode: "code" }));

      const ssotReports = loadAuditReports(tmpDir, "ssot");
      expect(ssotReports).toHaveLength(1);
      expect(ssotReports[0].mode).toBe("ssot");
    });

    it("returns empty for no reports", () => {
      expect(loadAuditReports(tmpDir)).toHaveLength(0);
    });

    it("creates audits directory", () => {
      saveAuditReport(tmpDir, makeReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "audits")),
      ).toBe(true);
    });
  });

  describe("generateAuditMarkdown", () => {
    it("generates markdown with scorecard", () => {
      const report = makeReport();
      const md = generateAuditMarkdown(report);
      expect(md).toContain("# SSOT Quality Audit Report");
      expect(md).toContain("TEST-001");
      expect(md).toContain("**Total: 100/100**");
      expect(md).toContain("PASS");
    });

    it("includes findings table when present", () => {
      const report = makeReport({
        findings: [
          {
            id: 1,
            severity: "critical",
            category: "Completeness",
            location: "§3",
            issue: "Missing section",
            correction: "Add section",
            deduction: 5,
          },
        ],
      });
      const md = generateAuditMarkdown(report);
      expect(md).toContain("## Findings");
      expect(md).toContain("CRITICAL");
      expect(md).toContain("Missing section");
    });

    it("includes absolute conditions", () => {
      const report = makeReport({
        absoluteConditions: [
          { name: "TBD Count = 0", passed: false, detail: "3 TBDs" },
        ],
      });
      const md = generateAuditMarkdown(report);
      expect(md).toContain("Absolute Conditions");
      expect(md).toContain("[FAIL] TBD Count = 0");
      expect(md).toContain("3 TBDs");
    });

    it("uses correct mode label for prompt", () => {
      const report = makeReport({ mode: "prompt" });
      const md = generateAuditMarkdown(report);
      expect(md).toContain("Prompt Quality Audit Report");
    });

    it("uses correct mode label for code", () => {
      const report = makeReport({ mode: "code" });
      const md = generateAuditMarkdown(report);
      expect(md).toContain("Code Quality Audit Report");
    });
  });
});
