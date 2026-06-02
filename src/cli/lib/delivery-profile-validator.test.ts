import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDeliveryProfiles } from "./delivery-profile-validator.js";

const TEMPLATE_PATH = "templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json";

function validProfile(overrides: Record<string, unknown> = {}): string {
  const profile = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8")) as Record<string, unknown>;
  return JSON.stringify({ ...profile, ...overrides }, null, 2);
}

function validProfileObject(): Record<string, unknown> {
  return JSON.parse(validProfile()) as Record<string, unknown>;
}

describe("validateDeliveryProfiles", () => {
  it("passes the IYASAKA internal PR Conveyor profile", () => {
    const result = validateDeliveryProfiles(
      [{ path: TEMPLATE_PATH, content: validProfile() }],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
    expect(result.checkedProfiles).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("warns in warning mode when required root fields are missing", () => {
    const profile = validProfileObject();
    delete profile.runner_contract;

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_field",
        field: "runner_contract",
      }),
    );
  });

  it("blocks in strict mode when required root fields are missing", () => {
    const profile = validProfileObject();
    delete profile.work_order_required_fields;

    const result = validateDeliveryProfiles(
      [{ path: "profile.json", content: JSON.stringify(profile) }],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "work_order_required_fields",
      }),
    );
  });

  it("blocks unknown delivery strategies", () => {
    const profile = validProfileObject();
    profile.allowed_delivery_strategies = ["pr_conveyor", "unreviewed_parallel_merge"];

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unknown_strategy",
        field: "allowed_delivery_strategies[1]",
      }),
    );
  });

  it("blocks R4 from using PR Conveyor with after-pr audit timing", () => {
    const profile = validProfileObject();
    profile.strategy_by_risk = {
      ...(profile.strategy_by_risk as Record<string, unknown>),
      R4: {
        delivery_strategy: "pr_conveyor",
        audit_timing: "after_pr",
        pr_mode: "normal",
      },
    };

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_risk_mapping",
        riskClass: "R4",
      }),
    );
  });

  it("blocks R3 from using normal PR mode even with before-merge audit timing", () => {
    const profile = validProfileObject();
    profile.strategy_by_risk = {
      ...(profile.strategy_by_risk as Record<string, unknown>),
      R3: {
        delivery_strategy: "phase_conveyor",
        audit_timing: "before_merge",
        pr_mode: "normal",
      },
    };

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "unsafe_risk_mapping",
        field: "strategy_by_risk.R3.pr_mode",
        riskClass: "R3",
      }),
    );
  });

  it("blocks when stop_policy is missing in warning mode", () => {
    const profile = validProfileObject();
    delete profile.stop_policy;

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "stop_policy",
      }),
    );
  });

  it("blocks Codex-only runner contracts", () => {
    const profile = validProfileObject();
    profile.runner_contract = {
      runner_agnostic: false,
      allowed_runners: ["codex"],
      required_result_states: [
        "completed_pr_opened",
        "completed_no_pr_needed",
        "blocked_requires_input",
        "blocked_requires_audit",
        "blocked_requires_approval",
        "failed_verification",
        "skipped_not_authorized",
      ],
      required_evidence: [
        "runner_identity",
        "runtime_mode",
        "work_order_id",
        "branch_or_pr_ref",
        "changed_files",
        "verification_results",
        "residual_risk",
        "stop_conditions_encountered",
      ],
    };

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "runner_specific_contract",
        field: "runner_contract.runner_agnostic",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "missing_field",
        field: "runner_contract.allowed_runners",
      }),
    );
  });

  it("blocks automatic merge policies", () => {
    const profile = validProfileObject();
    profile.merge_policy = {
      automatic_merge_allowed: true,
      implementation_runner_may_merge: true,
      merge_requires: [
        "audit_passed",
        "merge_authority",
        "green_required_checks",
        "no_active_stop_condition",
      ],
    };

    const result = validateDeliveryProfiles([
      { path: "profile.json", content: JSON.stringify(profile) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_merge_policy",
        field: "merge_policy.automatic_merge_allowed",
      }),
    );
  });
});
