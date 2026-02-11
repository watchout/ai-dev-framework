import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type CheckpointIO,
  runCheckpoint,
  collectSourceFiles,
  scoreSSOTAlignment,
  scoreCodeQuality,
  scoreTestCoverage,
  scoreTypeSafety,
  scoreLint,
} from "./checkpoint-engine.js";

function createMockIO(): CheckpointIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  const parent = path.dirname(fullPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
}

describe("checkpoint-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-checkpoint-engine-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runCheckpoint", () => {
    it("creates checkpoint in empty project", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      const data = runCheckpoint(tmpDir, {}, io);

      expect(data.id).toBe("CP-001");
      expect(data.scores).toBeDefined();
      expect(data.scores.total).toBeGreaterThanOrEqual(0);
    });

    it("saves checkpoint to .claude/checkpoints", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      runCheckpoint(tmpDir, {}, io);

      const cpDir = path.join(tmpDir, ".claude", "checkpoints");
      expect(fs.existsSync(cpDir)).toBe(true);
      const files = fs.readdirSync(cpDir).filter(
        (f) => f.startsWith("CP-001"),
      );
      expect(files.length).toBeGreaterThan(0);
    });

    it("uses custom name when provided", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      const data = runCheckpoint(
        tmpDir,
        { name: "release-v1" },
        io,
      );
      expect(data.name).toBe("release-v1");
    });

    it("prints scorecard to IO", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      runCheckpoint(tmpDir, {}, io);

      expect(io.output.some((o) => o.includes("CHECKPOINT"))).toBe(
        true,
      );
      expect(io.output.some((o) => o.includes("Verdict"))).toBe(
        true,
      );
      expect(io.output.some((o) => o.includes("TOTAL"))).toBe(true);
    });

    it("comparison outputs diff when --compare used", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      runCheckpoint(tmpDir, { name: "first" }, io);

      const io2 = createMockIO();
      runCheckpoint(tmpDir, { compare: "CP-001" }, io2);

      expect(
        io2.output.some((o) => o.includes("Comparison")),
      ).toBe(true);
      expect(
        io2.output.some((o) => o.includes("CP-001")),
      ).toBe(true);
    });

    it("handles missing compare checkpoint gracefully", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      runCheckpoint(tmpDir, { compare: "CP-999" }, io);

      expect(
        io.output.some((o) => o.includes("not found")),
      ).toBe(true);
    });
  });

  describe("scoring", () => {
    it("SSOT score penalizes missing docs/standards", () => {
      const issues: Parameters<typeof scoreSSOTAlignment>[1] = [];
      const score = scoreSSOTAlignment(tmpDir, issues);
      expect(score).toBeLessThan(100);
      expect(
        issues.some((i) => i.message.includes("docs/standards")),
      ).toBe(true);
    });

    it("SSOT score rewards existing docs/standards with files", () => {
      writeFile(tmpDir, "docs/standards/01.md", "# Spec\n");
      writeFile(tmpDir, ".framework/project.json", "{}");
      writeFile(tmpDir, "CLAUDE.md", "# Claude\n");

      const issues: Parameters<typeof scoreSSOTAlignment>[1] = [];
      const score = scoreSSOTAlignment(tmpDir, issues);
      expect(score).toBe(100);
    });

    it("code quality detects long files", () => {
      const longContent = Array.from(
        { length: 250 },
        (_, i) => `const x${i} = ${i};`,
      ).join("\n");
      writeFile(tmpDir, "src/long.ts", longContent);

      const files = [path.join(tmpDir, "src", "long.ts")];
      const issues: Parameters<typeof scoreCodeQuality>[2] = [];
      const score = scoreCodeQuality(tmpDir, files, issues);
      expect(score).toBeLessThan(100);
      expect(
        issues.some((i) => i.message.includes("exceeds 200")),
      ).toBe(true);
    });

    it("test coverage reflects source-to-test ratio", () => {
      const srcFiles = [
        path.join(tmpDir, "src", "a.ts"),
        path.join(tmpDir, "src", "b.ts"),
        path.join(tmpDir, "src", "c.ts"),
      ];
      const testFiles = [
        path.join(tmpDir, "src", "a.test.ts"),
      ];

      const issues: Parameters<typeof scoreTestCoverage>[2] = [];
      const score = scoreTestCoverage(srcFiles, testFiles, issues);
      // 1 out of 3 covered = 33%
      expect(score).toBe(33);
    });

    it("type safety detects any usage", () => {
      writeFile(
        tmpDir,
        "src/bad.ts",
        'const x: any = 42;\nfunction foo(a: any): any { return a; }\n',
      );

      const files = [path.join(tmpDir, "src", "bad.ts")];
      const issues: Parameters<typeof scoreTypeSafety>[2] = [];
      const score = scoreTypeSafety(tmpDir, files, issues);
      expect(score).toBeLessThan(100);
      expect(
        issues.some((i) => i.message.includes("any")),
      ).toBe(true);
    });

    it("lint detects console.log and TODO", () => {
      writeFile(
        tmpDir,
        "src/messy.ts",
        'console.log("debug");\n// TODO: fix this\n',
      );

      const files = [path.join(tmpDir, "src", "messy.ts")];
      const issues: Parameters<typeof scoreLint>[2] = [];
      const score = scoreLint(tmpDir, files, issues);
      expect(score).toBeLessThan(100);
      expect(
        issues.some((i) => i.message.includes("console.log")),
      ).toBe(true);
      expect(
        issues.some((i) => i.message.includes("TODO")),
      ).toBe(true);
    });

    it("recommendations generated for low scores", () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      const io = createMockIO();
      const data = runCheckpoint(tmpDir, {}, io);

      // Without docs/standards and .framework, SSOT will be low
      expect(data.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("collectSourceFiles", () => {
    it("collects .ts and .tsx files from src/", () => {
      writeFile(tmpDir, "src/index.ts", "export {};\n");
      writeFile(tmpDir, "src/comp.tsx", "export {};\n");
      writeFile(tmpDir, "src/readme.md", "# README\n");

      const files = collectSourceFiles(tmpDir, "src");
      expect(files).toHaveLength(2);
      expect(files.every((f) => /\.(ts|tsx)$/.test(f))).toBe(true);
    });

    it("recursively collects from subdirectories", () => {
      writeFile(tmpDir, "src/lib/utils.ts", "export {};\n");
      writeFile(tmpDir, "src/lib/deep/nested.ts", "export {};\n");

      const files = collectSourceFiles(tmpDir, "src");
      expect(files).toHaveLength(2);
    });

    it("returns empty for missing directory", () => {
      const files = collectSourceFiles(tmpDir, "nonexistent");
      expect(files).toHaveLength(0);
    });
  });
});
