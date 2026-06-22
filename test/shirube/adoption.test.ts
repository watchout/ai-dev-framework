import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-adoption.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/adoption");

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

function check(plan: string, extraArgs: string[] = []): { exitCode: number; json: any } {
  return run([
    "--adoption-plan",
    fixture(plan),
    "--format",
    "json",
    ...extraArgs,
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function warningIds(result: { json: any }): string[] {
  return result.json.warnings.map((finding: { item_id: string }) => finding.item_id);
}

function expectShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-adoption-check/v1");
  expect(result.json.lane).toBe("adoption_intake");
  expect(["greenfield_initialize", "retrofit_accelerate", "retrofit_recover"]).toContain(result.json.disposition);
  expect(Array.isArray(result.json.allowed_next_phases)).toBe(true);
  expect(Array.isArray(result.json.forbidden_next_phases)).toBe(true);
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.evidence)).toBe(true);
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
}

describe("Shirube adoption intake check", () => {
  it("passes greenfield ready with RPS and handoff", () => {
    const result = check("greenfield.pass.yaml", [
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.disposition).toBe("greenfield_initialize");
    expect(result.json.current_phase).toBe("ADOPTION_READY");
  });

  it("treats greenfield missing artifacts as initialization, not recovery", () => {
    const result = check("greenfield.empty-scan.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.disposition).toBe("greenfield_initialize");
    expect(result.json.current_phase).toBe("RPS_DRAFT_FROM_CURRENT_REALITY");
    expect(warningIds(result)).toContain("GREEN-W001");
    expect(blockerIds(result)).not.toContain("RPS-001");
  });

  it("passes retrofit ready after inventory, RPS, reconciliation, and handoff", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.healthy.yaml"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--spec-reconciliation",
      fixture("spec-reconciliation.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.disposition).toBe("retrofit_accelerate");
    expect(result.json.current_phase).toBe("ADOPTION_READY");
  });

  it("classifies healthy retrofit with only Shirube gaps as retrofit_accelerate", () => {
    const result = check("retrofit.gap-fill.yaml", [
      "--existing-state",
      fixture("existing-state.healthy.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.disposition).toBe("retrofit_accelerate");
    expect(result.json.current_phase).toBe("RPS_DRAFT_FROM_CURRENT_REALITY");
    expect(warningIds(result)).toContain("RETRO-W001");
  });

  it("blocks missing adoption plan", () => {
    const result = run(["--format", "json"]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("ADOPT-001");
  });

  it("blocks missing existing-state scan", () => {
    const result = check("missing-scan.block.yaml");

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("ADOPT-008");
  });

  it("blocks material drift as retrofit_recover", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.material-drift.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.disposition).toBe("retrofit_recover");
    expect(blockerIds(result)).toContain("RECOVER-001");
  });

  it("blocks legacy-as-truth", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.legacy-truth.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.disposition).toBe("retrofit_recover");
    expect(blockerIds(result)).toContain("RECOVER-002");
  });

  it("blocks LLM-as-truth", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.llm-truth.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.disposition).toBe("retrofit_recover");
    expect(blockerIds(result)).toContain("RECOVER-003");
  });

  it("blocks unsafe changed files before recovery", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.healthy.yaml"),
      "--changed-files",
      fixture("changed-files.unsafe.txt"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.disposition).toBe("retrofit_recover");
    expect(blockerIds(result)).toContain("RECOVER-004");
  });

  it("blocks retrofit with no owner-confirmed direction", () => {
    const result = check("retrofit.no-owner-direction.yaml", [
      "--existing-state",
      fixture("existing-state.healthy.yaml"),
      "--repo-spec",
      fixture("repo-spec.unconfirmed.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("ADOPT-007");
  });

  it("warns for partial specs captured as input-only", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.partial-specs.yaml"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--spec-reconciliation",
      fixture("spec-reconciliation.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(warningIds(result)).toContain("ADOPT-W003");
  });

  it("warns for absent or partial tests", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.partial-tests.yaml"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--spec-reconciliation",
      fixture("spec-reconciliation.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(warningIds(result)).toContain("ADOPT-W002");
  });

  it("warns for many unknowns", () => {
    const result = check("retrofit.pass.yaml", [
      "--existing-state",
      fixture("existing-state.many-unknowns.yaml"),
      "--repo-spec",
      fixture("repo-spec.ready.yaml"),
      "--spec-reconciliation",
      fixture("spec-reconciliation.ready.yaml"),
      "--handoff",
      fixture("handoff.ready.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(warningIds(result)).toContain("ADOPT-W004");
  });

  it("returns FAILURE and exits nonzero for unsupported format", () => {
    const result = run([
      "--adoption-plan",
      fixture("greenfield.pass.yaml"),
      "--format",
      "yaml",
    ]);

    expect(result.exitCode).not.toBe(0);
    expectShape(result);
    expect(result.json.verdict).toBe("FAILURE");
    expect(result.json.required_next_actions[0].code).toBe("unsupported_format");
  });
});
