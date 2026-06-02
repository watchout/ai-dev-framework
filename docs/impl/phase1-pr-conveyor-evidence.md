---
id: IMPL-PRCONVEYOREVIDENCE-267
status: Draft
traces:
  spec: [SPEC-PRCONVEYOREVIDENCE-267]
  verify: [VERIFY-PRCONVEYOREVIDENCE-267]
  ops: [OPS-PRCONVEYOREVIDENCE-267]
---

# IMPL: PR Conveyor Evidence and Audit Timing

## 1. Purpose
Implement SPEC-PRCONVEYOREVIDENCE-267 as a deterministic Markdown PR evidence
validator and template update.

## 2. Components
- `src/cli/lib/pr-evidence-validator.ts`
- `shirube check pr-evidence <files...>`
- governance PR template PR Conveyor evidence fields
- `templates/pr-evidence/iyasaka-pr-conveyor-pr-evidence.example.md`
- unit and CLI tests

## 3. Validator Behavior
The validator parses Markdown field lines such as:

```text
- Risk class: R2
- Audit timing: after_pr
```

It checks required fields, R0-R2 audit-pending behavior, R3 audit timing, R4
before-execution timing, and merge-ready claims for R3/R4.

## 4. Exit Behavior
- PASS exits 0.
- WARNING exits 0.
- BLOCK exits non-zero.

## 5. Boundary
This slice reads PR evidence only. It does not call GitHub APIs, mutate labels,
dispatch runners, or merge.
