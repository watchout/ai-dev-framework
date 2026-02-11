import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type Skill,
  type SkillIndex,
  generateSkillId,
  categorizePattern,
  calculateConfidence,
  saveSkill,
  loadSkill,
  loadSkillIndex,
  formatSkillMarkdown,
} from "./skill-model.js";

function makeSkill(overrides?: Partial<Skill>): Skill {
  return {
    id: "SKILL-001",
    name: "Test Skill",
    category: "implementation",
    confidence: 80,
    useCount: 0,
    createdAt: "2026-02-04T00:00:00Z",
    source: "src/cli/lib/test.ts",
    trigger: "When creating a new model file",
    steps: ["Create types", "Add pure functions", "Export all"],
    checklist: ["Types defined", "Functions pure", "Tests written"],
    ...overrides,
  };
}

describe("skill-model", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-skill-model-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generateSkillId", () => {
    it("generates SKILL-001 for empty index", () => {
      const index: SkillIndex = { skills: [] };
      expect(generateSkillId(index)).toBe("SKILL-001");
    });

    it("generates next sequential ID", () => {
      const index: SkillIndex = {
        skills: [
          { id: "SKILL-001", name: "a", category: "implementation", confidence: 50, useCount: 0 },
          { id: "SKILL-003", name: "b", category: "testing", confidence: 60, useCount: 1 },
        ],
      };
      expect(generateSkillId(index)).toBe("SKILL-004");
    });

    it("pads ID to three digits", () => {
      const index: SkillIndex = {
        skills: [
          { id: "SKILL-009", name: "x", category: "implementation", confidence: 50, useCount: 0 },
        ],
      };
      expect(generateSkillId(index)).toBe("SKILL-010");
    });
  });

  describe("categorizePattern", () => {
    it("categorizes test files as testing", () => {
      const files = [
        "src/lib/foo.test.ts",
        "src/lib/bar.test.ts",
        "src/lib/baz.test.ts",
      ];
      expect(categorizePattern(files)).toBe("testing");
    });

    it("categorizes debug/error files as debugging", () => {
      const files = [
        "src/lib/debug-utils.ts",
        "src/lib/error-handler.ts",
        "src/lib/logger.ts",
      ];
      expect(categorizePattern(files)).toBe("debugging");
    });

    it("categorizes util/helper files as refactoring", () => {
      const files = [
        "src/lib/util.ts",
        "src/lib/helper.ts",
        "src/shared/utils.ts",
      ];
      expect(categorizePattern(files)).toBe("refactoring");
    });

    it("defaults to implementation for regular files", () => {
      const files = [
        "src/cli/commands/init.ts",
        "src/cli/commands/run.ts",
        "src/cli/commands/audit.ts",
      ];
      expect(categorizePattern(files)).toBe("implementation");
    });
  });

  describe("calculateConfidence", () => {
    it("returns 0 for zero inputs", () => {
      expect(calculateConfidence(0, 0)).toBe(0);
    });

    it("increases with more occurrences", () => {
      const low = calculateConfidence(1, 1);
      const high = calculateConfidence(5, 1);
      expect(high).toBeGreaterThan(low);
    });

    it("increases with more files", () => {
      const low = calculateConfidence(1, 1);
      const high = calculateConfidence(1, 5);
      expect(high).toBeGreaterThan(low);
    });

    it("caps at 100", () => {
      expect(calculateConfidence(100, 100)).toBe(100);
    });

    it("returns expected value for moderate input", () => {
      // 3 occurrences = 30, 2 files = 30 => 60
      expect(calculateConfidence(3, 2)).toBe(60);
    });
  });

  describe("saveSkill + loadSkill round-trip", () => {
    it("saves and loads a skill", () => {
      const skill = makeSkill();
      saveSkill(tmpDir, skill);
      const loaded = loadSkill(tmpDir, "SKILL-001");
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("SKILL-001");
      expect(loaded!.name).toBe("Test Skill");
      expect(loaded!.steps).toHaveLength(3);
      expect(loaded!.checklist).toHaveLength(3);
    });

    it("creates .claude/skills directory", () => {
      saveSkill(tmpDir, makeSkill());
      expect(
        fs.existsSync(path.join(tmpDir, ".claude", "skills")),
      ).toBe(true);
    });

    it("returns null for nonexistent skill", () => {
      expect(loadSkill(tmpDir, "SKILL-999")).toBeNull();
    });

    it("updates existing skill in index", () => {
      const skill = makeSkill();
      saveSkill(tmpDir, skill);
      const updated = makeSkill({ confidence: 95 });
      saveSkill(tmpDir, updated);
      const index = loadSkillIndex(tmpDir);
      expect(index.skills).toHaveLength(1);
      expect(index.skills[0].confidence).toBe(95);
    });
  });

  describe("formatSkillMarkdown", () => {
    it("includes skill ID and name in title", () => {
      const md = formatSkillMarkdown(makeSkill());
      expect(md).toContain("# SKILL-001: Test Skill");
    });

    it("includes metadata lines", () => {
      const md = formatSkillMarkdown(makeSkill());
      expect(md).toContain("> Category: implementation");
      expect(md).toContain("> Confidence: 80%");
      expect(md).toContain("> Use Count: 0");
    });

    it("includes numbered steps", () => {
      const md = formatSkillMarkdown(makeSkill());
      expect(md).toContain("1. Create types");
      expect(md).toContain("2. Add pure functions");
      expect(md).toContain("3. Export all");
    });

    it("includes checklist items", () => {
      const md = formatSkillMarkdown(makeSkill());
      expect(md).toContain("- [ ] Types defined");
      expect(md).toContain("- [ ] Functions pure");
    });

    it("includes template when present", () => {
      const skill = makeSkill({ template: "const x = 1;" });
      const md = formatSkillMarkdown(skill);
      expect(md).toContain("## Template");
      expect(md).toContain("```typescript");
      expect(md).toContain("const x = 1;");
    });

    it("omits template section when not present", () => {
      const md = formatSkillMarkdown(makeSkill());
      expect(md).not.toContain("## Template");
    });
  });

  describe("loadSkillIndex", () => {
    it("returns empty index when no file exists", () => {
      const index = loadSkillIndex(tmpDir);
      expect(index.skills).toHaveLength(0);
    });

    it("returns populated index after saving skills", () => {
      saveSkill(tmpDir, makeSkill({ id: "SKILL-001", name: "First" }));
      saveSkill(tmpDir, makeSkill({ id: "SKILL-002", name: "Second" }));
      const index = loadSkillIndex(tmpDir);
      expect(index.skills).toHaveLength(2);
    });
  });
});
