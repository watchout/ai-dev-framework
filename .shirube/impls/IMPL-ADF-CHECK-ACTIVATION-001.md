# Cell Impl

- IMPL-ID: IMPL-ADF-CHECK-ACTIVATION-001
- CELL-ID: CELL-ADF-SELF-002
- SPEC-ID: SPEC-ADF-CHECK-ACTIVATION-001
- Risk Tier: R2

## Covered Requirements

- REQ-ADF-CHECK-001
- REQ-ADF-CHECK-002
- REQ-ADF-CHECK-003
- REQ-ADF-CHECK-004
- SEC-ADF-CHECK-001

## Planned File Changes

| Path | Change Type | Reason | Linked REQ-IDs |
| --- | --- | --- | --- |
| `.shirube/specs/SPEC-ADF-CHECK-ACTIVATION-001.md` | add | Feature spec for required-check activation planning. | REQ-ADF-CHECK-001, REQ-ADF-CHECK-002, REQ-ADF-CHECK-003, REQ-ADF-CHECK-004, SEC-ADF-CHECK-001 |
| `.shirube/cells/CELL-ADF-SELF-002.yaml` | update | Convert draft candidate into the planning-only Cell for this slice. | REQ-ADF-CHECK-001, REQ-ADF-CHECK-002, REQ-ADF-CHECK-003, REQ-ADF-CHECK-004, SEC-ADF-CHECK-001 |
| `.shirube/impls/IMPL-ADF-CHECK-ACTIVATION-001.md` | add | Implementation plan for documentation/planning artifacts only. | REQ-ADF-CHECK-001, SEC-ADF-CHECK-001 |
| `.shirube/audits/AUDIT-ADF-CHECK-ACTIVATION-SPEC-001.yaml` | add | Structured spec audit record. | SEC-ADF-CHECK-001 |
| `.shirube/audits/AUDIT-ADF-CHECK-ACTIVATION-IMPL-001.yaml` | add | Structured Impl audit record. | SEC-ADF-CHECK-001 |
| `.shirube/evidence/EVIDENCE-ADF-CHECK-ACTIVATION-001.yaml` | add | Structured evidence ledger entry for this planning slice. | REQ-ADF-CHECK-001, SEC-ADF-CHECK-001 |
| `docs/activation/shirube-conveyor-required-check-plan.md` | add | Human-readable activation plan for future command review. | REQ-ADF-CHECK-001, REQ-ADF-CHECK-002, REQ-ADF-CHECK-003, REQ-ADF-CHECK-004 |

## Planned Functions / Types / Modules

N/A. This is documentation and planning only.

## API Changes

N/A.

## DB Changes

N/A.

## Auth and Permission Handling

No auth or permission behavior changes. The plan documents future owner approval
requirements but does not create or modify enforcement.

## Error Handling

N/A. No runtime error path changes.

## Logging and Audit Logging

No runtime logging changes. Structured audit and evidence records are added for
Shirube command review.

## Tests to Add or Update

- TEST-MAP-ADF-CHECK-ACTIVATION-001: Run YAML parse, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, and conveyor check against the opened PR.

## Implementation Order

1. Add the activation planning spec.
2. Update `CELL-ADF-SELF-002` as the planning-only Cell.
3. Add the implementation plan.
4. Add audit and evidence records.
5. Add the activation plan document.
6. Open draft PR for Shirube command review.
7. Run conveyor check against the PR.
8. Stop without activating required checks.

## Risks

- Planning text could be mistaken for activation. Mitigation: all artifacts state that this slice does not enable required checks or protected settings.
- Later required-check activation could block emergency work if designed too narrowly. Mitigation: the plan requires emergency human intervention and rollback procedures before activation.
- Target repositories could be included prematurely. Mitigation: eligible repositories require explicit repo-spec owner confirmation and later approval.

## Rollback Method

Single PR revert removes the planning artifacts. Because this slice does not
enable enforcement, rollback has no branch protection, workflow, runtime, or
target repository effect.
