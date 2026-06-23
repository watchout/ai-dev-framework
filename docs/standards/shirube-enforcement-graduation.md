# Shirube Enforcement Graduation

Shirube report-only is a calibration stage, not the final adoption state.

Rapid/Lite starts report-only so a target repository can see PASS, PASS_WITH_WARN,
and BLOCKED findings before false positives interrupt live development. Once the
findings are classified, the repo should graduate toward mechanical blocking.

## Modes

| Mode | Purpose | Aggregate would_block=true | CI fails | Owner merge rule |
| --- | --- | --- | --- | --- |
| `report_only` | Observation and calibration | `PASS_WITH_WARN` | no | owner must not merge unless explicit pilot exception exists |
| `owner_block` | Owner process blocks before required checks | `BLOCKED` | no | owner must not merge without exact-head exception |
| `ci_hard_block` | CI fails on hard blocks | `BLOCKED` | yes | owner exception alone is not enough unless policy permits waiver |
| `required_check` | Required-check readiness | `BLOCKED` | yes | branch protection/ruleset activation is separate and out of scope |

## Recommended Path

1. Pilot PR 1-3: `report_only`
2. After false-positive review: `owner_block`
3. After 3-5 clean PRs: `ci_hard_block`
4. After owner approval and a protected-settings Cell: `required_check`

## Policy Check

Use:

```bash
node scripts/shirube/check-enforcement-policy.mjs \
  --policy <path> \
  --aggregate <path> \
  --owner-decision <path> \
  --format json
```

The check returns `ci_should_fail` and `owner_must_not_merge` as machine-readable
decisions. This PR only defines and validates those decisions; it does not
change branch protection, rulesets, required checks, runtime behavior, or target
repositories.

## Required-Check Readiness

`required_check` mode declares readiness requirements only. Activating a GitHub
required check requires a later protected-settings Cell with explicit owner
approval.
