---
id: IMPL-DOGFOOD-222
status: Draft
traces:
  spec: [SPEC-DOGFOOD-222]
  verify: [VERIFY-DOGFOOD-222]
  ops: [OPS-DOGFOOD-222]
---

# IMPL: Phase 1 Internal Dogfood Start Gate

## 0. Corresponding SPEC
`docs/spec/phase1-internal-dogfood-start-gate.md` / SPEC-DOGFOOD-222.

## 1. Implementation Slices

### Slice A: Evidence Model
Extend `workflow-state/v1` so workflow evidence can represent:

- Goal Contract;
- phase plan;
- task trace;
- DOC4L readiness;
- pre-implementation audit disposition;
- lifecycle notification record.

Evidence readers must be deterministic and local-first. GitHub issue or PR comments may be consumed later as adapters, but #222 must not require network access for local diagnosis.

### Slice B: Gate Decisions
Add #222 rule decisions to the workflow state builder:

- `G10.goal_contract.approved`;
- `G10.phase_plan.present`;
- `G10.task_trace.present`;
- `G10.doc4l.readiness`;
- `G11.pre_impl_audit.disposition`;
- `G18.admin_notice.lifecycle_record`.

The decision output must follow the existing `WorkflowGateDecision` contract: rule id, gate, decision, severity, profile, message, evidence refs, remediation, and deterministic flag.

### Slice C: Action Scoping
Add the #222 rules to `implementation_start` in `workflow-observability.ts`.

Do not add these rules to `remote_publish`, `merge`, or `release` unless separately specified. Those actions remain governed by their existing publish/merge authority rules and later phase work.

### Slice D: Start Wiring
Wire `start.ts` to evaluate `implementation_start` for strict starts before writing or resuming `.framework/current-session.json`.

Required behavior:

- strict + non-dry-run: BLOCK exits non-zero before session mutation;
- strict + dry-run: print diagnostic readiness without writing a session;
- minimal/standard: keep migration-safe warnings unless a rule is already a hard block in that profile;
- existing role/separation checks must remain compatible with the new workflow check.

### Slice E: Local Lifecycle Record
Add a minimal local lifecycle evidence path for #222, such as `.framework/lifecycle-events.jsonl`, if no reusable audit-log model already satisfies the requirement.

The record format must be append-only and include event type, task id, phase, actor, timestamp, destination/fallback, and result. External delivery adapters remain #229.

## 2. File-Level Impact
Likely touched files:

- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/start.ts`;
- `src/cli/commands/workflow.test.ts`;
- new or existing focused tests for `start`;
- `docs/specs/phase1-internal-dogfood-start.md` if the phase trace needs update.

## 3. Data Shape
Use existing `WorkflowEvidenceRecord` unless a new model is strictly needed. Preferred evidence kinds:

```text
goal_contract
phase_plan
task_trace
validator_result
audit
read_receipt
```

If the current union does not include a precise kind, add only the minimum names needed for deterministic filtering. Do not encode this as untyped text in `metadata` alone.

## 4. Compatibility Rules
- Do not break existing `workflow check` fixtures for hearing, roles, remote publish, or merge authority.
- Do not make GitHub mandatory.
- Do not allow a GitHub Issue alone to satisfy Goal Contract approval or pre-implementation audit.
- Do not make local hooks the source of truth.
- Do not treat LLM-generated prose as PASS evidence unless it is linked to an approved human/auditor disposition record.

## 5. Pre-Implementation Audit Boundary
This IMPL document is the implementation plan. Code changes for #222 should proceed only after L1/L2 pre-implementation review confirms:

- scope is limited to start/run readiness and workflow state;
- #229 is represented as lifecycle evidence but not adapter delivery;
- strict blocking behavior is covered by fixtures;
- non-strict migration behavior is explicit.
