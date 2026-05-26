---
id: IMPL-PHASECLOSURE-224
status: Draft
traces:
  spec: [SPEC-PHASECLOSURE-224]
  verify: [VERIFY-PHASECLOSURE-224]
  ops: [OPS-PHASECLOSURE-224]
---

# IMPL: Phase Closure Audit Gate

## 0. Corresponding SPEC
`docs/spec/phase1-phase-closure-audit-gate.md` /
SPEC-PHASECLOSURE-224.

## 1. Implementation Slices

### Slice A: Evidence Model
Add `phase_closure` evidence to `workflow-state/v1`.

Supported local evidence paths:

- `.framework/phase-closure.json`;
- `.framework/phase-closure.md`;
- `.framework/phase-closures/latest.json`;
- `docs/management/phase-closure.md`.

JSON is the normative shape for deterministic validation.

### Slice B: Gate Decisions
Add the `G12.phase_closure.*` rule family to the workflow state builder:

- record present;
- required fields complete;
- blockers cleared;
- carryovers justified;
- POSTMERGE evidence present.

Strict mode emits BLOCK for invalid closure evidence. Minimal and standard emit
WARN during migration.

### Slice C: Action Scoping
Add `phase_closure` to `workflow check`.

The new action scopes only to the `G12.phase_closure.*` rules. It must not
reuse implementation-start or merge-authority rules implicitly.

### Slice D: Validation Semantics
Validation is deterministic and local-first:

- required scalar fields must be non-empty;
- `completed_tasks` and `merged_prs` must be present and non-empty;
- `audit_matrix` must include L1, L2, and L3 evidence;
- `unresolved_blockers` must be present and empty for a completion claim;
- deferred/carryover items must include a justification or safety rationale;
- each merged PR must carry POSTMERGE evidence, or the record must provide an
  explicit top-level POSTMERGE evidence register.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- the #224 SPEC/IMPL/VERIFY/OPS docs.

## 3. Compatibility Rules
- Do not break existing `workflow check` action behavior.
- Do not make GitHub mandatory for local diagnosis.
- Do not treat unstructured LLM prose as closure approval.
- Do not wire automatic issue close, phase close, release, or branch
  protection.

## 4. Pre-Implementation Audit Boundary
This implementation is allowed to create deterministic local checks for #224.
Using the gate to claim any actual phase transition still requires L1/L2/L3
audit evidence for that transition.
