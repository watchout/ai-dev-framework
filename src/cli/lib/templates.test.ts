import { describe, it, expect } from "vitest";
import {
  generateClaudeMd,
  generateCursorRules,
  generateGitignore,
  generateReadme,
  generateStartHere,
  generateDocsIndex,
  generateVisualTesterAgent,
  generateCodeReviewerAgent,
  generateSsotExplorerAgent,
  generateProjectState,
  generateMcpJson,
  AGENT_TEMPLATES,
  type ProjectConfig,
} from "./templates.js";

const testConfig: ProjectConfig = {
  projectName: "test-project",
  description: "A test project for unit testing",
  profileType: "app",
};

// ─────────────────────────────────────────────
// generateClaudeMd
// ─────────────────────────────────────────────

describe("generateClaudeMd", () => {
  it("includes project name and description", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("test-project");
    expect(result).toContain("A test project for unit testing");
  });

  it("includes AI Interruption Protocol section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("AI Interruption Protocol");
    expect(result).toContain("PROHIBITED");
  });

  it("includes Pre-Code Gate section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("Pre-Code Gate");
    expect(result).toContain("Gate A");
    expect(result).toContain("Gate B");
    expect(result).toContain("Gate C");
  });

  it("includes Workflow Orchestration section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("Workflow Orchestration");
    expect(result).toContain("/discovery");
    expect(result).toContain("/design");
    expect(result).toContain("/implement");
    expect(result).toContain("/review");
  });

  it("includes GitHub Integration section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("GitHub Integration");
    expect(result).toContain("framework plan --sync");
    expect(result).toContain("framework status --github");
  });

  it("includes Knowledge & Memory section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("Knowledge & Memory");
    expect(result).toContain(".claude/memory/");
  });

  it("includes today's date", () => {
    const result = generateClaudeMd(testConfig);
    const today = new Date().toISOString().split("T")[0];
    expect(result).toContain(today);
  });

  it("includes Coding Standards", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("PascalCase");
    expect(result).toContain("camelCase");
    expect(result).toContain("any");
  });
});

// ─────────────────────────────────────────────
// generateCursorRules
// ─────────────────────────────────────────────

describe("generateCursorRules", () => {
  it("includes project name and description", () => {
    const result = generateCursorRules(testConfig);
    expect(result).toContain("test-project");
    expect(result).toContain("A test project for unit testing");
  });

  it("includes specification locations", () => {
    const result = generateCursorRules(testConfig);
    expect(result).toContain("SSOT-0_PRD.md");
    expect(result).toContain("SSOT-2_UI_STATE.md");
    expect(result).toContain("SSOT-3_API_CONTRACT.md");
    expect(result).toContain("SSOT-4_DATA_MODEL.md");
    expect(result).toContain("SSOT-5_CROSS_CUTTING.md");
  });

  it("includes highest priority rule", () => {
    const result = generateCursorRules(testConfig);
    expect(result).toContain("STOP and ask");
  });
});

// ─────────────────────────────────────────────
// generateGitignore
// ─────────────────────────────────────────────

describe("generateGitignore", () => {
  it("includes standard ignore patterns", () => {
    const result = generateGitignore();
    expect(result).toContain("node_modules/");
    expect(result).toContain(".next/");
    expect(result).toContain(".env");
    expect(result).toContain("dist/");
    expect(result).toContain(".DS_Store");
  });

  it("includes framework state patterns", () => {
    const result = generateGitignore();
    expect(result).toContain(".framework/logs/");
    expect(result).toContain("active-skill.json");
  });
});

// ─────────────────────────────────────────────
// generateReadme
// ─────────────────────────────────────────────

describe("generateReadme", () => {
  it("includes project name and description", () => {
    const result = generateReadme(testConfig);
    expect(result).toContain("# test-project");
    expect(result).toContain("A test project for unit testing");
  });

  it("includes setup instructions", () => {
    const result = generateReadme(testConfig);
    expect(result).toContain("npm install");
    expect(result).toContain("npm run dev");
  });

  it("includes documentation directory table", () => {
    const result = generateReadme(testConfig);
    expect(result).toContain("docs/idea/");
    expect(result).toContain("docs/requirements/");
    expect(result).toContain("docs/design/");
    expect(result).toContain("docs/standards/");
  });
});

// ─────────────────────────────────────────────
// generateStartHere
// ─────────────────────────────────────────────

describe("generateStartHere", () => {
  it("includes project name", () => {
    const result = generateStartHere(testConfig);
    expect(result).toContain("test-project");
  });

  it("describes the 8-phase flow", () => {
    const result = generateStartHere(testConfig);
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 8");
    expect(result).toContain("ディスカバリー");
  });

  it("mentions Gate A/B/C", () => {
    const result = generateStartHere(testConfig);
    expect(result).toContain("Gate A");
    expect(result).toContain("Gate B");
    expect(result).toContain("Gate C");
  });
});

// ─────────────────────────────────────────────
// generateDocsIndex
// ─────────────────────────────────────────────

describe("generateDocsIndex", () => {
  it("lists all SSOT documents", () => {
    const result = generateDocsIndex();
    expect(result).toContain("SSOT-0_PRD.md");
    expect(result).toContain("SSOT-1_FEATURE_CATALOG.md");
    expect(result).toContain("SSOT-2_UI_STATE.md");
    expect(result).toContain("SSOT-3_API_CONTRACT.md");
    expect(result).toContain("SSOT-4_DATA_MODEL.md");
    expect(result).toContain("SSOT-5_CROSS_CUTTING.md");
  });

  it("lists idea documents", () => {
    const result = generateDocsIndex();
    expect(result).toContain("IDEA_CANVAS.md");
    expect(result).toContain("USER_PERSONA.md");
    expect(result).toContain("COMPETITOR_ANALYSIS.md");
    expect(result).toContain("VALUE_PROPOSITION.md");
  });

  it("lists marketing documents", () => {
    const result = generateDocsIndex();
    expect(result).toContain("LP_SPEC.md");
    expect(result).toContain("SNS_STRATEGY.md");
    expect(result).toContain("PRICING_STRATEGY.md");
  });

  it("all entries have Pending status", () => {
    const result = generateDocsIndex();
    const pendingCount = (result.match(/\| Pending \|/g) ?? []).length;
    // All documents should be Pending on initial generation
    expect(pendingCount).toBeGreaterThan(20);
  });
});

// ─────────────────────────────────────────────
// Agent Templates
// ─────────────────────────────────────────────

describe("generateVisualTesterAgent", () => {
  it("includes project name", () => {
    const result = generateVisualTesterAgent(testConfig);
    expect(result).toContain("test-project");
  });

  it("describes visual test levels", () => {
    const result = generateVisualTesterAgent(testConfig);
    expect(result).toContain("Level 1");
    expect(result).toContain("Level 4");
    expect(result).toContain("レスポンシブ");
  });

  it("is read-only (no file modification)", () => {
    const result = generateVisualTesterAgent(testConfig);
    expect(result).toContain("ファイルの変更は行わない");
  });
});

describe("generateCodeReviewerAgent", () => {
  it("includes project name", () => {
    const result = generateCodeReviewerAgent(testConfig);
    expect(result).toContain("test-project");
  });

  it("describes security check points", () => {
    const result = generateCodeReviewerAgent(testConfig);
    expect(result).toContain("認証");
    expect(result).toContain("SQLインジェクション");
    expect(result).toContain("XSS");
  });
});

describe("generateSsotExplorerAgent", () => {
  it("includes project name", () => {
    const result = generateSsotExplorerAgent(testConfig);
    expect(result).toContain("test-project");
  });

  it("describes search patterns", () => {
    const result = generateSsotExplorerAgent(testConfig);
    expect(result).toContain("機能ID検索");
    expect(result).toContain("キーワード検索");
  });
});

// ─────────────────────────────────────────────
// AGENT_TEMPLATES array
// ─────────────────────────────────────────────

describe("AGENT_TEMPLATES", () => {
  it("contains 3 agent templates", () => {
    expect(AGENT_TEMPLATES).toHaveLength(3);
  });

  it("each template has filename and generate function", () => {
    for (const template of AGENT_TEMPLATES) {
      expect(template.filename).toMatch(/\.md$/);
      expect(typeof template.generate).toBe("function");
      const result = template.generate(testConfig);
      expect(result.length).toBeGreaterThan(100);
    }
  });
});

// ─────────────────────────────────────────────
// generateProjectState
// ─────────────────────────────────────────────

describe("generateProjectState", () => {
  it("returns valid JSON", () => {
    const result = generateProjectState(testConfig);
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it("includes project name and profile type", () => {
    const result = JSON.parse(generateProjectState(testConfig));
    expect(result.name).toBe("test-project");
    expect(result.profileType).toBe("app");
  });

  it("defaults profileType to app when not specified", () => {
    const config: ProjectConfig = {
      projectName: "no-profile",
      description: "test",
    };
    const result = JSON.parse(generateProjectState(config));
    expect(result.profileType).toBe("app");
  });

  it("includes timestamps", () => {
    const result = JSON.parse(generateProjectState(testConfig));
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    // Timestamps should be ISO format
    expect(() => new Date(result.createdAt)).not.toThrow();
  });

  it("includes tech stack", () => {
    const result = JSON.parse(generateProjectState(testConfig));
    expect(result.techStack.framework).toBe("next.js");
    expect(result.techStack.language).toBe("typescript");
    expect(result.techStack.testing).toBe("vitest");
  });

  it("includes config with escalation mode", () => {
    const result = JSON.parse(generateProjectState(testConfig));
    expect(result.config.escalationMode).toBe("strict");
    expect(result.config.autoCommit).toBe(false);
  });

  it("initializes at phase -1", () => {
    const result = JSON.parse(generateProjectState(testConfig));
    expect(result.phase).toBe(-1);
    expect(result.status).toBe("initialized");
  });
});

// ─────────────────────────────────────────────
// generateMcpJson
// ─────────────────────────────────────────────

describe("generateMcpJson", () => {
  it("returns valid JSON", () => {
    const result = generateMcpJson();
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it("includes playwright MCP server", () => {
    const parsed = JSON.parse(generateMcpJson());
    expect(parsed.mcpServers.playwright).toBeDefined();
    expect(parsed.mcpServers.playwright.command).toBe("npx");
    expect(parsed.mcpServers.playwright.args).toContain(
      "@playwright/mcp@latest",
    );
  });
});

// ─────────────────────────────────────────────
// generateClaudeMd — Browser Debugging section
// ─────────────────────────────────────────────

describe("generateClaudeMd browser debugging", () => {
  it("includes Browser Debugging MCP section", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("Browser Debugging (MCP)");
    expect(result).toContain("Playwright MCP");
  });

  it("mentions dedicated Chromium", () => {
    const result = generateClaudeMd(testConfig);
    expect(result).toContain("専用 Chromium");
  });
});

// ─────────────────────────────────────────────
// generateVisualTesterAgent — MCP prerequisites
// ─────────────────────────────────────────────

describe("generateVisualTesterAgent MCP", () => {
  it("includes .mcp.json prerequisite", () => {
    const result = generateVisualTesterAgent(testConfig);
    expect(result).toContain(".mcp.json");
    expect(result).toContain("Playwright MCP");
  });

  it("warns about Chrome extension conflict", () => {
    const result = generateVisualTesterAgent(testConfig);
    expect(result).toContain("Chrome 拡張機能");
  });
});
