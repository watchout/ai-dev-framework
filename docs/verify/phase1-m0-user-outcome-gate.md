---
id: VERIFY-M0-CONVEYOR-309-E
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-E]
  impl: [IMPL-M0-CONVEYOR-309-E]
  ops: [OPS-M0-CONVEYOR-309-E]
---

# M0 User Outcome Gate VERIFY

Verification plan for SPEC-M0-CONVEYOR-309-E.

## Focused Tests

- `src/cli/lib/user-outcome-gate.test.ts`
  - AUN recovery canary BLOCK;
  - PASS proof;
  - WAIVED proof;
  - non-completion statement.
- `src/cli/commands/conveyor.test.ts`
  - JSON outcome gate report;
  - human-readable outcome gate report.

## Commands

```text
npm test -- src/cli/lib/user-outcome-gate.test.ts src/cli/commands/conveyor.test.ts
npm run type-check
```

## Expected Result

Focused tests and type-check pass before audit request.
