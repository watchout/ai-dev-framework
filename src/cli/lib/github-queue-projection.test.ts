import { describe, expect, it } from "vitest";
import { validateGithubQueueProjections } from "./github-queue-projection.js";

function validProjection(overrides: Record<string, unknown> = {}): string {
  const projection = {
    projection_version: "github-queue-projection/v1",
    repository: "watchout/ai-dev-framework",
    labels: [
      { name: "ready-for-implementation", queue_state: "ready_for_implementation" },
      { name: "implementing", queue_state: "implementing" },
      { name: "evidence-ready", queue_state: "pr_opened_evidence_ready" },
      { name: "audit-pending", queue_state: "audit_pending" },
      { name: "changes-requested", queue_state: "changes_requested" },
      { name: "rework-implementing", queue_state: "rework_implementing" },
      { name: "audit-passed", queue_state: "audit_passed" },
      { name: "merge-ready", queue_state: "merge_ready" },
      { name: "blocked-stop-lane", queue_state: "blocked_stop_lane" },
    ],
    wip_policy: {
      fast_lane_prs_per_repo: 3,
      governed_draft_prs_per_repo: 2,
      rework_prs_per_repo: 2,
      stop_lane_prs_without_approval: 0,
    },
    items: [
      {
        id: "PR-1",
        type: "pull_request",
        state: "open",
        draft: false,
        labels: ["audit-pending"],
        lane: "Fast",
        risk_class: "R2",
      },
      {
        id: "PR-2",
        type: "pull_request",
        state: "open",
        draft: true,
        labels: ["audit-pending"],
        lane: "Governed",
        risk_class: "R3",
      },
    ],
    ...overrides,
  };

  return JSON.stringify(projection, null, 2);
}

describe("validateGithubQueueProjections", () => {
  it("passes complete GitHub-native queue projection within WIP limits", () => {
    const result = validateGithubQueueProjections(
      [{ path: "queue.json", content: validProjection() }],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
    expect(result.repositories).toContainEqual(
      expect.objectContaining({
        repository: "watchout/ai-dev-framework",
        fastLanePrs: 1,
        governedDraftPrs: 1,
      }),
    );
  });

  it("warns when required queue labels are missing in warning mode", () => {
    const result = validateGithubQueueProjections([
      {
        path: "queue.json",
        content: validProjection({ labels: ["ready-for-implementation"] }),
      },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_label",
        message: expect.stringContaining("audit-pending"),
      }),
    );
  });

  it("blocks missing queue labels in strict mode", () => {
    const result = validateGithubQueueProjections(
      [
        {
          path: "queue.json",
          content: validProjection({ labels: ["ready-for-implementation"] }),
        },
      ],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_label",
      }),
    );
  });

  it("warns when Fast Lane PR WIP exceeds the configured limit", () => {
    const items = Array.from({ length: 4 }, (_, index) => ({
      id: `PR-${index + 1}`,
      type: "pull_request",
      state: "open",
      labels: ["audit-pending"],
      lane: "Fast",
      risk_class: "R2",
    }));

    const result = validateGithubQueueProjections([
      { path: "queue.json", content: validProjection({ items }) },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "wip_over_limit",
        field: "fast_lane_prs_per_repo",
      }),
    );
  });

  it("blocks when Governed Draft PR WIP exceeds the configured limit", () => {
    const items = Array.from({ length: 3 }, (_, index) => ({
      id: `PR-${index + 1}`,
      type: "pull_request",
      state: "open",
      draft: true,
      labels: ["audit-pending"],
      lane: "Governed",
      risk_class: "R3",
    }));

    const result = validateGithubQueueProjections([
      { path: "queue.json", content: validProjection({ items }) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "wip_over_limit",
        field: "governed_draft_prs_per_repo",
      }),
    );
  });

  it("blocks Stop Lane PRs without approval", () => {
    const result = validateGithubQueueProjections([
      {
        path: "queue.json",
        content: validProjection({
          items: [
            {
              id: "PR-4",
              type: "pull_request",
              state: "open",
              labels: ["blocked-stop-lane"],
              lane: "Stop",
              risk_class: "R4",
              approval_refs: "TBD",
            },
          ],
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "stop_lane_without_approval",
      }),
    );
  });
});
