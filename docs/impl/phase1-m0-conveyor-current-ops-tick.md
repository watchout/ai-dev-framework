---
id: IMPL-M0-CONVEYOR-309-C
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-C]
  verify: [VERIFY-M0-CONVEYOR-309-C]
  ops: [OPS-M0-CONVEYOR-309-C]
---

# M0 Conveyor Current Ops Tick IMPL

Implementation for SPEC-M0-CONVEYOR-309-C.

## Code

- `src/cli/lib/conveyor-manifest.ts`
  - adds `ConveyorCurrentOps`;
  - summarizes role lane queues;
  - derives reconcile backlog from transition plans;
  - derives dirty audit queue, merged stale cleanup, human approval, dependency
    release, and deployed commit blocker lists.
- `src/cli/commands/conveyor.ts`
  - prints current-ops counts and sections in human-readable `conveyor tick`
    output.

## Data Shape

`current_ops` is nested inside `shirube-conveyor-tick-manifest/v1` and is
read-only:

```text
schema: shirube-conveyor-current-ops/v1
safe_to_apply: false
lane_queues: <role -> count + targets>
reconcile_backlog: <safe transition plans>
dirty_audit_queue: <audit lane findings/skips>
merged_stale_state_cleanup: <merged PR cleanup recommendations>
dependency_release_candidates: <released stack dependents>
human_approval_notifications: <CEO/human approval lane>
unreviewed_deployed_commit_blockers: <deployment blockers>
```

## Boundary

The tick manifest does not execute GitHub mutations. Apply behavior remains a
future guarded slice.
