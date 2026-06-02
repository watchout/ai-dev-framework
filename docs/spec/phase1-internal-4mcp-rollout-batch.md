---
id: SPEC-4MCPROLLOUT-273
status: Draft
traces:
  impl: [IMPL-4MCPROLLOUT-273]
  verify: [VERIFY-4MCPROLLOUT-273]
  ops: [OPS-4MCPROLLOUT-273]
---

# SPEC: Internal 4MCP PR Conveyor Rollout Batch

## 0. Meta
- Origin Issue: #273
- Parent Issue: #266
- Depends on: #269 delivery profile, #270 Work Order defaults, #267 PR
  evidence, #268 GitHub queue projection, #271 runner instruction packs
- Related: #264 4MCP safety profile, #249 Governance Bone, #272 AUN bridge

## 1. Purpose
Define the internal IYASAKA rollout guide and first Work Order batch for using
the PR Conveyor on 4MCP completion work.

This slice makes the operating order explicit. It does not implement a runner,
dispatch AUN work, mutate GitHub state, approve protected operations, or merge.

## 2. Rollout Order
Rollout uses two waves.

Wave 1 builds and stabilizes the conveyor substrate:

1. Shirube profile, Work Order, PR evidence, queue/WIP, runner packs, and this
   rollout batch.
2. AUN internal stabilization PRs only.
3. Wasurezu memory/recovery safety and evidence continuity.

Wave 2 applies the conveyor after the minimum substrate is usable:

1. Kodama context-pack/get_context PRs.
2. Totonoe dogfood preparation after 4MCP minimum readiness.

Kodama and Totonoe must not block Wave 1.

## 3. Work Order Batch Contract
Each initial Work Order must state:

- work_order_id;
- repo and tracking issue;
- delivery strategy;
- runner policy;
- work unit;
- lane;
- risk class;
- architecture owner;
- implementation owner;
- review owner;
- audit owner;
- merge authority;
- scope and non-goals;
- allowed files/actions;
- forbidden actions;
- verification commands;
- PR mode;
- audit timing;
- stop conditions;
- fallback next work policy.

## 4. Risk and Audit Timing
The batch follows the IYASAKA internal PR Conveyor defaults:

| Risk | Strategy | Audit timing | PR handling |
|------|----------|--------------|-------------|
| R0-R2 | `pr_conveyor` | after PR, before merge | normal PR to Audit Pending |
| R3 | `phase_conveyor` | before merge/adoption | draft/reference until owner adopts |
| R4 | `serial_gate` | before execution | blocked until approval/audit |

Merge is never automatic.

## 5. Target Repositories
The first batch covers these internal products:

- Shirube: `watchout/ai-dev-framework`
- AUN: `watchout/agent-comms-mcp`
- Wasurezu: `watchout/agent-memory`
- Kodama: `watchout/kodama`
- Totonoe: `watchout/totonoe`

Shirube, AUN, and Wasurezu are Wave 1. Kodama and Totonoe are Wave 2.

## 6. AUN Boundary
AUN live dispatch remains out of scope.

Allowed before #272:

- mirror Work Order or PR evidence;
- receive audit notification evidence;
- remain a referenced future dispatch surface.

Forbidden before #272 and safety stack acceptance:

- select next Work Order;
- dispatch a runner;
- approve execution;
- bypass stop conditions;
- merge.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- a rollout guide exists for internal IYASAKA use;
- the first Work Order batch includes PR-sized work for Shirube, AUN, Wasurezu,
  Kodama, and Totonoe;
- at least one Shirube Work Order is ready for implementation;
- at least one AUN Work Order is ready without enabling live dispatch;
- at least one Kodama Work Order targets context-pack/get_context;
- at least one Wasurezu Work Order targets recovery/memory safety;
- Totonoe is marked dogfood-after-4MCP-minimum, not a Wave 1 blocker;
- all Work Orders declare strategy, risk, audit timing, owners, merge
  authority, stop conditions, and verification commands.

Wave 1 scenario:

```gherkin
Given the first Work Order batch is used for internal 4MCP rollout
When Wave 1 is selected
Then Shirube, AUN, and Wasurezu Work Orders are available
And Kodama and Totonoe are not required to start Wave 1
```

AUN boundary scenario:

```gherkin
Given an AUN stabilization Work Order is in the batch
When a runner reads the Work Order
Then live AUN dispatch remains forbidden
And merge remains outside runner authority
```

Totonoe timing scenario:

```gherkin
Given a Totonoe dogfood Work Order is in the batch
When the 4MCP minimum is not yet usable
Then the Work Order remains deferred
And it does not block Wave 1 completion
```

## 8. Implementation Contract
Implement as docs and templates:

- 4-layer SPEC/IMPL/VERIFY/OPS artifacts;
- rollout guide under `docs/specs`;
- first Work Order batch under `templates/work-orders`;
- roadmap trace.

## 9. Review Boundary
This slice is R3/Governed because it changes internal operating guidance across
multiple repositories.

Required review:

- L1 spec review for rollout order, risk/audit timing, and authority boundary;
- L2 implementation audit for artifact completeness and Work Order fields;
- R3 before-merge/adoption audit before this guidance is treated as accepted.

## 10. 制御機構選定原則
script 選定根拠: This slice does not add a new script; it consumes prior
deterministic checks for profile, Work Order, PR evidence, queue, and runner
packs.

Hook 選定根拠: Hook 不採用. Rollout guidance must not become a local
interception authority.

GitHub 選定根拠: GitHub issues, PRs, labels, and comments remain the initial
source of truth for Work Orders and evidence.

LLM boundary: LLM output may draft Work Orders and reports, but cannot approve
protected operations, satisfy audit, grant merge authority, or start live AUN
dispatch.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Rollout order | docs/specs guide | - | cross-repo operating contract |
| First batch | Work Order template | - | reusable GitHub-native work units |
| Audit timing | Work Order fields | - | risk-specific before merge/execution gates |
| AUN boundary | docs + Work Order non-goals | - | no live dispatch before #272 |
| Merge boundary | Work Order authority fields | - | merge remains human/repo authority |

## 11. Testing Layer
Validation for this docs-only slice:

- trace verification;
- spec gate validation;
- diff check;
- smoke review of Work Order batch fields;
- no runtime tests required because no CLI/runtime behavior changes.

## 12. Non-Goals
- Do not implement #272 AUN bridge.
- Do not enable live AUN dispatch.
- Do not create live GitHub labels or Projects automation.
- Do not execute Work Orders.
- Do not automate audit, approval, or merge.
