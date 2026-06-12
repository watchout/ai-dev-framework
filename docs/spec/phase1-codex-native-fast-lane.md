---
id: SPEC-CODEXFASTLANE-275
status: Draft
traces:
  impl: [IMPL-CODEXFASTLANE-275]
  verify: [VERIFY-CODEXFASTLANE-275]
  ops: [OPS-CODEXFASTLANE-275]
---

# SPEC: Codex Native Fast Lane With Minimal AUN Coupling

## 0. Meta
- Origin Issue: #275
- Parent Issue: #266
- Depends on: #269 delivery profile, #270 Work Order defaults, #271 runner instruction packs
- Related: #264 4MCP safety profile, #268 GitHub queue projection, #272 AUN bridge

## 1. Purpose
Define `codex_native_fast_lane` as the fastest internal IYASAKA runner policy
for R0-R2 Work Orders while preserving runner-agnostic Work Orders, GitHub
evidence, audit separation, and merge authority.

This is not a Codex-only delivery architecture. It is an internal runner policy
for low-to-medium risk work before AUN live dispatch is accepted.

## 2. Authority Boundary
The fast lane is not an authority grant.

- GitHub issue/PR/labels remain the Wave 1 source of truth.
- Codex may implement bounded R0-R2 Work Orders locally.
- AUN may only mirror state or notify audit queues before #272.
- AUN must not select Work Orders, dispatch runners, approve execution, merge,
  or override stop policy in this lane.
- Implementation runners must not merge.

## 3. Runner Policy Contract
`codex_native_fast_lane` must declare:

- eligible risk classes: R0, R1, R2;
- forbidden risk classes: R3, R4;
- AUN coupling: `minimal_async_optional`;
- queue source of truth: `github_issue_pr_labels`;
- execution source of truth: `codex_local_session`;
- evidence source of truth: `github_pr_body_or_comment`;
- forbidden AUN roles: select next Work Order, dispatch runner, approve
  execution, merge, override stop policy.

## 4. Risk Mapping
The IYASAKA internal profile maps runner policy by risk:

| Risk | Runner policy |
|------|---------------|
| R0 | `codex_native_fast_lane` |
| R1 | `codex_native_fast_lane` |
| R2 | `codex_native_fast_lane` |
| R3 | `runner_agnostic_manual` |
| R4 | `runner_agnostic_manual` |

R3/R4 must not silently use `codex_native_fast_lane`.

## 5. Work Order Defaults
Work Orders may declare `runner_policy` or inherit it from the delivery profile.

If a Work Order declares R3 or R4 with `codex_native_fast_lane`, the Work Order
delivery default check must report a finding.

## 6. Gate Behavior
The implementation extends:

- `shirube check delivery-profile`;
- Work Order delivery default resolution;
- `workflow check --action work_order` warning-first G21 reporting.

Delivery profile safety violations are BLOCK. Work Order migration gaps remain
warning-first until the reviewed hard-block promotion slice.

## 7. Acceptance Criteria
- The bundled profile declares `codex_native_fast_lane`.
- R0-R2 inherit `codex_native_fast_lane`.
- R3/R4 inherit non-fast-lane runner policy.
- Profile validation blocks R3/R4 fast-lane mappings.
- Work Order checks warn when R3/R4 declare fast lane.
- AUN live dispatch remains disabled and out of scope.
- Merge remains outside implementation runner authority.

Fast lane inheritance scenario:

```gherkin
Given a Work Order declares risk_class R2
When delivery defaults resolve from the IYASAKA profile
Then runner_policy is codex_native_fast_lane
```

R3 guard scenario:

```gherkin
Given a Work Order declares risk_class R3
And runner_policy is codex_native_fast_lane
When workflow check evaluates delivery profile defaults
Then the result includes a G21 warning
```

Profile safety scenario:

```gherkin
Given a delivery profile maps R4 to codex_native_fast_lane
When the delivery profile validator runs
Then the result is BLOCK
```

## 8. Review Boundary
This slice is R3/Governed because it changes cross-repo runner policy defaults.

Required review:

- L1 spec review for runner policy semantics;
- L2 implementation audit for validator/resolver behavior;
- L3 before merge readiness if required by the active governance route.

## 9. Non-Goals
- Do not enable AUN live dispatch.
- Do not make Codex the only supported runner.
- Do not implement AUN bridge (#272).
- Do not mutate GitHub labels.
- Do not automate audit, approval, or merge.

## 10. 制御機構選定原則
script 選定根拠: runner policy compatibility must be deterministic before
implementation runners consume Work Orders.

Hook 選定根拠: Hook 不採用. Hooks may later call the same checks but cannot own
runner policy truth.

GitHub 選定根拠: GitHub labels and PR evidence are the Wave 1 SSOT.

LLM boundary: LLM output may draft evidence, but cannot classify R3/R4 as fast
lane, approve AUN dispatch, or merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Runner policy schema | CLI script | - | deterministic profile validation |
| R3/R4 fast-lane guard | CLI/workflow check | - | prevents unsafe runner routing |
| AUN boundary | Profile fields + check | - | no live dispatch before #272 |
| GitHub SSOT | Labels/evidence | - | Wave 1 operates without AUN |

## 11. Testing Layer
The implementation must add unit, integration-style CLI/workflow, regression,
and smoke fixtures for:

- bundled profile PASS;
- R3/R4 profile fast-lane mapping BLOCK;
- unsafe AUN role omission in fast-lane policy BLOCK;
- R0-R2 Work Order runner policy inheritance;
- R3 Work Order fast-lane declaration warning.
