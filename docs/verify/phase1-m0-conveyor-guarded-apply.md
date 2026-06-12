---
id: VERIFY-M0-CONVEYOR-309-D
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-D]
  impl: [IMPL-M0-CONVEYOR-309-D]
  ops: [OPS-M0-CONVEYOR-309-D]
---

# M0 Conveyor Guarded Apply VERIFY

Verification plan for SPEC-M0-CONVEYOR-309-D.

## Focused Tests

- `src/cli/lib/conveyor-guarded-apply.test.ts`
  - dry-run operation creation;
  - unsafe operation blocking;
  - confirmation requirement;
  - live head match;
  - live head mismatch.
- `src/cli/commands/conveyor.test.ts`
  - dry-run JSON plan;
  - missing confirmation rejection.

## Commands

```text
npm test -- src/cli/lib/conveyor-guarded-apply.test.ts src/cli/commands/conveyor.test.ts
npm run type-check
```

## Expected Result

Focused tests and type-check pass before audit request.
