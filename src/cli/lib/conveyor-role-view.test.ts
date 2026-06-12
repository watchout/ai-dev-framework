import { describe, expect, it } from "vitest";
import {
  buildConveyorRoleView,
  validateConveyorRoleLabelChange,
} from "./conveyor-role-view.js";
import type { ConveyorPullRequestSnapshot } from "./conveyor-reconciler.js";

const repo = "watchout/ai-dev-framework";

function pr(number: number, labels: string[], options: Partial<ConveyorPullRequestSnapshot> = {}): ConveyorPullRequestSnapshot {
  return {
    repo,
    number,
    head: `head-${number}`,
    merge_state: "CLEAN",
    labels,
    ...options,
  };
}

describe("conveyor role view", () => {
  it("keeps L1 scoped to state:impl-l1", () => {
    const view = buildConveyorRoleView(
      {
        pull_requests: [
          pr(101, ["state:impl-l1", "audit-pending", "audit:l1-pending"]),
          pr(102, ["state:impl-l2", "audit-pending", "audit:l2-pending", "audit:l1-passed"]),
        ],
      },
      "l1",
    );

    expect(view.targets.map((target) => target.number)).toEqual([101]);
    expect(view.writable_add_labels).toContain("audit:l1-passed");
    expect(view.forbidden_add_labels).toContain("merge-ready");
  });

  it("withholds L2 stateful targets until L1 pass or explicit L2 route exists", () => {
    const view = buildConveyorRoleView(
      {
        pull_requests: [
          pr(201, ["state:impl-l2", "audit-pending", "audit:l2-pending"]),
          pr(202, ["state:impl-l2", "audit-pending", "audit:l2-pending", "audit:l1-passed"]),
          pr(203, ["state:impl-l2", "audit-pending", "audit:l2-pending", "audit:l2-required"]),
        ],
      },
      "l2",
    );

    expect(view.targets.map((target) => target.number)).toEqual([202, 203]);
    expect(view.excluded).toEqual([
      expect.objectContaining({
        pr: 201,
        reason_codes: ["l2_requires_l1_pass_or_route"],
      }),
    ]);
  });

  it("requires prior audit evidence before L3 role view advances", () => {
    const view = buildConveyorRoleView(
      {
        pull_requests: [
          pr(301, ["state:impl-l3", "audit-pending", "audit:l3-pending"]),
          pr(302, ["state:impl-l3", "audit-pending", "audit:l3-pending", "audit:l1-passed"]),
          pr(303, ["state:impl-l3", "audit-pending", "audit:l3-pending", "audit:l2-required", "audit:l1-passed"]),
          pr(304, ["state:impl-l3", "audit-pending", "audit:l3-pending", "audit:l2-required", "audit:l2-passed"]),
        ],
      },
      "l3",
    );

    expect(view.targets.map((target) => target.number)).toEqual([302, 304]);
    expect(view.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pr: 301, reason_codes: ["l3_requires_prior_audit_pass"] }),
        expect.objectContaining({ pr: 303, reason_codes: ["l3_requires_l2_pass"] }),
      ]),
    );
  });

  it("surfaces dirty audit-pending and missing evidence to checker only", () => {
    const view = buildConveyorRoleView(
      {
        pull_requests: [
          pr(401, ["state:impl-l1", "audit-pending", "audit:l1-pending"], { merge_state: "DIRTY" }),
          pr(402, ["state:impl-l1", "audit-pending", "audit:l1-pending"], {
            comments: [{ body: "<!-- conveyor:audit-result/v1 -->\nrepo: watchout/ai-dev-framework\npr: 402\nrole: l1\nverdict: HOLD\nhead: head-402" }],
          }),
          pr(403, ["state:impl-l1"]),
        ],
      },
      "checker",
    );

    expect(view.targets.map((target) => target.number)).toEqual([401]);
    expect(view.targets[0].reason_codes).toEqual(
      expect.arrayContaining(["dirty_audit_pending", "missing_pr_conveyor_evidence"]),
    );
  });

  it("keeps AUN mirror read-only", () => {
    const view = buildConveyorRoleView(
      {
        issues: [{ repo, number: 501, labels: ["needs:implementation"] }],
        pull_requests: [pr(502, ["state:impl-l1", "audit-pending", "audit:l1-pending"])],
      },
      "aun_mirror",
    );

    expect(view.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      `${repo}#501`,
      `${repo}#502`,
    ]);
    expect(view.writable_add_labels).toEqual([]);
    expect(view.authority_notes).toContain("read_only_mirror");
  });
});

describe("conveyor role authority check", () => {
  it("prevents implementation runners from setting audit pass or merge-ready", () => {
    const report = validateConveyorRoleLabelChange({
      role: "implementation",
      add: ["evidence-ready", "audit:l3-passed", "merge-ready"],
    });

    expect(report.authorized).toBe(false);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "audit:l3-passed", reason: "role_forbidden_final_or_foreign_authority_label" }),
        expect.objectContaining({ label: "merge-ready", reason: "role_forbidden_final_or_foreign_authority_label" }),
      ]),
    );
  });

  it("allows L1 to request L2 but not grant L2 pass", () => {
    const report = validateConveyorRoleLabelChange({
      role: "l1",
      add: ["audit:l2-required", "audit:l2-passed"],
    });

    expect(report.authorized).toBe(false);
    expect(report.violations).toEqual([
      expect.objectContaining({ label: "audit:l2-passed" }),
    ]);
  });

  it("prevents checker from granting final pass while allowing blocker metadata", () => {
    const report = validateConveyorRoleLabelChange({
      role: "checker",
      add: ["blocked-stop-lane", "audit:l1-passed"],
    });

    expect(report.authorized).toBe(false);
    expect(report.violations).toEqual([
      expect.objectContaining({ label: "audit:l1-passed" }),
    ]);
  });

  it("prevents AUN mirror label mutation", () => {
    const report = validateConveyorRoleLabelChange({
      role: "aun_mirror",
      add: ["dependency-blocked"],
    });

    expect(report.authorized).toBe(false);
    expect(report.violations).toEqual([
      expect.objectContaining({ reason: "aun_mirror_is_read_only" }),
    ]);
  });
});
