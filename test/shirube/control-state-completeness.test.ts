import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/check-control-state-completeness.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/control-state-completeness");
const sequencingFixtures = path.join(root, "test/fixtures/shirube/next-action-sequencing");

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

function baseArgs(overrides: Record<string, string | null> = {}): string[] {
  const inputs: Record<string, string> = {
    "--execution-context-report": fixture("execution-context.pass.json"),
    "--repo-spec": fixture("repo-spec.pass.yaml"),
    "--source-mirror": fixture("source-mirror.pass.yaml"),
    "--adoption-report": fixture("adoption.pass.json"),
    "--lifecycle-report": fixture("lifecycle.pass.json"),
    "--gate-contract-report": fixture("gate-contract.pass.json"),
    "--design-rule-report": fixture("design-rules.pass.json"),
    "--enforcement-policy-report": fixture("enforcement.pass.json"),
    "--handoff": fixture("handoff.pass.yaml"),
    "--changed-files": fixture("changed-files.pass.txt"),
    "--validation": fixture("validation.pass.yaml"),
    "--owner-decision": fixture("owner-decision.pass.yaml"),
    "--aggregate": fixture("aggregate.pass.json"),
  };
  const merged = { ...inputs, ...overrides };
  return Object.entries(merged)
    .flatMap(([key, value]) => value === null ? [] : [key, value])
    .concat(["--format", "json"]);
}

function check(overrides: Record<string, string | null> = {}): { exitCode: number; json: any } {
  return run(baseArgs(overrides));
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function expectShape(result: { json: any }): void {
  expect(result.json.schema).toBe("shirube-control-state-completeness/v1");
  expect(["CONTROL_COMPLETE", "CONTROL_COMPLETE_WITH_WARNINGS", "CONTROL_PARTIAL", "CONTROL_BLOCKED", "CONTROL_FAILURE"]).toContain(result.json.state);
  expect(result.json).toHaveProperty("current_phase");
  expect(result.json).toHaveProperty("next_action");
  expect(result.json).toHaveProperty("owner_approval_allowed");
  expect(result.json).toHaveProperty("merge_ready_allowed");
  expect(Array.isArray(result.json.forbidden_next_actions)).toBe(true);
  expect(result.json).toHaveProperty("audit_required");
  expect(result.json).toHaveProperty("audit_completion");
  expect(result.json).toHaveProperty("owner_decision_status");
  expect(result.json).toHaveProperty("would_block");
  expect(result.json).toHaveProperty("owner_must_not_merge");
  expect(result.json).toHaveProperty("inventory");
  expect(Array.isArray(result.json.missing_states)).toBe(true);
  expect(Array.isArray(result.json.stale_states)).toBe(true);
  expect(Array.isArray(result.json.mismatches)).toBe(true);
  expect(Array.isArray(result.json.blockers)).toBe(true);
  expect(Array.isArray(result.json.warnings)).toBe(true);
  expect(Array.isArray(result.json.required_next_actions)).toBe(true);
}

describe("Shirube control state completeness check", () => {
  it("passes a complete reconciled control state", () => {
    const result = check();

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_COMPLETE");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.would_block).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(false);
    expect(result.json.blockers).toEqual([]);
  });

  it("blocks missing execution context", () => {
    const result = check({ "--execution-context-report": null });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_BLOCKED");
    expect(blockerIds(result)).toContain("CSC-001");
  });

  it("blocks missing RPS / PRS", () => {
    const result = check({ "--repo-spec": null });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-002");
  });

  it("blocks missing source mirror for declared control source", () => {
    const result = check({ "--source-mirror": null });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-003");
  });

  it("blocks handoff CELL-ID mismatch", () => {
    const result = check({ "--handoff": fixture("handoff.cell-mismatch.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-004");
  });

  it("blocks work-order or PR reference mismatch", () => {
    const result = check({ "--handoff": fixture("handoff.work-order-mismatch.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-004");
    expect(result.json.mismatches.map((item: { code: string }) => item.code)).toContain("work_order_mismatch");
  });

  it("blocks missing allowed/forbidden paths or changed files outside scope", () => {
    const missing = check({ "--handoff": fixture("handoff.paths-missing.yaml") });
    const forbidden = check({ "--changed-files": fixture("changed-files.forbidden.txt") });

    expect(missing.exitCode).toBe(0);
    expect(forbidden.exitCode).toBe(0);
    expect(blockerIds(missing)).toContain("CSC-005");
    expect(blockerIds(forbidden)).toContain("CSC-005");
  });

  it("blocks unknown protected surfaces", () => {
    const result = check({ "--handoff": fixture("handoff.unknown-protected.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-006");
  });

  it("blocks required evidence without concrete refs", () => {
    const result = check({ "--handoff": fixture("handoff.evidence-missing.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-007");
  });

  it("blocks owner exact-head mismatch", () => {
    const result = check({ "--owner-decision": fixture("owner-decision.mismatch.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-008");
  });

  it("blocks adoption/lifecycle mismatch", () => {
    const result = check({ "--adoption-report": fixture("adoption.recover.json") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-009");
  });

  it("blocks gate-contract BLOCKED while lifecycle allows progress", () => {
    const result = check({ "--gate-contract-report": fixture("gate-contract.blocked.json") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-010");
  });

  it("blocks design-rule BLOCKED while owner readiness is claimed", () => {
    const result = check({ "--design-rule-report": fixture("design-rules.blocked.json") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-011");
  });

  it("blocks missing audit when audit is required", () => {
    const result = check({
      "--handoff": fixture("handoff.audit-required.yaml"),
      "--owner-decision": null,
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-012");
    expect(result.json.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.json.next_action.action).toBe("request_independent_audit");
    expect(result.json.owner_approval_allowed).toBe(false);
  });

  it("blocks owner approval before independent audit completion", () => {
    const result = check({ "--handoff": fixture("handoff.audit-required.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("OWNER-SEQ-001");
    expect(result.json.next_action.action).toBe("request_independent_audit");
    expect(result.json.owner_approval_allowed).toBe(false);
  });

  it("accepts an audit checklist report as required audit evidence", () => {
    const result = check({
      "--handoff": fixture("handoff.audit-required.yaml"),
      "--audit-checklist-report": fixture("audit-checklist.pass.json"),
      "--structured-audit": "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      "--audit-source": path.join(sequencingFixtures, "audit-source.pass.json"),
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_COMPLETE");
    expect(blockerIds(result)).not.toContain("CSC-012");
    expect(result.json.inventory.audit_checklist_report.present).toBe(true);
    expect(result.json.merge_ready_allowed).toBe(true);
  });

  it("requests owner decision after independent audit completion when owner is missing", () => {
    const result = check({
      "--handoff": fixture("handoff.audit-required.yaml"),
      "--audit-checklist-report": fixture("audit-checklist.pass.json"),
      "--structured-audit": "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      "--audit-source": path.join(sequencingFixtures, "audit-source.pass.json"),
      "--owner-decision": null,
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.current_phase).toBe("OWNER_DECISION_REQUIRED");
    expect(result.json.next_action.action).toBe("request_owner_exact_head_decision");
    expect(result.json.owner_approval_allowed).toBe(true);
    expect(result.json.merge_ready_allowed).toBe(false);
  });

  it("propagates audit checklist blockers into control-state completeness", () => {
    const result = check({
      "--audit-checklist-report": fixture("audit-checklist.blocked.json"),
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-005");
    expect(result.json.would_block).toBe(true);
    expect(result.json.owner_must_not_merge).toBe(true);
  });

  it("fails when an audit checklist report failed", () => {
    const result = check({
      "--audit-checklist-report": fixture("audit-checklist.failure.json"),
    });

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_FAILURE");
    expect(blockerIds(result)).toContain("AUDIT-LIST-001");
    expect(blockerIds(result)).toContain("CSC-017");
  });

  it("blocks duplicate or incomplete audit item answers", () => {
    const result = check({
      "--handoff": fixture("handoff.audit-required.yaml"),
      "--audit-record": fixture("audit-record.duplicate.json"),
      "--audit-item-set": fixture("audit-item-set.pass.yaml"),
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-013");
  });

  it("blocks COMPLETE without post-merge evidence", () => {
    const result = check({ "--lifecycle-report": fixture("lifecycle.complete.json") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-014");
  });

  it("blocks full-control claims without full readiness", () => {
    const result = check({ "--repo-spec": fixture("repo-spec.full-claim.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-015");
  });

  it("accepts full-control claims with full readiness", () => {
    const result = check({
      "--repo-spec": fixture("repo-spec.full-claim.yaml"),
      "--readiness-report": fixture("readiness.full.json"),
    });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).not.toContain("CSC-015");
  });

  it("blocks stale artifact references", () => {
    const result = check({ "--handoff": fixture("handoff.stale-ref.yaml") });

    expect(result.exitCode).toBe(0);
    expectShape(result);
    expect(blockerIds(result)).toContain("CSC-016");
  });

  it("fails when a report failure would otherwise be ignored", () => {
    const result = check({ "--execution-context-report": fixture("execution-context.failure.json") });

    expect(result.exitCode).toBe(1);
    expectShape(result);
    expect(result.json.state).toBe("CONTROL_FAILURE");
    expect(blockerIds(result)).toContain("CSC-017");
  });
});
