import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { updateAgentTemplates, updateSkillTemplates } from "./update-engine.js";
import { AGENT_TEMPLATES } from "./templates.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-engine-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// updateAgentTemplates
// ─────────────────────────────────────────────

describe("updateAgentTemplates", () => {
  it("returns 0 when .claude/agents/ does not exist", () => {
    expect(updateAgentTemplates(tmpDir)).toBe(0);
  });

  it("creates all agent files when agents dir exists but is empty", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });

    const count = updateAgentTemplates(tmpDir);

    expect(count).toBe(AGENT_TEMPLATES.length);
    for (const agent of AGENT_TEMPLATES) {
      const filePath = path.join(tmpDir, ".claude/agents", agent.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("does not update when content is identical (idempotent)", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });

    // First run: create files
    updateAgentTemplates(tmpDir);

    // Second run: no changes
    const count = updateAgentTemplates(tmpDir);
    expect(count).toBe(0);
  });

  it("updates agent file when content differs", () => {
    const agentsDir = path.join(tmpDir, ".claude/agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Write stale content
    const firstAgent = AGENT_TEMPLATES[0];
    fs.writeFileSync(
      path.join(agentsDir, firstAgent.filename),
      "# Outdated content",
      "utf-8",
    );

    const count = updateAgentTemplates(tmpDir);

    // Should update the stale file + create the missing ones
    expect(count).toBe(AGENT_TEMPLATES.length);
    const content = fs.readFileSync(
      path.join(agentsDir, firstAgent.filename),
      "utf-8",
    );
    expect(content).not.toBe("# Outdated content");
  });

  it("reads project name from .framework/project.json", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".framework/project.json"),
      JSON.stringify({ name: "my-custom-project" }),
      "utf-8",
    );

    updateAgentTemplates(tmpDir);

    // Check that generated content includes the project name
    const firstAgent = AGENT_TEMPLATES[0];
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude/agents", firstAgent.filename),
      "utf-8",
    );
    expect(content).toContain("my-custom-project");
  });

  it("falls back to directory name when project.json is missing", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });

    updateAgentTemplates(tmpDir);

    const firstAgent = AGENT_TEMPLATES[0];
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude/agents", firstAgent.filename),
      "utf-8",
    );
    // Should contain the tmp dir basename
    expect(content).toContain(path.basename(tmpDir));
  });
});

// ─────────────────────────────────────────────
// updateSkillTemplates
// ─────────────────────────────────────────────

describe("updateSkillTemplates", () => {
  let fakeFrameworkRoot: string;

  beforeEach(() => {
    // Create a fake framework root with skill templates
    fakeFrameworkRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-root-"),
    );

    // Create skill source templates
    for (const skill of ["discovery", "design", "implement", "review"]) {
      const skillDir = path.join(
        fakeFrameworkRoot,
        "templates/skills",
        skill,
      );
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        `# ${skill} skill template v4`,
        "utf-8",
      );
    }

    // Create _INDEX.md source
    const skillsIndexDir = path.join(fakeFrameworkRoot, ".claude/skills");
    fs.mkdirSync(skillsIndexDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsIndexDir, "_INDEX.md"),
      "# Skills Index v4",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(fakeFrameworkRoot, { recursive: true, force: true });
  });

  it("returns 0 when .claude/skills/ does not exist", () => {
    expect(updateSkillTemplates(tmpDir, fakeFrameworkRoot)).toBe(0);
  });

  it("creates skill files when skills dir exists but is empty", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/skills"), { recursive: true });

    const count = updateSkillTemplates(tmpDir, fakeFrameworkRoot);

    // 4 skills + 1 _INDEX.md = 5
    expect(count).toBe(5);

    for (const skill of ["discovery", "design", "implement", "review"]) {
      const dest = path.join(tmpDir, ".claude/skills", skill, "SKILL.md");
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, "utf-8")).toContain(
        `# ${skill} skill template v4`,
      );
    }

    const indexDest = path.join(tmpDir, ".claude/skills/_INDEX.md");
    expect(fs.existsSync(indexDest)).toBe(true);
  });

  it("does not update when content is identical (idempotent)", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/skills"), { recursive: true });

    // First run
    updateSkillTemplates(tmpDir, fakeFrameworkRoot);

    // Second run
    const count = updateSkillTemplates(tmpDir, fakeFrameworkRoot);
    expect(count).toBe(0);
  });

  it("updates skill file when content differs", () => {
    const destDir = path.join(
      tmpDir,
      ".claude/skills/discovery",
    );
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(
      path.join(destDir, "SKILL.md"),
      "# old version",
      "utf-8",
    );
    // Create skills root so the function proceeds
    fs.mkdirSync(path.join(tmpDir, ".claude/skills"), { recursive: true });

    const count = updateSkillTemplates(tmpDir, fakeFrameworkRoot);

    // discovery updated + 3 created + _INDEX.md = 5
    expect(count).toBe(5);
    const content = fs.readFileSync(
      path.join(destDir, "SKILL.md"),
      "utf-8",
    );
    expect(content).toBe("# discovery skill template v4");
  });

  it("removes deprecated v3 skill directories", () => {
    const skillsDir = path.join(tmpDir, ".claude/skills");
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create deprecated directories
    const deprecated = ["business", "product", "technical"];
    for (const name of deprecated) {
      const dir = path.join(skillsDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), "# old", "utf-8");
    }

    const count = updateSkillTemplates(tmpDir, fakeFrameworkRoot);

    // 4 skills + _INDEX.md + 3 deprecated removed = 8
    expect(count).toBe(8);

    for (const name of deprecated) {
      expect(fs.existsSync(path.join(skillsDir, name))).toBe(false);
    }
  });

  it("handles missing _INDEX.md source gracefully", () => {
    // Remove _INDEX.md from fake framework root
    fs.rmSync(
      path.join(fakeFrameworkRoot, ".claude/skills/_INDEX.md"),
    );

    fs.mkdirSync(path.join(tmpDir, ".claude/skills"), { recursive: true });

    const count = updateSkillTemplates(tmpDir, fakeFrameworkRoot);

    // 4 skills only, no _INDEX.md
    expect(count).toBe(4);
    expect(
      fs.existsSync(path.join(tmpDir, ".claude/skills/_INDEX.md")),
    ).toBe(false);
  });
});
