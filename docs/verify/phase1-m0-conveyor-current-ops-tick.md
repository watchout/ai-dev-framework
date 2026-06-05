---
id: VERIFY-M0-CONVEYOR-309-C
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-C]
  impl: [IMPL-M0-CONVEYOR-309-C]
  ops: [OPS-M0-CONVEYOR-309-C]
---

# M0 Conveyor Current Ops Tick VERIFY

Verification plan for SPEC-M0-CONVEYOR-309-C.

## Focused Tests

- `src/cli/lib/conveyor-manifest.test.ts`
  - current-ops schema and safe-to-apply boundary;
  - lane queue counts;
  - reconcile backlog;
  - dirty audit queue;
  - merged stale cleanup;
  - dependency release candidates;
  - human approval notifications;
  - unreviewed deployed commit blockers.
- `src/cli/commands/conveyor.test.ts`
  - JSON `current_ops` output;
  - human-readable current-ops sections.

## Commands

```text
npm test -- src/cli/lib/conveyor-manifest.test.ts src/cli/commands/conveyor.test.ts
npm run type-check
```

## Expected Result

Focused tests and type-check pass before the PR requests audit.
