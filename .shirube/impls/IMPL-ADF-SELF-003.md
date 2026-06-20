# Cell Impl

- IMPL-ID: IMPL-ADF-SELF-003
- CELL-ID: CELL-ADF-SELF-003
- SPEC-ID: SPEC-ADF-SELF-003
- Risk Tier: R2

## Covered Requirements

- REQ-ADF-SELF-003-001
- REQ-ADF-SELF-003-002
- REQ-ADF-SELF-003-003
- REQ-ADF-SELF-003-004
- SEC-ADF-SELF-003-001

## Planned File Changes

| Path | Change Type | Reason | Linked REQ-IDs |
| --- | --- | --- | --- |
| `src/cli/lib/shirube-artifact-validator.ts` | add | Local `.shirube` artifact discovery, YAML subset parsing, and v1 schema validation. | REQ-ADF-SELF-003-001 |
| `src/cli/commands/conveyor.ts` | update | Register `conveyor artifacts validate` command. | REQ-ADF-SELF-003-001, REQ-ADF-SELF-003-004 |
| `src/cli/lib/conveyor-prerequisite-check.ts` | update | Recognize current `.shirube` Spec, Cell, Impl, and audit artifact paths as current PR evidence. | REQ-ADF-SELF-003-002 |
| `src/cli/lib/shirube-artifact-validator.test.ts` | add | Deterministic local validation tests. | REQ-ADF-SELF-003-003 |
| `src/cli/lib/conveyor-prerequisite-check.test.ts` | update | Current-PR `.shirube` artifact resolver regression coverage. | REQ-ADF-SELF-003-002, REQ-ADF-SELF-003-003 |
| `src/cli/commands/conveyor.test.ts` | update | CLI command JSON pass/fail coverage. | REQ-ADF-SELF-003-001, REQ-ADF-SELF-003-003 |
| `.shirube/cells/CELL-ADF-SELF-003.yaml` | update | Convert future candidate into implementation Cell. | SEC-ADF-SELF-003-001 |
| `.shirube/specs/SPEC-ADF-SELF-003.md` | add | Feature spec for the Cell. | REQ-ADF-SELF-003-001, REQ-ADF-SELF-003-002, REQ-ADF-SELF-003-003, REQ-ADF-SELF-003-004 |
| `.shirube/audits/AUDIT-ADF-SELF-003-*.yaml` | add | Structured spec and Impl audit records. | SEC-ADF-SELF-003-001 |
| `.shirube/evidence/EVIDENCE-ADF-SELF-003.yaml` | add | Structured evidence ledger entry. | SEC-ADF-SELF-003-001 |

## Planned Functions / Types / Modules

- `buildShirubeArtifactValidationReport`
- `formatShirubeArtifactValidationReport`
- dependency-free YAML subset parser for existing Shirube v1 artifact shapes
- lightweight JSON-schema constraint validator for checked-in v1 schemas
- `conveyor artifacts validate --root <path> --format json`

## API Changes

N/A. CLI-only local validation command.

## DB Changes

N/A.

## Auth and Permission Handling

The command reads local repository files only. It does not call GitHub APIs,
write comments, create checks, mutate labels, mutate protected settings, or
dispatch external automation.

## Error Handling

Invalid YAML, unsupported schema versions, missing schema files, missing required
fields, type mismatches, enum/const/pattern mismatches, additional schema
properties, and malformed artifact roots produce deterministic `BLOCKED` JSON.

## Logging and Audit Logging

JSON output is the durable machine-readable evidence. Human-readable output is
available when JSON is not requested.

## Tests to Add or Update

- TEST-MAP-ADF-SELF-003: Run targeted validator, conveyor resolver, and command tests; run local artifact validation command; run diff, lint, type-check, build, and PR conveyor check.

## Implementation Order

1. Add local artifact validator library.
2. Register separate CLI command.
3. Harden `.shirube` current-PR artifact path predicates in conveyor prerequisite check.
4. Add deterministic tests.
5. Update Shirube Cell records.
6. Open draft PR for Shirube command review.

## Risks

- YAML parsing is intentionally dependency-free and scoped to repository Shirube artifact shapes. If future YAML features are needed, a later Cell can approve dependency or parser expansion.
- Local validation is separate from required checks in this Cell. Future enforcement requires a separate approved Cell.

## Rollback Method

Single PR revert removes the local validator, command registration, tests, and
Cell records. No protected settings, workflows, target repositories, or external
state need rollback.
