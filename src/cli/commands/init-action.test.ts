import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { initProject, type InitOptions } from "./init-action.js";

describe("initProject", () => {
  let tmpDir: string;
  let fakeFrameworkDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-init-test-"));

    // Create a fake framework source (avoids git clone)
    fakeFrameworkDir = path.join(tmpDir, "_fake-framework");
    fs.mkdirSync(fakeFrameworkDir, { recursive: true });
    fs.writeFileSync(
      path.join(fakeFrameworkDir, "00_MASTER_GUIDE.md"),
      "# Master Guide",
    );
    fs.writeFileSync(
      path.join(fakeFrameworkDir, "CODING_STANDARDS.md"),
      "# Coding Standards",
    );
    fs.writeFileSync(
      path.join(fakeFrameworkDir, "TESTING_STANDARDS.md"),
      "# Testing Standards",
    );
    fs.writeFileSync(
      path.join(fakeFrameworkDir, "GIT_WORKFLOW.md"),
      "# Git Workflow",
    );
    fs.writeFileSync(
      path.join(fakeFrameworkDir, "TECH_STACK.md"),
      "# Tech Stack",
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function defaultOptions(overrides?: Partial<InitOptions>): InitOptions {
    return {
      projectName: "test-project",
      description: "A test project",
      targetDir: tmpDir,
      skipGit: true,
      frameworkSourceDir: fakeFrameworkDir,
      ...overrides,
    };
  }

  function projectPath(name = "test-project"): string {
    return path.join(tmpDir, name);
  }

  it("creates project directory", async () => {
    await initProject(defaultOptions());
    expect(fs.existsSync(projectPath())).toBe(true);
  });

  it("returns correct project path", async () => {
    const result = await initProject(defaultOptions());
    expect(result.projectPath).toBe(projectPath());
  });

  it("creates docs directory structure", async () => {
    await initProject(defaultOptions());

    const expectedDirs = [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/design/features/common",
      "docs/design/features/project",
      "docs/design/adr",
      "docs/standards",
      "docs/operations",
      "docs/marketing",
      "docs/growth",
      "docs/management",
    ];

    for (const dir of expectedDirs) {
      const dirPath = path.join(projectPath(), dir);
      expect(fs.existsSync(dirPath), `${dir} should exist`).toBe(true);
    }
  });

  it("creates src directory structure", async () => {
    await initProject(defaultOptions());

    const expectedDirs = [
      "src/app",
      "src/components/ui",
      "src/components/features",
      "src/lib",
      "src/hooks",
      "src/types",
      "src/services",
      "src/__tests__",
    ];

    for (const dir of expectedDirs) {
      const dirPath = path.join(projectPath(), dir);
      expect(fs.existsSync(dirPath), `${dir} should exist`).toBe(true);
    }
  });

  it("creates .framework directory", async () => {
    await initProject(defaultOptions());

    expect(fs.existsSync(path.join(projectPath(), ".framework"))).toBe(true);
    expect(
      fs.existsSync(path.join(projectPath(), ".framework/audits/ssot")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectPath(), ".framework/logs")),
    ).toBe(true);
  });

  it("fetches framework docs into docs/standards/", async () => {
    await initProject(defaultOptions());

    expect(
      fs.existsSync(
        path.join(projectPath(), "docs/standards/00_MASTER_GUIDE.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectPath(), "docs/standards/CODING_STANDARDS.md"),
      ),
    ).toBe(true);
  });

  it("saves framework state after fetch", async () => {
    await initProject(defaultOptions());

    expect(
      fs.existsSync(
        path.join(projectPath(), ".framework/framework.json"),
      ),
    ).toBe(true);
  });

  it("generates CLAUDE.md with project info", async () => {
    await initProject(
      defaultOptions({ description: "My awesome project" }),
    );

    const content = fs.readFileSync(
      path.join(projectPath(), "CLAUDE.md"),
      "utf-8",
    );
    expect(content).toContain("test-project");
    expect(content).toContain("My awesome project");
    expect(content).toContain("AI Interruption Protocol");
    expect(content).toContain("docs/design/core/SSOT-2_UI_STATE.md");
  });

  it("generates .cursorrules with project info", async () => {
    await initProject(defaultOptions());

    const content = fs.readFileSync(
      path.join(projectPath(), ".cursorrules"),
      "utf-8",
    );
    expect(content).toContain("test-project");
    expect(content).toContain("Next.js 15");
  });

  it("creates .gitignore", async () => {
    await initProject(defaultOptions());

    const content = fs.readFileSync(
      path.join(projectPath(), ".gitignore"),
      "utf-8",
    );
    expect(content).toContain("node_modules/");
    expect(content).toContain(".next/");
    expect(content).toContain(".env");
    expect(content).toContain(".framework/logs/");
  });

  it("creates README.md", async () => {
    await initProject(
      defaultOptions({ description: "Test description" }),
    );

    const content = fs.readFileSync(
      path.join(projectPath(), "README.md"),
      "utf-8",
    );
    expect(content).toContain("# test-project");
    expect(content).toContain("Test description");
  });

  it("creates docs/INDEX.md", async () => {
    await initProject(defaultOptions());

    const content = fs.readFileSync(
      path.join(projectPath(), "docs/INDEX.md"),
      "utf-8",
    );
    expect(content).toContain("SSOT-0_PRD.md");
    expect(content).toContain("SSOT-2_UI_STATE.md");
  });

  it("creates document placeholders (excluding docs/standards/)", async () => {
    await initProject(defaultOptions());

    // These are in the app profile's requiredTemplates
    const expectedFiles = [
      "docs/idea/IDEA_CANVAS.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
      "docs/design/core/SSOT-2_UI_STATE.md",
      "docs/management/PROJECT_PLAN.md",
    ];

    for (const file of expectedFiles) {
      expect(
        fs.existsSync(path.join(projectPath(), file)),
        `${file} should exist`,
      ).toBe(true);
    }

    // docs/standards/ files come from framework fetch, not placeholders
    const codingStd = fs.readFileSync(
      path.join(projectPath(), "docs/standards/CODING_STANDARDS.md"),
      "utf-8",
    );
    expect(codingStd).toBe("# Coding Standards");
  });

  it("creates .framework/project.json with correct state", async () => {
    await initProject(defaultOptions());

    const raw = fs.readFileSync(
      path.join(projectPath(), ".framework/project.json"),
      "utf-8",
    );
    const state = JSON.parse(raw);

    expect(state.name).toBe("test-project");
    expect(state.version).toBe("0.1.0");
    expect(state.phase).toBe(-1);
    expect(state.status).toBe("initialized");
    expect(state.techStack.framework).toBe("next.js");
    expect(state.techStack.language).toBe("typescript");
    expect(state.config.aiProvider).toBe("anthropic");
    expect(state.config.escalationMode).toBe("strict");
  });

  it("returns list of created files", async () => {
    const result = await initProject(defaultOptions());

    expect(result.createdFiles).toContain("CLAUDE.md");
    expect(result.createdFiles).toContain(".cursorrules");
    expect(result.createdFiles).toContain(".gitignore");
    expect(result.createdFiles).toContain("README.md");
    expect(result.createdFiles).toContain("docs/INDEX.md");
    expect(result.createdFiles).toContain(".framework/project.json");
    expect(result.createdFiles.length).toBeGreaterThan(20);
  });

  it("throws if directory exists and is non-empty", async () => {
    const dir = path.join(tmpDir, "existing");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "file.txt"), "content");

    await expect(
      initProject(defaultOptions({ projectName: "existing" })),
    ).rejects.toThrow("already exists and is not empty");
  });

  it("succeeds if directory exists but is empty", async () => {
    const dir = path.join(tmpDir, "empty-dir");
    fs.mkdirSync(dir);

    const result = await initProject(
      defaultOptions({ projectName: "empty-dir" }),
    );
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });

  it("uses custom project name", async () => {
    const result = await initProject(
      defaultOptions({ projectName: "my-saas-app" }),
    );

    expect(result.projectPath).toBe(path.join(tmpDir, "my-saas-app"));
    expect(fs.existsSync(path.join(tmpDir, "my-saas-app"))).toBe(true);
  });

  it("creates .claude/agents/ directory with agent templates", async () => {
    await initProject(defaultOptions());

    const agentsDir = path.join(projectPath(), ".claude/agents");
    expect(fs.existsSync(agentsDir)).toBe(true);

    const expectedAgents = [
      "visual-tester.md",
      "code-reviewer.md",
      "ssot-explorer.md",
    ];

    for (const agent of expectedAgents) {
      const agentPath = path.join(agentsDir, agent);
      expect(fs.existsSync(agentPath), `${agent} should exist`).toBe(true);

      const content = fs.readFileSync(agentPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("agent templates contain project name", async () => {
    await initProject(defaultOptions({ projectName: "my-app" }));

    const agentPath = path.join(
      tmpDir,
      "my-app",
      ".claude/agents/visual-tester.md",
    );
    const content = fs.readFileSync(agentPath, "utf-8");
    expect(content).toContain("my-app");
    expect(content).toContain("Visual Tester Agent");
  });

  it("includes agent files in createdFiles list", async () => {
    const result = await initProject(defaultOptions());

    expect(result.createdFiles).toContain(
      ".claude/agents/visual-tester.md",
    );
    expect(result.createdFiles).toContain(
      ".claude/agents/code-reviewer.md",
    );
    expect(result.createdFiles).toContain(
      ".claude/agents/ssot-explorer.md",
    );
  });
});
