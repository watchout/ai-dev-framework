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
              "base: main",
              "route: standard",
              "next_state_recommendation: state:impl-l3",
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
              "base: main",
              "route: standard",
              "next_state_recommendation: state:impl-l3",
            ].join("\n"),
          },
        ],
      },
      {
        repo,
        number: 293,
        head: "merged-head-293",
        merge_state: "MERGED",
        labels: ["state:done", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
      },
    ],
    deployments: [
      {
        component: "shirube-control-plane",
        repo,
        checkout_path: "/srv/shirube",
        deployed_head: "unreviewed-deployed-head",
      },
      {
        component: "merged-control-plane",
        repo,
        checkout_path: "/srv/shirube",
        deployed_head: "merged-deployed-head",
      },
    ],
    merged_heads: { [repo]: ["merged-deployed-head"] },
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
    expect(manifest.current_ops.schema).toBe("shirube-conveyor-current-ops/v1");
    expect(manifest.current_ops.safe_to_apply).toBe(false);
    expect(manifest.current_ops.lane_queues.l2.count).toBe(2);
    expect(manifest.current_ops.reconcile_backlog.map((target) => `${target.repo}#${target.number}`)).toEqual([
      "watchout/ai-dev-framework#285",
    ]);
    expect(manifest.current_ops.dirty_audit_queue.map((target) => `${target.repo}#${target.number}`)).toContain(
      "watchout/ai-dev-framework#292",
    );
    expect(manifest.current_ops.merged_stale_state_cleanup).toEqual([
      expect.objectContaining({
        repo,
        number: 293,
        recommended_add: ["merged_closed"],
        recommended_remove: expect.arrayContaining(["audit-pending", "audit:l1-pending", "needs:l1-audit"]),
      }),
    ]);
    expect(manifest.current_ops.dependency_release_candidates).toEqual([
      expect.objectContaining({ repo, predecessor: 285, released: 286 }),
    ]);
    expect(manifest.current_ops.human_approval_notifications).toEqual([
      expect.objectContaining({ repo, number: 291 }),
    ]);
    expect(manifest.current_ops.unreviewed_deployed_commit_blockers).toEqual([
      expect.objectContaining({
        component: "shirube-control-plane",
        deployed_head: "unreviewed-deployed-head",
        reason_codes: ["no_merged_commit_or_reviewed_pr_for_deployed_head"],
      }),
    ]);
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
