import { describe, expect, it } from "vitest";
import { buildConveyorLabelSyncPlan } from "./conveyor-label-sync.js";
import type { ConveyorPullRequestSnapshot } from "./conveyor-reconciler.js";

const repo = "watchout/ai-dev-framework";

function pr(input: Partial<ConveyorPullRequestSnapshot> & { number: number; labels: string[] }): ConveyorPullRequestSnapshot {
  return {
    repo,
    number: input.number,
    head: input.head ?? `head-${input.number}`,
    merge_state: input.merge_state ?? "CLEAN",
    labels: input.labels,
    comments: input.comments,
  };
}

function evidence(role: string, verdict: string, number: number, head = `head-${number}`): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${repo}`,
    `pr: ${number}`,
    `role: ${role}`,
    `verdict: ${verdict}`,
    `head: ${head}`,
  ].join("\n");
}

describe("conveyor label sync plan", () => {
  it("reports safe label add/remove changes from the reconciler", () => {
    const plan = buildConveyorLabelSyncPlan({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 101) }],
        }),
      ],
    });

    expect(plan.schema).toBe("shirube-conveyor-label-sync-plan/v1");
    expect(plan.safe_to_apply).toBe(true);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        add: expect.arrayContaining(["state:impl-l3", "audit:l2-passed", "audit:l3-pending"]),
        remove: expect.arrayContaining(["state:impl-l2", "audit:l2-pending", "needs:l2-audit"]),
        blocked: false,
      }),
    );
  });

  it("blocks audit compatibility labels without a canonical state label", () => {
    const plan = buildConveyorLabelSyncPlan({
      pull_requests: [
        pr({
          number: 102,
          labels: ["audit-pending", "audit:l1-pending", "needs:l1-audit"],
        }),
      ],
    });

    expect(plan.safe_to_apply).toBe(false);
    expect(plan.actions[0].findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_canonical_state", "audit_label_without_state"]),
    );
  });

  it("blocks stale-head and dirty/conflicting pass transitions", () => {
    const plan = buildConveyorLabelSyncPlan({
      pull_requests: [
        pr({
          number: 201,
          head: "new-head",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 201, "old-head") }],
        }),
        pr({
          number: 202,
          merge_state: "DIRTY",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 202) }],
        }),
      ],
    });

    expect(plan.safe_to_apply).toBe(false);
    expect(plan.actions.find((action) => action.pr === 201)?.findings.map((finding) => finding.code)).toContain(
      "head_mismatch",
    );
    expect(plan.actions.find((action) => action.pr === 202)?.findings.map((finding) => finding.code)).toContain(
      "dirty_or_conflicting_pr",
    );
  });

  it("surfaces CEO stale audit cleanup as a safe sync", () => {
    const plan = buildConveyorLabelSyncPlan({
      pull_requests: [
        pr({
          number: 291,
          labels: ["state:ceo-approval", "audit-pending", "audit:l2-pending", "needs:l2-audit"],
        }),
      ],
    });

    expect(plan.safe_to_apply).toBe(true);
    expect(plan.actions[0].add).toContain("needs:ceo-approval");
    expect(plan.actions[0].remove).toEqual(expect.arrayContaining(["audit-pending", "audit:l2-pending", "needs:l2-audit"]));
  });

  it("blocks merge-ready without L3 evidence", () => {
    const plan = buildConveyorLabelSyncPlan({
      pull_requests: [
        pr({
          number: 300,
          labels: ["state:impl-l3", "merge-ready", "audit:l3-pending", "needs:l3-review"],
        }),
      ],
    });

    expect(plan.safe_to_apply).toBe(false);
    expect(plan.actions[0].findings.map((finding) => finding.code)).toContain("merge_ready_without_l3_evidence");
  });
});
