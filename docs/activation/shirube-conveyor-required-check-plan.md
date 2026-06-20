# Shirube Conveyor Required Check Activation Plan

SPEC-ID: SPEC-ADF-CHECK-ACTIVATION-001
CELL-ID: CELL-ADF-SELF-002
IMPL-ID: IMPL-ADF-CHECK-ACTIVATION-001
Risk Tier: R2

## Status

Planning-only. This document does not enable required checks, modify active
GitHub workflows, change branch protection, change rulesets, change runtime or
CLI code, mutate target repositories, or activate AUN or multi-agent automation.

## Future Required Check

Planned required check name:

- `Shirube Conveyor Prerequisite Check`

Planned command:

```sh
shirube conveyor check <pr-url-or-repo-pr> --format json
```

The command must emit deterministic JSON with schema
`shirube-conveyor-check/v1`. A later activation Cell must decide whether the
command is invoked through a GitHub workflow, a GitHub App, or another approved
control-plane runner. This planning slice does not create or modify that
execution surface.

## Repository Eligibility

A repository is eligible only when all of these are true:

- The repository has an approved `.shirube/repo-spec.yaml`.
- The repo-spec names the repo owner, release owner, security owner, and evidence owner.
- The owner named in the repo-spec confirms that the repository may enter the pilot.
- The repository already uses the Shirube PR metadata block or an approved equivalent.
- The repository can produce exact head SHA evidence for PR checks.
- The repository has a documented rollback owner and emergency intervention path.
- The repository has no unresolved protected-surface approval gaps for the planned enforcement.

## Repository Exclusions

A repository is excluded until separately approved when any of these are true:

- No approved repo-spec exists.
- Owner confirmation is missing or disputed.
- The repository has unmanaged branch protection or rulesets.
- The repository relies on auto-merge flows that cannot be paused or overridden by a human maintainer.
- The repository contains emergency, production, deploy, or regulated workflows without a documented bypass path.
- The repository cannot surface exact head SHA evidence in check output.
- Existing waivers are not represented in a machine-readable artifact.

## Warn-only Pilot Criteria

The first activation phase must be warn-only. A repository may enter the pilot
only after Shirube command review approves the repo-specific pilot record.

Pilot entry criteria:

- At least one successful manual `shirube conveyor check <pr> --format json` run exists for the repository.
- The repo owner confirms the pilot scope and rollback owner.
- Draft PR, emergency intervention, waiver, and false-positive handling are documented.
- The check is visible to maintainers but is not required for merging.
- The pilot records exact head SHA, PR URL, command version, and result JSON.

Pilot exit criteria before required-check activation:

- No unresolved BLOCKED result caused by a false positive remains.
- PASS and PASS_WITH_WARN semantics are documented for the repository.
- Rollback has been rehearsed or reviewed by the repo owner.
- Auto-merge handling has been reviewed.
- Owner approval for required-check activation is recorded in a protected governance artifact.

## Pass, Warn, And Fail Criteria

Required-check semantics for a later approved activation:

- `PASS`: no blockers and no warnings; check may pass.
- `PASS_WITH_WARN`: no blockers; warnings are visible but non-blocking unless the repo-specific policy says otherwise.
- `BLOCKED`: one or more blockers; check must fail when enforcement is active.

Warnings must remain machine-readable. Narrative explanations must not override
missing machine facts.

## Rollback Procedure

Rollback must be available before any required-check activation:

1. Release owner pauses activation for affected repositories.
2. Owner disables the required-check binding through the approved protected-settings path.
3. Owner records rollback reason, exact affected check name, affected repositories, and timestamp.
4. Owner preserves failed result JSON and exact head SHA evidence for review.
5. Owner opens a follow-up Cell if code, workflow, or policy fixes are needed.

Rollback is not implemented by this PR because this PR does not enable the
required check.

## Owner Approval Requirements

Required-check activation needs explicit approval from:

- repo owner
- release owner
- security owner when protected or R3/R4 surfaces are affected
- evidence owner
- Shirube command reviewer

Approval must name the repository, check name, command, branch or ruleset
surface, rollback owner, and exact activation window. This planning PR does not
grant that approval.

## Exact Head SHA Verification

The future check must verify the exact PR head SHA before evaluating artifacts:

- Read the PR head SHA from GitHub machine facts.
- Run the conveyor command against that PR.
- Include `head_sha` in the JSON output.
- Compare output `head_sha` to the GitHub PR head SHA.
- Treat mismatch as `BLOCKED`.
- Include the exact SHA in evidence and release-owner merge records.

## Draft PR Handling

Draft PRs should run the conveyor check in warn-only mode during the pilot.
Draft PR failures must not block normal draft iteration. A later activation
Cell must define whether non-draft transition requires the latest conveyor
result to be PASS or PASS_WITH_WARN.

## Auto-merge Handling

Auto-merge must not bypass Shirube evidence. Before a repository enables this
check as required:

- Auto-merge must wait for the exact-head conveyor result.
- Auto-merge must be disabled or paused when the result is `BLOCKED`.
- Auto-merge configuration must be reversible by a human maintainer.
- Emergency human intervention must remain possible through the documented protected-settings path.

## Repo-spec Owner Confirmation

The future activation runner must check repo ownership from `.shirube/repo-spec.yaml`:

- Confirm `repo_id` matches the target repository.
- Confirm owner fields are present.
- Confirm the activation approval references the same owners or explicitly records a delegated approver.
- Treat missing or mismatched owner confirmation as `BLOCKED` for activation.

## Waiver Representation

Waivers must be represented as machine-readable artifacts before enforcement:

- Waiver ID
- repository
- affected PR or rule
- risk tier
- owner approval
- expiration
- reason
- compensating evidence

Skipped required gates without an active waiver must remain `BLOCKED`.

## False-positive Handling

False positives must not be solved through narrative override. The allowed
paths are:

- record the exact check JSON and PR head SHA,
- classify the false positive in a review artifact,
- create a bounded fix Cell for conveyor logic or artifact metadata,
- use an approved time-boxed waiver if merge must proceed before the fix,
- preserve visibility in evidence until the root cause is fixed.

## Emergency Human Intervention

The plan must avoid blocking emergency human intervention:

- A human maintainer override path must exist before activation.
- Override authority must be separate from goal-mode implementation.
- Override use must record owner, reason, affected SHA, and follow-up Cell.
- Emergency override must not silently mutate target repositories or protected settings.
- The normal fix path remains a separate approved Cell after the emergency action.

## Future Activation Preconditions

A later activation Cell must provide:

- approved design consolidation / enterprise fit gate record if protected surfaces are affected,
- protected branch or ruleset owner approval,
- exact workflow or app runner design,
- rollback rehearsal or owner sign-off,
- pilot evidence,
- waiver format,
- command version or commit SHA,
- post-activation verification plan.

This PR stops before those steps.
