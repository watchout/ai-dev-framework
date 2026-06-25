import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-execution-context.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/execution-context");
const head = "0123456789abcdef0123456789abcdef01234567";

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

function check(context: string, extraArgs: string[] = []): { exitCode: number; json: any } {
  return run([
    "--context",
    fixture(context),
    "--changed-files",
    fixture("changed-files.docs.txt"),
    "--actual-repo",
    "watchout/ai-dev-framework",
    "--actual-branch",
    "codex/487-execution-context-lock",
    "--actual-head",
    head,
    ...extraArgs,
    "--format",
    "json",
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function expectShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-execution-context-check/v1");
  expect(result.json).toHaveProperty("verdict");
  expect(result.json).toHaveProperty("would_block");
  expect(result.json).toHaveProperty("owner_must_not_merge");
  expect(result.json).toHaveProperty("primary_repo");
  expect(result.json).toHaveProperty("actual_repo");
  expect(result.json).toHaveProperty("active_role");
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
}

describe("Shirube execution context check", () => {
  it("passes a valid dev context", () => {
    const result = check("valid-dev.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(false);
    expect(result.json.active_role).toBe("dev");
  });

  it("passes a valid lead planning context", () => {
    const result = check("valid-lead.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.active_role).toBe("lead");
  });

  it("blocks missing context", () => {
    const result = run([
      "--context",
      fixture("missing.yaml"),
      "--actual-repo",
      "watchout/ai-dev-framework",
      "--actual-branch",
      "codex/487-execution-context-lock",
      "--actual-head",
      head,
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-001");
  });

  it("blocks actual repo mismatch", () => {
    const result = check("valid-dev.yaml", ["--actual-repo", "watchout/other-repo"]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-002");
  });

  it("blocks work order repo mismatch", () => {
    const result = check("work-order-mismatch.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-004");
  });

  it("blocks support repo used as implementation target", () => {
    const result = check("support-as-target.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-005");
  });

  it("blocks control repo used as implementation target", () => {
    const result = check("control-as-target.yaml", ["--actual-repo", "watchout/omotenasuai-control"]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-006");
  });

  it("blocks merge-ready claim without owner exact-head decision", () => {
    const result = check("valid-lead.yaml", ["--pr-body", fixture("pr-body.merge-ready.md")]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-010");
  });

  it("does not block pre-final owner decision wording", () => {
    const result = check("valid-lead.yaml", ["--pr-body", fixture("pr-body.pre-final-owner-decision.md")]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(blockerIds(result)).not.toContain("CTX-010");
  });

  it("blocks unknown role", () => {
    const result = check("unknown-role.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-014");
  });

  it("blocks lead attempts product implementation", () => {
    const result = check("valid-lead.yaml", ["--changed-files", fixture("changed-files.product.txt")]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-015");
  });

  it("blocks dev claims audit or owner authority", () => {
    const result = check("valid-dev.yaml", ["--pr-body", fixture("pr-body.dev-authority.md")]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("CTX-016");
  });
});
