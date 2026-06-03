import { describe, expect, it } from "vitest";
import { validateRunnerInstructionPacks } from "./runner-instruction-pack-validator.js";

const REQUIRED_STEPS = [
  "read_work_order",
  "verify_authority_and_lane_risk",
  "execute_allowed_files_actions_only",
  "run_verification",
  "open_or_update_pr_or_report_no_pr_needed",
  "write_pr_evidence",
  "return_result_state",
];

function validPack(overrides: Record<string, unknown> = {}): string {
  const pack = {
    pack_version: "runner-instruction-pack/v1",
    profile_id: "iyasaka-internal.pr-conveyor",
    runner_agnostic: true,
    common_contract: {
      required_steps: REQUIRED_STEPS,
      result_states: [
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
      forbidden_interfaces: [
        "codex_goal_required",
        "aun_live_dispatch_required",
      ],
      stop_behavior: "record_blocker_and_stop",
    },
    runner_packs: [
      runnerPack("human"),
      runnerPack("codex"),
      runnerPack("claude_code"),
      runnerPack("ci_headless_script"),
      {
        ...runnerPack("aun_dispatched_runner"),
        activation_condition: "after_safety_stack_acceptance",
        live_aun_dispatch_enabled: false,
      },
    ],
    ...overrides,
  };

  return JSON.stringify(pack, null, 2);
}

function runnerPack(runner: string): Record<string, unknown> {
  return {
    runner,
    required_steps: REQUIRED_STEPS,
    requires_codex_goal: false,
    live_aun_dispatch_enabled: false,
    instruction_summary: "Execute one bounded Work Order and return evidence.",
  };
}

describe("validateRunnerInstructionPacks", () => {
  it("passes a complete runner-agnostic instruction pack", () => {
    const result = validateRunnerInstructionPacks(
      [{ path: "runner-packs.json", content: validPack() }],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
    expect(result.checkedPacks).toBe(1);
  });

  it("warns when a required runner pack is missing in warning mode", () => {
    const result = validateRunnerInstructionPacks([
      {
        path: "runner-packs.json",
        content: validPack({ runner_packs: [runnerPack("human")] }),
      },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_runner",
        runner: "claude_code",
      }),
    );
  });

  it("blocks missing required runner packs in strict mode", () => {
    const result = validateRunnerInstructionPacks(
      [
        {
          path: "runner-packs.json",
          content: validPack({ runner_packs: [runnerPack("human")] }),
        },
      ],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_runner",
      }),
    );
  });

  it.each([true, "true", "false"])(
    "blocks Codex-specific goal requirements unless explicitly false: %s",
    (requiresCodexGoal) => {
      const result = validateRunnerInstructionPacks([
        {
          path: "runner-packs.json",
          content: validPack({
            runner_packs: [
              { ...runnerPack("human") },
              { ...runnerPack("codex"), requires_codex_goal: requiresCodexGoal },
              { ...runnerPack("claude_code") },
              { ...runnerPack("ci_headless_script") },
              {
                ...runnerPack("aun_dispatched_runner"),
                activation_condition: "after_safety_stack_acceptance",
              },
            ],
          }),
        },
      ]);

      expect(result.status).toBe("BLOCK");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: "unsafe_runner_boundary",
          field: "runner_packs.codex.requires_codex_goal",
        }),
      );
    },
  );

  it("blocks missing Codex goal safety flags", () => {
    const result = validateRunnerInstructionPacks([
      {
        path: "runner-packs.json",
        content: validPack({
          runner_packs: [
            { ...runnerPack("human") },
            (() => {
              const pack = { ...runnerPack("codex") };
              delete pack.requires_codex_goal;
              return pack;
            })(),
            { ...runnerPack("claude_code") },
            { ...runnerPack("ci_headless_script") },
            {
              ...runnerPack("aun_dispatched_runner"),
              activation_condition: "after_safety_stack_acceptance",
            },
          ],
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_runner_boundary",
        field: "runner_packs.codex.requires_codex_goal",
      }),
    );
  });

  it.each([true, "true", "false"])(
    "blocks live AUN dispatch flags unless explicitly false: %s",
    (liveAunDispatchEnabled) => {
      const result = validateRunnerInstructionPacks([
        {
          path: "runner-packs.json",
          content: validPack({
            runner_packs: [
              runnerPack("human"),
              runnerPack("codex"),
              runnerPack("claude_code"),
              runnerPack("ci_headless_script"),
              {
                ...runnerPack("aun_dispatched_runner"),
                activation_condition: "after_safety_stack_acceptance",
                live_aun_dispatch_enabled: liveAunDispatchEnabled,
              },
            ],
          }),
        },
      ]);

      expect(result.status).toBe("BLOCK");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: "unsafe_runner_boundary",
          field: "runner_packs.aun_dispatched_runner.live_aun_dispatch_enabled",
        }),
      );
    },
  );

  it("blocks missing live AUN dispatch safety flags", () => {
    const aunPack: Record<string, unknown> = {
      ...runnerPack("aun_dispatched_runner"),
      activation_condition: "after_safety_stack_acceptance",
    };
    delete aunPack.live_aun_dispatch_enabled;

    const result = validateRunnerInstructionPacks([
      {
        path: "runner-packs.json",
        content: validPack({
          runner_packs: [
            runnerPack("human"),
            runnerPack("codex"),
            runnerPack("claude_code"),
            runnerPack("ci_headless_script"),
            aunPack,
          ],
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_runner_boundary",
        field: "runner_packs.aun_dispatched_runner.live_aun_dispatch_enabled",
      }),
    );
  });

  it("blocks unsafe stop behavior", () => {
    const pack = JSON.parse(validPack()) as {
      common_contract: Record<string, unknown>;
    };
    pack.common_contract.stop_behavior = "continue_to_next_step";

    const result = validateRunnerInstructionPacks([
      { path: "runner-packs.json", content: JSON.stringify(pack) },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_runner_boundary",
        field: "common_contract.stop_behavior",
      }),
    );
  });
});
