---
id: OPS-M0-CONVEYOR-309-E
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-E]
  impl: [IMPL-M0-CONVEYOR-309-E]
  verify: [VERIFY-M0-CONVEYOR-309-E]
---

# M0 User Outcome Gate OPS

Operating notes for SPEC-M0-CONVEYOR-309-E.

## Run The Gate

```text
shirube conveyor outcome-gate --fixture outcome-fixture.json --json
```

Human-readable:

```text
shirube conveyor outcome-gate --fixture outcome-fixture.json
```

## Required Fixture Shape

```text
subject: <claim subject>
claim_text: <done/recovered/usable/complete claim>
proof.expected_user_outcome: <observable user outcome>
proof.outcome_evidence_uri: <evidence URI>
proof.outcome_verdict: PASS|FAIL|NEEDS_INFO|WAIVED
proof.negative_controls_checked: <array>
proof.waiver_actor: <required for WAIVED>
proof.waiver_reason: <required for WAIVED>
```

## Stop Conditions

- missing proof field;
- outcome FAIL;
- outcome NEEDS_INFO;
- WAIVED without actor/reason;
- claim based only on CI, audit, queue ACK, or script output.
