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
