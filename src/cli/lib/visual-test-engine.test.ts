import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type VisualTestIO,
  runVisualTest,
} from "./visual-test-engine.js";

function createMockIO(): VisualTestIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("visual-test-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-visual-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runVisualTest", () => {
    it("returns report for project without visual testing", () => {
      const io = createMockIO();
      const report = runVisualTest(tmpDir, {}, io);

      expect(report.verdict).toBe("fail");
      expect(report.scorecard.total).toBe(0);
      expect(report.levels.length).toBeGreaterThan(0);
    });

    it("prints readiness information", () => {
      const io = createMockIO();
      runVisualTest(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("Playwright"))).toBe(true);
      expect(io.output.some((o) => o.includes("Readiness"))).toBe(true);
    });

    it("checks all 5 levels by default", () => {
      const io = createMockIO();
      const report = runVisualTest(tmpDir, {}, io);

      expect(report.levels).toHaveLength(5);
      expect(report.levels[0].level).toBe(1);
      expect(report.levels[4].level).toBe(5);
    });

    it("checks only specified level when --level is set", () => {
      const io = createMockIO();
      const report = runVisualTest(tmpDir, { level: 3 }, io);

      expect(report.levels).toHaveLength(1);
      expect(report.levels[0].level).toBe(3);
      expect(report.levels[0].levelName).toBe("状態表示テスト");
    });

    it("saves report to .framework/audits", () => {
      const io = createMockIO();
      runVisualTest(tmpDir, {}, io);

      const auditsDir = path.join(tmpDir, ".framework", "audits");
      expect(fs.existsSync(auditsDir)).toBe(true);
      const files = fs.readdirSync(auditsDir);
      expect(files.some((f) => f.startsWith("visual-test-"))).toBe(true);
    });

    it("shows status when --status flag is set", () => {
      // First create a report
      const io1 = createMockIO();
      runVisualTest(tmpDir, {}, io1);

      // Then check status
      const io2 = createMockIO();
      runVisualTest(tmpDir, { status: true }, io2);

      expect(io2.output.some((o) => o.includes("VISUAL TEST STATUS"))).toBe(true);
    });

    it("prints scorecard with all categories", () => {
      const io = createMockIO();
      runVisualTest(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("Scorecard"))).toBe(true);
      expect(io.output.some((o) => o.includes("Display Accuracy"))).toBe(true);
      expect(io.output.some((o) => o.includes("Flow Accuracy"))).toBe(true);
      expect(io.output.some((o) => o.includes("Verdict"))).toBe(true);
    });

    it("detects Playwright when config exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, "playwright.config.ts"),
        "export default { use: { viewport: { width: 1280 } } };",
      );

      const io = createMockIO();
      const report = runVisualTest(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("Playwright: Found"))).toBe(true);
      // Level 1 should have Playwright check passing
      const level1 = report.levels.find((l) => l.level === 1);
      expect(level1?.checks.some((c) => c.name === "Playwright configured" && c.passed)).toBe(true);
    });
  });
});
