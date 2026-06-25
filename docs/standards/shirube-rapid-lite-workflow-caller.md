# Shirube Rapid/Lite Workflow Caller

This standard defines the thin workflow caller used by target repositories to run Shirube Rapid/Lite reports without copying ADF scripts into the target repository.

## Control Model

Target repositories may add only a thin caller workflow:

- `.github/workflows/shirube-rapid-lite-gates-report.yml`

ADF remains the source for:

- reusable workflow logic;
- `scripts/shirube/**`;
- gate contract matrix;
- default design rule pack;
- standards and templates.

The target caller must use a pinned ADF ref:

```yaml
uses: watchout/ai-dev-framework/.github/workflows/shirube-rapid-lite-reusable.yml@<PINNED_SHA>
```

The caller also passes the same value as `framework_ref` in `owner/repo@ref` form so reports can record which framework revision produced the evidence.

## Target Caller Trigger

The target caller must be report-only and run on PR metadata changes that can affect evidence discovery or owner decisions:

```yaml
on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review
      - edited
      - labeled
      - unlabeled
```

These triggers keep PR-body evidence refs, exact-head evidence, and pilot labels visible without making the workflow required.

## Input Model

The reusable workflow accepts:

- `framework_ref`
- `profile`
- `report_only`
- `pr_body`
- `changed_files`
- `execution_context_ref`
- `adoption_plan_ref`
- `lifecycle_state_ref`
- `handoff_ref`
- `validation_evidence_ref`
- `owner_decision_ref`
- `enforcement_policy_ref`
- `audit_checklist_ref`
- `structured_audit_ref`
- `audit_machine_evidence_ref`

If `changed_files` is empty, the reusable workflow computes the PR diff from Git metadata and records the collection method. If `pr_body` is empty, it reads the PR body from the GitHub event payload.

The reusable workflow also injects ADF-local `matrix_ref` and `rule_pack_ref` paths into the effective PR-body evidence so target repositories do not need to copy the gate contract matrix or default design rule pack.

When no explicit `validation_evidence_ref` is supplied, the reusable workflow creates `.shirube-rapid-lite/runtime-validation-evidence.json` during the run and injects that path into the effective PR-body evidence. This runtime artifact may provide the current PR head SHA, changed-file collection evidence, and validation command/result facts. It is external to the attested commit and is not copied into the target repository.

Final owner exact-head evidence should be supplied outside the attested commit, for example through an owner-decision PR comment parser or workflow-provided evidence input. A committed pending owner-decision YAML file is policy only and must not be treated as approval.

The reusable workflow must not synthesize owner approval. Missing owner final decision is a pre-merge warning until merge readiness is claimed; once merge readiness or a final owner decision is asserted, exact-head mismatch or missing approval is blocking.

## Report-Only Semantics

This workflow is signal-only in the initial overlay slice:

- `PASS` succeeds.
- `PASS_WITH_WARN` succeeds and records warnings.
- `BLOCKED` succeeds but records `would_block=true` and `owner_must_not_merge=true`.
- `FAILURE` is recorded as report evidence and remains non-enforcing in this slice.

Making `BLOCKED` or `FAILURE` fail CI requires a later approved enforcement Cell. Making the workflow a required check requires a later protected-settings Cell.

## Scope Rules

The workflow caller must not:

- copy `scripts/shirube/**` into the target repository;
- add or modify target `package.json` or lockfiles;
- change runtime, API, DB, product, deployment, branch protection, rulesets, or required checks;
- claim V3 complete, fully controlled, enforced, or required-check protected status.

The target adoption PR may include this workflow only together with `.shirube/**` and `docs/shirube/**` overlay artifacts.

Adoption checks treat workflow changes as unsafe by default. The fixed caller path is allowed only when the handoff lists the exact workflow file in `cell.allowed_paths` and explicitly declares the `active workflows` protected surface. Broad `.github/workflows/**` permission is not accepted for Rapid/Lite overlay adoption.

Before opening the target adoption PR, run `check-overlay-pilot-readiness` against the rendered pack. Static pack safety is not enough; the generated overlay must also dry-run through `run-rapid-lite-report` with `would_block=false`.
