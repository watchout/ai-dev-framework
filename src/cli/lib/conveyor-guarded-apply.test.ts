import { describe, expect, it } from "vitest";
import {
  buildConveyorGuardedApplyPlan,
  executeConveyorGuardedApplyPlan,
  type ConveyorGuardedApplyAdapter,
  type ConveyorGuardedApplyOperation,
} from "./conveyor-guarded-apply.js";
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

function evidence(role: string, verdict: string, number: number): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${repo}`,
    `pr: ${number}`,
    `role: ${role}`,
    `verdict: ${verdict}`,
    `head: head-${number}`,
    "base: main",
    "route: standard",
    "next_state_recommendation: state:impl-l3",
  ].join("\n");
}

describe("conveyor guarded apply", () => {
  it("builds a dry-run label/comment operation from safe exact-head evidence", () => {
    const plan = buildConveyorGuardedApplyPlan({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 101) }],
        }),
      ],
    });

    expect(plan.schema).toBe("shirube-conveyor-guarded-apply-plan/v1");
    expect(plan.mode).toBe("dry-run");
    expect(plan.dry_run).toBe(true);
    expect(plan.safe_to_apply).toBe(true);
    expect(plan.confirmation_required).toBe(false);
    expect(plan.forbidden_operations).toEqual(expect.arrayContaining(["merge", "approve", "aun_dispatch"]));
    expect(plan.operations[0]).toEqual(
      expect.objectContaining({
        repo,
        pr: 101,
        expected_head: "head-101",
        add_labels: expect.arrayContaining(["state:impl-l3", "audit:l2-passed"]),
        remove_labels: expect.arrayContaining(["state:impl-l2", "needs:l2-audit"]),
      }),
    );
    expect(plan.operations[0].comment_body).toContain("<!-- conveyor:guarded-apply/v1 -->");
  });

  it("blocks unsafe label sync actions from guarded apply", () => {
    const plan = buildConveyorGuardedApplyPlan({
      pull_requests: [
        pr({
          number: 201,
          head: "new-head",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 201) }],
        }),
      ],
    });

    expect(plan.safe_to_apply).toBe(false);
    expect(plan.operations).toEqual([]);
    expect(plan.blocked_operations[0].reason_codes).toContain("head_mismatch");
  });

  it("requires explicit live confirmation before execution", () => {
    const plan = buildConveyorGuardedApplyPlan({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 101) }],
        }),
      ],
    }, { mode: "apply" });

    expect(plan.confirmation_required).toBe(true);
    expect(() => executeConveyorGuardedApplyPlan(plan, fakeAdapter("head-101"))).toThrow(/confirm-live-github/);
  });

  it("checks live head before applying labels and comments", () => {
    const plan = buildConveyorGuardedApplyPlan({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 101) }],
        }),
      ],
    }, { mode: "apply", confirmLiveGithub: true });
    const applied: ConveyorGuardedApplyOperation[] = [];
    const commented: ConveyorGuardedApplyOperation[] = [];
    const adapter = fakeAdapter("head-101", applied, commented);

    const report = executeConveyorGuardedApplyPlan(plan, adapter, { confirmLiveGithub: true });

    expect(report.safe_to_apply).toBe(true);
    expect(applied.map((operation) => operation.pr)).toEqual([101]);
    expect(commented.map((operation) => operation.pr)).toEqual([101]);
  });

  it("does not mutate when the live head differs", () => {
    const plan = buildConveyorGuardedApplyPlan({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 101) }],
        }),
      ],
    }, { mode: "apply", confirmLiveGithub: true });
    const applied: ConveyorGuardedApplyOperation[] = [];
    const report = executeConveyorGuardedApplyPlan(plan, fakeAdapter("other-head", applied), { confirmLiveGithub: true });

    expect(report.safe_to_apply).toBe(false);
    expect(report.blocked[0].reason_codes).toContain("live_head_mismatch");
    expect(applied).toEqual([]);
  });
});

function fakeAdapter(
  head: string,
  applied: ConveyorGuardedApplyOperation[] = [],
  commented: ConveyorGuardedApplyOperation[] = [],
): ConveyorGuardedApplyAdapter {
  return {
    readPullRequestHead: () => head,
    applyPullRequestLabels: (operation) => {
      applied.push(operation);
    },
    postPullRequestComment: (operation) => {
      commented.push(operation);
    },
  };
}
