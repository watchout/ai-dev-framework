---
id: VERIFY-M0-CONVEYOR-309-A-B
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-A-B]
  impl: [IMPL-M0-CONVEYOR-309-A-B]
  ops: [OPS-M0-CONVEYOR-309-A-B]
---

# M0 Conveyor Audit Result And Reconcile VERIFY

Verification plan for SPEC-M0-CONVEYOR-309-A-B.

## Focused Tests

- `src/cli/lib/conveyor-reconciler.test.ts`
  - fixed evidence parsing;
  - L1/L2/L3 PASS transition planning;
  - `STALE_HEAD` and `NEEDS_INFO` no-transition handling;
  - missing fixed fields rejection;
  - label-only pass rejection;
  - dependency blocker handling.
- `src/cli/commands/conveyor.test.ts`
  - fixed `audit-report` evidence block;
  - L1/L2/L3 template rendering path.
- Existing conveyor manifest, label-sync, and audit-sweeper tests cover
  downstream use of fixed evidence.

## Commands

```text
npm test -- src/cli/lib/conveyor-reconciler.test.ts src/cli/commands/conveyor.test.ts src/cli/lib/conveyor-manifest.test.ts src/cli/lib/conveyor-label-sync.test.ts src/cli/lib/conveyor-audit-sweeper.test.ts
npm run type-check
```

## Expected Result

All focused tests and type-check pass before PR evidence is posted.
