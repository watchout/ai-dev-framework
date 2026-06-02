# IYASAKA Internal 4MCP PR Conveyor Rollout

Status: draft
Owner: IYASAKA ARC
Applies to: Shirube, AUN, Wasurezu, Kodama, Totonoe
Profile: `iyasaka-internal.pr-conveyor`
Source issue: `watchout/ai-dev-framework#273`

## Purpose
Use the PR Conveyor as the internal default for 4MCP completion work while the
full autonomous runner platform is still immature.

The first operating mode is GitHub-native:

```text
Work Order issue
  -> implementation PR
    -> PR evidence
      -> audit comment
        -> merge by explicit repo authority
```

AUN may later orchestrate the same model after the safety stack is accepted.
It is not in the critical path for this rollout.

## Operating Rule
For IYASAKA internal development:

| Risk | Default handling |
|------|------------------|
| R0-R2 | PR Conveyor, PR opened first, audit before merge |
| R3 | governed draft/reference PR, audit before merge or repo-owner adoption |
| R4 | serial gate, approval/audit before execution |

Merge is never automatic.

## Vertical Lanes
There is one task graph: Work Order issue, PR, labels/projection, audit
comments, and merge event.

Operate it through separate lanes:

- Spec/Work Order lane keeps ready work available.
- Implementation lane opens bounded PRs.
- Audit sweeper lane reviews Audit Pending PRs.
- Merge lane merges only audit-passed PRs with explicit authority.
- Blocked lane holds stop conditions and protected operations.

Dashboards, AUN, chat notifications, and GitHub Projects may project the same
IDs later, but must not create separate completion truth.

## Wave 1
Wave 1 builds and stabilizes the conveyor substrate.

| Product | Repo | Initial focus | Boundary |
|---------|------|---------------|----------|
| Shirube | `watchout/ai-dev-framework` | profile, Work Order, evidence, queue, runner packs, rollout batch | no automatic merge |
| AUN | `watchout/agent-comms-mcp` | internal stabilization PRs | no live runner dispatch |
| Wasurezu | `watchout/agent-memory` | recovery/memory safety and evidence continuity | memory is not execution authority |

## Wave 2
Wave 2 starts after the minimum Shirube conveyor substrate is usable.

| Product | Repo | Initial focus | Boundary |
|---------|------|---------------|----------|
| Kodama | `watchout/kodama` | context-pack/get_context | context labels are not permission grants |
| Totonoe | `watchout/totonoe` | SaaS dogfood preparation | customer-impacting operations stay governed or stop lane |

Kodama and Totonoe do not block Wave 1.

## AUN Boundary
Before #272 and safety stack acceptance, AUN may only mirror or receive
evidence. It must not select work, dispatch runners, approve execution, bypass
stop policy, or merge.

## Adoption Sequence
1. Use the first Work Order batch template.
2. Open one bounded PR per Work Order.
3. Move R0-R2 PRs to Audit Pending after PR evidence is written.
4. Keep R3 PRs Draft/reference until before-merge/adoption audit.
5. Keep R4 work blocked until pre-execution approval/audit.
6. Record audit evidence in GitHub comments.
7. Merge only by explicit repo merge authority.

## Non-Goals
- no live AUN runner dispatch;
- no automatic queue assignment;
- no automatic approval;
- no automatic merge;
- no production deploy, secret change, destructive migration, customer data
  export, billing/value transfer, or permission broadening in Fast Lane.
