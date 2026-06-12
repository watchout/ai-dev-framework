---
id: OPS-COMPLETION-GATE-326
status: Draft
traces:
  spec: [SPEC-COMPLETION-GATE-326]
  impl: [IMPL-COMPLETION-GATE-326]
  verify: [VERIFY-COMPLETION-GATE-326]
---

# OPS: Work Order / PR Completion Gate

## 0. Corresponding SPEC
`docs/spec/phase1-completion-gate.md` /
SPEC-COMPLETION-GATE-326.

## 1. Operator Flow
1. Collect PR-local evidence links for scope, contract, implementation, audit,
   QA/check, and live processing when applicable.
2. Classify every residual finding as `blocking`, `accepted_debt`, or
   `out_of_scope`.
3. Run `shirube complete --gate-file completion-gate.json --json`.
4. Paste the JSON or human-readable report into the PR as completion evidence.
5. Route to L1 audit, QA/check, and CTO when protected policy adoption applies.

## 2. Safety Rules
- `FAIL` and `BLOCKED` are not complete.
- `CONDITIONAL PASS` requires downstream review and does not waive blockers.
- AUN ACKs, queue ids, green CI alone, and chat-only claims are not completion
  evidence.
- Implementation bots must not self-approve the report.

## 3. Rollback / Recovery
This slice is read-only for gate evaluation. If a report is wrong, correct the
input JSON or implementation and regenerate the PR-local evidence. No runtime
or database recovery action is needed for the gate command itself.
