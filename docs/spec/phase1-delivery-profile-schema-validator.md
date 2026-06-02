---
id: SPEC-DELIVERYPROFILE-269
status: Draft
traces:
  impl: [IMPL-DELIVERYPROFILE-269]
  verify: [VERIFY-DELIVERYPROFILE-269]
  ops: [OPS-DELIVERYPROFILE-269]
---

# SPEC: Delivery Profile Schema and Validator

## 0. Meta
- Origin Issue: #269
- Parent Issue: #266
- Parent governance boundary: #249 / PR #253
- Safety profile dependency: #264 / PR #274
- ARC source profile: `iyasaka-arc/cross-cutting/profiles/draft/iyasaka-internal.pr-conveyor.delivery-profile.json`
- ARC rollout plan: `iyasaka-arc/cross-cutting/specs/draft/2026-06-02-iyasaka-pr-conveyor-rollout-plan.md`

## 1. Purpose
Define the deterministic Shirube delivery-profile schema and validator needed
to make PR Conveyor usable as the IYASAKA internal development profile without
making it an enterprise-wide default or a Codex-only flow.

The first supported profile is `iyasaka-internal.pr-conveyor`. The validator is
not a runner and does not dispatch work. It checks that a profile can safely
drive Work Order defaults, PR evidence, audit timing, WIP projection, and later
runner instructions.

## 2. Authority Boundary
The delivery profile is a policy artifact. It must not grant implementation,
audit, approval, merge, or live execution authority.

Required boundaries:

- GitHub-native operation must work before AUN live dispatch.
- Runners must be interchangeable: human, Codex, Claude Code, headless/CI, and
  later AUN-dispatched runners consume the same Work Order contract.
- Merge is never automatic.
- R4/protected operations require approval and audit before execution.
- AUN bridge behavior is out of scope until the safety stack is accepted.

## 3. Required Schema
Every delivery profile must be a JSON object with these top-level fields:

- `profile_version`;
- `profile_id`;
- `default_delivery_strategy`;
- `default_runner_policy`;
- `allowed_delivery_strategies`;
- `allowed_runner_policies`;
- `strategy_by_risk`;
- `runner_policy_by_risk`;
- `runner_policies`;
- `queue_states`;
- `wip_policy`;
- `work_order_required_fields`;
- `runner_contract`;
- `audit_contract`;
- `merge_policy`;
- `stop_policy`.

The supported profile version for this slice is `0.1.0`.

## 4. Delivery Strategies
Supported delivery strategies:

- `pr_conveyor`;
- `phase_conveyor`;
- `release_train`;
- `serial_gate`;
- `design_only`;
- `hotfix`.

Profiles may choose among these strategies. The IYASAKA internal default is
`pr_conveyor`, but enterprise/product profiles are not forced into that default.
Unknown strategy names are invalid because downstream Work Order and queue
defaults cannot safely interpret them.

## 5. Risk Defaults
The profile must declare `strategy_by_risk` for `R0`, `R1`, `R2`, `R3`, and
`R4`.

IYASAKA internal defaults:

| Risk | Strategy | Audit timing | PR mode |
|------|----------|--------------|---------|
| `R0` | `pr_conveyor` | `after_pr` | `normal` |
| `R1` | `pr_conveyor` | `after_pr` | `normal` |
| `R2` | `pr_conveyor` | `after_pr` | `normal` |
| `R3` | `phase_conveyor` | `before_merge` | `draft_or_reference_until_owner_adopts` |
| `R4` | `serial_gate` | `before_execution` | `blocked_until_approved` |

R0-R2 may enter Audit Pending after PR creation. R3 must not use after-PR
audit timing. R4 must not use PR Conveyor or after-PR audit timing.

## 5.1 Runner Policy Defaults
The IYASAKA internal profile may use `codex_native_fast_lane` only for R0-R2.
R3 and R4 must resolve to a non-fast-lane policy such as
`runner_agnostic_manual`.

`codex_native_fast_lane` keeps AUN coupling `minimal_async_optional`; AUN may
mirror evidence or notify audit queues, but must not select Work Orders,
dispatch runners, approve execution, merge, or override stop policy.

## 6. Queue, WIP, and Evidence
Required queue states:

- `backlog`;
- `ready_for_spec`;
- `ready_for_implementation`;
- `implementing`;
- `pr_opened_evidence_ready`;
- `audit_pending`;
- `changes_requested`;
- `rework_implementing`;
- `audit_passed`;
- `merge_ready`;
- `merged_closed`.

Required WIP policy fields:

- `fast_lane_prs_per_repo`;
- `governed_draft_prs_per_repo`;
- `rework_prs_per_repo`;
- `stop_lane_prs_without_approval`;
- `max_runner_sessions_per_repo`;
- `max_changed_files_per_work_order`.

`stop_lane_prs_without_approval` must be `0`.

Required runner evidence:

- `runner_identity`;
- `runtime_mode`;
- `work_order_id`;
- `branch_or_pr_ref`;
- `changed_files`;
- `verification_results`;
- `residual_risk`;
- `stop_conditions_encountered`.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- valid `iyasaka-internal.pr-conveyor` profile passes;
- missing required fields produce findings;
- strict mode blocks missing required fields;
- unknown delivery strategies block;
- R4 with `pr_conveyor` and `after_pr` blocks;
- R3/R4 with `codex_native_fast_lane` blocks;
- Codex-only runner contracts block;
- automatic merge policy blocks;
- CLI supports `shirube check delivery-profile <paths...> --strict --json`.

Valid profile scenario:

```gherkin
Given the IYASAKA internal PR Conveyor delivery profile
When `shirube check delivery-profile --strict` validates it
Then the result is PASS
```

R4 safety scenario:

```gherkin
Given a profile maps R4 to pr_conveyor
And audit_timing is after_pr
When the delivery profile validator runs
Then the result is BLOCK
```

Runner-agnostic scenario:

```gherkin
Given a profile only allows Codex execution
When the delivery profile validator runs
Then the result is BLOCK because the profile is not runner agnostic
```

## 8. Implementation Contract
The first implementation provides:

- `src/cli/lib/delivery-profile-validator.ts`;
- `shirube check delivery-profile <paths...>`;
- `--strict`;
- `--json`;
- bundled profile template at
  `templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json`;
- unit and CLI regression tests.

The validator may run in warning mode for migration visibility, but structural
safety violations such as parse errors, unknown strategies, unsafe R4 mapping,
unsafe runner-policy mapping, Codex-only runners, automatic merge, and missing
stop policy remain BLOCK.

## 9. Review Boundary
This slice is governed as R3 because it creates a cross-cutting delivery
profile validator and future Work Order defaults.

Required review:

- L1 spec review for schema and profile correctness;
- L2 implementation audit for validator behavior and tests;
- L3 before merge readiness or standard-profile promotion if required by the
  active governance route.

## 10. 制御機構選定原則
script 選定根拠: Profile validation must be deterministic, replayable, and
usable by GitHub-native workflows before AUN live dispatch exists.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may call the same validator
later but must not own delivery-profile truth.

GitHub 選定根拠: GitHub PRs and labels can project queue/audit state after this
schema exists. GitHub projection does not grant merge authority.

LLM boundary: LLM output may draft profile text, but cannot invent delivery
strategies, approve R4 execution, satisfy missing audit timing, or merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Schema validation | CLI script | - | deterministic profile contract |
| Risk strategy defaults | CLI script | - | avoid prompt-dependent routing |
| Runner-agnostic contract | CLI script | - | same Work Order for human/Codex/Claude/headless |
| Merge and stop policy | CLI script | - | no automatic merge or protected execution |
| Queue projection | Future GitHub labels/checks | - | GitHub-native first, AUN bridge later |

## 11. Testing Layer
The implementation must add unit, integration-style CLI, regression, and smoke
fixtures for:

- valid bundled IYASAKA internal profile;
- missing root fields in warning and strict modes;
- unknown delivery strategy;
- R4 using PR Conveyor and after-PR audit timing;
- Codex-only runner contract;
- automatic merge policy;
- directory scanning and JSON output.

## 12. Non-Goals
- Do not implement Work Order default resolution in this slice.
- Do not implement PR evidence template checks in this slice.
- Do not implement GitHub queue labels or WIP projection in this slice.
- Do not implement runner instruction packs in this slice.
- Do not enable AUN live dispatch.
- Do not implement automatic merge.
