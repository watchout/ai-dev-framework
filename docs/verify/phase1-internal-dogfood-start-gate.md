---
id: VERIFY-DOGFOOD-222
status: Draft
traces:
  spec: [SPEC-DOGFOOD-222]
  impl: [IMPL-DOGFOOD-222]
  ops: [OPS-DOGFOOD-222]
---

# VERIFY: Phase 1 Internal Dogfood Start Gate

## 0. Corresponding SPEC
`docs/spec/phase1-internal-dogfood-start-gate.md` / SPEC-DOGFOOD-222.

## 1. L0 Required Checks
For the #222 design/spec PR:

- `git diff --check`;
- `npm run build:cli`;
- `node dist/cli/index.js trace verify`.

For the later #222 runtime PR, add focused tests for workflow state, workflow check, and start wiring.

## 2. Required Runtime Fixtures
The implementation PR must include fixtures proving strict `implementation_start` blocks when each item is missing:

| Fixture | Expected strict result |
|---------|------------------------|
| missing Goal Contract | BLOCK `G10.goal_contract.approved` |
| missing phase plan | BLOCK `G10.phase_plan.present` |
| missing task trace | BLOCK `G10.task_trace.present` |
| missing SPEC/IMPL/VERIFY/OPS readiness | BLOCK `G10.doc4l.readiness` |
| missing pre-implementation audit | BLOCK `G11.pre_impl_audit.disposition` |
| missing lifecycle evidence sink readiness | BLOCK `G18.admin_notice.sink_ready` |
| lifecycle write failure on strict pass | BLOCK `G18.admin_notice.lifecycle_record` and no session write |
| lifecycle write failure on strict block | BLOCK `G18.admin_notice.lifecycle_record` and no silent blocked exit |
| missing role binding | BLOCK existing role rule |
| role separation violation | BLOCK existing separation rule |
| missing hearing/intake confirmation | BLOCK existing hearing rule |

Each fixture must assert the rule id, decision, remediation, and action-scoped failure result.
Lifecycle fixtures must also assert that `task_start` is emitted by the same
transition that writes/resumes the session, and `blocked` is emitted by the same
transition that exits non-zero.

## 3. Start Command Verification
Required cases:

1. `shirube start --audit-level strict` exits non-zero before session write when #222 evidence is missing.
2. `shirube start --audit-level strict --dry-run` reports the same missing evidence without writing a session.
3. `shirube start --audit-level standard` does not claim strict dogfood readiness when #222 evidence is missing.
4. `shirube start --resume --audit-level strict` re-checks current evidence before resuming.
5. An existing role/separation block still produces actionable output.
6. Strict successful start writes `task_start` lifecycle evidence before
   `.framework/current-session.json` mutation.
7. Strict blocked start writes `blocked` lifecycle evidence with blocking rule
   ids before exit.
8. Lifecycle write failure prevents session mutation.

## 4. Trace Verification
The #222 4-layer docs must remain trace-complete:

- SPEC traces to IMPL/VERIFY/OPS;
- IMPL traces to SPEC/VERIFY/OPS;
- VERIFY traces to SPEC/IMPL/OPS;
- OPS traces to SPEC/IMPL/VERIFY.

## 5. Manual Audit Evidence
Required review sequence before merge:

- L1: developer workflow and scope fit;
- L2: independent audit for workflow-control behavior;
- L3: required only if the implementation PR changes strict authority semantics or is used as a phase-exit claim.

Post-merge evidence must follow POSTMERGE-001 if the PR contributes to Phase 1 exit readiness.
