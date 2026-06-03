---
id: OPS-DELIVERYPROFILE-269
status: Draft
traces:
  spec: [SPEC-DELIVERYPROFILE-269]
  impl: [IMPL-DELIVERYPROFILE-269]
  verify: [VERIFY-DELIVERYPROFILE-269]
---

# OPS: Delivery Profile Schema and Validator

## 1. Operator Use
Validate one profile:

```bash
shirube check delivery-profile --strict templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json
```

Validate a directory:

```bash
shirube check delivery-profile --json templates/delivery-profiles
```

## 2. Interpreting Results
- `PASS`: profile is structurally valid.
- `WARNING`: migration-visible required-field gaps exist in warning mode.
- `BLOCK`: unsafe or invalid profile behavior exists.

BLOCK findings must be fixed before using the profile for Work Order defaults,
PR evidence routing, queue projection, runner instruction packs, or AUN bridge
work.

## 3. IYASAKA Internal Operating Rule
The standard internal profile is:

```text
profile_id: iyasaka-internal.pr-conveyor
R0-R2: PR Conveyor, audit after PR creation and before merge
R3: Governed/phase conveyor, draft/reference until owner adopts, audit before merge
R4: Serial gate, approval/audit before execution
```

This is an internal operating default, not a universal enterprise default.

## 4. Manual Report Format
Use this report format in PR evidence until #267 adds a PR evidence template:

```text
Delivery profile: iyasaka-internal.pr-conveyor
Validator command:
Validator result:
Work Order:
Risk class:
Delivery strategy:
Audit timing:
Runner identity:
Runtime mode:
Verification:
Residual risk:
Stop conditions encountered:
Merge policy: automatic merge disabled
```

## 5. Stop Rules
Stop and request review if:

- profile uses an unknown strategy;
- R3 uses after-PR audit timing;
- R4 is not `serial_gate` / `before_execution` /
  `blocked_until_approved`;
- runner contract is Codex-only;
- automatic merge is enabled;
- Stop Lane WIP without approval is not `0`;
- no-run or protected-operation approval policy is missing.

## 6. AUN Boundary
Do not connect this validator to live AUN dispatch in this slice. #272 owns the
AUN bridge and starts only after safety stack acceptance.
