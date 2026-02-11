import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type SkillIO,
  runSkillCreate,
  detectStructurePatterns,
  detectImportPatterns,
  detectCodePatterns,
} from "./skill-engine.js";
import { loadSkillIndex } from "./skill-model.js";

function createMockIO(
  answers: string[] = [],
): SkillIO & { output: string[] } {
  let answerIndex = 0;
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
    async ask(_prompt: string): Promise<string> {
      const answer = answers[answerIndex] ?? "n";
      answerIndex++;
      return answer;
    },
  };
}

function createFileInfo(relativePath: string, content: string) {
  return { relativePath, content };
}

describe("skill-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-skill-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detectStructurePatterns", () => {
    it("detects files grouped by suffix", () => {
      const files = [
        createFileInfo("src/cli/lib/audit-model.ts", "export type A = {};"),
        createFileInfo("src/cli/lib/plan-model.ts", "export type B = {};"),
        createFileInfo("src/cli/lib/run-model.ts", "export type C = {};"),
      ];
      const patterns = detectStructurePatterns(files);
      expect(patterns.length).toBeGreaterThan(0);
      const modelPattern = patterns.find((p) =>
        p.pattern.includes("model"),
      );
      expect(modelPattern).toBeDefined();
      expect(modelPattern!.occurrences).toBe(3);
    });

    it("ignores groups with fewer than 2 files", () => {
      const files = [
        createFileInfo("src/cli/lib/audit-unique.ts", "export type A = {};"),
      ];
      const patterns = detectStructurePatterns(files);
      expect(patterns).toHaveLength(0);
    });
  });

  describe("detectImportPatterns", () => {
    it("detects commonly imported modules", () => {
      const content = 'import * as fs from "node:fs";\nimport * as path from "node:path";';
      const files = [
        createFileInfo("src/a.ts", content),
        createFileInfo("src/b.ts", content),
        createFileInfo("src/c.ts", content),
      ];
      const patterns = detectImportPatterns(files);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.pattern.includes("node:fs"))).toBe(true);
    });

    it("ignores relative imports", () => {
      const files = [
        createFileInfo("src/a.ts", 'import { x } from "./utils.js";'),
        createFileInfo("src/b.ts", 'import { x } from "./utils.js";'),
        createFileInfo("src/c.ts", 'import { x } from "./utils.js";'),
      ];
      const patterns = detectImportPatterns(files);
      const relativePatterns = patterns.filter((p) =>
        p.pattern.includes("./"),
      );
      expect(relativePatterns).toHaveLength(0);
    });
  });

  describe("detectCodePatterns", () => {
    it("detects error handling patterns", () => {
      const content = "try {\n  doStuff();\n} catch (e) {\n  handle(e);\n}";
      const files = [
        createFileInfo("src/a.ts", content),
        createFileInfo("src/b.ts", content),
      ];
      const patterns = detectCodePatterns(files);
      expect(patterns.some((p) => p.pattern.includes("Error handling"))).toBe(true);
    });

    it("detects validation patterns", () => {
      const content = 'if (!input) throw new Error("required");';
      const files = [
        createFileInfo("src/a.ts", content),
        createFileInfo("src/b.ts", content),
      ];
      const patterns = detectCodePatterns(files);
      expect(
        patterns.some((p) => p.pattern.includes("validation")),
      ).toBe(true);
    });
  });

  describe("runSkillCreate", () => {
    it("returns empty when no src files exist", async () => {
      const io = createMockIO();
      const skills = await runSkillCreate(tmpDir, {}, io);
      expect(skills).toHaveLength(0);
      expect(io.output.some((o) => o.includes("No source files"))).toBe(true);
    });

    it("detects patterns from project files", async () => {
      // Create src directory with patterned files
      const srcDir = path.join(tmpDir, "src", "lib");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "a-model.ts"),
        'import * as fs from "node:fs";\nexport type A = {};',
      );
      fs.writeFileSync(
        path.join(srcDir, "b-model.ts"),
        'import * as fs from "node:fs";\nexport type B = {};',
      );

      const io = createMockIO(["n"]);
      await runSkillCreate(tmpDir, {}, io);
      expect(
        io.output.some((o) => o.includes("Detected")),
      ).toBe(true);
    });

    it("creates skills when user confirms", async () => {
      const srcDir = path.join(tmpDir, "src", "lib");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "x-engine.ts"),
        "export function run() {}",
      );
      fs.writeFileSync(
        path.join(srcDir, "y-engine.ts"),
        "export function run() {}",
      );

      const io = createMockIO(["y"]);
      const skills = await runSkillCreate(tmpDir, {}, io);
      expect(skills.length).toBeGreaterThan(0);

      const index = loadSkillIndex(tmpDir);
      expect(index.skills.length).toBeGreaterThan(0);
    });

    it("skips patterns when user declines", async () => {
      const srcDir = path.join(tmpDir, "src", "lib");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "a-model.ts"),
        "export type A = {};",
      );
      fs.writeFileSync(
        path.join(srcDir, "b-model.ts"),
        "export type B = {};",
      );

      const io = createMockIO(["n"]);
      const skills = await runSkillCreate(tmpDir, {}, io);
      expect(skills).toHaveLength(0);
    });

    it("saves instincts when flag is set", async () => {
      const srcDir = path.join(tmpDir, "src", "lib");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "a-model.ts"),
        "export type A = {};",
      );
      fs.writeFileSync(
        path.join(srcDir, "b-model.ts"),
        "export type B = {};",
      );

      const io = createMockIO(["y"]);
      await runSkillCreate(tmpDir, { instincts: true }, io);

      const instinctsPath = path.join(
        tmpDir,
        ".claude",
        "memory",
        "instincts.json",
      );
      expect(fs.existsSync(instinctsPath)).toBe(true);
    });

    it("filters by custom pattern", async () => {
      const srcDir = path.join(tmpDir, "src", "lib");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "foo.ts"),
        "export function specialPattern() {}",
      );
      fs.writeFileSync(
        path.join(srcDir, "bar.ts"),
        "export function other() {}",
      );

      const io = createMockIO(["y"]);
      const skills = await runSkillCreate(
        tmpDir,
        { pattern: "specialPattern" },
        io,
      );
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].name).toContain("specialPattern");
    });
  });
});
