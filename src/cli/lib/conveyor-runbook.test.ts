import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("docs/ops/wave1-pr-conveyor-runbook.md", "utf8");

describe("Wave 1 PR Conveyor runbook", () => {
  it("pins GitHub labels as Wave 1 SSOT while AUN is degraded", () => {
    expect(runbook).toContain("GitHub labels are the Wave 1 state source of truth");
    expect(runbook).toContain("AUN mirror mode is read-only");
    expect(runbook).toContain("must not dispatch live runners, mutate queue lifecycle, or replace GitHub label state");
  });

  it("uses canonical state labels for Audit Sweeper dispatch", () => {
    expect(runbook).toContain("L1 Audit Sweeper search: `state:impl-l1`");
    expect(runbook).toContain("L2 Audit Sweeper search: `state:impl-l2`");
    expect(runbook).toContain("L3 Audit Sweeper search: `state:impl-l3`");
    expect(runbook).toContain("Compatibility labels may remain, but they are not the dispatch SSOT.");
  });

  it("documents one graph with separated lane authority", () => {
    expect(runbook).toContain("one Work Order / PR graph");
    expect(runbook).toContain("must not create a parallel task system");
    expect(runbook).toContain("Implementation runners must not set audit pass labels, merge-ready labels, or `state:done`.");
    expect(runbook).toContain("L3/merge authority alone decides draft removal, final merge readiness, and merge execution.");
  });

  it("documents read-only Audit Sweeper planning and exact-head checks", () => {
    expect(runbook).toContain("shirube conveyor audit-sweeper plan");
    expect(runbook).toContain("The Audit Sweeper plan is read-only.");
    expect(runbook).toContain("It must not mutate labels, post PR comments, dispatch AUN runners, or merge PRs.");
    expect(runbook).toContain("Confirm prior L1/L2 evidence is current at the exact head when auditing L2/L3.");
  });

  it("documents metrics and warning thresholds", () => {
    expect(runbook).toContain("More than 4 Wave 1 PRs in `audit-pending`.");
    expect(runbook).toContain("Any PR in `audit-pending` for more than 24h.");
    expect(runbook).toContain("Any PR with more than 2 rework loops.");
    expect(runbook).toContain("`merge-ready` PR whose reviewed SHA is stale.");
    expect(runbook).toContain("slow implementation and drain audit or rework first");
  });
});
