/**
 * Tests for protected-pattern-detector.ts
 * Ref: #366 — CI Gate 0 tier auto-promotion
 */
import { describe, it, expect } from "vitest";
import {
  detectProtectedPatterns,
  formatDetectionWarning,
} from "./protected-pattern-detector.js";

function makeDiff(filePath: string, codeLines: string[]): string {
  const header = [
    "diff --git a/src/foo.ts b/src/foo.ts",
    "--- a/" + filePath,
    "+++ b/" + filePath,
    "@@ -1,1 +1,2 @@",
  ];
  return [...header, ...codeLines.map((l) => `+${l}`)].join("\n");
}

// ─────────────────────────────────────────────
// auth category
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — auth", () => {
  it("detects password in code", () => {
    const diff = makeDiff("src/user.ts", ["const password = hashPassword(input);"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("auth");
  });

  it("detects token in code", () => {
    const diff = makeDiff("src/client.ts", ["const apiToken = process.env.TOKEN;"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("auth");
  });

  it("detects auth path", () => {
    const diff = makeDiff("src/auth/middleware.ts", ["export function checkAuth() {}"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("auth");
  });

  it("detects credential in code", () => {
    const diff = makeDiff("src/service.ts", ["const credential = await getCredential();"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("auth");
  });
});

// ─────────────────────────────────────────────
// db category
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — db", () => {
  it("detects ALTER TABLE in code", () => {
    const diff = makeDiff("src/db/migration.sql", ["ALTER TABLE users ADD COLUMN age INT;"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("db");
  });

  it("detects DROP TABLE in code", () => {
    const diff = makeDiff("src/db/reset.sql", ["DROP TABLE sessions;"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("db");
  });

  it("detects migration path", () => {
    const diff = makeDiff("db/migrations/0042_add_column.sql", ["SELECT 1;"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("db");
  });
});

// ─────────────────────────────────────────────
// governance category
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — governance", () => {
  it("detects governance-flow path", () => {
    const diff = makeDiff(".claude/rules/governance-flow.md", ["# New rule"]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("governance");
  });

  it("detects merge-authority in code", () => {
    const diff = makeDiff("src/cli/lib/gate-engine.ts", [
      "if (mergeAuthority === 'cto') { approve(); }",
    ]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("governance");
  });

  it("detects branch-protection path", () => {
    const diff = makeDiff(".github/branch-protection.json", ['{ "required_reviews": 2 }']);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("governance");
  });
});

// ─────────────────────────────────────────────
// public-api category
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — public-api", () => {
  it("detects mcp tool in code", () => {
    const diff = makeDiff("src/mcp/tool.ts", [
      "server.tool('get_user', schema, handler);",
    ]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("public-api");
  });
});

// ─────────────────────────────────────────────
// clean diff (no matches)
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — clean diff", () => {
  it("returns no categories for innocent code change", () => {
    const diff = makeDiff("src/utils/format.ts", [
      "export function formatDate(d: Date): string {",
      "  return d.toISOString();",
      "}",
    ]);
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it("returns no categories for empty diff", () => {
    const result = detectProtectedPatterns("");
    expect(result.hasProtectedPatterns).toBe(false);
    expect(result.categories).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// multiple categories in one diff
// ─────────────────────────────────────────────

describe("detectProtectedPatterns — multi-category diff", () => {
  it("detects both auth and db in one diff", () => {
    const diff = [
      "--- a/src/db/migration.sql",
      "+++ b/src/db/migration.sql",
      "@@ -1 +1,2 @@",
      "+ALTER TABLE sessions ADD COLUMN token TEXT;",
    ].join("\n");
    const result = detectProtectedPatterns(diff);
    expect(result.hasProtectedPatterns).toBe(true);
    expect(result.categories).toContain("db");
    expect(result.categories).toContain("auth");
  });
});

// ─────────────────────────────────────────────
// formatDetectionWarning
// ─────────────────────────────────────────────

describe("formatDetectionWarning", () => {
  it("returns empty string when no protected patterns", () => {
    const result = { hasProtectedPatterns: false, categories: [], matchedLines: [] };
    expect(formatDetectionWarning(result)).toBe("");
  });

  it("includes WARNING header and category list", () => {
    const result = {
      hasProtectedPatterns: true,
      categories: ["auth" as const, "db" as const],
      matchedLines: ["+const password = 'x';"],
    };
    const warning = formatDetectionWarning(result);
    expect(warning).toContain("WARNING: protected pattern detected → upgrading to Full tier");
    expect(warning).toContain("auth");
    expect(warning).toContain("db");
  });

  it("truncates long match lists to 5 entries", () => {
    const result = {
      hasProtectedPatterns: true,
      categories: ["auth" as const],
      matchedLines: Array.from({ length: 8 }, (_, i) => `+line${i}`),
    };
    const warning = formatDetectionWarning(result);
    expect(warning).toContain("and 3 more");
  });
});
