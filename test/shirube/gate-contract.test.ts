import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-gate-contract.mjs";
const matrix = ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml";
const fixtures = path.join(root, "test/fixtures/shirube/gate-contract");

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

function check(handoff: string, changedFiles = "changed-files.pass.txt"): { exitCode: number; json: any } {
  return run([
    "--matrix",
    matrix,
    "--handoff",
    fixture(handoff),
    "--changed-files",
    fixture(changedFiles),
    "--format",
    "json",
  ]);
}

function hardBlockIds(result: { json: any }): string[] {
  return result.json.hard_blocks.map((finding: { item_id: string }) => finding.item_id);
}

function warningIds(result: { json: any }): string[] {
  return result.json.warnings.map((finding: { item_id: string }) => finding.item_id);
}

describe("Rapid/Lite gate contract check", () => {
  it("passes the valid Rapid/Lite fixture", () => {
    const result = check("rapid-lite.pass.yaml");

    expect(result.exitCode).toBe(0);
    expect(result.json.schema).toBe("shirube-gate-contract-check/v1");
    expect(result.json.mode).toBe("rapid-lite");
    expect(result.json.profile).toBe("hotel-lite");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.hard_blocks).toEqual([]);
    expect(result.json.warnings).toEqual([]);
  });

  it("blocks missing CELL-ID", () => {
    const result = check("missing-cell-id.block.yaml");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.would_block).toBe(true);
    expect(hardBlockIds(result)).toContain("RL-CELL-001");
  });

  it("blocks changed files outside allowed paths", () => {
    const result = check("outside-allowed-path.block.yaml", "changed-files.outside.txt");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(hardBlockIds(result)).toContain("RL-PR-002");
  });

  it("blocks forbidden paths", () => {
    const result = check("forbidden-path.block.yaml", "changed-files.forbidden.txt");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(hardBlockIds(result)).toContain("RL-PR-003");
  });

  it("blocks placeholder evidence", () => {
    const result = check("placeholder-evidence.block.yaml");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(hardBlockIds(result)).toContain("RL-EVID-002");
  });

  it("blocks protected_stop cell type", () => {
    const result = check("protected-stop.block.yaml");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(hardBlockIds(result)).toContain("RL-CELL-006");
  });

  it("warns on low acceptance/test granularity without hard blockers", () => {
    const result = check("warn-ac-test-granularity.yaml");

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.would_block).toBe(false);
    expect(result.json.hard_blocks).toEqual([]);
    expect(warningIds(result)).toContain("RL-SPEC-W001");
  });

  it("returns FAILURE and exits nonzero for malformed handoff files", () => {
    const result = check("malformed.yaml");

    expect(result.exitCode).not.toBe(0);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.required_next_actions[0].code).toBe("handoff_parse_error");
  });

  it("returns FAILURE and exits nonzero for unsupported format", () => {
    const result = run([
      "--matrix",
      matrix,
      "--handoff",
      fixture("rapid-lite.pass.yaml"),
      "--changed-files",
      fixture("changed-files.pass.txt"),
      "--format",
      "yaml",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.required_next_actions[0].code).toBe("unsupported_format");
  });
});
