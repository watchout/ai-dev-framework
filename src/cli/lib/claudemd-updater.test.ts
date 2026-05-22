import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findSkillSection,
  updateClaudeMdSkillSection,
  getWorkflowOrchestrationContent,
} from "./claudemd-updater.js";

describe("claudemd-updater", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-claudemd-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────
  // findSkillSection
  // ─────────────────────────────────────────────

  describe("findSkillSection", () => {
    it("finds v4 Workflow Orchestration header", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "---",
        "",
        "## Workflow Orchestration",
        "",
        "Some content here.",
        "",
        "---",
        "",
        "## Other Section",
      ];
      const result = findSkillSection(lines);
      expect(result).toEqual({ start: 4, end: 8 });
    });

    it("finds hotel-kanri style header (emoji + スキル)", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "## 🧠 スキル（専門家チーム）",
        "",
        "Old skill content.",
        "",
        "---",
        "",
        "## Next Section",
      ];
      const result = findSkillSection(lines);
      expect(result).toEqual({ start: 2, end: 6 });
    });

    it("finds haishin-plus-hub/wbs style header (emoji + 合議制開発)", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "## 🧠 スキル（専門家チーム）による合議制開発",
        "",
        "Old deliberation content.",
        "More content.",
        "",
        "---",
        "",
        "## Footer",
      ];
      const result = findSkillSection(lines);
      expect(result).toEqual({ start: 2, end: 7 });
    });

    it("finds iyasaka style header (no emoji)", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "## スキル（専門家チーム）による合議制開発",
        "",
        "Content without emoji.",
        "",
        "---",
      ];
      const result = findSkillSection(lines);
      expect(result).toEqual({ start: 2, end: 6 });
    });

    it("returns null when no skill section exists", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "## Some Other Section",
        "",
        "Content.",
        "",
        "---",
      ];
      const result = findSkillSection(lines);
      expect(result).toBeNull();
    });

    it("extends to end of file when no --- found after header", () => {
      const lines = [
        "# CLAUDE.md",
        "",
        "## Workflow Orchestration",
        "",
        "Content with no trailing separator.",
        "More content.",
      ];
      const result = findSkillSection(lines);
      expect(result).toEqual({ start: 2, end: 6 });
    });
  });

  // ─────────────────────────────────────────────
  // updateClaudeMdSkillSection
  // ─────────────────────────────────────────────

  describe("updateClaudeMdSkillSection", () => {
    it("returns not updated when CLAUDE.md does not exist", () => {
      const result = updateClaudeMdSkillSection(tmpDir);
      expect(result.updated).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("replaces v3 skill section with v4 Workflow Orchestration", () => {
      const claudeMd = [
        "# CLAUDE.md",
        "",
        "---",
        "",
        "## 🧠 スキル（専門家チーム）による合議制開発",
        "",
        "Old v3 content about deliberation.",
        "More old content.",
        "",
        "---",
        "",
        "## Other Section",
        "",
        "This should be preserved.",
      ].join("\n");

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);
      const result = updateClaudeMdSkillSection(tmpDir);

      expect(result.updated).toBe(true);
      expect(result.reason).toContain("replaced");

      const updated = fs.readFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "utf-8",
      );

      // New content is present
      expect(updated).toContain("## Workflow Orchestration");
      expect(updated).toContain("スキル起動ルール");
      expect(updated).toContain("/implement");

      // Old content is gone
      expect(updated).not.toContain("合議制開発");
      expect(updated).not.toContain("Old v3 content");

      // Other section preserved
      expect(updated).toContain("## Other Section");
      expect(updated).toContain("This should be preserved.");
    });

    it("is idempotent — no change on second call", () => {
      const claudeMd = [
        "# CLAUDE.md",
        "",
        "## Workflow Orchestration",
        "",
        "Old version.",
        "",
        "---",
        "",
        "## Footer",
      ].join("\n");

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);

      // First call: update
      const first = updateClaudeMdSkillSection(tmpDir);
      expect(first.updated).toBe(true);

      // Second call: no change
      const second = updateClaudeMdSkillSection(tmpDir);
      expect(second.updated).toBe(false);
      expect(second.reason).toContain("up to date");
    });

    it("preserves following H2 sections when no separator exists", () => {
      const claudeMd = [
        "# CLAUDE.md",
        "",
        "## Workflow Orchestration",
        "",
        "Old workflow text.",
        "",
        "## Knowledge & Memory",
        "",
        "- Keep this section.",
      ].join("\n");

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);
      const result = updateClaudeMdSkillSection(tmpDir);

      expect(result.updated).toBe(true);
      const updated = fs.readFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "utf-8",
      );
      expect(updated).toContain("## Workflow Orchestration");
      expect(updated).toContain("shirube gate check");
      expect(updated).not.toContain("Old workflow text");
      expect(updated).toContain("## Knowledge & Memory");
      expect(updated).toContain("- Keep this section.");
    });

    it("appends section when no skill section exists", () => {
      const claudeMd = [
        "# CLAUDE.md",
        "",
        "## Some Section",
        "",
        "Content.",
      ].join("\n");

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);
      const result = updateClaudeMdSkillSection(tmpDir);

      expect(result.updated).toBe(true);
      expect(result.reason).toContain("appended");

      const updated = fs.readFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "utf-8",
      );

      // Original content preserved
      expect(updated).toContain("## Some Section");
      expect(updated).toContain("Content.");

      // New section appended
      expect(updated).toContain("## Workflow Orchestration");
    });

    it("inserts after Pre-Code Gate section when appending", () => {
      const claudeMd = [
        "# CLAUDE.md",
        "",
        "## Pre-Code Gate",
        "",
        "Gate content.",
        "",
        "---",
        "",
        "## Knowledge & Memory",
        "",
        "Memory content.",
      ].join("\n");

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);
      const result = updateClaudeMdSkillSection(tmpDir);

      expect(result.updated).toBe(true);

      const updated = fs.readFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "utf-8",
      );

      // Workflow Orchestration should appear after Pre-Code Gate's ---
      const gateEnd = updated.indexOf("---");
      const workflowStart = updated.indexOf("## Workflow Orchestration");
      const memoryStart = updated.indexOf("## Knowledge & Memory");

      expect(workflowStart).toBeGreaterThan(gateEnd);
      // Memory section should still exist after the workflow section
      expect(memoryStart).toBeGreaterThan(workflowStart);
    });

    it("preserves all non-skill sections exactly", () => {
      const sections = {
        header: "# CLAUDE.md\n\n> Important project.\n",
        preSection: "---\n\n## AI Protocol\n\nStop and ask.\n",
        skillSection:
          "---\n\n## 🧠 スキル（専門家チーム）\n\nOld skills.\n",
        postSection:
          "---\n\n## Coding Standards\n\n- No any type\n- Tests required\n",
        footer: "---\n\n## Footer\n\nEnd of file.\n",
      };

      const claudeMd =
        sections.header +
        "\n" +
        sections.preSection +
        "\n" +
        sections.skillSection +
        "\n" +
        sections.postSection +
        "\n" +
        sections.footer;

      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeMd);
      updateClaudeMdSkillSection(tmpDir);

      const updated = fs.readFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "utf-8",
      );

      // All non-skill sections preserved
      expect(updated).toContain("# CLAUDE.md");
      expect(updated).toContain("## AI Protocol");
      expect(updated).toContain("Stop and ask.");
      expect(updated).toContain("## Coding Standards");
      expect(updated).toContain("- No any type");
      expect(updated).toContain("## Footer");
      expect(updated).toContain("End of file.");

      // Old skill content gone
      expect(updated).not.toContain("Old skills.");
    });
  });

  // ─────────────────────────────────────────────
  // getWorkflowOrchestrationContent
  // ─────────────────────────────────────────────

  describe("getWorkflowOrchestrationContent", () => {
    it("starts with ## Workflow Orchestration header", () => {
      const content = getWorkflowOrchestrationContent();
      expect(content.startsWith("## Workflow Orchestration")).toBe(true);
    });

    it("contains skill activation rules", () => {
      const content = getWorkflowOrchestrationContent();
      expect(content).toContain("スキル起動ルール");
      expect(content).toContain("/discovery");
      expect(content).toContain("/design");
      expect(content).toContain("/implement");
      expect(content).toContain("/review");
    });

    it("contains phase transition rules", () => {
      const content = getWorkflowOrchestrationContent();
      expect(content).toContain("フェーズ遷移");
      expect(content).toContain("discovery → design → implement → review");
    });

    it("contains Pre-Code Gate integration", () => {
      const content = getWorkflowOrchestrationContent();
      expect(content).toContain("Pre-Code Gate");
      expect(content).toContain("shirube gate check");
      expect(content).toContain("shirube trace verify");
    });

    it("contains LLM control and design thinking rules", () => {
      const content = getWorkflowOrchestrationContent();
      expect(content).toContain("LLM Control Policy");
      expect(content).toContain("Development Principles");
      expect(content).toContain("public MCP-quality");
      expect(content).toContain("GitHub SSOT");
      expect(content).toContain("deterministic control");
      expect(content).toContain("Design Thinking Flow");
      expect(content).toContain("Runtime boundary");
      expect(content).toContain("Hook justification");
    });
  });
});
