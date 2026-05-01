/**
 * Gate 1 design-validation registry smoke test (cycle X+1).
 *
 * Anti-regression: ensures the Gate 1 validator list stays consistent across
 * registry SSOT, skill doc, and CLI context template. The previous BLOCK
 * (auditor msg ba388186/24cad117) flagged drift between these three locations.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

const REQUIRED_VALIDATORS = [
  "feasibility-checker",
  "coherence-auditor",
  "gap-detector",
  "traceability-auditor",
];

describe("Gate 1 design-validation registry", () => {
  it("design-validation.md lists all 4 validators", () => {
    const registry = fs.readFileSync(
      path.join(REPO_ROOT, ".claude/gates/design-validation.md"),
      "utf-8",
    );
    for (const v of REQUIRED_VALIDATORS) {
      expect(registry).toContain(v);
    }
  });

  it("gate-design SKILL.md references all 4 validators", () => {
    const skill = fs.readFileSync(
      path.join(REPO_ROOT, ".claude/skills/gate-design/SKILL.md"),
      "utf-8",
    );
    for (const v of REQUIRED_VALIDATORS) {
      expect(skill).toContain(v);
    }
  });

  it("gate.ts design context template enumerates all 4 validators", () => {
    const cli = fs.readFileSync(
      path.join(REPO_ROOT, "src/cli/commands/gate.ts"),
      "utf-8",
    );
    for (const v of REQUIRED_VALIDATORS) {
      expect(cli).toContain(v);
    }
  });

  it("WARNING threshold is unified at 5 across registry / skill / CLI", () => {
    const registry = fs.readFileSync(
      path.join(REPO_ROOT, ".claude/gates/design-validation.md"),
      "utf-8",
    );
    const skill = fs.readFileSync(
      path.join(REPO_ROOT, ".claude/skills/gate-design/SKILL.md"),
      "utf-8",
    );
    const cli = fs.readFileSync(
      path.join(REPO_ROOT, "src/cli/commands/gate.ts"),
      "utf-8",
    );
    expect(registry).toMatch(/≤\s*5\s*WARNING|Maximum\s+5\s+WARNING/);
    expect(skill).toMatch(/WARNING\s*≤\s*5/);
    expect(cli).toMatch(/WARNING\s*合計\s*≤\s*5|WARNING\s*>\s*5/);
  });
});
