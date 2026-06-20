# Shirube Conveyor Required Check Activation Plan

SPEC-ID: SPEC-ADF-CHECK-ACTIVATION-001
Risk Tier: R2

## Background

`watchout/ai-dev-framework` now has a `.shirube/` self-application scaffold.
The next governance step is to plan how the existing deterministic Shirube
conveyor prerequisite check can later become a GitHub required check without
turning enforcement on in this slice.

## Purpose

Define the activation plan, prerequisites, rollback path, owner approval path,
pilot criteria, and review evidence required before a later approved Cell may
enable the conveyor prerequisite check as a required GitHub check.

## Non-goals

- This spec does not enable required checks.
- This spec does not modify active `.github/workflows/**`.
- This spec does not modify branch protection or rulesets.
- This spec does not change runtime code or CLI code.
- This spec does not mutate target repositories.
- This spec does not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation.
- This spec does not authorize auto-merge behavior changes.

## Target Users

- Shirube command reviewers
- ai-dev-framework maintainers
- Release owners planning later required-check activation

## Target Scope

- `.shirube/cells/CELL-ADF-SELF-002.yaml`
- `.shirube/impls/IMPL-ADF-CHECK-ACTIVATION-001.md`
- `.shirube/audits/AUDIT-ADF-CHECK-ACTIVATION-SPEC-001.yaml`
- `.shirube/audits/AUDIT-ADF-CHECK-ACTIVATION-IMPL-001.yaml`
- `.shirube/evidence/EVIDENCE-ADF-CHECK-ACTIVATION-001.yaml`
- `docs/activation/shirube-conveyor-required-check-plan.md`

## Changed Areas

- Shirube planning artifacts under `.shirube/**`.
- Documentation under `docs/activation/**`.
- No active enforcement, workflow, runtime, CLI, package, deploy, protection, ruleset, or target repository area changes.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-CHECK-001 | Define required-check activation plan. |
| REQ-ADF-CHECK-002 | Define pilot and rollback criteria. |
| REQ-ADF-CHECK-003 | Define owner approval and repo eligibility requirements. |
| REQ-ADF-CHECK-004 | Define draft PR and auto-merge handling. |
| SEC-ADF-CHECK-001 | Do not enable enforcement or modify protected settings in this slice. |
| NFR-ADF-CHECK-001 | The plan must be deterministic and evidence-driven, with machine facts taking priority over narrative explanation. |
| AI-ADF-CHECK-001 | The plan must not activate AUN or multi-agent automation. |
| DATA-ADF-CHECK-001 | The plan must not read secrets or mutate target repository data. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-CHECK-001 | REQ-ADF-CHECK-001 | The plan names the future required check and command that will run. |
| AC-ADF-CHECK-002 | REQ-ADF-CHECK-002 | The plan defines warn-only pilot, pass/fail, rollback, false-positive, and emergency intervention criteria. |
| AC-ADF-CHECK-003 | REQ-ADF-CHECK-003 | The plan defines eligible and excluded repositories, owner approval, repo-spec owner confirmation, and waiver representation. |
| AC-ADF-CHECK-004 | REQ-ADF-CHECK-004 | The plan defines draft PR and auto-merge handling. |
| AC-ADF-CHECK-005 | SEC-ADF-CHECK-001 | This slice changes only `.shirube/**` and `docs/**` planning artifacts. |
| AC-ADF-CHECK-006 | NFR-ADF-CHECK-001 | Conveyor check against the PR is PASS or PASS_WITH_WARN. |

## Negative Cases

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-NEG-ADF-CHECK-001 | SEC-ADF-CHECK-001 | This PR must not modify `src/**`, `lib/**`, `bin/**`, `scripts/**`, `.github/workflows/**`, package files, deploy files, `.env`, or private config. |
| AC-NEG-ADF-CHECK-002 | SEC-ADF-CHECK-001 | This PR must not enable required checks, branch protection, rulesets, external dispatch, or production activation. |
| AC-NEG-ADF-CHECK-003 | AI-ADF-CHECK-001 | This PR must not activate AUN, Discord, DB, queue, LaunchAgent, or multi-agent automation. |

## Impact

- Security impact: Planning only; no enforcement or protected setting changes.
- Privacy impact: N/A; no personal or customer data processing.
- AI usage impact: N/A; no agent automation activation.
- Data impact: N/A; no data stores or target repositories are mutated.
- API changes: N/A.
- DB changes: N/A.
- Audit log requirements: Planning evidence and audit records are added for command review.

## Migration Plan

No migration occurs in this slice. Later activation must be a separate approved
Cell with explicit owner approval and protected-surface authorization.

## Rollback Plan

Single PR revert removes the planning artifacts added or updated by this slice.
Because no enforcement is enabled, rollback has no runtime or branch-protection
effect.

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-CHECK-ACTIVATION-001 | REQ-ADF-CHECK-001, REQ-ADF-CHECK-002, REQ-ADF-CHECK-003, REQ-ADF-CHECK-004, SEC-ADF-CHECK-001 | Run YAML parse, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, and conveyor check against the created PR. |

## Trace Matrix

TRACE-ADF-CHECK-ACTIVATION-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-CHECK-001 | CELL-ADF-SELF-002 | IMPL-ADF-CHECK-ACTIVATION-001 | EVIDENCE-ADF-CHECK-ACTIVATION-001 |
| REQ-ADF-CHECK-002 | CELL-ADF-SELF-002 | IMPL-ADF-CHECK-ACTIVATION-001 | EVIDENCE-ADF-CHECK-ACTIVATION-001 |
| REQ-ADF-CHECK-003 | CELL-ADF-SELF-002 | IMPL-ADF-CHECK-ACTIVATION-001 | EVIDENCE-ADF-CHECK-ACTIVATION-001 |
| REQ-ADF-CHECK-004 | CELL-ADF-SELF-002 | IMPL-ADF-CHECK-ACTIVATION-001 | EVIDENCE-ADF-CHECK-ACTIVATION-001 |
| SEC-ADF-CHECK-001 | CELL-ADF-SELF-002 | IMPL-ADF-CHECK-ACTIVATION-001 | EVIDENCE-ADF-CHECK-ACTIVATION-001 |

## Unresolved Questions

- Exact implementation surface for the future required check remains pending a separate approved activation Cell.
