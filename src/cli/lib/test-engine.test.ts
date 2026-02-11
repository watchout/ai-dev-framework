import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type TestIO,
  runTestAudit,
} from "./test-engine.js";

function createMockIO(): TestIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("test-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-test-engine-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runTestAudit", () => {
    it("returns report for empty project", () => {
      const io = createMockIO();
      const report = runTestAudit(tmpDir, {}, io);

      expect(report.testFiles).toBe(0);
      expect(report.testCases).toBe(0);
      expect(report.verdict).toBe("fail");
    });

    it("analyzes project with test files", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "utils.ts"),
        "export function add(a: number, b: number): number { return a + b; }",
      );
      fs.writeFileSync(
        path.join(tmpDir, "src", "utils.test.ts"),
        [
          'import { describe, it, expect } from "vitest";',
          'it("adds numbers", () => { expect(1 + 1).toBe(2); });',
          'it("handles zero", () => { expect(0 + 0).toBe(0); });',
        ].join("\n"),
      );

      const io = createMockIO();
      const report = runTestAudit(tmpDir, {}, io);

      expect(report.testFiles).toBe(1);
      expect(report.testCases).toBeGreaterThanOrEqual(2);
      expect(report.passed).toBeGreaterThanOrEqual(2);
    });

    it("saves report to .framework/audits", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "a.ts"),
        "export const x = 1;",
      );

      const io = createMockIO();
      runTestAudit(tmpDir, {}, io);

      const auditsDir = path.join(tmpDir, ".framework", "audits");
      expect(fs.existsSync(auditsDir)).toBe(true);
      const files = fs.readdirSync(auditsDir);
      expect(files.some((f) => f.startsWith("test-"))).toBe(true);
    });

    it("prints scorecard to IO", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "a.ts"),
        "export const x = 1;",
      );

      const io = createMockIO();
      runTestAudit(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("Scorecard"))).toBe(true);
      expect(io.output.some((o) => o.includes("Total"))).toBe(true);
      expect(io.output.some((o) => o.includes("Verdict"))).toBe(true);
    });

    it("reports issues when found", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "bad.test.ts"),
        'it.skip("skipped", () => {});\n// TODO: fix this',
      );

      const io = createMockIO();
      const report = runTestAudit(tmpDir, {}, io);

      expect(report.issues.length).toBeGreaterThan(0);
      expect(io.output.some((o) => o.includes("Issues"))).toBe(true);
    });

    it("lists untested source files", () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "covered.ts"),
        "export const x = 1;",
      );
      fs.writeFileSync(
        path.join(tmpDir, "src", "covered.test.ts"),
        'it("works", () => {});',
      );
      fs.writeFileSync(
        path.join(tmpDir, "src", "orphan.ts"),
        "export const y = 2;",
      );

      const io = createMockIO();
      runTestAudit(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("Untested source files"))).toBe(true);
    });

    it("shows status when --status flag is set", () => {
      // First create a report
      fs.writeFileSync(
        path.join(tmpDir, "src", "a.ts"),
        "export const x = 1;",
      );
      const io1 = createMockIO();
      runTestAudit(tmpDir, {}, io1);

      // Then check status
      const io2 = createMockIO();
      const report = runTestAudit(tmpDir, { status: true }, io2);

      expect(report.verdict).toBe("fail");
      expect(io2.output.some((o) => o.includes("TEST STATUS"))).toBe(true);
    });

    it("handles project with high coverage ratio", () => {
      // Create many source files and test files
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(tmpDir, "src", `module${i}.ts`),
          `export const val${i} = ${i};`,
        );
        fs.writeFileSync(
          path.join(tmpDir, "src", `module${i}.test.ts`),
          [
            'import { describe, it, expect } from "vitest";',
            `it("test ${i}a", () => { expect(true).toBe(true); });`,
            `it("test ${i}b", () => { expect(true).toBe(true); });`,
            `it("test ${i}c", () => { expect(true).toBe(true); });`,
          ].join("\n"),
        );
      }

      const io = createMockIO();
      const report = runTestAudit(tmpDir, {}, io);

      expect(report.testFiles).toBe(5);
      expect(report.scorecard.ssotCoverage).toBe(30);
      expect(report.scorecard.total).toBeGreaterThan(50);
    });
  });
});
