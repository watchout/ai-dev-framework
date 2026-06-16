import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  formatProjectStateValidationResult,
  generateProjectStateFromConfig,
  validateGeneratedProjectState,
  writeGeneratedProjectState,
} from "./project-state-generator.js";

function withProjectDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-project-state-"));
  try {
    fs.mkdirSync(path.join(dir, ".framework"), { recursive: true });
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeConfig(dir: string): void {
  fs.writeFileSync(
    path.join(dir, ".framework/project-state.config.json"),
    JSON.stringify(
      {
        projectName: "ai-dev-framework",
        version: "0.1.0",
        profileType: "cli",
        description:
          "AI Dev Framework - meta-framework for AI agent-driven development",
        repository: "watchout/ai-dev-framework",
        createdAt: "2026-04-27T07:00:00.000Z",
        updatedAt: "2026-04-27T07:00:00.000Z",
        phase: -1,
        status: "initialized",
        techStack: {
          framework: "nodejs-cli",
          language: "typescript",
          ui: "none",
          runtime: "node",
          package_manager: "npm",
          testing: "vitest",
          deployment: "npm-package",
        },
        projectSettings: {
          aiProvider: "anthropic",
          aiModel: "claude-sonnet-4-20250514",
          autoCommit: false,
          escalationMode: "strict",
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
}

describe("project state generator config", () => {
  it("generates deterministic project state from external config", () => {
    withProjectDir((dir) => {
      writeConfig(dir);
      const result = generateProjectStateFromConfig(dir);
      const parsed = JSON.parse(result.content) as Record<string, unknown>;

      expect(parsed.name).toBe("ai-dev-framework");
      expect(parsed.profileType).toBe("cli");
      expect(parsed.description).toBe(
        "AI Dev Framework - meta-framework for AI agent-driven development",
      );
      expect(parsed.repository).toBe("watchout/ai-dev-framework");
      expect(parsed.createdAt).toBe("2026-04-27T07:00:00.000Z");
      expect(parsed.updatedAt).toBe("2026-04-27T07:00:00.000Z");
      expect(parsed.techStack).toMatchObject({
        framework: "nodejs-cli",
        runtime: "node",
        package_manager: "npm",
      });
    });
  });

  it("passes validation when project.json matches generated output", () => {
    withProjectDir((dir) => {
      writeConfig(dir);
      writeGeneratedProjectState(dir);

      const result = validateGeneratedProjectState(dir);

      expect(result.ok).toBe(true);
      expect(result.differences).toEqual([]);
      expect(formatProjectStateValidationResult(result)).toContain("PASS");
    });
  });

  it("reports drift when project.json diverges from generated output", () => {
    withProjectDir((dir) => {
      writeConfig(dir);
      writeGeneratedProjectState(dir);

      const projectJsonPath = path.join(dir, ".framework/project.json");
      const projectJson = JSON.parse(
        fs.readFileSync(projectJsonPath, "utf-8"),
      ) as { techStack: { testing: string } };
      projectJson.techStack.testing = "manual";
      fs.writeFileSync(
        projectJsonPath,
        JSON.stringify(projectJson, null, 2),
        "utf-8",
      );

      const result = validateGeneratedProjectState(dir);

      expect(result.ok).toBe(false);
      expect(result.differences).toContain(
        '$.techStack.testing: expected "vitest", got "manual"',
      );
    });
  });
});
