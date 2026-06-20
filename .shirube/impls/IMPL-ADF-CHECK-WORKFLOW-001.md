# Cell Impl

- IMPL-ID: IMPL-ADF-CHECK-WORKFLOW-001
- CELL-ID: CELL-ADF-SELF-006
- SPEC-ID: SPEC-ADF-CHECK-WORKFLOW-001
- Risk Tier: R3

## Covered Requirements

- REQ-ADF-WORKFLOW-001
- REQ-ADF-WORKFLOW-002
- REQ-ADF-WORKFLOW-003
- REQ-ADF-WORKFLOW-004
- REQ-ADF-WORKFLOW-005
- REQ-ADF-WORKFLOW-006
- SEC-ADF-WORKFLOW-001

## Planned File Changes

| Path | Change Type | Reason | Linked REQ-IDs |
| --- | --- | --- | --- |
| `.github/workflows/shirube-conveyor-prerequisite-check.yml` | add | Active non-required PR workflow for Shirube schema validation and conveyor check. | REQ-ADF-WORKFLOW-001, REQ-ADF-WORKFLOW-002, REQ-ADF-WORKFLOW-003, REQ-ADF-WORKFLOW-004, REQ-ADF-WORKFLOW-006 |
| `.shirube/specs/SPEC-ADF-CHECK-WORKFLOW-001.md` | add | Feature spec for active workflow integration. | REQ-ADF-WORKFLOW-001, REQ-ADF-WORKFLOW-002, REQ-ADF-WORKFLOW-003, REQ-ADF-WORKFLOW-004, REQ-ADF-WORKFLOW-005, REQ-ADF-WORKFLOW-006, SEC-ADF-WORKFLOW-001 |
| `.shirube/cells/CELL-ADF-SELF-006.yaml` | add | Cell record for this active workflow integration slice. | REQ-ADF-WORKFLOW-001, SEC-ADF-WORKFLOW-001 |
| `.shirube/impls/IMPL-ADF-CHECK-WORKFLOW-001.md` | add | Implementation plan for workflow integration. | REQ-ADF-WORKFLOW-001, SEC-ADF-WORKFLOW-001 |
| `.shirube/audits/AUDIT-ADF-CHECK-WORKFLOW-SPEC-001.yaml` | add | Structured spec audit record. | SEC-ADF-WORKFLOW-001 |
| `.shirube/audits/AUDIT-ADF-CHECK-WORKFLOW-IMPL-001.yaml` | add | Structured Impl audit record. | SEC-ADF-WORKFLOW-001 |
| `.shirube/evidence/EVIDENCE-ADF-CHECK-WORKFLOW-001.yaml` | add | Structured evidence ledger entry. | REQ-ADF-WORKFLOW-001, REQ-ADF-WORKFLOW-006, SEC-ADF-WORKFLOW-001 |
| `docs/activation/shirube-conveyor-active-workflow.md` | add | Documents non-required workflow behavior, draft PR handling, and auto-merge handling. | REQ-ADF-WORKFLOW-005 |

## Planned Functions / Types / Modules

N/A. No runtime code or CLI code changes.

## API Changes

N/A.

## DB Changes

N/A.

## Auth and Permission Handling

The workflow uses read-only GitHub token permissions:

- `contents: read`
- `pull-requests: read`

It does not request write permissions and does not mutate target repositories,
branch protection, rulesets, labels, comments, checks, or statuses.

## Error Handling

The workflow fails on `.shirube` YAML/schema validation failure, conveyor setup
failure without a valid report, malformed conveyor JSON, or unknown verdict.
`PASS`, `PASS_WITH_WARN`, and `BLOCKED` are non-failing during the non-required
pilot. A `BLOCKED` conveyor verdict is not ignored; it is recorded as evidence
in logs, the GitHub step summary, and the uploaded JSON artifact.

## Logging and Audit Logging

GitHub Actions logs show validation and conveyor output. The workflow writes a
GitHub step summary with the conveyor verdict, blockers, and warnings, and
uploads the conveyor JSON result as an artifact named
`shirube-conveyor-result-<PR_NUMBER>`.

## Tests to Add or Update

- TEST-MAP-ADF-CHECK-WORKFLOW-001: Run YAML parse, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, conveyor check against the opened PR, and remote workflow verification that `BLOCKED` is reported while the non-required pilot workflow succeeds.

## Implementation Order

1. Add active non-required workflow.
2. Add spec, Cell, Impl, audit, evidence, and documentation artifacts.
3. Run local validation.
4. Open draft PR for Shirube command review.
5. Run conveyor check against the PR.
6. Stop without enabling required checks.

## Risks

- The workflow can record `BLOCKED` conveyor verdicts on protected-path pilot work. Mitigation: `BLOCKED` is report-only in this slice and remains visible in logs, step summary, and the uploaded JSON artifact.
- The current conveyor may classify `.github/workflows/**` as a protected default-forbidden path. Mitigation: this Cell explicitly scopes the workflow path and stops for Shirube command review before merge.
- Draft PRs may see early `BLOCKED` results while metadata is incomplete. Mitigation: draft behavior is documented as pilot signal and not required for merge.
- Making `BLOCKED` fail the workflow requires a later approved enforcement Cell.
- Making this check required requires a later protected-settings Cell.

## Rollback Method

Single PR revert removes the workflow and associated artifacts. Because no
required check, branch protection, or ruleset is changed, rollback does not
require protected settings mutation.
