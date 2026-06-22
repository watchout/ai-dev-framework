import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-lifecycle.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/lifecycle");

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

function check(state: string, extraArgs: string[] = []): { exitCode: number; json: any } {
  return run([
    "--state",
    fixture(state),
    "--format",
    "json",
    ...extraArgs,
  ]);
}

function readyArgs(adoption = "adoption.greenfield-ready.json"): string[] {
  return [
    "--adoption-report",
    fixture(adoption),
    "--repo-spec",
    fixture("repo-spec.ready.yaml"),
    "--handoff",
    fixture("handoff.ready.yaml"),
    "--gate-contract-report",
    fixture("gate-contract.pass.json"),
  ];
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function warningIds(result: { json: any }): string[] {
  return result.json.warnings.map((finding: { item_id: string }) => finding.item_id);
}

function expectShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-lifecycle-check/v1");
  expect(result.json.mode).toBe("rapid-lite");
  expect(result.json.profile).toBe("hotel-lite");
  expect(result.json).toHaveProperty("adoption");
  expect(Array.isArray(result.json.allowed_next_phases)).toBe(true);
  expect(Array.isArray(result.json.forbidden_next_phases)).toBe(true);
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.evidence)).toBe(true);
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
}

describe("Shirube lifecycle flow guard", () => {
  it("blocks missing lifecycle state", () => {
    const result = run(["--format", "json"]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-BOOT-001");
  });

  it("blocks EXECUTION_READY without an adoption report", () => {
    const result = check("block.execution-no-adoption.yaml", [
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-ADOPT-001");
  });

  it("blocks a blocked adoption report", () => {
    const result = check("pass.execution-ready.yaml", readyArgs("adoption.blocked.json"));

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-ADOPT-002");
  });

  it("blocks GAP_FILL_REQUIRED adoption when lifecycle tries MERGE_READY", () => {
    const result = check("block.merge-ready.yaml", [
      ...readyArgs("adoption.gap-fill.json"),
      "--owner-decision",
      fixture("owner-decision.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-ADOPT-003");
    expect(result.json.forbidden_next_phases).toContain("MERGE_READY");
  });

  it("blocks unknown adoption disposition", () => {
    const result = check("pass.execution-ready.yaml", readyArgs("adoption.unknown-disposition.json"));

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-ADOPT-004");
  });

  it("passes greenfield_initialize ADOPTION_READY into EXECUTION_READY", () => {
    const result = check("pass.execution-ready.yaml", readyArgs());

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.current_phase).toBe("EXECUTION_READY");
    expect(result.json.would_block).toBe(false);
    expect(result.json.adoption.disposition).toBe("greenfield_initialize");
    expect(result.json.blockers).toEqual([]);
  });

  it("passes retrofit_accelerate ADOPTION_READY into EXECUTION_READY", () => {
    const result = check("pass.execution-ready-retrofit.yaml", readyArgs("adoption.retrofit-ready.json"));

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.adoption.disposition).toBe("retrofit_accelerate");
    expect(result.json.blockers).toEqual([]);
  });

  it("blocks retrofit_recover RECOVERY_REQUIRED from normal lifecycle phases", () => {
    const result = check("pass.execution-ready.yaml", readyArgs("adoption.recover-required.json"));

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.adoption.disposition).toBe("retrofit_recover");
    expect(blockerIds(result)).toContain("LC-ADOPT-003");
  });

  it("blocks missing RPS before handoff or implementation", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--handoff",
      fixture("handoff.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-RPS-001");
  });

  it("blocks unconfirmed RPS before implementation", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.unconfirmed.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-RPS-002");
  });

  it("blocks missing handoff before implementation", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-HANDOFF-001");
  });

  it("blocks handoff that is not ready for implementation", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.not-ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-HANDOFF-002");
  });

  it("blocks handoff without CELL-ID", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.no-cell.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.pass.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-HANDOFF-003");
  });

  it("blocks missing gate-contract report at PR_READY", () => {
    const result = check("block.pr-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-EXEC-001");
  });

  it("blocks a blocked gate-contract report", () => {
    const result = check("pass.execution-ready.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.blocked.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-EXEC-002");
  });

  it("warns when design-rule report is optional and absent before enforcement", () => {
    const result = check("warn.pr-ready.yaml", readyArgs());

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.would_block).toBe(false);
    expect(warningIds(result)).toContain("LC-WARN-002");
  });

  it("blocks when design-rule report is required but absent", () => {
    const result = check("block.implemented-design-required.yaml", readyArgs());

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-EXEC-003");
  });

  it("blocks a blocked design-rule report", () => {
    const result = check("warn.pr-ready.yaml", [
      ...readyArgs(),
      "--design-rule-report",
      fixture("design-rules.blocked.json"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-EXEC-004");
  });

  it("blocks LLM approval used as phase authority", () => {
    const result = check("block.llm-authority.yaml", readyArgs());

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-EXEC-005");
  });

  it("blocks missing owner decision at MERGE_READY", () => {
    const result = check("block.merge-ready.yaml", readyArgs());

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-MERGE-001");
  });

  it("blocks owner decision head mismatch", () => {
    const result = check("block.merge-ready.yaml", [
      ...readyArgs(),
      "--owner-decision",
      fixture("owner-decision.mismatch.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-MERGE-002");
  });

  it("blocks MERGED while prior blockers remain", () => {
    const result = check("block.merged-before-allowed.yaml", [
      "--adoption-report",
      fixture("adoption.greenfield-ready.json"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
      "--gate-contract-report",
      fixture("gate-contract.blocked.json"),
      "--owner-decision",
      fixture("owner-decision.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-MERGE-003");
  });

  it("blocks COMPLETE without post-merge evidence", () => {
    const result = check("block.complete.yaml", [
      ...readyArgs(),
      "--owner-decision",
      fixture("owner-decision.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-POST-001");
  });

  it("blocks COMPLETE with unresolved follow-up blockers", () => {
    const result = check("pass.complete.yaml", [
      ...readyArgs(),
      "--design-rule-report",
      fixture("design-rules.pass.json"),
      "--owner-decision",
      fixture("owner-decision.ready.yaml"),
      "--post-merge",
      fixture("post-merge.follow-up-blocked.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("LC-POST-004");
  });

  it("passes COMPLETE with post-merge evidence and no unresolved blockers", () => {
    const result = check("pass.complete.yaml", [
      ...readyArgs(),
      "--design-rule-report",
      fixture("design-rules.pass.json"),
      "--owner-decision",
      fixture("owner-decision.ready.yaml"),
      "--post-merge",
      fixture("post-merge.complete.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.current_phase).toBe("COMPLETE");
    expect(result.json.blockers).toEqual([]);
  });

  it("returns FAILURE and exits nonzero for unsupported format", () => {
    const result = run(["--format", "text"]);

    expect(result.exitCode).not.toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.required_next_actions[0].code).toBe("unsupported_format");
  });
});
