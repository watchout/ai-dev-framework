---
id: IMPL-CODEXFASTLANE-275
status: Draft
traces:
  spec: [SPEC-CODEXFASTLANE-275]
  verify: [VERIFY-CODEXFASTLANE-275]
  ops: [OPS-CODEXFASTLANE-275]
---

# IMPL: Codex Native Fast Lane With Minimal AUN Coupling

## 1. Purpose
Implement SPEC-CODEXFASTLANE-275 as a deterministic profile/resolver extension.

## 2. Components
- `templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json`
- `templates/work-orders/iyasaka-pr-conveyor-work-order.example.json`
- `src/cli/lib/delivery-profile-validator.ts`
- `src/cli/lib/work-order-delivery-defaults.ts`
- workflow check regressions for G21 delivery default gaps

## 3. Behavior
The bundled delivery profile declares:

- `default_runner_policy`;
- `allowed_runner_policies`;
- `runner_policies`;
- `runner_policy_by_risk`.

The profile validator blocks unsafe runner policy mappings and AUN dispatch
authority in `codex_native_fast_lane`.

The Work Order resolver returns `runnerPolicy` and reports gaps when R3/R4
declares `codex_native_fast_lane`.

## 4. Boundary
This implementation reads local profile/Work Order artifacts only. It does not
dispatch runners, call AUN, mutate GitHub labels, approve execution, or merge.
