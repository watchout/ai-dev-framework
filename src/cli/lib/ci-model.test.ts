import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type CIReport,
  type CIStageResult,
  createDefaultStages,
  evaluateStage,
  determineCIVerdict,
  generatePRChecklist,
  saveCIReport,
  loadCIReports,
  formatCIMarkdown,
} from "./ci-model.js";

function makeReport(overrides?: Partial<CIReport>): CIReport {
  return {
    timestamp: "2026-02-04T00:00:00Z",
    branch: "main",
    commit: "abc12345",
    stages: createDefaultStages(),
    allRequiredPassed: true,
    verdict: "ready",
    blockers: [],
    ...overrides,
  };
}

function makePassedStages(): CIStageResult[] {
  return [
    { stage: "lint", name: "Lint & Type Check", status: "pass", required: true, details: [] },
    { stage: "unit-test", name: "Unit Tests", status: "pass", required: true, details: [] },
    { stage: "integration-test", name: "Integration Tests", status: "pass", required: false, details: [] },
    { stage: "build", name: "Build", status: "pass", required: true, details: [] },
    { stage: "e2e", name: "E2E Tests", status: "pass", required: false, details: [] },
    { stage: "security", name: "Security Scan", status: "pass", required: true, details: [] },
  ];
}

describe("ci-model", () => {
  describe("createDefaultStages", () => {
    it("returns 6 stages", () => {
      const stages = createDefaultStages();
      expect(stages).toHaveLength(6);
    });

    it("all stages start as pending", () => {
      const stages = createDefaultStages();
      for (const stage of stages) {
        expect(stage.status).toBe("pending");
      }
    });

    it("has correct required flags", () => {
      const stages = createDefaultStages();
      const required = stages.filter((s) => s.required);
      const optional = stages.filter((s) => !s.required);
      expect(required).toHaveLength(4);
      expect(optional).toHaveLength(2);
    });

    it("includes all 6 stage types", () => {
      const stages = createDefaultStages();
      const names = stages.map((s) => s.stage);
      expect(names).toContain("lint");
      expect(names).toContain("unit-test");
      expect(names).toContain("integration-test");
      expect(names).toContain("build");
      expect(names).toContain("e2e");
      expect(names).toContain("security");
    });
  });

  describe("evaluateStage", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-ci-eval-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("lint passes with tsconfig and eslint config", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      fs.writeFileSync(path.join(tmpDir, "eslint.config.js"), "");
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        'export const x: string = "hello";\n',
      );

      const result = evaluateStage(tmpDir, "lint");
      expect(result.status).toBe("pass");
      expect(result.details).toContain("tsconfig.json found");
      expect(result.details).toContain("ESLint config found");
    });

    it("lint fails without tsconfig", () => {
      const result = evaluateStage(tmpDir, "lint");
      expect(result.status).toBe("fail");
      expect(result.details).toContain("tsconfig.json missing");
    });

    it("unit-test passes with test files", () => {
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(path.join(tmpDir, "src", "foo.test.ts"), "test");

      const result = evaluateStage(tmpDir, "unit-test");
      expect(result.status).toBe("pass");
      expect(result.details[0]).toContain("1 test file(s) found");
    });

    it("unit-test fails without test files", () => {
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "");

      const result = evaluateStage(tmpDir, "unit-test");
      expect(result.status).toBe("fail");
    });

    it("integration-test skips when no integration files", () => {
      fs.mkdirSync(path.join(tmpDir, "src"));
      const result = evaluateStage(tmpDir, "integration-test");
      expect(result.status).toBe("skip");
      expect(result.required).toBe(false);
    });

    it("build passes with script and output", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: { build: "tsc" } }),
      );
      fs.mkdirSync(path.join(tmpDir, "dist"));

      const result = evaluateStage(tmpDir, "build");
      expect(result.status).toBe("pass");
    });

    it("build fails without build script", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ scripts: {} }),
      );

      const result = evaluateStage(tmpDir, "build");
      expect(result.status).toBe("fail");
    });

    it("e2e skips without config", () => {
      const result = evaluateStage(tmpDir, "e2e");
      expect(result.status).toBe("skip");
      expect(result.required).toBe(false);
    });

    it("e2e passes with playwright config", () => {
      fs.writeFileSync(path.join(tmpDir, "playwright.config.ts"), "");
      const result = evaluateStage(tmpDir, "e2e");
      expect(result.status).toBe("pass");
    });

    it("security passes with proper gitignore", () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".env\nnode_modules\n");
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        'export const x = "safe";\n',
      );

      const result = evaluateStage(tmpDir, "security");
      expect(result.status).toBe("pass");
    });

    it("security fails without gitignore", () => {
      const result = evaluateStage(tmpDir, "security");
      expect(result.status).toBe("fail");
      expect(result.details).toContain("No .gitignore file found");
    });

    it("security detects hardcoded secrets", () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".env\n");
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(
        path.join(tmpDir, "src", "config.ts"),
        'const apiKey = "sk-secret-12345";\n',
      );

      const result = evaluateStage(tmpDir, "security");
      expect(result.status).toBe("fail");
      expect(result.details.some((d) => d.includes("hardcoded secret"))).toBe(true);
    });
  });

  describe("determineCIVerdict", () => {
    it("returns ready when all required stages pass", () => {
      const stages = makePassedStages();
      expect(determineCIVerdict(stages)).toBe("ready");
    });

    it("returns not_ready when a required stage fails", () => {
      const stages = makePassedStages();
      stages[0].status = "fail"; // lint is required
      expect(determineCIVerdict(stages)).toBe("not_ready");
    });

    it("returns ready when optional stage fails", () => {
      const stages = makePassedStages();
      stages[2].status = "fail"; // integration-test is optional
      expect(determineCIVerdict(stages)).toBe("ready");
    });

    it("returns not_ready when required stage is skipped", () => {
      const stages = makePassedStages();
      stages[3].status = "skip"; // build is required
      expect(determineCIVerdict(stages)).toBe("not_ready");
    });
  });

  describe("generatePRChecklist", () => {
    it("all true for passing stages", () => {
      const checklist = generatePRChecklist(makePassedStages());
      expect(checklist.typeCheckPassed).toBe(true);
      expect(checklist.lintPassed).toBe(true);
      expect(checklist.unitTestsPassed).toBe(true);
      expect(checklist.buildSucceeded).toBe(true);
      expect(checklist.noSkippedTests).toBe(true);
    });

    it("reflects failed lint stage", () => {
      const stages = makePassedStages();
      stages[0].status = "fail";
      const checklist = generatePRChecklist(stages);
      expect(checklist.typeCheckPassed).toBe(false);
      expect(checklist.lintPassed).toBe(false);
    });

    it("integration skip counts as pass", () => {
      const stages = makePassedStages();
      stages[2].status = "skip";
      const checklist = generatePRChecklist(stages);
      expect(checklist.integrationTestsPassed).toBe(true);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-ci-persist-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads CI reports", () => {
      const report = makeReport();
      saveCIReport(tmpDir, report);

      const reports = loadCIReports(tmpDir);
      expect(reports).toHaveLength(1);
      expect(reports[0].branch).toBe("main");
      expect(reports[0].verdict).toBe("ready");
    });

    it("creates audits directory", () => {
      saveCIReport(tmpDir, makeReport());
      expect(
        fs.existsSync(path.join(tmpDir, ".framework", "audits")),
      ).toBe(true);
    });

    it("returns empty array when no reports exist", () => {
      expect(loadCIReports(tmpDir)).toHaveLength(0);
    });

    it("sorts reports newest first", () => {
      // Write files with distinct names to avoid same-millisecond collision
      const auditsDir = path.join(tmpDir, ".framework", "audits");
      fs.mkdirSync(auditsDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditsDir, "ci-1000.json"),
        JSON.stringify(makeReport({ timestamp: "2026-01-01T00:00:00Z" })),
      );
      fs.writeFileSync(
        path.join(auditsDir, "ci-2000.json"),
        JSON.stringify(makeReport({ timestamp: "2026-02-01T00:00:00Z" })),
      );

      const reports = loadCIReports(tmpDir);
      expect(reports).toHaveLength(2);
      expect(reports[0].timestamp).toBe("2026-02-01T00:00:00Z");
    });
  });

  describe("formatCIMarkdown", () => {
    it("generates markdown with all sections", () => {
      const report = makeReport({
        stages: makePassedStages(),
        verdict: "ready",
      });
      const md = formatCIMarkdown(report);
      expect(md).toContain("# CI Report");
      expect(md).toContain("READY");
      expect(md).toContain("main");
      expect(md).toContain("Lint & Type Check");
    });

    it("includes blockers section when present", () => {
      const report = makeReport({
        verdict: "not_ready",
        blockers: ["Build: fail", "Security: fail"],
      });
      const md = formatCIMarkdown(report);
      expect(md).toContain("## Blockers");
      expect(md).toContain("Build: fail");
      expect(md).toContain("Security: fail");
    });

    it("omits blockers section when empty", () => {
      const report = makeReport({ blockers: [] });
      const md = formatCIMarkdown(report);
      expect(md).not.toContain("## Blockers");
    });
  });
});
