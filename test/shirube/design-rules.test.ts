import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-design-rules.mjs";
const rulePack = ".shirube/design-rule-packs/shirube-default-design-rules.yaml";
const fixtures = path.join(root, "test/fixtures/shirube/design-rules");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function run(args: string[]): { exitCode: number; json: any } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout) };
  }
}

function check(
  changedFiles: string,
  diffRoot: string,
  extraArgs: string[] = [],
): { exitCode: number; json: any } {
  return run([
    "--rule-pack",
    rulePack,
    "--changed-files",
    fixture(changedFiles),
    "--diff-root",
    fixture(diffRoot),
    "--handoff",
    fixture("handoff.pass.yaml"),
    ...extraArgs,
    "--format",
    "json",
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { rule_id: string }) => finding.rule_id);
}

function warningIds(result: { json: any }): string[] {
  return result.json.warnings.map((finding: { rule_id: string }) => finding.rule_id);
}

function expectReportShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-design-rule-check/v1");
  expect(Array.isArray(result.json.rule_results)).toBe(true);
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.evidence)).toBe(true);
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
}

describe("Shirube design rule check", () => {
  it("passes when no rule violations are present", () => {
    const result = check("changed-files.pass.txt", "pass");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.rule_pack_id).toBe("DESIGN-RULE-PACK-SHIRUBE-DEFAULT-001");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.blockers).toEqual([]);
    expect(result.json.warnings).toEqual([]);
  });

  it("blocks LLM final approval claims", () => {
    const result = check("changed-files.pass.txt", "pass", [
      "--pr-body",
      fixture("pr-body.llm-block.txt"),
    ]);

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.would_block).toBe(true);
    expect(blockerIds(result)).toContain("DR-LLM-001");
  });

  it("blocks hard delete patterns without soft-delete policy", () => {
    const result = check("changed-files.hard-delete.txt", "hard-delete");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("DR-DATA-001");
  });

  it("warns on duplicate code blocks at the warning threshold", () => {
    const result = check("changed-files.duplicate-warn.txt", "duplicate-warn");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.would_block).toBe(false);
    expect(warningIds(result)).toContain("DR-CODE-001");
  });

  it("blocks duplicate code blocks at the blocking threshold", () => {
    const result = check("changed-files.duplicate-block.txt", "duplicate-block");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("DR-CODE-001");
  });

  it("warns on repeated configurable literals in source", () => {
    const result = check("changed-files.config-warn.txt", "config-warn");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(warningIds(result)).toContain("DR-CONFIG-001");
  });

  it("blocks protected surfaces without explicit protected declaration", () => {
    const result = check("changed-files.protected.txt", "protected");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("DR-SAFE-001");
  });

  it("blocks missing rule pack schema/version", () => {
    const result = run([
      "--rule-pack",
      fixture("rule-pack.missing-version.yaml"),
      "--changed-files",
      fixture("changed-files.pass.txt"),
      "--diff-root",
      fixture("pass"),
      "--handoff",
      fixture("handoff.pass.yaml"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("DR-RULEPACK-001");
  });

  it("passes hard delete inside a test fixture with an explicit exception", () => {
    const result = run([
      "--rule-pack",
      rulePack,
      "--changed-files",
      fixture("changed-files.test-delete.txt"),
      "--diff-root",
      fixture("test-delete"),
      "--handoff",
      fixture("handoff.delete-exception.yaml"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.blockers).toEqual([]);
    expect(result.json.warnings).toEqual([]);
  });

  it("returns PASS_WITH_WARN for symbolic/general design warning only", () => {
    const result = check("changed-files.arch-warn.txt", "arch-warn");

    expect(result.exitCode).toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.would_block).toBe(false);
    expect(warningIds(result)).toContain("DR-ARCH-001");
  });

  it("returns FAILURE and exits nonzero for unsupported format", () => {
    const result = run([
      "--rule-pack",
      rulePack,
      "--changed-files",
      fixture("changed-files.pass.txt"),
      "--diff-root",
      fixture("pass"),
      "--handoff",
      fixture("handoff.pass.yaml"),
      "--format",
      "yaml",
    ]);

    expect(result.exitCode).not.toBe(0);
    expectReportShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.required_next_actions[0].code).toBe("unsupported_format");
  });
});
