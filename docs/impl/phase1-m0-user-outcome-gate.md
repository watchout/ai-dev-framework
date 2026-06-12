---
id: IMPL-M0-CONVEYOR-309-E
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-E]
  verify: [VERIFY-M0-CONVEYOR-309-E]
  ops: [OPS-M0-CONVEYOR-309-E]
---

# M0 User Outcome Gate IMPL

Implementation for SPEC-M0-CONVEYOR-309-E.

## Code

- `src/cli/lib/user-outcome-gate.ts`
  - evaluates claim text and structured outcome proof;
  - detects done/complete/recovered/usable claims;
  - blocks missing, FAIL, NEEDS_INFO, and incomplete waiver proof.
- `src/cli/commands/conveyor.ts`
  - adds `conveyor outcome-gate`;
  - prints JSON and human-readable reports.

## Boundary

The gate is read-only and does not mutate GitHub, runtime, AUN, DB, queues, or
Discord.
