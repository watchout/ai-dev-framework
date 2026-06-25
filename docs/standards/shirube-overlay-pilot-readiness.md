# Shirube Overlay Pilot Readiness

`check-overlay-pilot-readiness` verifies that a rendered Shirube overlay is not only safe as files, but also able to enter a target repository adoption PR without a known Rapid/Lite `BLOCKED` state.

This gate is local and report-only. It does not fetch GitHub, mutate target repositories, create PRs, enable required checks, change branch protection, or copy ADF scripts.

## Command

```bash
node scripts/shirube/check-overlay-pilot-readiness.mjs \
  --pack-root .tmp/shirube-adoption-pack \
  --target-repo owner/repo \
  --profile hotel-lite \
  --actual-head <sha-or-placeholder> \
  --format json
```

The gate runs:

1. `check-adoption-pack`
2. `run-rapid-lite-report` from the generated pack root

`PASS` is allowed only when the rendered overlay passes the static pack check and the Rapid/Lite dry-run has `would_block=false`.

## Required Render Inputs

Pilot-ready render output requires:

- `--owner-actor`
- `--owner-confirmation-ref`
- `--cell-id`

The renderer must not emit `owner.actor: null` or `CELL-ID: <CELL-ID>` for a pilot-ready pack. Missing values fail render before target PR creation.

## Same-Repo Control Source

If `--source-control` points to the same repository as `--target-repo`, the generated execution context must not create a second `control_source` relation for that repository.

Use `same_repo_control_source` for the source relation while keeping the repository's `primary` relation. This keeps the repo as the implementation target and avoids `CTX-006`.

## External Exact-Head Evidence

Final owner exact-head approval is external to the committed overlay.

Allowed target-repo evidence paths are:

- owner-decision PR comment parser
- workflow input supplied by the report runner
- external validation or owner-decision evidence file outside the attested commit

Committed owner-decision YAML is policy only unless a later approved parser explicitly validates it against the current PR head. Pending owner-decision YAML must not be treated as approval.

The generated workflow caller path must be able to provide runtime validation evidence for the current PR head without committing that evidence into the overlay. This keeps `PR_head_SHA`, changed-file, and validation-result checks deterministic while preserving the authority boundary for owner final decision.

Owner final decision remains a merge authority artifact, not a workflow-generated fact. Before merge readiness is claimed, missing owner final decision should be reported as a required next action or warning rather than making the overlay pilot dry-run appear structurally impossible.

## Output

The command emits `shirube-overlay-pilot-readiness/v1` JSON with:

- `verdict`: `PASS`, `PASS_WITH_WARN`, `BLOCKED`, or `FAILURE`
- `would_block`
- `owner_must_not_merge`
- `adoption_pack_check`
- `rapid_lite_dry_run`
- `blockers`
- `warnings`
- `required_next_actions`

`BLOCKED` exits zero and prevents opening the target adoption PR by policy. `FAILURE` exits nonzero for invalid invocation, invalid source-control metadata, malformed pack artifacts, or script/report failures.

## Blocking Examples

- missing concrete `CELL-ID`
- missing owner actor or owner confirmation ref
- same-repo control source rendered as a duplicate `control_source` relation
- lifecycle state not accepted by `check-lifecycle`
- generated overlay dry-run has `would_block=true`
- pending committed owner decision is treated as approval
- invalid target repo or source-control metadata

## Non-Scope

This gate does not:

- perform live GitHub API fetches;
- mutate external repositories;
- create target repo PRs;
- activate required checks;
- mutate branch protection or rulesets;
- change runtime/API/DB/product/package files;
- claim Shirube V3 complete.
