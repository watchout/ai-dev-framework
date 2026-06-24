# Shirube Universal Overlay Adoption Pack

The Universal Overlay Adoption Pack renders the smallest repo-local Shirube Rapid/Lite control plane needed to adopt Shirube without copying ADF scripts or changing target product behavior.

It is intended for target repositories that are in `PARTIAL_SHIRUBE_PILOT`, `FULL_OVERLAY_PENDING`, or another owner-observed transition state. The pack normalizes control source evidence into `.shirube/**` artifacts and target-repo guidance while keeping ADF as the framework source.

## Command

```bash
node scripts/shirube/render-adoption-pack.mjs \
  --profile hotel-lite \
  --target-repo owner/repo \
  --product ProductName \
  --source-control owner/control-repo#123 \
  --framework-ref watchout/ai-dev-framework@<PINNED_SHA> \
  --owner-actor <repo-owner> \
  --owner-confirmation-ref <owner-confirmation-ref> \
  --cell-id <CELL-ID> \
  --mode render \
  --out .tmp/shirube-adoption-pack \
  --format json
```

`--framework-ref` must be pinned. `--owner-actor`, `--owner-confirmation-ref`, and `--cell-id` are required for pilot-ready output; the renderer must not emit `owner.actor: null` or `CELL-ID: <CELL-ID>`. The target repository records the pinned ADF ref but does not receive copied `scripts/shirube/**`.

Add `--include-workflow-caller` only when the thin caller slice is in scope. That renders `.github/workflows/shirube-rapid-lite-gates-report.yml`, which calls the pinned ADF reusable workflow instead of copying gate scripts into the target repo.

## Generated Files

The `hotel-lite` profile writes:

- `.shirube/execution-context.yaml`
- `.shirube/adoption-intake.yaml`
- `.shirube/existing-state-scan.yaml`
- `.shirube/repo-spec.yaml`
- `.shirube/control-handoffs/CH-001.yaml`
- `.shirube/lifecycle-state.yaml`
- `.shirube/source-mirrors/control-issue.yaml`
- `.shirube/enforcement-policy.yaml`
- `.shirube/control-state-completeness.yaml`
- `docs/shirube/README.md`

When `--include-workflow-caller` is set, the pack also writes:

- `.github/workflows/shirube-rapid-lite-gates-report.yml`

The caller must remain thin and report-only. See `docs/standards/shirube-rapid-lite-workflow-caller.md`.

## Pack Safety Check

Before applying a rendered pack to a target repository, run:

```bash
node scripts/shirube/check-adoption-pack.mjs \
  --pack-root .tmp/shirube-adoption-pack \
  --target-repo owner/repo \
  --profile hotel-lite \
  --format json
```

The check verifies that the pack is lightweight, machine-readable, target-repo aligned, report-only, and free of forbidden runtime/API/DB/package/script/protection changes. See `docs/standards/shirube-adoption-pack-check.md`.

## Pilot Readiness Dry-Run

Before opening a target repository adoption PR, run:

```bash
node scripts/shirube/check-overlay-pilot-readiness.mjs \
  --pack-root .tmp/shirube-adoption-pack \
  --target-repo owner/repo \
  --profile hotel-lite \
  --actual-head <sha-or-placeholder> \
  --format json
```

This gate runs both `check-adoption-pack` and a local `run-rapid-lite-report` dry-run against the rendered overlay. A pack that passes `check-adoption-pack` is not pilot-ready if the Rapid/Lite dry-run would already be `BLOCKED`.

See `docs/standards/shirube-overlay-pilot-readiness.md`.

## Target PR Scope

Generated adoption PRs are control-plane overlay PRs only.

Allowed:

- `.shirube/**`
- `docs/shirube/**`
- `.github/workflows/shirube-rapid-lite-gates-report.yml` only when the approved slice includes the thin workflow caller

Forbidden:

- `scripts/shirube/**`
- runtime/product code such as `src/**`, `app/**`, `api/**`, `lib/**`
- `db/**` and `migrations/**`
- package or lock files
- `.env*`, secrets, deploy, production, branch protection, ruleset, or required-check changes

## Control Model

The pack creates machine-readable artifacts for:

- Execution Context Lock
- RPS / PRS
- Adoption Intake
- Existing State Scan
- Lifecycle State
- Gate Pack / Control Handoff
- Enforcement Policy
- Control State Completeness
- Source Mirror
- target repo README guidance
- optional report-only thin workflow caller

The source mirror is not independent truth. It is a structured snapshot of the GitHub Control source.

If the control issue is in the same repository as the target repository, the execution context keeps the target as `primary` and marks the source relation as `same_repo_control_source` instead of `control_source`. This keeps the repo as the implementation target and avoids `CTX-006`.

Use `scripts/shirube/mirror-control-source.mjs` when a standalone source mirror skeleton is needed before rendering or refreshing a target overlay. The command is offline in its first slice and keeps `mirror_is_truth=false`.

## Authority Rules

LLM output is not authority.

`BLOCKED` or `would_block=true` means the owner must not merge unless an explicit exact-head pilot exception exists.

Final owner exact-head approval is external to the committed overlay. It may come from a PR owner-decision comment parser, workflow input, or external validation/owner-decision evidence file outside the attested commit. Pending owner-decision YAML inside the overlay is policy only and must not be treated as approval.

`report_only` is calibration and observation. It is not the final enforcement state. Promotion to `owner_block`, `ci_hard_block`, or `required_check` requires later owner-approved work.

Full control requires Control State Completeness. A target repo must not claim V3 complete, enforced, fully controlled, or required-check protected status until machine evidence supports that claim.

## Adoption Status Path

The normal target-repo progression is:

1. `PARTIAL_SHIRUBE_PILOT`
2. `FULL_OVERLAY_PENDING`
3. `RAPID_LITE_REPORT_ONLY`
4. `OWNER_BLOCK`
5. later enforcement graduation after owner-approved protected-settings work

The generated pack supports the transition from partial/gate-pack usage to repo-local Rapid/Lite report-only overlay.

## Non-Scope

This pack does not:

- mutate external repositories;
- create target repo PRs;
- copy ADF scripts;
- require package or lockfile changes;
- change runtime, API, DB, product, deploy, production, AUN, branch protection, rulesets, or required checks;
- enable CI hard-blocking;
- claim Shirube V3 complete.
