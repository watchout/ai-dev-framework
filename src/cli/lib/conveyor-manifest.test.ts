import { describe, expect, it } from "vitest";
import {
  buildConveyorTickManifest,
  selectConveyorNextTarget,
  type ConveyorManifestInput,
} from "./conveyor-manifest.js";

const repo = "watchout/ai-dev-framework";

function fixture(): ConveyorManifestInput {
  return {
    issues: [
      {
        repo: "watchout/aun-platform",
        number: 24,
        title: "Discord-like thread stream",
        labels: ["needs:implementation", "ready-for-implementation"],
      },
      {
        repo: "watchout/aun-platform",
        number: 30,
        labels: ["state:start"],
      },
    ],
    pull_requests: [
      {
        repo,
        number: 285,
        head: "head-285",
        merge_state: "CLEAN",
        labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
        comments: [
          {
            body: [
              "<!-- conveyor:audit-result/v1 -->",
              `repo: ${repo}`,
              "pr: 285",
              "role: l2",
              "verdict: PASS",
              "head: head-285",
            ].join("\n"),
          },
        ],
      },
      {
        repo,
        number: 286,
        head: "head-286",
        merge_state: "CLEAN",
        labels: ["state:blocked", "dependency-blocked"],
      },
      {
        repo: "watchout/agent-memory",
        number: 132,
        head: "head-132",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit:l1-pending", "needs:l1-audit"],
      },
      {
        repo,
        number: 291,
        head: "head-291",
        merge_state: "CLEAN",
        labels: ["state:ceo-approval", "audit:l2-pending", "needs:l2-audit"],
      },
      {
        repo,
        number: 292,
        head: "new-head",
        merge_state: "CLEAN",
        labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
        comments: [
          {
            body: [
              "<!-- conveyor:audit-result/v1 -->",
              `repo: ${repo}`,
              "pr: 292",
              "role: l2",
              "verdict: PASS",
              "head: old-head",
            ].join("\n"),
          },
        ],
      },
    ],
    config: { dependencies: { [repo]: [[285, 286]] } },
  };
}

describe("conveyor tick manifest", () => {
  it("builds implementation and PR lane manifests after reconciliation", () => {
    const manifest = buildConveyorTickManifest(fixture(), "apply");

    expect(manifest.schema).toBe("shirube-conveyor-tick-manifest/v1");
    expect(manifest.execution_mode).toBe("batch");
    expect(manifest.judgment_unit).toBe("pull_request");
    expect(manifest.dependency_order).toEqual([["watchout/ai-dev-framework#285", "watchout/ai-dev-framework#286"]]);
    expect(manifest.lanes.implementation.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      "watchout/aun-platform#24",
    ]);
    expect(manifest.lanes.l1.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      "watchout/agent-memory#132",
    ]);
    expect(manifest.lanes.l2.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      "watchout/ai-dev-framework#286",
      "watchout/ai-dev-framework#292",
    ]);
    expect(manifest.lanes.l3.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      "watchout/ai-dev-framework#285",
    ]);
    expect(manifest.lanes.ceo.targets[0]).toEqual(
      expect.objectContaining({
        repo,
        number: 291,
        reason: "state:ceo-approval",
      }),
    );
  });

  it("preserves skipped transition reasons instead of silently omitting stale-head targets", () => {
    const manifest = buildConveyorTickManifest(fixture(), "dry-run");
    const target = manifest.lanes.l2.targets.find((item) => item.number === 292);

    expect(target?.skipped).toContain("head_mismatch");
    expect(target?.reason).toBe("head_mismatch");
  });

  it("selects the next role target deterministically", () => {
    const manifest = buildConveyorTickManifest(fixture(), "dry-run");

    expect(selectConveyorNextTarget(manifest, "implementation")).toEqual(
      expect.objectContaining({ repo: "watchout/aun-platform", number: 24 }),
    );
    expect(selectConveyorNextTarget(manifest, "l2")).toEqual(
      expect.objectContaining({ repo: "watchout/ai-dev-framework", number: 286 }),
    );
  });
});
