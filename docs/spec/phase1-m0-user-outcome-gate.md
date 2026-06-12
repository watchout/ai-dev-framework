---
id: SPEC-M0-CONVEYOR-309-E
status: Draft
traces:
  impl: [IMPL-M0-CONVEYOR-309-E]
  verify: [VERIFY-M0-CONVEYOR-309-E]
  ops: [OPS-M0-CONVEYOR-309-E]
---

# SPEC: M0 User Outcome Gate

## 0. Meta
- Origin Issue: #309
- Scope: M0-E user outcome gate
- Depends on: SPEC-M0-CONVEYOR-309-A-B, SPEC-M0-CONVEYOR-309-C, and SPEC-M0-CONVEYOR-309-D

## 1. Purpose
Prevent Shirube or related projects from claiming done, recovered, usable, or
complete based only on CI, audit labels, queue ACKs, or script-style output.

A completion or recovery claim requires explicit user outcome proof or an
explicit waiver.

## 2. Required Proof Model
`shirube-user-outcome-proof/v1` includes:

- `expected_user_outcome`;
- `outcome_evidence_uri`;
- `outcome_verdict`;
- `negative_controls_checked`;
- `waiver_actor` when waived;
- `waiver_reason` when waived.

Supported verdicts:

- `PASS`;
- `FAIL`;
- `NEEDS_INFO`;
- `WAIVED`.

## 3. Claim Terms
The gate detects completion or usability claims containing:

- done;
- complete/completed;
- recovered/recovery;
- usable.

## 4. Blocking Rules
- Missing proof fields block completion claims.
- `FAIL` blocks completion claims.
- `NEEDS_INFO` blocks completion claims.
- `WAIVED` passes only with `waiver_actor` and `waiver_reason`.
- `PASS` requires negative controls.

## 5. Acceptance Criteria
- AUN recovery canary fixture is blocked when visible behavior is still queue
  ACK/script-style output.
- PASS proof allows a usability claim.
- WAIVED proof requires actor and reason.
- Non-completion statements are not blocked.
- CLI JSON and human-readable reports are available.

## 6. Gate Behavior
The gate is read-only. It evaluates claim/proof fixtures and returns PASS or
BLOCK. It does not mutate GitHub, AUN, DB, Discord, queues, or local runtime.

## 7. Scenarios
AUN canary scenario:

```gherkin
Given a claim says AUN complete recovery is done and usable
And the visible output remains queue ACK/script-style
When the outcome gate evaluates the proof
Then the verdict is BLOCK
And the claim is blocked
```

PASS scenario:

```gherkin
Given a usability claim has expected user outcome, evidence URI, PASS verdict,
and negative controls
When the outcome gate evaluates the proof
Then the verdict is PASS
```

## 8. Implementation Contract
The implementation changes:

- `src/cli/lib/user-outcome-gate.ts`;
- `src/cli/lib/user-outcome-gate.test.ts`;
- `src/cli/commands/conveyor.ts`;
- `src/cli/commands/conveyor.test.ts`;
- M0-E SPEC/IMPL/VERIFY/OPS docs and roadmap trace.

## 9. Review Boundary
This slice is R3/Governed because it changes completion and recovery claim
authority.

Required review:

- L1 audit for proof model and canary fixture;
- L2 audit for claim detection and blocking behavior;
- L3 or merge authority review before merge readiness.

## 10. 制御機構選定原則
script 選定根拠: Completion claims must be evaluated deterministically from
structured proof, not from chat or session memory.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may call the same gate later, but
cannot substitute for structured proof.

GitHub 選定根拠: GitHub may host outcome evidence URIs. This slice does not
mutate GitHub.

LLM boundary: LLM output may draft a claim, but cannot satisfy the gate without
proof fields and a PASS or valid WAIVED verdict.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Claim detection | script/library | - | claim terms must be deterministic |
| Outcome proof | structured JSON | - | evidence must be inspectable |
| Negative controls | required field | - | prevents CI/audit-only overclaim |
| Waiver | explicit actor/reason | - | waiver authority must be visible |

## 11. Testing Layer
Testing layers: unit, regression, and CLI smoke coverage.

The implementation must add tests for:

- AUN recovery canary BLOCK;
- PASS proof;
- WAIVED proof with and without actor/reason;
- non-completion statements;
- CLI JSON report;
- CLI human-readable report.

## 12. Non-Goals
- Do not implement live GitHub mutation.
- Do not mutate AUN, DB, queues, Discord, launchctl, or runtime processes.
- Do not merge, approve, or draft-remove.
- Do not claim M0 complete from this PR alone; audit/merge sequencing still
  applies.
