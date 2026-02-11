import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type VerifyIO,
  runVerify,
} from "./verify-engine.js";

function createMockIO(): VerifyIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
    async ask(_prompt: string): Promise<string> {
      return "";
    },
  };
}

function writeFile(
  dir: string,
  relPath: string,
  content: string,
): void {
  const fullPath = path.join(dir, relPath);
  const parent = path.dirname(fullPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
}

describe("verify-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-verify-engine-"),
    );
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("verify all targets", () => {
    it("runs all checks with target=all", async () => {
      writeFile(tmpDir, "src/index.ts", "export {};\n");
      writeFile(tmpDir, "src/index.test.ts", "export {};\n");

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "all", {}, io,
      );

      expect(result.target).toBe("all");
      expect(result.grader).toBe("auto");
      expect(result.scores.ssotAlignment).toBeDefined();
      expect(result.scores.codeQuality).toBeDefined();
      expect(result.scores.testCoverage).toBeDefined();
      expect(result.scores.typeSafety).toBeDefined();
    });

    it("prints VERIFY header", async () => {
      const io = createMockIO();
      await runVerify(tmpDir, "all", {}, io);

      expect(
        io.output.some((o) => o.includes("VERIFY")),
      ).toBe(true);
    });
  });

  describe("individual target verification", () => {
    it("verifies ssot target only", async () => {
      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "ssot", {}, io,
      );

      expect(result.scores.ssotAlignment).toBeDefined();
      expect(result.scores.codeQuality).toBeUndefined();
    });

    it("verifies code target only", async () => {
      writeFile(
        tmpDir,
        "src/app.ts",
        "export function app(): string { return 'ok'; }\n",
      );

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "code", {}, io,
      );

      expect(result.scores.codeQuality).toBeDefined();
      expect(result.scores.ssotAlignment).toBeUndefined();
    });

    it("verifies tests target only", async () => {
      writeFile(tmpDir, "src/a.ts", "export {};\n");

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "tests", {}, io,
      );

      expect(result.scores.testCoverage).toBeDefined();
      expect(result.scores.codeQuality).toBeUndefined();
    });

    it("verifies types target only", async () => {
      writeFile(tmpDir, "src/typed.ts", "const x: string = 'ok';\n");

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "types", {}, io,
      );

      expect(result.scores.typeSafety).toBeDefined();
      expect(result.scores.ssotAlignment).toBeUndefined();
    });
  });

  describe("strict mode", () => {
    it("strict mode fails on warnings", async () => {
      // No docs/standards = low SSOT score -> warning normally
      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "ssot", { strict: true }, io,
      );

      // Without docs/standards, score < 90
      expect(result.verdict).toBe("fail");
    });

    it("strict mode passes when score >= 90", async () => {
      writeFile(tmpDir, "docs/standards/01.md", "# Spec\n");
      writeFile(tmpDir, ".framework/project.json", "{}");
      writeFile(tmpDir, "CLAUDE.md", "# Claude\n");
      writeFile(tmpDir, "src/clean.ts", "export {};\n");
      writeFile(tmpDir, "src/clean.test.ts", "export {};\n");

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "ssot", { strict: true }, io,
      );

      expect(result.scores.ssotAlignment).toBe(100);
      expect(result.verdict).toBe("pass");
    });
  });

  describe("verdict determination", () => {
    it("verdict is pass for high scores", async () => {
      writeFile(tmpDir, "docs/standards/01.md", "# Spec\n");
      writeFile(tmpDir, ".framework/project.json", "{}");
      writeFile(tmpDir, "CLAUDE.md", "# Claude\n");

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "ssot", {}, io,
      );

      expect(result.verdict).toBe("pass");
    });

    it("verdict is fail for very low scores", async () => {
      // Empty src, no docs -> code target has no files -> 100
      // But ssot will be low without docs
      writeFile(
        tmpDir,
        "src/bad.ts",
        'const x: any = 1;\nconst y: any = 2;\nconst z: any = 3;\n' +
        'const a: any = 4;\nconst b: any = 5;\nconst c: any = 6;\n' +
        'const d: any = 7;\nconst e: any = 8;\nconst f: any = 9;\n' +
        'const g: any = 10;\nconst h: any = 11;\n',
      );

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "types", {}, io,
      );

      // 11 any usages * 10 = 110 penalty, clamped to 0
      expect(result.scores.typeSafety).toBe(0);
      expect(result.verdict).toBe("fail");
    });
  });

  describe("issues reported", () => {
    it("reports issues for any type usage", async () => {
      writeFile(
        tmpDir,
        "src/problem.ts",
        "const x: any = 42;\n",
      );

      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "types", {}, io,
      );

      expect(result.issues.length).toBeGreaterThan(0);
      expect(
        result.issues.some((i) => i.message.includes("any")),
      ).toBe(true);
    });

    it("reports missing docs/standards for ssot target", async () => {
      const io = createMockIO();
      const result = await runVerify(
        tmpDir, "ssot", {}, io,
      );

      expect(
        result.issues.some((i) =>
          i.message.includes("docs/standards"),
        ),
      ).toBe(true);
    });
  });

  describe("persistence", () => {
    it("saves verify result to .claude/verify/", async () => {
      const io = createMockIO();
      await runVerify(tmpDir, "all", {}, io);

      const verifyDir = path.join(tmpDir, ".claude", "verify");
      expect(fs.existsSync(verifyDir)).toBe(true);
      const files = fs.readdirSync(verifyDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe("fix option", () => {
    it("prints fix placeholder message", async () => {
      const io = createMockIO();
      await runVerify(tmpDir, "code", { fix: true }, io);

      expect(
        io.output.some((o) => o.includes("--fix")),
      ).toBe(true);
    });
  });
});
