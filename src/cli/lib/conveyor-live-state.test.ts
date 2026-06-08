import { describe, expect, it } from "vitest";
import { buildConveyorLiveStateReport } from "./conveyor-live-state.js";

const repo = "watchout/agent-comms-mcp";

describe("conveyor live state reconciler", () => {
  it("accepts a deployed head represented by a merged commit", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun", deployed_head: "merged-head" },
      ],
      merged_heads: { [repo]: ["merged-head"] },
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "represented_by_merged_commit",
        stop_lane: false,
        represented_by: expect.objectContaining({ kind: "merged_commit", head: "merged-head" }),
      }),
    );
    expect(report.metrics.unreviewed_deployed_commit_count).toBe(0);
  });

  it("accepts an open emergency PR only with exact-head audit evidence", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun", deployed_head: "emergency-head" },
      ],
      pull_requests: [
        {
          repo,
          number: 687,
          head: "emergency-head",
          labels: ["route:emergency", "state:impl-l2"],
          comments: [
            {
              body: auditEvidence({ pr: 687, role: "l1", verdict: "PASS", head: "emergency-head" }),
            },
          ],
        },
      ],
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "represented_by_open_emergency_pr",
        stop_lane: false,
        represented_by: expect.objectContaining({ kind: "open_emergency_pr", pr: 687 }),
      }),
    );
  });

  it("emits stop-lane for unreviewed deployed commits", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun", deployed_head: "unreviewed-head" },
      ],
      merged_heads: { [repo]: ["merged-head"] },
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "unreviewed_deployed_commit",
        stop_lane: true,
        reason_codes: ["unreviewed_deployed_commit", "no_open_pr_for_deployed_head"],
        next_actions: ["rollback_decision_required", "create_or_attach_emergency_pr_with_exact_head_evidence"],
      }),
    );
    expect(report.metrics.unreviewed_deployed_commit_count).toBe(1);
  });

  it("does not accept emergency PR evidence for the wrong head", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun", deployed_head: "current-live-head" },
      ],
      pull_requests: [
        {
          repo,
          number: 687,
          head: "current-live-head",
          labels: ["route:emergency"],
          comments: [
            {
              body: auditEvidence({ pr: 687, role: "l1", verdict: "PASS", head: "stale-head" }),
            },
          ],
        },
      ],
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "unreviewed_deployed_commit",
        stop_lane: true,
        reason_codes: expect.arrayContaining(["open_emergency_pr_missing_exact_head_evidence"]),
      }),
    );
  });

  it("keeps exact-head non-PASS emergency PR evidence in stop lane", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun", deployed_head: "unsafe-head" },
      ],
      pull_requests: [
        {
          repo,
          number: 687,
          head: "unsafe-head",
          labels: ["route:emergency"],
          comments: [
            {
              body: auditEvidence({ pr: 687, role: "l2", verdict: "BLOCK", head: "unsafe-head" }),
            },
          ],
        },
      ],
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "unreviewed_deployed_commit",
        stop_lane: true,
        reason_codes: expect.arrayContaining([
          "open_emergency_pr_missing_exact_head_evidence",
          "open_emergency_pr_exact_head_audit_not_pass",
        ]),
        next_actions: ["rollback_decision_required", "create_or_attach_emergency_pr_with_exact_head_evidence"],
      }),
    );
  });

  it("emits stop-lane when a live probe omits the deployed head", () => {
    const report = buildConveyorLiveStateReport({
      deployments: [
        { component: "aun-state-daemon", repo, checkout_path: "/srv/aun" },
      ],
    });

    expect(report.deployments[0]).toEqual(
      expect.objectContaining({
        status: "missing_deployed_head",
        stop_lane: true,
        reason_codes: ["missing_deployed_head"],
      }),
    );
    expect(report.metrics.missing_deployed_head_count).toBe(1);
  });
});

function auditEvidence(input: { pr: number; role: "l1" | "l2"; verdict: "PASS" | "BLOCK"; head: string }): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${repo}`,
    `pr: ${input.pr}`,
    `role: ${input.role}`,
    `verdict: ${input.verdict}`,
    `head: ${input.head}`,
    "base: base-head",
    "route: R3/Governed emergency regularization",
    "next_state_recommendation: continue_emergency_pr_audit_to_merge_authority",
  ].join("\n");
}
