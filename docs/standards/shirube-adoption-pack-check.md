# Shirube Adoption Pack Check

`check-adoption-pack` verifies that a rendered Shirube Rapid/Lite overlay pack is safe to apply as a target repository adoption PR.

The gate is local and report-only. It does not mutate target repositories, create PRs, enable required checks, change branch protection, or copy ADF scripts.

## Command

```bash
node scripts/shirube/check-adoption-pack.mjs \
  --pack-root .tmp/shirube-adoption-pack \
  --target-repo owner/repo \
  --profile hotel-lite \
  --format json
```

## Required Output

The command emits `shirube-adoption-pack-check/v1` JSON with:

- `verdict`: `PASS`, `PASS_WITH_WARN`, `BLOCKED`, or `FAILURE`
- `would_block`
- `owner_must_not_merge`
- `target_repo`
- `profile`
- `inventory`
- `blockers`
- `warnings`
- `required_next_actions`

`BLOCKED` exits zero and records `would_block=true`. `FAILURE` exits nonzero and is reserved for malformed command input or malformed generated YAML.

## Required Overlay

The hotel-lite pack must contain:

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

The pack must not contain copied `scripts/shirube/**`, runtime/API/DB/package/deploy files, branch protection files, or ruleset files.

When the approved slice includes the thin workflow caller, the pack may also contain exactly:

- `.github/workflows/shirube-rapid-lite-gates-report.yml`

Other workflow, branch-protection, or ruleset files remain outside the allowed overlay scope.

## Machine Checks

The gate checks:

- all required files exist;
- forbidden target files are absent;
- generated YAML parses;
- execution context and repo-spec target the requested repo;
- adoption status is partial pilot or Rapid/Lite report-only unless readiness evidence exists;
- enforcement policy starts as `report_only` with owner observation;
- Control State Completeness requires execution context, RPS, source mirror, adoption, lifecycle, gate-contract, design-rules, enforcement, handoff, validation evidence, owner exact-head decision, and post-merge evidence;
- source mirror has `mirror_is_truth=false`;
- README states that LLM output is not authority, `report_only` is not final enforcement, `BLOCKED` means owner must not merge without exception, adoption PRs must not mix runtime/API/DB/package changes, and full control requires Control State Completeness.

## Blocking IDs

- `ADOPT-PACK-001 missing_required_file`
- `ADOPT-PACK-002 forbidden_target_file_present`
- `ADOPT-PACK-003 invalid_yaml`
- `ADOPT-PACK-004 target_repo_mismatch`
- `ADOPT-PACK-005 missing_execution_context`
- `ADOPT-PACK-006 source_mirror_claims_truth`
- `ADOPT-PACK-007 enforcement_not_report_only`
- `ADOPT-PACK-008 missing_control_state_completeness_config`
- `ADOPT-PACK-009 missing_owner_exact_head_policy`
- `ADOPT-PACK-010 docs_missing_non_authority_language`
- `ADOPT-PACK-011 full_control_claim_without_readiness`
- `ADOPT-PACK-012 runtime_or_package_scope_detected`

## Non-Scope

This gate does not wire workflows, activate required checks, mutate branch protection or rulesets, change runtime/API/DB/product code, change package files or lockfiles, mutate external repos, or claim Shirube V3 complete.
