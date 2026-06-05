---
id: IMPL-M0-CONVEYOR-309-A-B
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-A-B]
  verify: [VERIFY-M0-CONVEYOR-309-A-B]
  ops: [OPS-M0-CONVEYOR-309-A-B]
---

# M0 Conveyor Audit Result And Reconcile IMPL

Implementation for SPEC-M0-CONVEYOR-309-A-B.

## Code

- `src/cli/commands/conveyor.ts`
  - expands `conveyor audit-report` with `base`, `route`, and
    `next_state_recommendation`;
  - supports `PASS`, `BLOCK`, `CHANGES_REQUESTED`, `HOLD`, `STALE_HEAD`, and
    `NEEDS_INFO`;
  - adds `--template` output for fixed audit-result handoff blocks.
- `src/cli/lib/conveyor-reconciler.ts`
  - requires fixed M0 audit-result fields before evidence can drive state;
  - records `base`, `route`, and `next_state_recommendation`;
  - emits per-PR `transition_plan`;
  - treats `STALE_HEAD`, `NEEDS_INFO`, and `HOLD` as no-transition evidence.

## Data Shape

```text
<!-- conveyor:audit-result/v1 -->
repo: <owner/repo>
pr: <number>
role: l1|l2|l3
verdict: PASS|BLOCK|CHANGES_REQUESTED|HOLD|STALE_HEAD|NEEDS_INFO
head: <current-pr-head>
base: <current-base-ref-or-sha>
route: <audit route>
next_state_recommendation: <state or no_transition>
reported_by: <actor>
recorded_at: <iso8601>
```

## Boundary

This slice remains fixture/read-only. `--apply` only applies reconciliation to
the in-memory fixture result and does not mutate GitHub.
