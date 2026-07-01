# Shirube Local Artifact Validation Hardening

SPEC-ID: SPEC-ADF-SELF-003
Risk Tier: R2

## Background

`CELL-ADF-SELF-003` is the local preflight and artifact resolver hardening Cell
for `ai-dev-framework`. Earlier conveyor work made PR prerequisite checks
deterministic, but local `.shirube` artifact validation was still split between
workflow-local scripts and narrative records.

## Purpose

Add deterministic local validation for Shirube v1 artifacts and harden current
PR artifact resolution so machine facts remain based on current changed files,
explicit IDs, explicit artifact paths or URLs, or approved repo baseline only.

## Non-goals

- This spec does not enable required checks.
- This spec does not modify branch protection.
- This spec does not modify rulesets.
- This spec does not modify active GitHub workflows.
- This spec does not change package files or add dependencies.
- This spec does not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation.
- This spec does not mutate target repositories.

## Target Scope

- `src/cli/lib/shirube-artifact-validator.ts`
- `src/cli/lib/shirube-artifact-validator.test.ts`
- `src/cli/lib/conveyor-prerequisite-check.ts`
- `src/cli/lib/conveyor-prerequisite-check.test.ts`
- `src/cli/commands/conveyor.ts`
- `src/cli/commands/conveyor.test.ts`
- `.shirube/**`

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-SELF-003-001 | Add a deterministic local CLI validation command for `.shirube` repo-spec, agent-policy, Cell, audit-result, and evidence artifacts against checked-in v1 schemas. |
| REQ-ADF-SELF-003-002 | Ensure current PR artifact evidence is resolved only from changed files, explicit IDs, explicit artifact paths or URLs, or approved repo-spec baseline. |
| REQ-ADF-SELF-003-003 | Add deterministic tests for schema validation pass/fail behavior and `.shirube` current-PR artifact resolution. |
| REQ-ADF-SELF-003-004 | Keep conveyor integration bounded; expose local validation as a separate command and document future integration. |
| SEC-ADF-SELF-003-001 | Do not enable required checks, mutate protected settings, change active workflows, change package files, mutate target repositories, or activate AUN/multi-agent automation. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-SELF-003-001 | REQ-ADF-SELF-003-001 | `shirube conveyor artifacts validate --root . --format json` emits deterministic JSON with schema `shirube-artifact-validation/v1`. |
| AC-ADF-SELF-003-002 | REQ-ADF-SELF-003-001 | The validator checks required fields, type shape, const/enum/pattern, additional properties, nested objects, and arrays for the targeted v1 schemas. |
| AC-ADF-SELF-003-003 | REQ-ADF-SELF-003-002 | `.shirube` Spec, Cell, Impl, and audit files changed by the current PR satisfy the matching conveyor artifact facts without relying on unrelated historical repo files. |
| AC-ADF-SELF-003-004 | REQ-ADF-SELF-003-003 | Tests cover valid local artifacts, schema-extra Cell fields, invalid evidence audit result shape, CLI JSON output, and current-PR `.shirube` resolver behavior. |
| AC-ADF-SELF-003-005 | REQ-ADF-SELF-003-004 | Required-check activation and deeper workflow integration are explicitly left for later approved Cells. |
| AC-ADF-SELF-003-006 | SEC-ADF-SELF-003-001 | The PR does not modify branch protection, rulesets, active workflows, package files, deploy files, production behavior, target repositories, AUN, or multi-agent automation. |

## Negative Cases

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-NEG-ADF-SELF-003-001 | REQ-ADF-SELF-003-001 | A Cell artifact with schema-extra fields such as `status` must be `BLOCKED`. |
| AC-NEG-ADF-SELF-003-002 | REQ-ADF-SELF-003-001 | Evidence `audit_results` must be a string array, not maps. |
| AC-NEG-ADF-SELF-003-003 | REQ-ADF-SELF-003-002 | Historical repo files must not satisfy current PR feature spec, Cell, Impl, audit, trace, test-map, or execution-contract gates without explicit current evidence. |

## Impact

- Security impact: local validation only; no secrets, protected settings, or external mutation.
- Privacy impact: N/A.
- AI usage impact: N/A; no agent dispatch is activated.
- Data impact: local repository artifact reads only.
- API changes: N/A.
- DB changes: N/A.
- Audit log requirements: CLI JSON output and test results provide evidence.

## Migration Plan

No migration. This is an additive CLI validation command and resolver hardening.
Future required-check or active workflow integration must be covered by separate
approved Cells.

## Rollback Plan

Single PR revert removes the new local validator, command registration, tests,
and Cell records. No protected settings or external state need rollback.

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-SELF-003 | REQ-ADF-SELF-003-001, REQ-ADF-SELF-003-002, REQ-ADF-SELF-003-003, REQ-ADF-SELF-003-004, SEC-ADF-SELF-003-001 | Run `npx vitest run src/cli/lib/shirube-artifact-validator.test.ts src/cli/lib/conveyor-prerequisite-check.test.ts src/cli/commands/conveyor.test.ts`, `npx tsx src/cli/index.ts conveyor artifacts validate --root . --format json`, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, and conveyor check against the opened PR. |

## Trace Matrix

TRACE-ADF-SELF-003

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-SELF-003-001 | CELL-ADF-SELF-003 | IMPL-ADF-SELF-003 | EVIDENCE-ADF-SELF-003 |
| REQ-ADF-SELF-003-002 | CELL-ADF-SELF-003 | IMPL-ADF-SELF-003 | EVIDENCE-ADF-SELF-003 |
| REQ-ADF-SELF-003-003 | CELL-ADF-SELF-003 | IMPL-ADF-SELF-003 | EVIDENCE-ADF-SELF-003 |
| REQ-ADF-SELF-003-004 | CELL-ADF-SELF-003 | IMPL-ADF-SELF-003 | EVIDENCE-ADF-SELF-003 |
| SEC-ADF-SELF-003-001 | CELL-ADF-SELF-003 | IMPL-ADF-SELF-003 | EVIDENCE-ADF-SELF-003 |

## Future Integration

The local validator is intentionally exposed as a separate command in this Cell.
Wiring it into required checks or protected workflow enforcement requires a
later approved Cell.
