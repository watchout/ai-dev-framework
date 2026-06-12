---
id: VERIFY-COMPLETION-GATE-326
status: Draft
traces:
  spec: [SPEC-COMPLETION-GATE-326]
  impl: [IMPL-COMPLETION-GATE-326]
  ops: [OPS-COMPLETION-GATE-326]
---

# VERIFY: Work Order / PR Completion Gate

## 0. Corresponding SPEC
`docs/spec/phase1-completion-gate.md` /
SPEC-COMPLETION-GATE-326.

## 1. Required Checks
- `npm test -- src/cli/lib/complete-engine.test.ts src/cli/commands/cli-commands-extended.test.ts`;
- `npm run type-check`;
- `npm run build:cli`;
- `npm run lint`;
- `git diff --check`;
- `npm audit --audit-level=high`;
- `npm test`;
- `node dist/cli/index.js trace verify`.

## 2. Required Fixtures
The test layer must prove:

| Fixture | Expected result |
| --- | --- |
| all required stages passed, no defects | `PASS` |
| any blocking defect | `FAIL` and non-passable |
| missing required stage evidence | `BLOCKED` and non-passable |
| live processing applicable but missing | `BLOCKED` |
| valid accepted debt | `CONDITIONAL PASS` and passable |
| accepted debt missing metadata | `BLOCKED` |
| material out-of-scope finding without follow-up | `BLOCKED` |
| CLI `--gate-file --json` | machine-readable report |
| CLI blocking defect fixture | non-zero exit |

## 3. Review Boundary
L1 audit and QA/check are required before relying on this gate for completion
evidence. CTO review is required before policy adoption on protected governance
or merge-authority surfaces.
