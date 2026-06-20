# Cell Impl

- IMPL-ID: IMPL-ADF-PHASE-001
- CELL-ID: CELL-ADF-PHASE-001
- SPEC-ID: SPEC-ADF-PHASE-001
- Risk Tier: R2

## Covered Requirements

- REQ-ADF-PHASE-001
- REQ-ADF-PHASE-002
- REQ-ADF-PHASE-003
- REQ-ADF-PHASE-004
- REQ-ADF-PHASE-005
- REQ-ADF-PHASE-006
- REQ-ADF-PHASE-007
- REQ-ADF-PHASE-008
- REQ-ADF-PHASE-009
- SEC-ADF-PHASE-001

## Planned File Changes

| Path | Change Type | Reason | Linked REQ-IDs |
| --- | --- | --- | --- |
| `src/cli/lib/phase-conveyor.ts` | add | Deterministic phase state-machine and evidence classifier. | REQ-ADF-PHASE-002 through REQ-ADF-PHASE-009 |
| `src/cli/commands/phase.ts` | add | CLI command `shirube phase check <PR> --format json`. | REQ-ADF-PHASE-001, REQ-ADF-PHASE-002 |
| `src/cli/index.ts` | update | Register the new phase command. | REQ-ADF-PHASE-001 |
| `src/cli/lib/phase-conveyor.test.ts` | add | Regression tests for required phase and evidence rules. | REQ-ADF-PHASE-003 through REQ-ADF-PHASE-009 |
| `src/cli/commands/phase.test.ts` | add | Command-level JSON and exit-code coverage. | REQ-ADF-PHASE-001, REQ-ADF-PHASE-002 |
| `.shirube/specs/SPEC-ADF-PHASE-001.md` | add | Feature spec and trace matrix. | REQ-ADF-PHASE-001 through REQ-ADF-PHASE-009, SEC-ADF-PHASE-001 |
| `.shirube/cells/CELL-ADF-PHASE-001.yaml` | add | Cell record for bounded implementation. | REQ-ADF-PHASE-001, SEC-ADF-PHASE-001 |
| `.shirube/impls/IMPL-ADF-PHASE-001.md` | add | Implementation record. | REQ-ADF-PHASE-001, SEC-ADF-PHASE-001 |
| `.shirube/audits/AUDIT-ADF-PHASE-SPEC-001.yaml` | add | Structured spec audit record. | SEC-ADF-PHASE-001 |
| `.shirube/audits/AUDIT-ADF-PHASE-IMPL-001.yaml` | add | Structured Impl audit record. | SEC-ADF-PHASE-001 |
| `.shirube/evidence/EVIDENCE-ADF-PHASE-001.yaml` | add | Evidence ledger entry. | REQ-ADF-PHASE-002, SEC-ADF-PHASE-001 |

## Planned Functions / Types / Modules

- `buildShirubePhaseCheck(input)`: derives deterministic phase, verdict, blockers, warnings, required evidence, and observed evidence from structured PR facts.
- `registerPhaseCommand(program)`: exposes `shirube phase check`.
- Live GitHub PR reader: reads PR metadata, changed file paths, selected changed artifact bodies, and approved repo-spec baseline paths without mutating GitHub.

## API Changes

N/A. This is a CLI command addition, not a service API change.

## DB Changes

N/A.

## Auth and Permission Handling

The live command uses `gh` read operations for PR metadata, repository tree
paths, and selected text artifact contents. It does not write labels, comments,
checks, statuses, branch protection, rulesets, target repositories, AUN,
Discord, DB, queue, LaunchAgent, production, or deploy resources.

## Error Handling

The command exits nonzero for malformed input, unsupported output format,
GitHub read failures that prevent PR metadata loading, or a `BLOCKED` phase
verdict. JSON mode returns a deterministic error object for command errors.

## Logging and Audit Logging

No external audit log or GitHub Check is created. The CLI prints the JSON phase
report for handoff evidence.

## Tests to Add or Update

- TEST-MAP-ADF-PHASE-001: focused library tests for repo-spec draft, premise
  required, premise draft, inventory required, parent-gate violation, narrative
  confirmation rejection, and execution readiness.
- TEST-MAP-ADF-PHASE-001: command tests for JSON output and nonzero `BLOCKED`
  verdict exit behavior.

## Implementation Order

1. Add deterministic phase checker library.
2. Add phase command and register it in the CLI.
3. Add focused library and command tests.
4. Add Shirube spec, Cell, Impl, audit, and evidence records.
5. Run validation.
6. Open draft PR for Shirube command review.

## Risks

- Overbroad repo tree artifact detection could hide missing evidence. Mitigation: repo tree use is limited to approved repo-spec baseline paths; other gates rely on PR metadata, changed artifacts, or explicit structured references.
- Narrative claims could be mistaken for approvals. Mitigation: confirmation claims without structured refs are surfaced as insufficient evidence.
- Future enforcement could accidentally become required. Mitigation: this slice does not edit workflows, branch protection, rulesets, or required checks.

## Rollback Method

Single PR revert removes the command, tests, and governance records. No
workflow, required check, branch protection, ruleset, target repository,
production, or deploy rollback is required.
