---
id: SPEC-WORKORDERDEFAULTS-270
status: Draft
traces:
  impl: [IMPL-WORKORDERDEFAULTS-270]
  verify: [VERIFY-WORKORDERDEFAULTS-270]
  ops: [OPS-WORKORDERDEFAULTS-270]
---

# SPEC: Work Order Delivery Defaults

## 0. Meta
- Origin Issue: #270
- Parent Issue: #266
- Depends on: #269 delivery profile schema and validator
- Related: #244 work-order/v1, #249 Governance Bone, #264 4MCP safety profile

## 1. Purpose
Make `delivery_strategy` first-class in Shirube Work Orders and allow Work
Orders to inherit risk-based defaults from a selected delivery profile.

This turns the IYASAKA internal PR Conveyor profile into executable Work Order
evidence without requiring Codex-specific goal semantics or live AUN dispatch.

## 2. Authority Boundary
Work Order defaults are routing evidence, not authority grants.

- ARC may define architecture/profile defaults.
- Repo implementation owners still own implementation.
- Review/audit owners remain separate.
- Merge authority remains separate.
- R4 protected operations require approval/audit before execution.
- Merge is never automatic.

## 3. Required Work Order Fields
PR Conveyor Work Orders must include or inherit:

- `delivery_profile_ref`;
- `delivery_strategy`;
- `work_unit`;
- `lane`;
- `risk_class`;
- `pr_mode`;
- `audit_timing`;
- `architecture_owner`;
- `implementation_owner`;
- `review_owner`;
- `audit_owner`;
- `merge_authority`;
- `scope`;
- `non_goals`;
- `allowed_files`;
- `allowed_actions`;
- `forbidden_actions`;
- `verification_commands`;
- `stop_conditions`;
- `fallback_next_work_policy`.

The existing `work-order/v1` runtime fields remain required by #244.

## 4. Default Resolution
The resolver takes:

- selected delivery profile;
- Work Order risk class;
- optional Work Order declarations.

It resolves:

- lane;
- delivery strategy;
- audit timing;
- PR mode.

IYASAKA internal defaults:

| Risk | Lane | Strategy | Audit timing | PR mode |
|------|------|----------|--------------|---------|
| `R0` | `Fast` | `pr_conveyor` | `after_pr` | `normal` |
| `R1` | `Fast` | `pr_conveyor` | `after_pr` | `normal` |
| `R2` | `Fast` | `pr_conveyor` | `after_pr` | `normal` |
| `R3` | `Governed` | `phase_conveyor` | `before_merge` | `draft_or_reference_until_owner_adopts` |
| `R4` | `Stop` | `serial_gate` | `before_execution` | `blocked_until_approved` |

## 5. Safety Rules
- R0-R2 can inherit `pr_conveyor`, `after_pr`, and `normal`.
- R3 must not use `after_pr` audit timing.
- R4 must use `serial_gate`, `before_execution`, and
  `blocked_until_approved`.
- Owner fields must be concrete and non-placeholder.
- Action envelope fields must be present.
- A missing profile prevents inheritance.

## 6. Gate Behavior
The first implementation remains warning-first through
`workflow check --action work_order`.

New finding group:

- `G21.work_order.delivery_profile_defaults`

The gate reports gaps but does not hard-block until a later reviewed promotion
slice.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- a Work Order can declare or inherit `delivery_strategy=pr_conveyor`;
- R0-R2 default to normal PR and audit after PR;
- R3 defaults to governed draft/reference behavior;
- R4 defaults to serial gate and blocks execution until approval/audit;
- missing owner fields are reported by the governance/work-order check;
- the flow is runner-agnostic and does not require Codex `/goal` semantics.

Inheritance scenario:

```gherkin
Given a Work Order declares risk_class R2
And it references the IYASAKA internal PR Conveyor profile
When the Work Order delivery resolver runs
Then delivery_strategy is pr_conveyor
And audit_timing is after_pr
And pr_mode is normal
```

R4 scenario:

```gherkin
Given a Work Order declares risk_class R4
When the Work Order delivery resolver runs
Then delivery_strategy is serial_gate
And audit_timing is before_execution
And pr_mode is blocked_until_approved
```

Owner scenario:

```gherkin
Given a Work Order has implementation_owner TBD
When workflow check evaluates the Work Order
Then G21.work_order.delivery_profile_defaults warns
```

## 8. Implementation Contract
The implementation adds:

- deterministic resolver library;
- workflow check integration;
- GitHub Work Order template fields;
- JSON Work Order example;
- docs and tests.

## 9. Review Boundary
This slice is R3/Governed because it changes Work Order routing behavior.

Required review:

- L1 spec review for profile/default semantics;
- L2 implementation audit for resolver and workflow check behavior;
- L3 before merge readiness if the active governance route requires it.

## 10. 制御機構選定原則
script 選定根拠: Work Order default resolution must be deterministic and
replayable before runner automation or AUN dispatch consumes it.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later invoke the same
workflow check but cannot own routing truth.

GitHub 選定根拠: GitHub issues/PRs host Work Order evidence and templates. They
project state but do not grant merge authority.

LLM boundary: LLM output may draft Work Orders but cannot invent safe defaults,
approve R4 execution, satisfy owner fields, or merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Default resolution | script/library | - | deterministic profile + risk mapping |
| Work Order evidence | workflow check | - | warning-first migration evidence |
| Owner separation | workflow check + Governance Bone | - | implementation/review/audit/merge stay separate |
| R4 stop behavior | workflow check | - | protected operations need pre-execution approval |
| Templates | GitHub/files | - | evidence projection only |

## 11. Testing Layer
The implementation must add unit, integration-style CLI, regression, and smoke
fixtures for:

- R0-R2 inherited PR Conveyor defaults;
- R3 governed defaults and after-PR rejection;
- R4 serial gate defaults;
- owner placeholder reporting;
- profile ref mismatch;
- workflow check `G21.work_order.delivery_profile_defaults` PASS/WARN behavior.

## 12. Non-Goals
- Do not implement PR evidence template checks (#267).
- Do not implement GitHub-native queue labels or WIP projection (#268).
- Do not implement runner instruction packs (#271).
- Do not implement rollout batch Work Orders (#273).
- Do not enable AUN live dispatch (#272).
- Do not automate merge.
