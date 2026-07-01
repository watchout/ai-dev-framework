import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-enforcement-policy.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/enforcement-policy");

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

function check(policy: string, aggregate = "aggregate.pass.json", extraArgs: string[] = []): { exitCode: number; json: any } {
  return run([
    "--policy",
    fixture(policy),
    "--aggregate",
    fixture(aggregate),
    ...extraArgs,
    "--format",
    "json",
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function warningIds(result: { json: any }): string[] {
  return result.json.warnings.map((finding: { item_id: string }) => finding.item_id);
}

function failureIds(result: { json: any }): string[] {
  return result.json.failures.map((finding: { item_id: string }) => finding.item_id);
}

function expectShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-enforcement-policy-check/v1");
  expect(result.json).toHaveProperty("mode");
  expect(result.json).toHaveProperty("verdict");
  expect(result.json).toHaveProperty("would_block");
  expect(result.json).toHaveProperty("ci_should_fail");
  expect(result.json).toHaveProperty("owner_must_not_merge");
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.failures)).toBe(true);
}

describe("Shirube enforcement policy check", () => {
  it("passes report-only when aggregate passes", () => {
    const result = check("report-only.pass.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.mode).toBe("report_only");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.ci_should_fail).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(false);
  });

  it("warns in report-only when aggregate would block", () => {
    const result = check("report-only.blocked.yaml", "aggregate.blocked.json");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.would_block).toBe(true);
    expect(result.json.ci_should_fail).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(true);
    expect(warningIds(result)).toContain("ENF-005");
  });

  it("blocks owner-block mode when aggregate would block", () => {
    const result = check("owner-block.blocked.yaml", "aggregate.blocked.json");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.mode).toBe("owner_block");
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.ci_should_fail).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(true);
    expect(blockerIds(result)).toContain("ENF-005");
  });

  it("blocks and marks CI fail in ci-hard-block mode", () => {
    const result = check("ci-hard-block.blocked.yaml", "aggregate.blocked.json");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.mode).toBe("ci_hard_block");
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.ci_should_fail).toBe(true);
    expect(result.json.owner_must_not_merge).toBe(true);
    expect(blockerIds(result)).toContain("ENF-006");
  });

  it("blocks and marks CI fail in required-check mode when aggregate would block", () => {
    const result = check("required-check.blocked.yaml", "aggregate.blocked.json");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.mode).toBe("required_check");
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.ci_should_fail).toBe(true);
    expect(result.json.owner_must_not_merge).toBe(true);
    expect(blockerIds(result)).toContain("ENF-006");
    expect(blockerIds(result)).not.toContain("ENF-007");
  });

  it("fails invalid policy modes", () => {
    const result = check("invalid-mode.failure.yaml");

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(failureIds(result)).toContain("ENF-002");
  });

  it("blocks missing policy owner", () => {
    const result = check("missing-owner.block.yaml");

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.owner_must_not_merge).toBe(true);
    expect(failureIds(result)).toContain("ENF-003");
  });

  it("fails report-only without enforce_by", () => {
    const result = check("report-only.missing-enforce-by.failure.yaml");

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(failureIds(result)).toContain("ENF-009");
  });

  it("fails expired report-only enforce_by", () => {
    const result = check("report-only.expired.failure.yaml");

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(failureIds(result)).toContain("ENF-010");
  });

  it("fails report-only without reason", () => {
    const result = check("report-only.missing-reason.failure.yaml");

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(failureIds(result)).toContain("ENF-011");
  });

  it("blocks required-check mode without owner approval evidence", () => {
    const result = check("required-check.no-owner-approval.block.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.mode).toBe("required_check");
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.ci_should_fail).toBe(true);
    expect(blockerIds(result)).toContain("ENF-007");
  });
});
