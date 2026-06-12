---
id: OPS-CODEXFASTLANE-275
status: Draft
traces:
  spec: [SPEC-CODEXFASTLANE-275]
  impl: [IMPL-CODEXFASTLANE-275]
  verify: [VERIFY-CODEXFASTLANE-275]
---

# OPS: Codex Native Fast Lane With Minimal AUN Coupling

## 1. Operator Use
Validate the bundled profile:

```bash
shirube check delivery-profile --strict templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json
```

Validate a Work Order:

```bash
shirube workflow check --action work_order --profile strict --fail-on warn
```

## 2. Allowed Use
Use `codex_native_fast_lane` only for R0-R2 Work Orders with concrete owner
fields, action envelope, verification commands, and stop conditions.

## 3. Forbidden Use
Do not use fast lane for:

- R3/R4 work;
- AUN queue/runtime control-plane changes;
- live AUN dispatch;
- merge;
- production deploy;
- secret or credential changes;
- destructive DB/storage operations;
- customer/external sends;
- billing/value transfer;
- permission broadening.

## 4. Stop Rules
If risk changes to R3/R4, move the Work Order to governed/manual handling and
request audit before implementation or merge.
