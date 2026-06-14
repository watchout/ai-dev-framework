import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveWorkOrderDeliveryDefaults } from "./work-order-delivery-defaults.js";

const PROFILE_PATH = "templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json";

function profile(): Record<string, unknown> {
  return JSON.parse(readFileSync(PROFILE_PATH, "utf-8")) as Record<string, unknown>;
}

function workOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    work_order_id: "SHIRUBE-CONVEYOR-001",
    repo: "watchout/ai-dev-framework",
    product: "shirube",
    github_state_ref: {
      issue_url: "https://github.com/watchout/ai-dev-framework/issues/401",
      pr_url: "https://github.com/watchout/ai-dev-framework/pull/401",
    },
    phase_goal: {
      phase_type: "implementation",
      goal: "Implement a bounded Work Order contract update.",
      next_phase_handoff: "L1 audit",
    },
    runner_policy: "codex_native_fast_lane",
    evidence_contract: {
      required: ["pr_comment", "checks", "review"],
      not_sufficient: ["aun_ack", "queue_id"],
    },
    risk_class: "R1",
    work_unit: "PR",
    architecture_owner: "IYASAKA ARC",
    implementation_owner: "Shirube repo maintainer",
    review_owner: "Shirube reviewer",
    audit_owner: "Shirube audit owner",
    merge_authority: "Shirube repo maintainer",
    scope: ["Implement bounded profile work."],
    non_goals: ["Do not merge automatically."],
    acceptance_criteria: ["A draft PR captures implementation evidence."],
    role_flow: ["arc", "adf-lead", "audit", "qa", "cto-if-required"],
    current_owner: "adf-lead",
    next_action: "open implementation PR",
    evidence_required: ["PR comment", "local checks", "review links"],
    required_review: ["L1 audit"],
    allowed_files: ["src/cli/lib/*"],
    allowed_actions: ["edit code", "run tests", "open PR"],
    forbidden_actions: ["merge", "production deploy"],
    verification_commands: ["npm test -- delivery-profile"],
    stop_conditions: ["R4 action requested"],
    fallback_next_work_policy: "record blocker and move to next ready Work Order",
    ...overrides,
  };
}

describe("resolveWorkOrderDeliveryDefaults", () => {
  it("inherits PR Conveyor defaults for R0-R2 work", () => {
    const result = resolveWorkOrderDeliveryDefaults(profile(), workOrder({ risk_class: "R2" }));

    expect(result.gaps).toHaveLength(0);
    expect(result.defaults).toEqual(
      expect.objectContaining({
        profileId: "iyasaka-internal.pr-conveyor",
        riskClass: "R2",
        lane: "Fast",
        deliveryStrategy: "pr_conveyor",
        auditTiming: "after_pr",
        prMode: "normal",
      }),
    );
    expect(result.defaults?.inherited.deliveryStrategy).toBe(true);
  });

  it("uses governed defaults for R3 work", () => {
    const result = resolveWorkOrderDeliveryDefaults(profile(), workOrder({ risk_class: "R3" }));

    expect(result.gaps).toHaveLength(0);
    expect(result.defaults).toEqual(
      expect.objectContaining({
        riskClass: "R3",
        lane: "Governed",
        deliveryStrategy: "phase_conveyor",
        auditTiming: "before_merge",
        prMode: "draft_or_reference_until_owner_adopts",
      }),
    );
  });

  it("blocks R3 after-pr audit declarations", () => {
    const result = resolveWorkOrderDeliveryDefaults(
      profile(),
      workOrder({
        risk_class: "R3",
        lane: "Governed",
        audit_timing: "after_pr",
      }),
    );

    expect(result.gaps).toContain("R3.audit_timing:after_pr");
  });

  it("blocks R3 normal PR mode declarations", () => {
    const result = resolveWorkOrderDeliveryDefaults(
      profile(),
      workOrder({
        risk_class: "R3",
        lane: "Governed",
        audit_timing: "before_merge",
        pr_mode: "normal",
      }),
    );

    expect(result.gaps).toContain("R3.pr_mode:normal");
  });

  it("uses serial gate defaults for R4 work", () => {
    const result = resolveWorkOrderDeliveryDefaults(profile(), workOrder({ risk_class: "R4" }));

    expect(result.gaps).toHaveLength(0);
    expect(result.defaults).toEqual(
      expect.objectContaining({
        riskClass: "R4",
        lane: "Stop",
        deliveryStrategy: "serial_gate",
        auditTiming: "before_execution",
        prMode: "blocked_until_approved",
      }),
    );
  });

  it("reports missing owner fields", () => {
    const result = resolveWorkOrderDeliveryDefaults(
      profile(),
      workOrder({ implementation_owner: "TBD" }),
    );

    expect(result.gaps).toContain("owner:implementation_owner");
  });

  it("reports missing GitHub-first phase contract fields", () => {
    const result = resolveWorkOrderDeliveryDefaults(
      profile(),
      workOrder({
        github_state_ref: "",
        phase_goal: "",
        runner_policy: "",
        evidence_contract: "",
      }),
    );

    expect(result.gaps).toEqual(
      expect.arrayContaining([
        "envelope:github_state_ref",
        "envelope:phase_goal",
        "envelope:runner_policy",
        "envelope:evidence_contract",
      ]),
    );
  });

  it("reports profile reference mismatches", () => {
    const result = resolveWorkOrderDeliveryDefaults(
      profile(),
      workOrder({ delivery_profile_ref: "other.profile" }),
    );

    expect(result.gaps).toContain(
      "delivery_profile_ref:other.profile!=iyasaka-internal.pr-conveyor",
    );
  });
});
