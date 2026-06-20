# Shirube Conveyor Active Workflow

SPEC-ID: SPEC-ADF-CHECK-WORKFLOW-001
CELL-ID: CELL-ADF-SELF-006
IMPL-ID: IMPL-ADF-CHECK-WORKFLOW-001
Risk Tier: R3

## Status

Active workflow integration, non-required. This document does not enable
required checks, modify branch protection, modify rulesets, activate AUN,
change runtime code, change CLI code, change package files, or mutate target
repositories.

## Workflow

Workflow file:

- `.github/workflows/shirube-conveyor-prerequisite-check.yml`

Stable workflow/job name:

- `Shirube Conveyor Prerequisite Check`

Triggers:

- `pull_request` opened
- `pull_request` synchronize
- `pull_request` reopened
- `pull_request` ready_for_review

Permissions:

- `contents: read`
- `pull-requests: read`

## Behavior

The workflow performs three checks:

1. Parse `.shirube/**/*.yaml` and `.shirube/**/*.yml`.
2. Validate known Shirube v1 YAML artifacts for required top-level fields.
3. Run `shirube conveyor check <PR_URL> --format json`.

The workflow uploads the conveyor JSON result as:

- `shirube-conveyor-result-<PR_NUMBER>`

## Verdict Handling

The workflow exits successfully for:

- `PASS`
- `PASS_WITH_WARN`

The workflow exits nonzero for:

- `.shirube` YAML/schema validation failure
- conveyor command failure
- malformed conveyor JSON
- conveyor verdict `BLOCKED`

The check is intentionally not added to required checks, branch protection, or
rulesets by this Cell.

## Draft PR Behavior

Draft PRs run the workflow as early signal. A `BLOCKED` result on a draft PR
does not represent merge denial by itself because the workflow is not required.
Draft authors should use the uploaded JSON artifact to fill missing Shirube
metadata before moving the PR out of draft.

## Auto-merge Behavior

This Cell does not modify auto-merge configuration. If auto-merge is enabled on
a repository, it must not treat this workflow as required unless a later
approved Cell updates branch protection or rulesets. A later required-check
Cell must explicitly define how auto-merge waits for exact-head conveyor
evidence.

## Non-required Pilot Boundary

This workflow is a pilot signal:

- It is active on PRs.
- It uploads machine-readable evidence.
- It may fail when the conveyor verdict is `BLOCKED`.
- It is not required by branch protection or rulesets.
- It does not mutate PR labels, comments, statuses, checks, target repos, or protected settings.

## Rollback

Rollback is a normal PR revert that removes the workflow and associated Shirube
artifacts. No required-check or branch-protection rollback is needed because
this Cell does not modify protected settings.
