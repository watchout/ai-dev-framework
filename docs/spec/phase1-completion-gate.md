---
id: SPEC-COMPLETION-GATE-326
status: Draft
traces:
  impl: [IMPL-COMPLETION-GATE-326]
  verify: [VERIFY-COMPLETION-GATE-326]
  ops: [OPS-COMPLETION-GATE-326]
---

# SPEC: Work Order / PR Completion Gate

## 0. Meta
- Origin Issue: #326
- Phase: Phase 1 internal applied dogfood
- Task: Completion criteria with defect classification

## 1. Purpose
Prevent Work Order or PR completion claims from oscillating between endless
bug-zero rework and unsafe completion. Completion requires zero blocking
defects, required evidence for every gate stage, and explicit classification
for all residual findings.

This gate does not make green CI, AUN ACKs, queue ids, or chat-only statements
sufficient completion evidence.

## 2. Required Gate Stages
The deterministic report must evaluate:

1. Scope Gate;
2. Contract Gate;
3. Implementation Evidence Gate;
4. Audit Gate;
5. QA/Check Gate;
6. Live Processing Gate when applicable;
7. Completion Aggregator.

Required stages must have `status: "pass"` and at least one concrete
`evidence_refs` entry. Live Processing is required only when the input marks it
applicable or the stage itself declares `required: true`.

## 3. Defect Classification
Residual defects must be classified as:

- `blocking`: prevents `PASS`;
- `accepted_debt`: allowed only with owner, issue, severity, reason, due
  condition/date, and evidence;
- `out_of_scope`: allowed only with evidence, plus a follow-up issue or URI
  when material.

Unknown or incomplete classifications block completion.

## 4. Verdicts
The Completion Aggregator emits:

- `PASS`: all required stages passed and no residual defects remain;
- `CONDITIONAL PASS`: all required stages passed and only valid accepted debt
  or out-of-scope findings remain;
- `FAIL`: any blocking defect remains;
- `BLOCKED`: required evidence or classification metadata is missing.

Only `PASS` and `CONDITIONAL PASS` are passable. `CONDITIONAL PASS` is not a
waiver of downstream audit, QA/check, or CTO review.

## 5. CLI Contract
`shirube complete --gate-file <path> --json` reads a
`shirube-completion-gate-input/v1` JSON file and emits a
`shirube-completion-gate-report/v1` report. Human-readable output is available
without `--json`.

The command exits non-zero for `FAIL` and `BLOCKED`.

## 6. Non-Goals
- Do not merge, approve, remove draft state, or mutate branch protection.
- Do not auto-waive blocking defects.
- Do not collapse implementation, audit, QA/check, or CTO authority.
- Do not make AUN ACKs or queue ids completion evidence.

## 7. Acceptance Criteria
- A clean input with all required stage evidence and no residual defects emits
  `PASS`.
- Any `blocking` defect emits `FAIL` and `can_pass: false`.
- Missing required stage evidence emits `BLOCKED` and `can_pass: false`.
- Live Processing Gate is required only when explicitly applicable.
- Valid `accepted_debt` emits `CONDITIONAL PASS` only when owner, issue,
  severity, reason, due condition/date, and evidence are present.
- Material `out_of_scope` findings require evidence and a follow-up issue or
  URI.
- CLI JSON output is machine-readable and includes stage reports, defects,
  findings, aggregator verdict, authority notes, and next required review.

Acceptance scenario for strict completion:

```gherkin
Given a Work Order completion input has all required stage evidence
And it records one valid accepted debt item with owner, issue, severity, reason, due, and evidence
When the operator runs `shirube complete --gate-file completion-gate.json --json`
Then the report emits `CONDITIONAL PASS`
And the report remains machine-readable as `shirube-completion-gate-report/v1`
And no blocking defect is auto-waived
```

## 8. Evidence Projection
Completion gate evidence is projected as:

- local CLI JSON from `shirube complete --gate-file <path> --json`;
- human-readable CLI output from `shirube complete --gate-file <path>`;
- PR comments that paste or link the deterministic report;
- CI output proving the evaluator and fixtures pass.

GitHub reviews, CI checks, PR comments, and runtime evidence are valid evidence
refs. AUN ACKs, queue ids, and transient chat messages are not completion
evidence.

## 9. Manual Review Boundary
L1 audit and QA/check are required before relying on this gate for PR or Work
Order completion evidence. L2/L3 and CTO are required before policy adoption on
protected governance, merge authority, runtime recovery, or production-impacting
surfaces.

Implementation output is not self-approval. The implementation role may produce
the report and handoff, but audit, QA/check, and CTO decisions must remain
separate roles.

## 10. 制御機構選定原則
script 選定根拠: completion criteria must be deterministic, replayable, and
machine-readable. A TypeScript CLI evaluator is the primary control because it
can fail closed, emit stable JSON, and be covered by fixtures.

Hook 選定根拠: Hook は不採用。The unavoidable 4 case rule is therefore not
invoked in this slice. The four hook cases are explicitly out of scope here: no
pre-tool blocking, no context injection, no session state recovery, and no
post-tool or completion-time verification hook. If a later reviewed slice
invokes this evaluator from a hook, the hook must remain a wrapper around the
script-controlled report and must not become canonical completion evidence.

MCP/GitHub 選定根拠: GitHub PR comments, reviews, CI checks, and runtime evidence
are projection and review surfaces. They may carry evidence refs, but the local
completion report schema remains the deterministic artifact. MCP/AUN
notifications are auxiliary and must not be treated as completion authority.

## 11. Testing Layer
The testing layer is unit and regression focused, with CLI smoke coverage for
the command boundary. It must cover:

- all required stages passing with no residual defects;
- blocking defects;
- missing required stage evidence;
- live processing applicable but missing;
- valid accepted debt;
- accepted debt missing owner, issue, severity, reason, due, or evidence;
- material out-of-scope findings without follow-up;
- CLI JSON output and non-zero exit for non-passable reports.
