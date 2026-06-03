import { describe, expect, it } from "vitest";
import {
  collectConveyorAuditEvidence,
  parseConveyorAuditEvidence,
  reconcileConveyor,
  type ConveyorPullRequestSnapshot,
} from "./conveyor-reconciler.js";

const repo = "watchout/ai-dev-framework";

function pr(input: Partial<ConveyorPullRequestSnapshot> & { number: number; head?: string; labels: string[] }): ConveyorPullRequestSnapshot {
  return {
    repo,
    number: input.number,
    head: input.head ?? `head-${input.number}`,
    merge_state: input.merge_state ?? "CLEAN",
    labels: input.labels,
    comments: input.comments,
    reviews: input.reviews,
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
    "reported_by: auditor",
    "recorded_at: 2026-06-04T00:00:00.000Z",
  ].join("\n");
}

describe("conveyor reconciler", () => {
  it("parses durable conveyor audit evidence comments", () => {
    const parsed = parseConveyorAuditEvidence({
      body: evidence("l2", "PASS", 286, "abc123"),
      url: "https://github.test/comment",
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        schema: "conveyor:audit-result/v1",
        repo,
        pr: 286,
        role: "l2",
        verdict: "PASS",
        head: "abc123",
        source: "https://github.test/comment",
      }),
    );
  });

  it("moves L1 PASS to L2 when L2 is required", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 101,
          labels: ["state:impl-l1", "audit:l1-pending", "needs:l1-audit", "audit:l2-required"],
          comments: [{ body: evidence("l1", "PASS", 101) }],
        }),
      ],
    }, "apply");

    const result = report.prs[0];
    expect(result.accepted_evidence[0].role).toBe("l1");
    expect(result.final_labels).toEqual(
      expect.arrayContaining(["state:impl-l2", "audit:l1-passed", "audit:l2-pending", "needs:l2-audit"]),
    );
    expect(result.final_labels).not.toContain("state:impl-l1");
    expect(result.final_labels).not.toContain("audit:l1-pending");
    expect(result.final_labels).not.toContain("needs:l1-audit");
  });

  it("moves L2 PASS to L3 only with matching exact-head evidence", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 286,
          head: "reviewed-head",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 286, "reviewed-head") }],
        }),
      ],
    }, "apply");

    expect(report.prs[0].final_labels).toEqual(
      expect.arrayContaining(["state:impl-l3", "audit:l2-passed", "audit:l3-pending", "needs:l3-review"]),
    );
    expect(report.skipped).toEqual([]);
  });

  it("moves L3 PASS to state:done and merge-ready without approving or merging", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 300,
          labels: ["state:impl-l3", "audit:l3-pending", "needs:l3-review"],
          comments: [{ body: evidence("l3", "PASS", 300) }],
        }),
      ],
    }, "apply");

    expect(report.prs[0].final_labels).toEqual(
      expect.arrayContaining(["state:done", "merge-ready", "audit:l3-passed"]),
    );
    expect(report.prs[0].final_labels).not.toContain("state:impl-l3");
    expect(report.prs[0].final_labels).not.toContain("audit:l3-pending");
  });

  it("moves BLOCK and CHANGES_REQUESTED to rework", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 401,
          labels: ["state:impl-l1", "audit:l1-pending", "needs:l1-audit"],
          comments: [{ body: evidence("l1", "BLOCK", 401) }],
        }),
        pr({
          number: 402,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "CHANGES_REQUESTED", 402) }],
        }),
      ],
    }, "apply");

    expect(report.prs.find((item) => item.pr === 401)?.final_labels).toEqual(
      expect.arrayContaining(["state:rework", "needs:rework", "audit:blocked"]),
    );
    expect(report.prs.find((item) => item.pr === 402)?.final_labels).toEqual(
      expect.arrayContaining(["state:rework", "needs:rework", "audit:changes-requested"]),
    );
  });

  it("releases only the immediate downstream dependency after L2 PASS", () => {
    const report = reconcileConveyor({
      config: { dependencies: { [repo]: [[285, 286, 287]] } },
      pull_requests: [
        pr({
          number: 285,
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 285) }],
        }),
        pr({ number: 286, labels: ["state:blocked", "dependency-blocked"] }),
        pr({ number: 287, labels: ["state:blocked", "dependency-blocked"] }),
      ],
    }, "apply");

    expect(report.dependency_releases).toEqual([
      expect.objectContaining({
        predecessor: 285,
        released: 286,
        state: "state:impl-l2",
      }),
    ]);
    expect(report.prs.find((item) => item.pr === 286)?.final_labels).toEqual(
      expect.arrayContaining(["state:impl-l2", "audit:l2-pending", "needs:l2-audit"]),
    );
    expect(report.prs.find((item) => item.pr === 287)?.final_labels).toEqual(
      expect.arrayContaining(["state:blocked", "dependency-blocked"]),
    );
  });

  it("cleans stale audit-pending labels from CEO approval state", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 291,
          labels: ["state:ceo-approval", "audit:l2-pending", "needs:l2-audit", "audit-pending"],
        }),
      ],
    }, "apply");

    expect(report.prs[0].final_labels).toEqual(
      expect.arrayContaining(["state:ceo-approval", "needs:ceo-approval"]),
    );
    expect(report.prs[0].final_labels).not.toContain("audit:l2-pending");
    expect(report.prs[0].final_labels).not.toContain("needs:l2-audit");
    expect(report.prs[0].final_labels).not.toContain("audit-pending");
  });

  it("refuses dirty/conflicting or stale-head PASS transitions", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 501,
          merge_state: "DIRTY",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 501) }],
        }),
        pr({
          number: 502,
          head: "new-head",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [{ body: evidence("l2", "PASS", 502, "old-head") }],
        }),
      ],
    }, "apply");

    expect(report.prs.find((item) => item.pr === 501)?.skipped).toContain("dirty_or_conflicting_pr");
    expect(report.prs.find((item) => item.pr === 501)?.final_labels).toContain("state:impl-l2");
    expect(report.prs.find((item) => item.pr === 502)?.skipped).toContain("head_mismatch");
    expect(report.prs.find((item) => item.pr === 502)?.final_labels).toContain("state:impl-l2");
  });

  it("reports label-only pass without durable audit evidence", () => {
    const report = reconcileConveyor({
      pull_requests: [
        pr({
          number: 601,
          labels: ["state:impl-l2", "audit:l2-passed", "audit:l2-pending", "needs:l2-audit"],
        }),
      ],
    }, "dry-run");

    expect(report.prs[0].findings).toContain("label_only_pass_without_durable_evidence");
    expect(report.prs[0].skipped).toContain("missing_durable_audit_evidence");
    expect(report.prs[0].final_labels).toContain("state:impl-l2");
  });

  it("normalizes multiple state labels and is idempotent after apply", () => {
    const input = {
      pull_requests: [
        pr({
          number: 701,
          labels: ["state:impl-l1", "state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
        }),
      ],
    };
    const first = reconcileConveyor(input, "apply");
    const second = reconcileConveyor({
      pull_requests: first.prs.map((item) => pr({ number: item.pr, head: item.head, labels: item.final_labels })),
    }, "apply");

    expect(first.prs[0].findings).toContain("multiple_state_labels_normalized");
    expect(first.prs[0].final_labels.filter((label) => label.startsWith("state:"))).toHaveLength(1);
    expect(second.changed).toBe(false);
  });

  it("collects evidence from comments and reviews", () => {
    const snapshot = pr({
      number: 801,
      labels: ["state:impl-l1"],
      comments: [{ body: evidence("l1", "PASS", 801) }],
      reviews: [{ body: evidence("l2", "PASS", 801) }],
    });

    expect(collectConveyorAuditEvidence(snapshot).map((item) => item.role)).toEqual(["l1", "l2"]);
  });
});
