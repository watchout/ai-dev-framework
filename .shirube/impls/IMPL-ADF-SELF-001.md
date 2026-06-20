# Cell Impl

- IMPL-ID: IMPL-ADF-SELF-001
- CELL-ID: CELL-ADF-SELF-001
- SPEC-ID: SPEC-ADF-SELF-001
- Risk Tier: R2

## Covered Requirements

- REQ-ADF-SELF-001
- REQ-ADF-SELF-002
- REQ-ADF-SELF-003
- REQ-ADF-SELF-004
- SEC-ADF-SELF-001

## Planned File Changes

| Path | Change Type | Reason | Linked REQ-IDs |
| --- | --- | --- | --- |
| `.shirube/repo-spec.yaml` | add | Repository premise spec for ai-dev-framework. | REQ-ADF-SELF-001 |
| `.shirube/agent-policy.yaml` | add | Agent-neutral bounded execution policy. | REQ-ADF-SELF-002 |
| `.shirube/specs/SPEC-ADF-SELF-001.md` | add | Feature spec for this self-application slice. | REQ-ADF-SELF-001, REQ-ADF-SELF-002, REQ-ADF-SELF-003, REQ-ADF-SELF-004 |
| `.shirube/cells/CELL-ADF-SELF-001.yaml` | add | Implemented Cell for this scaffold slice. | REQ-ADF-SELF-003 |
| `.shirube/cells/CELL-ADF-SELF-002.yaml` | add | Draft candidate for required-check activation planning. | REQ-ADF-SELF-003 |
| `.shirube/cells/CELL-ADF-SELF-003.yaml` | add | Draft candidate for local preflight artifact resolver planning. | REQ-ADF-SELF-003 |
| `.shirube/cells/CELL-ADF-SELF-004.yaml` | add | Draft candidate for multi-agent conveyor planning. | REQ-ADF-SELF-003 |
| `.shirube/cells/CELL-ADF-SELF-005.yaml` | add | Draft candidate for target repo rollout monitoring planning. | REQ-ADF-SELF-003 |
| `.shirube/audits/AUDIT-ADF-SELF-SPEC-001.yaml` | add | Structured spec audit record. | REQ-ADF-SELF-004 |
| `.shirube/audits/AUDIT-ADF-SELF-IMPL-001.yaml` | add | Structured Impl audit record. | REQ-ADF-SELF-004 |
| `.shirube/evidence/EVIDENCE-ADF-SELF-001.yaml` | add | Structured evidence ledger entry. | REQ-ADF-SELF-004 |
| `.shirube/contracts/.gitkeep` | add | Reserve contract artifact directory. | REQ-ADF-SELF-002 |
| `.shirube/waivers/.gitkeep` | add | Reserve waiver artifact directory. | REQ-ADF-SELF-004 |

## Planned Functions / Types / Modules

N/A. This is scaffold-only and does not change runtime code.

## API Changes

N/A.

## DB Changes

N/A.

## Auth and Permission Handling

No auth or permission behavior changes. The agent policy documents boundaries only.

## Error Handling

N/A. No runtime error path changes.

## Logging and Audit Logging

No runtime logging changes. Structured audit records are added under `.shirube/audits/`.

## Tests to Add or Update

- TEST-MAP-ADF-SELF-001: Run repository checks and conveyor check against the PR after it is opened.

## Implementation Order

1. Add repository premise spec.
2. Add agent policy.
3. Add self-application feature spec.
4. Add implemented Cell and draft future Cells.
5. Add audit and evidence records.
6. Open draft PR for Shirube command review.
7. Run conveyor check against the PR.
8. Stop for command review.

## Risks

- Scaffold could be mistaken for activation. Mitigation: records state warn-only / scaffold-only and list non-goals.
- Future Cell candidates could be mistaken for implementation authorization. Mitigation: candidates are marked `draft_candidate_only`.
- Required checks or protected automation could be changed accidentally. Mitigation: forbidden paths and stop conditions prohibit those changes.

## Rollback Method

Single PR revert removes the `.shirube/` self-application scaffold added by this slice.
