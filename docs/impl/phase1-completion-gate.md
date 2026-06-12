---
id: IMPL-COMPLETION-GATE-326
status: Draft
traces:
  spec: [SPEC-COMPLETION-GATE-326]
  verify: [VERIFY-COMPLETION-GATE-326]
  ops: [OPS-COMPLETION-GATE-326]
---

# IMPL: Work Order / PR Completion Gate

## 0. Corresponding SPEC
`docs/spec/phase1-completion-gate.md` /
SPEC-COMPLETION-GATE-326.

## 1. Implementation Surface
- `src/cli/lib/complete-model.ts` defines the input, report, stage, defect,
  finding, and verdict types.
- `src/cli/lib/complete-engine.ts` evaluates required stage evidence, defect
  classification metadata, final verdict, and human-readable report output.
- `src/cli/commands/complete.ts` adds `--gate-file` and `--json` without
  removing the existing post-merge evidence recording flow.

## 2. Behavior
The evaluator is deterministic and read-only. It treats missing required stage
evidence as `BLOCKED`, blocking defects as `FAIL`, valid accepted debt or
out-of-scope findings as `CONDITIONAL PASS`, and clean evidence as `PASS`.

The implementation intentionally keeps completion authority separate from the
implementation role. Reports include the next review path so PR evidence can be
handed to L1 audit, QA/check, and CTO when protected policy adoption applies.

## 3. Boundaries
The command does not contact GitHub, AUN, Discord, runtime daemons, or databases.
It does not merge, approve, label, deploy, or alter state outside stdout and the
existing complete evidence file path used by the older `--pr` flow.
