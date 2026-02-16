import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  installClaudeCodeHook,
  installGitPreCommitHook,
  installAllHooks,
  mergeClaudeSettings,
} from "./hooks-installer.js";

describe("hooks-installer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-hooks-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────
  // mergeClaudeSettings
  // ─────────────────────────────────────────────

  describe("mergeClaudeSettings", () => {
    it("creates PreToolUse hooks on empty settings", () => {
      const result = mergeClaudeSettings({});
      const hooks = result.hooks as Record<string, unknown>;
      const preToolUse = hooks.PreToolUse as Array<Record<string, unknown>>;

      // gate + skill-tracker
      expect(preToolUse).toHaveLength(2);

      const gateEntry = preToolUse.find((e) => e.matcher === "Edit|Write");
      expect(gateEntry).toBeDefined();
      const gateHooks = gateEntry!.hooks as Array<Record<string, unknown>>;
      expect(gateHooks[0].command).toContain("pre-code-gate");

      const skillEntry = preToolUse.find((e) => e.matcher === "Skill");
      expect(skillEntry).toBeDefined();
    });

    it("preserves existing env and mcpServers", () => {
      const existing = {
        env: { MY_VAR: "value" },
        mcpServers: { filesystem: { command: "node" } },
      };
      const result = mergeClaudeSettings(existing);

      expect(result.env).toEqual({ MY_VAR: "value" });
      expect(result.mcpServers).toEqual({ filesystem: { command: "node" } });
    });

    it("preserves existing SessionStart hooks", () => {
      const existing = {
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [{ type: "command", command: "bash setup.sh" }],
            },
          ],
        },
      };
      const result = mergeClaudeSettings(existing);
      const hooks = result.hooks as Record<string, unknown>;

      expect(hooks.SessionStart).toBeDefined();
      const sessionStart = hooks.SessionStart as Array<unknown>;
      expect(sessionStart).toHaveLength(1);

      // Also has PreToolUse (gate + skill-tracker)
      const preToolUse = hooks.PreToolUse as Array<unknown>;
      expect(preToolUse).toHaveLength(2);
    });

    it("creates Skill tracker hook on empty settings", () => {
      const result = mergeClaudeSettings({});
      const hooks = result.hooks as Record<string, unknown>;
      const preToolUse = hooks.PreToolUse as Array<Record<string, unknown>>;

      expect(preToolUse).toHaveLength(2);

      const skillEntry = preToolUse.find((e) => e.matcher === "Skill");
      expect(skillEntry).toBeDefined();
      const skillHooks = skillEntry!.hooks as Array<Record<string, unknown>>;
      expect(skillHooks[0].command).toContain("skill-tracker");
    });

    it("does not duplicate gate hook on second call", () => {
      const first = mergeClaudeSettings({});
      const second = mergeClaudeSettings(first);
      const hooks = second.hooks as Record<string, unknown>;
      const preToolUse = hooks.PreToolUse as Array<unknown>;

      expect(preToolUse).toHaveLength(2); // gate + skill-tracker
    });

    it("preserves existing PreToolUse hooks", () => {
      const existing = {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                { type: "command", command: "bash check.sh" },
              ],
            },
          ],
        },
      };
      const result = mergeClaudeSettings(existing);
      const hooks = result.hooks as Record<string, unknown>;
      const preToolUse = hooks.PreToolUse as Array<unknown>;

      // Original + gate hook + skill-tracker
      expect(preToolUse).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────
  // installClaudeCodeHook
  // ─────────────────────────────────────────────

  describe("installClaudeCodeHook", () => {
    it("creates hook scripts and settings file", () => {
      const result = installClaudeCodeHook(tmpDir);

      expect(result.files).toContain(".claude/hooks/pre-code-gate.sh");
      expect(result.files).toContain(".claude/hooks/skill-tracker.sh");
      expect(result.files).toContain(".claude/settings.json");

      const scriptPath = path.join(
        tmpDir,
        ".claude/hooks/pre-code-gate.sh",
      );
      expect(fs.existsSync(scriptPath)).toBe(true);

      const trackerPath = path.join(
        tmpDir,
        ".claude/hooks/skill-tracker.sh",
      );
      expect(fs.existsSync(trackerPath)).toBe(true);

      const settingsPath = path.join(tmpDir, ".claude/settings.json");
      expect(fs.existsSync(settingsPath)).toBe(true);
    });

    it("creates executable hook script", () => {
      installClaudeCodeHook(tmpDir);
      const scriptPath = path.join(
        tmpDir,
        ".claude/hooks/pre-code-gate.sh",
      );
      const stat = fs.statSync(scriptPath);
      // Check executable bit
      expect(stat.mode & 0o111).toBeGreaterThan(0);
    });

    it("creates valid JSON settings", () => {
      installClaudeCodeHook(tmpDir);
      const settingsPath = path.join(tmpDir, ".claude/settings.json");
      const content = fs.readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.hooks).toBeDefined();
      expect(parsed.hooks.PreToolUse).toBeDefined();
    });

    it("merges with existing settings.json", () => {
      // Create existing settings
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, "settings.json"),
        JSON.stringify({
          env: { TEST: "1" },
          hooks: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [{ type: "command", command: "echo hi" }],
              },
            ],
          },
        }),
      );

      const result = installClaudeCodeHook(tmpDir);
      expect(result.warnings).toHaveLength(0);

      const settingsPath = path.join(tmpDir, ".claude/settings.json");
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

      // Existing env preserved
      expect(parsed.env).toEqual({ TEST: "1" });
      // Existing SessionStart preserved
      expect(parsed.hooks.SessionStart).toHaveLength(1);
      // PreToolUse added (gate + skill-tracker)
      expect(parsed.hooks.PreToolUse).toHaveLength(2);
    });

    it("is idempotent on second call", () => {
      installClaudeCodeHook(tmpDir);
      installClaudeCodeHook(tmpDir);

      const settingsPath = path.join(tmpDir, ".claude/settings.json");
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      // gate + skill-tracker, no duplicates
      expect(parsed.hooks.PreToolUse).toHaveLength(2);
    });

    it("warns on invalid existing JSON", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, "settings.json"),
        "not valid json",
      );

      const result = installClaudeCodeHook(tmpDir);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────
  // installGitPreCommitHook
  // ─────────────────────────────────────────────

  describe("installGitPreCommitHook", () => {
    it("creates new pre-commit when no .husky exists", () => {
      const result = installGitPreCommitHook(tmpDir);

      expect(result.files).toContain(".husky/pre-commit");
      const hookPath = path.join(tmpDir, ".husky/pre-commit");
      expect(fs.existsSync(hookPath)).toBe(true);

      const content = fs.readFileSync(hookPath, "utf-8");
      expect(content).toContain("#!/bin/sh");
      expect(content).toContain("Pre-Code Gate");
      expect(content).toContain("framework gate check");
    });

    it("creates executable pre-commit hook", () => {
      installGitPreCommitHook(tmpDir);
      const hookPath = path.join(tmpDir, ".husky/pre-commit");
      const stat = fs.statSync(hookPath);
      expect(stat.mode & 0o111).toBeGreaterThan(0);
    });

    it("prepends to existing pre-commit with shebang", () => {
      const huskyDir = path.join(tmpDir, ".husky");
      fs.mkdirSync(huskyDir, { recursive: true });
      fs.writeFileSync(
        path.join(huskyDir, "pre-commit"),
        "#!/bin/sh\npnpm lint-staged\n",
        { mode: 0o755 },
      );

      const result = installGitPreCommitHook(tmpDir);
      expect(result.files).toContain(".husky/pre-commit (updated)");

      const content = fs.readFileSync(
        path.join(huskyDir, "pre-commit"),
        "utf-8",
      );
      // Shebang first
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      // Gate block before existing content
      const gateIdx = content.indexOf("Pre-Code Gate");
      const lintIdx = content.indexOf("pnpm lint-staged");
      expect(gateIdx).toBeLessThan(lintIdx);
    });

    it("prepends to existing pre-commit without shebang", () => {
      const huskyDir = path.join(tmpDir, ".husky");
      fs.mkdirSync(huskyDir, { recursive: true });
      fs.writeFileSync(
        path.join(huskyDir, "pre-commit"),
        "pnpm lint-staged\n",
        { mode: 0o755 },
      );

      installGitPreCommitHook(tmpDir);

      const content = fs.readFileSync(
        path.join(huskyDir, "pre-commit"),
        "utf-8",
      );
      // Adds shebang
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      // Gate block before existing content
      expect(content).toContain("Pre-Code Gate");
      expect(content).toContain("pnpm lint-staged");
    });

    it("is idempotent on second call", () => {
      const huskyDir = path.join(tmpDir, ".husky");
      fs.mkdirSync(huskyDir, { recursive: true });
      fs.writeFileSync(
        path.join(huskyDir, "pre-commit"),
        "#!/bin/sh\npnpm lint-staged\n",
        { mode: 0o755 },
      );

      installGitPreCommitHook(tmpDir);
      const result = installGitPreCommitHook(tmpDir);

      // Second call returns no files (already installed)
      expect(result.files).toHaveLength(0);

      const content = fs.readFileSync(
        path.join(huskyDir, "pre-commit"),
        "utf-8",
      );
      // Only one gate block
      const matches = content.match(/Pre-Code Gate \(framework\)/g);
      expect(matches).toHaveLength(2); // Start + End markers
    });

    it("creates .husky directory with warning when not exists", () => {
      const result = installGitPreCommitHook(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, ".husky"))).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Husky");
    });
  });

  // ─────────────────────────────────────────────
  // installAllHooks
  // ─────────────────────────────────────────────

  describe("installAllHooks", () => {
    it("installs both claude and git hooks", () => {
      const result = installAllHooks(tmpDir);

      expect(result.claudeHookInstalled).toBe(true);
      expect(result.gitHookInstalled).toBe(true);
      expect(result.files.length).toBeGreaterThanOrEqual(3);
    });

    it("returns combined warnings", () => {
      // No existing .husky → warning
      const result = installAllHooks(tmpDir);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
