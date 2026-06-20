# Shirube Conveyor Active Workflow Integration

SPEC-ID: SPEC-ADF-CHECK-WORKFLOW-001
Risk Tier: R3

## Background

`CELL-ADF-SELF-002` created the activation plan for the Shirube conveyor
required-check path. This slice takes the next bounded step: add an active
GitHub Actions workflow that runs on pull requests while remaining non-required.

## Purpose

Create a stable, non-required PR workflow named `Shirube Conveyor Prerequisite
Check` that validates `.shirube` YAML/schema artifacts, runs the deterministic
conveyor prerequisite check, uploads the JSON result, and reports the verdict
without enforcing `BLOCKED` during the non-required pilot.

## Non-goals

- This spec does not enable required checks.
- This spec does not modify branch protection.
- This spec does not modify rulesets.
- This spec does not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation.
- This spec does not change runtime code.
- This spec does not change CLI code.
- This spec does not change package files.
- This spec does not mutate target repositories.
- This spec does not change auto-merge configuration.

## Target Users

- Shirube command reviewers
- ai-dev-framework maintainers
- Release owners observing conveyor evidence on PRs

## Target Scope

- `.github/workflows/shirube-conveyor-prerequisite-check.yml`
- `.shirube/specs/SPEC-ADF-CHECK-WORKFLOW-001.md`
- `.shirube/cells/CELL-ADF-SELF-006.yaml`
- `.shirube/impls/IMPL-ADF-CHECK-WORKFLOW-001.md`
- `.shirube/audits/AUDIT-ADF-CHECK-WORKFLOW-SPEC-001.yaml`
- `.shirube/audits/AUDIT-ADF-CHECK-WORKFLOW-IMPL-001.yaml`
- `.shirube/evidence/EVIDENCE-ADF-CHECK-WORKFLOW-001.yaml`
- `docs/activation/shirube-conveyor-active-workflow.md`

## Changed Areas

- Active non-required GitHub Actions workflow.
- Shirube governance artifacts under `.shirube/**`.
- Activation documentation under `docs/activation/**`.
- No runtime, CLI, package, branch protection, ruleset, target repo, or AUN/multi-agent changes.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-WORKFLOW-001 | Add an active non-required PR workflow with stable job name `Shirube Conveyor Prerequisite Check`. |
| REQ-ADF-WORKFLOW-002 | Validate `.shirube` YAML/schema artifacts in the workflow. |
| REQ-ADF-WORKFLOW-003 | Run `shirube conveyor check <PR_URL> --format json` and upload the JSON result as an artifact. |
| REQ-ADF-WORKFLOW-004 | Report `PASS`, `PASS_WITH_WARN`, and `BLOCKED` conveyor verdicts during the non-required pilot; fail only on validation/setup failures, conveyor command failure without a valid report, malformed conveyor JSON, or unknown verdict. |
| REQ-ADF-WORKFLOW-005 | Document draft PR and auto-merge behavior for the non-required pilot. |
| REQ-ADF-WORKFLOW-006 | Record `BLOCKED` conveyor verdicts in logs, GitHub step summary, and uploaded JSON artifact without treating them as ignored. |
| SEC-ADF-WORKFLOW-001 | Do not enable required checks, modify branch protection, modify rulesets, activate AUN/multi-agent automation, mutate target repos, or change runtime/CLI/package files. |
| NFR-ADF-WORKFLOW-001 | Keep the check name stable and unique for future required-check planning. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-WORKFLOW-001 | REQ-ADF-WORKFLOW-001, NFR-ADF-WORKFLOW-001 | The workflow job name is exactly `Shirube Conveyor Prerequisite Check`. |
| AC-ADF-WORKFLOW-002 | REQ-ADF-WORKFLOW-002 | The workflow parses `.shirube/**/*.yaml` and `.shirube/**/*.yml` and checks required fields for known Shirube v1 schema versions. |
| AC-ADF-WORKFLOW-003 | REQ-ADF-WORKFLOW-003 | The workflow runs the conveyor check against the PR URL and uploads the JSON result artifact. |
| AC-ADF-WORKFLOW-004 | REQ-ADF-WORKFLOW-004 | The workflow exits successfully for `PASS`, `PASS_WITH_WARN`, and `BLOCKED` reports and exits nonzero for validation/setup failure, malformed conveyor JSON, unknown verdict, or conveyor command failure without a valid `BLOCKED` report. |
| AC-ADF-WORKFLOW-005 | REQ-ADF-WORKFLOW-005 | Draft PR and auto-merge behavior are documented. |
| AC-ADF-WORKFLOW-006 | REQ-ADF-WORKFLOW-006 | `BLOCKED` is shown in logs, the GitHub step summary, and the uploaded JSON artifact during the signal-only pilot. |
| AC-ADF-WORKFLOW-007 | SEC-ADF-WORKFLOW-001 | The PR does not modify branch protection, rulesets, runtime code, CLI code, package files, target repositories, or AUN/multi-agent automation. |

## Negative Cases

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-NEG-ADF-WORKFLOW-001 | SEC-ADF-WORKFLOW-001 | This PR must not edit branch protection, rulesets, package files, runtime code, CLI code, deploy files, `.env`, or private config. |
| AC-NEG-ADF-WORKFLOW-002 | SEC-ADF-WORKFLOW-001 | This PR must not mark the new workflow as required in GitHub settings. |
| AC-NEG-ADF-WORKFLOW-003 | SEC-ADF-WORKFLOW-001 | This PR must not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation. |

## Impact

- Security impact: Active read-only PR workflow is added; no secrets beyond the default read token are requested.
- Privacy impact: N/A; no customer or personal data processing.
- AI usage impact: N/A; no model, agent, AUN, or multi-agent automation is activated.
- Data impact: N/A; target repositories are not mutated.
- API changes: N/A.
- DB changes: N/A.
- Audit log requirements: GitHub Actions run logs, GitHub step summaries, and uploaded JSON artifacts provide evidence, including report-only `BLOCKED` verdicts.

## Migration Plan

No migration. The workflow becomes active when merged, but it is report-only for
`BLOCKED` during the non-required pilot. It is not configured as a required
check and no branch protection or ruleset is changed.

## Rollback Plan

Revert the PR to remove the workflow and associated governance artifacts. If the
workflow causes noise while non-required, maintainers may temporarily disable
the workflow in GitHub Actions UI and open a follow-up Cell; no branch
protection rollback is needed because this slice does not enable required
checks.

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-CHECK-WORKFLOW-001 | REQ-ADF-WORKFLOW-001, REQ-ADF-WORKFLOW-002, REQ-ADF-WORKFLOW-003, REQ-ADF-WORKFLOW-004, REQ-ADF-WORKFLOW-006, SEC-ADF-WORKFLOW-001 | Run YAML parse, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, conveyor check against the created PR, and remote workflow verification that `BLOCKED` is recorded but the non-required workflow succeeds. |

## Trace Matrix

TRACE-ADF-CHECK-WORKFLOW-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-WORKFLOW-001 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| REQ-ADF-WORKFLOW-002 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| REQ-ADF-WORKFLOW-003 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| REQ-ADF-WORKFLOW-004 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| REQ-ADF-WORKFLOW-005 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| REQ-ADF-WORKFLOW-006 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |
| SEC-ADF-WORKFLOW-001 | CELL-ADF-SELF-006 | IMPL-ADF-CHECK-WORKFLOW-001 | EVIDENCE-ADF-CHECK-WORKFLOW-001 |

## Unresolved Questions

- Making `BLOCKED` fail the workflow requires a later approved enforcement Cell.
- Making this check required requires a later protected-settings Cell.
