import { describe, expect, it } from "vitest";
import { buildConveyorStackGateReport } from "./conveyor-stack-gate.js";
import type { ConveyorPullRequestSnapshot } from "./conveyor-reconciler.js";

const repo = "watchout/ai-dev-framework";

function pr(number: number, labels: string[], head = `head-${number}`): ConveyorPullRequestSnapshot {
  return {
    repo,
    number,
    head,
    merge_state: "CLEAN",
    labels,
  };
}

describe("conveyor stack gate", () => {
  it("marks upper dependents as dependency-blocked when a lower foundation blocker exists", () => {
    const report = buildConveyorStackGateReport({
      config: { dependencies: { [repo]: [[285, 286, 287]] } },
      pull_requests: [
        pr(285, ["state:impl-l2", "foundation-blocker"]),
        pr(286, ["state:impl-l2", "audit:l2-pending"]),
        pr(287, ["state:impl-l2", "audit:l2-pending"]),
      ],
    });

    expect(report.safe_to_advance_dependents).toBe(false);
    expect(report.blocked_dependents.map((item) => item.pr)).toEqual([286, 287]);
    expect(report.blocked_dependents[0]).toEqual(
      expect.objectContaining({
        blocker_pr: 285,
        current_state: "state:impl-l2",
        recommended_add: ["dependency-blocked"],
      }),
    );
  });

  it("preserves current state visibility while recommending dependency-blocked metadata", () => {
    const report = buildConveyorStackGateReport({
      config: { dependencies: { [repo]: [[1, 2]] } },
      pull_requests: [
        pr(1, ["state:rework", "blocked-stop-lane"]),
        pr(2, ["state:impl-l3", "audit:l3-pending"]),
      ],
    });

    expect(report.blocked_dependents[0].current_state).toBe("state:impl-l3");
    expect(report.blocked_dependents[0].recommended_add).toEqual(["dependency-blocked"]);
  });

  it("blocks final pass and merge signals above a lower blocker", () => {
    const report = buildConveyorStackGateReport({
      config: { dependencies: { [repo]: [[10, 11]] } },
      pull_requests: [
        pr(10, ["state:impl-l1", "foundation-blocker"]),
        pr(11, ["state:done", "audit:l3-passed", "merge-ready"]),
      ],
    });

    expect(report.blocked_dependents[0].blocked_final_signals).toEqual(
      expect.arrayContaining(["state:done", "audit:l3-passed", "merge-ready"]),
    );
    expect(report.blocked_dependents[0].recommended_remove).toEqual(
      expect.arrayContaining(["state:done", "audit:l3-passed", "merge-ready"]),
    );
  });

  it("does not block independent stacks", () => {
    const report = buildConveyorStackGateReport({
      config: { dependencies: { [repo]: [[1, 2], [3, 4]] } },
      pull_requests: [
        pr(1, ["state:impl-l1", "foundation-blocker"]),
        pr(2, ["state:impl-l1"]),
        pr(3, ["state:impl-l2"]),
        pr(4, ["state:impl-l2"]),
      ],
    });

    expect(report.independent_stacks_clear).toBe(1);
    expect(report.blocked_dependents.map((item) => item.pr)).toEqual([2]);
  });

  it("does not clear blocker state from green CI or labels alone", () => {
    const report = buildConveyorStackGateReport({
      config: { dependencies: { [repo]: [[20, 21]] } },
      pull_requests: [
        pr(20, ["state:impl-l2", "foundation-blocker", "ci:green"]),
        pr(21, ["state:impl-l2"]),
      ],
    });

    expect(report.safe_to_advance_dependents).toBe(false);
    expect(report.blocked_dependents[0].reason).toContain("foundation-blocker");
  });
});
