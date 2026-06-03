# Wave 1 PR Conveyor Runbook

This runbook is the Wave 1 operating guide for the PR Conveyor. It keeps one Work Order / PR graph and exposes multiple lane views over that same graph. It must not create a parallel task system.

While AUN is degraded or not fully recovered, GitHub labels are the Wave 1 state source of truth. AUN may mirror the same Work Order, PR, and head SHA later, but AUN mirror mode is read-only and must not dispatch live runners, mutate queue lifecycle, or replace GitHub label state.

## Bootstrap Checklist

Before opening a new Conveyor PR batch:

- Confirm each target repo has the Conveyor labels installed.
- Confirm every active Work Order or PR has exactly one active `state:*` label.
- Confirm each PR body contains a PR Conveyor Evidence block before audit labels are applied.
- Confirm implementation, Audit Sweeper, and L3/merge authority are separate roles.
- Confirm Wave 1 WIP limits are known for implementation and audit.
- Confirm each repo has recorded validation commands.
- Confirm Wasurezu recovery or a bounded context pack is available for auditor continuity.

Wave 1 repo scope:

- `watchout/ai-dev-framework` - Shirube framework profile.
- `watchout/agent-comms-mcp` - AUN MCP runtime profile.
- `watchout/agent-memory` - Wasurezu MCP memory profile.
- `watchout/aun-platform` - AUN Platform SaaS UI profile.

## Required Labels

Core operation states:

- `state:start`
- `state:impl-l1`
- `state:impl-l2`
- `state:impl-l3`
- `state:ceo-approval`
- `state:rework`
- `state:blocked`
- `state:done`

Audit and evidence labels:

- `evidence-ready`
- `audit-pending`
- `audit:l1-pending`
- `audit:l1-passed`
- `audit:l2-required`
- `audit:l2-pending`
- `audit:l2-passed`
- `audit:l3-required`
- `audit:l3-pending`
- `audit:l3-passed`
- `needs:l1-audit`
- `needs:l2-audit`
- `needs:l3-review`

Blocker and rework labels:

- `changes-requested`
- `foundation-blocker`
- `blocked-stop-lane`
- `dependency-blocked`
- `needs:rework`
- `merge-ready`

Dispatch uses the single current operation state, not fine-grained audit label combinations:

- L1 Audit Sweeper search: `state:impl-l1`
- L2 Audit Sweeper search: `state:impl-l2`
- L3 Audit Sweeper search: `state:impl-l3`

Compatibility labels may remain, but they are not the dispatch SSOT.

## Saved Searches

Minimum GitHub searches:

```text
org:watchout is:issue is:open label:ready-for-implementation
org:watchout is:pr is:open label:state:impl-l1
org:watchout is:pr is:open label:state:impl-l2
org:watchout is:pr is:open label:state:impl-l3
org:watchout is:pr is:open label:state:rework
org:watchout is:open label:blocked-stop-lane
org:watchout is:pr is:open label:merge-ready
```

Repo-specific searches should use the same labels with `repo:<owner>/<repo>` prefixes for each Wave 1 repo.

Recommended Project views:

- Implementation Lane: `ready-for-implementation`, `state:start`, `implementing`
- Audit Sweeper Lane: `state:impl-l1`, `state:impl-l2`, `state:impl-l3`
- Rework Lane: `state:rework`, `changes-requested`
- Merge Lane: `merge-ready`, `state:done`
- Blocked Lane: `blocked-stop-lane`, `foundation-blocker`, `dependency-blocked`

## Daily Operating Loop

1. Check `blocked-stop-lane` and `foundation-blocker` first.
2. Check audit backlog and WIP limits.
3. Prioritize rework before opening new implementation PRs when audit debt is high.
4. Let implementation runners open new R0-R2 Work Orders only while WIP allows.
5. Run the Audit Sweeper across Wave 1 repos.
6. Route R3/R4 or unclear blast radius to L2 or governed review.
7. Let L3/merge authority review merge-ready PRs only after exact-head audit evidence is current.
8. Run batch regression after related slices land.

Implementation runners must not set audit pass labels, merge-ready labels, or `state:done`.

Audit Sweeper sessions must not implement product repo changes unless the target repo has an explicit Work Order for that change.

L3/merge authority alone decides draft removal, final merge readiness, and merge execution.

## Audit Sweeper Loop

Use a local fixture/profile snapshot when operating without live GitHub integration:

```bash
shirube conveyor audit-sweeper plan --fixture conveyor-fixture.json --profile wave1-profile.json --level all --json
```

The Audit Sweeper plan is read-only. It reports target PRs, exact head SHA, stale or missing evidence, prior audit readiness, dependency blockers, risk routing, and context recovery policy. It must not mutate labels, post PR comments, dispatch AUN runners, or merge PRs.

For each target:

1. Confirm the PR number and exact head SHA.
2. Confirm PR Conveyor Evidence exists and matches the PR scope.
3. Confirm the changed-file scope matches the claimed risk class.
4. Confirm validation commands are credible for the touched files.
5. Confirm prior L1/L2 evidence is current at the exact head when auditing L2/L3.
6. Confirm dependency watermarks are clear before final pass.
7. Comment an audit verdict or findings on the same PR.
8. Move labels only through an authorized label-sync path.

Required audit comment fields:

- exact PR/head reviewed
- evidence completeness
- changed-file scope result
- verification result assessment
- risk/lane assessment
- findings
- required rework, if any
- next label/state

Allowed audit outcomes:

- `L1 PASS`
- `L1 CHANGES REQUESTED`
- `L1 ESCALATE L2`
- `L2 PASS`
- `L2 CHANGES REQUESTED`
- `BLOCKED STOP LANE`

## Metrics

Track these metrics manually first:

- ready Work Orders
- active implementation PRs
- audit-pending PRs
- `state:impl-l1` PR count
- `state:impl-l2` PR count
- `state:impl-l3` PR count
- changes-requested PRs
- average audit wait time
- rework count per PR
- blocked-stop-lane count
- foundation-blocker count
- merged PRs per day
- failed verification count
- stale reviewed SHA count

Warning thresholds:

- More than 4 Wave 1 PRs in `audit-pending`.
- Any PR in `audit-pending` for more than 24h.
- Any PR with more than 2 rework loops.
- R3/R4 PR missing L2/L3 route labels.
- `merge-ready` PR whose reviewed SHA is stale.
- Any `state:impl-l3` PR missing required exact-head prior audit evidence.
- Any dependency blocker below an upper-stack PR.

When thresholds trip, slow implementation and drain audit or rework first.

## Failure Modes

- Duplicate task systems: stop and reconcile back to the same Work Order/PR graph.
- Missing PR Conveyor Evidence: do not pass audit; request evidence.
- Stale exact-head audit evidence: re-audit at current head before final pass.
- Dirty or conflicting merge state: hold L2/L3/final pass until resolved.
- Stop-lane or foundation blocker: process before ordinary audit-pending work.
- Dependency blocker below a stack: mark or recommend `dependency-blocked`; do not advance upper PRs to final pass.
- AUN degraded: keep GitHub labels as SSOT and use AUN only as mirror/notification when recovered.
- Auditor context degradation: load Wasurezu recovery or bounded context pack before claiming continuity.

## Authority Boundaries

- Implementation lane owns scoped code/docs changes and PR evidence.
- Audit Sweeper lane owns audit findings and audit verdict evidence only.
- L3/merge authority owns merge readiness and merge execution.
- CEO/owner approval is required when governance says route:ceo-approval.
- AUN mirror mode is read-only while AUN is degraded.
- No lane may bypass L3, CEO approval, exact-head evidence, or stop-lane blockers.
