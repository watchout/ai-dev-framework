---
id: IMPL-M0-CONVEYOR-309-D
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-D]
  verify: [VERIFY-M0-CONVEYOR-309-D]
  ops: [OPS-M0-CONVEYOR-309-D]
---

# M0 Conveyor Guarded Apply IMPL

Implementation for SPEC-M0-CONVEYOR-309-D.

## Code

- `src/cli/lib/conveyor-guarded-apply.ts`
  - builds guarded label/comment apply plans from label sync plans;
  - lists allowed and forbidden operations;
  - requires explicit live confirmation;
  - checks live PR head through an adapter before mutation.
- `src/cli/commands/conveyor.ts`
  - adds `conveyor labels apply`;
  - defaults to dry-run;
  - uses `gh` only after `--apply --confirm-live-github`.

## Boundary

The only live operations available through the adapter are PR label edits and a
guarded apply comment. Merge, approval, draft removal, deploy, restart, DB,
queue, Discord, and AUN paths are not exposed.
