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
  --mode render \
  --out .tmp/shirube-adoption-pack \
  --format json
```

`--framework-ref` must be pinned. The target repository records the pinned ADF ref but does not receive copied `scripts/shirube/**`.

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

The first slice does not generate a workflow caller. A later approved Cell may add `.github/workflows/shirube-rapid-lite-gates-report.yml` when the thin caller is explicitly scoped.

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

## Target PR Scope

Generated adoption PRs are control-plane overlay PRs only.

Allowed:

- `.shirube/**`
- `docs/shirube/**`
- `.github/workflows/shirube-rapid-lite-gates-report.yml` only in a later thin-caller slice

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

The source mirror is not independent truth. It is a structured snapshot of the GitHub Control source.

## Authority Rules

LLM output is not authority.

`BLOCKED` or `would_block=true` means the owner must not merge unless an explicit exact-head pilot exception exists.

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
