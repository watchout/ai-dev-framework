/**
 * Principle #0: CLI にLLM呼び出しなし
 *
 * Part of ADF v1.2.0 (#92, VERIFY §1.11).
 *
 * Static verification that src/cli/ contains no LLM invocation patterns.
 * This ensures all flow control, data validation, and file generation
 * is deterministic (script-only).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Patterns that indicate direct LLM API invocation in CLI code.
// Provider name references in config (llm-provider.ts) are excluded.
const LLM_PATTERNS = [
  /claude\s+-p/,
  /spawn\(\s*['"]claude['"]/,
  /new\s+OpenAI\s*\(/,
  /Anthropic\s*\(/,
];

// Files allowed to reference LLM provider names (config, not invocation)
const ALLOWED_FILES = ["llm-provider.ts"];

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectTsFiles(fullPath));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist — ok
  }
  return files;
}

describe("Principle #0: CLI にLLM呼び出しなし", () => {
  const cliFiles = [
    ...collectTsFiles("src/cli/commands"),
    ...collectTsFiles("src/cli/lib"),
  ];

  it("src/cli/ 配下にLLM呼び出しパターンが存在しない", () => {
    expect(cliFiles.length).toBeGreaterThan(0);

    const violations: { file: string; pattern: string; line: number }[] = [];

    for (const file of cliFiles) {
      const basename = file.split("/").pop() ?? "";
      if (ALLOWED_FILES.includes(basename)) continue;
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and test pattern definitions
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;

        for (const pattern of LLM_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file,
              pattern: pattern.source,
              line: i + 1,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} matched /${v.pattern}/`)
        .join("\n");
      expect.fail(`LLM invocation patterns found in CLI code:\n${msg}`);
    }
  });
});
