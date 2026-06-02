---
id: SPEC-WORKORDERAUTH-248
status: Draft
traces:
  impl: [IMPL-WORKORDERAUTH-248]
  verify: [VERIFY-WORKORDERAUTH-248]
  ops: [OPS-WORKORDERAUTH-248]
---

# SPEC: Work Order Authority and Action-Tool Approval Gates

## 0. Meta
- Origin Issue: #248
- Parent: #238 / Enterprise Delivery Graph
- Builds on: #244 Work Order contract warning gate
- Related: #249 product-wide Governance Bone

## 1. Purpose
Extend `work-order/v1` with authority, risk, approval, and evidence fields
needed before AUN or other action-tool surfaces can safely execute work.

This is still warning-first. It makes missing authority data visible and
auditable without claiming runtime dispatch, merge authority, or phase
transition authority.

## 2. Authority Schema
A Work Order must carry the following structured authority fields:

- work order id;
- repo;
- issue;
- parent issue;
- PR or change slice;
- branch policy;
- objective;
- scope;
- non-goals;
- owner roles;
- authority level;
- risk classification;
- affected systems or environments;
- allowed tool classes;
- required approvals;
- required evidence;
- rollback plan;
- context inputs;
- report format.

Allowed tool classes are `read`, `write`, `action`, and `privileged_action`.

## 3. Risk Classification
Risk values are:

- `low`: docs-only, read-only analysis, no external mutation;
- `medium`: code/test edits and non-sensitive repo changes;
- `high`: DB writes, GitHub mutation, Discord/public sends, credential-adjacent
  changes, or data migration;
- `critical`: deployment, merge/release, destructive operation, secret/token
  handling, customer data, broad automation, or policy change.

High or critical risk requires explicit approval evidence. Critical risk also
requires strict or multi-agent review evidence before action-tool work can be
treated as dispatch-ready in a later enforcement slice.

## 4. Approval Mapping
The Work Order must map risk to:

- allowed tool classes;
- required approvals;
- audit level;
- required verification evidence;
- rollback/replay evidence.

Privileged action-tool classes cannot be paired with low or medium risk without
a warning.

## 5. Delivery Graph Evidence
The Work Order must map authority data to Delivery Graph evidence:

- Kodama context-pack evidence;
- Wasurezu recovery or memory refs;
- AUN queue/message/execution/audit refs;
- tests, build, typecheck, lint, and gate results;
- approval evidence;
- exception records where applicable.

## 6. Gate Behavior
This slice adds warning-first G22 work_order rules:

| Rule | Purpose | Initial decision when invalid |
|------|---------|-------------------------------|
| `G22.work_order.authority_schema` | required authority schema fields | WARN |
| `G22.work_order.risk_approval_mapping` | risk to approval/audit/tool-class mapping | WARN |
| `G22.work_order.delivery_graph_evidence` | Delivery Graph evidence refs | WARN |

The default `--fail-on block` threshold does not stop current development.
Migration audits can use `--fail-on warn`.

## 7. Acceptance Criteria and Scenarios
- Existing G21 Work Order warning-first behavior remains intact.
- Complete Work Orders with #248 authority fields pass under
  `--fail-on warn`.
- Missing authority schema fields produce a G22 WARN.
- High/critical action-tool work without approval mapping produces a G22 WARN.
- Missing Delivery Graph evidence refs produce a G22 WARN.
- No Work Order text grants merge, phase, gate, or goal authority.

Authority schema scenario:

```gherkin
Given a work-order/v1 artifact omits repo, parent issue, branch policy, non-goals, or allowed tool classes
When the strict work_order check runs with --fail-on warn
Then G22.work_order.authority_schema reports WARN
And the migration audit fails
```

Risk approval scenario:

```gherkin
Given a work-order/v1 artifact declares critical risk and privileged_action tools
And it lacks approval evidence or strict review mapping
When the strict work_order check runs with --fail-on warn
Then G22.work_order.risk_approval_mapping reports WARN
And action-tool dispatch is not ready
```

Delivery Graph evidence scenario:

```gherkin
Given a work-order/v1 artifact lacks Wasurezu recovery refs or AUN execution refs
When the strict work_order check runs with --fail-on warn
Then G22.work_order.delivery_graph_evidence reports WARN
And reviewers can see which evidence references are missing
```

## 8. Non-Goals
- Do not execute AUN queues.
- Do not mutate GitHub issues or PRs.
- Do not promote Work Order warnings to hard BLOCK.
- Do not enforce merge authority.
- Do not grant LLM approval authority.
- Do not claim public, OSS, or enterprise readiness.

## 9. Review Boundary
L1/L2 review is required before the G22 warning gate is used as migration
evidence.

L3 review is required before G22 warnings become hard dispatch, merge, phase,
or action-tool authority blockers.

## 10. 制御機構選定原則
script 選定根拠: Work Order authority validation must be deterministic and
replayable. The TypeScript workflow-state evaluator and
`workflow check --action work_order` are the authority surface for this slice.

Hook 選定根拠: Hook 不採用. Hooks may call this script later for unavoidable
local interception, but they must not independently decide approval readiness.

GitHub 選定根拠: GitHub issues and PRs are evidence refs only. They do not
replace the Work Order authority schema.

AUN 選定根拠: AUN queue/message ids are evidence refs only. Shirube does not own
AUN queue state in this slice.

LLM boundary: an LLM may draft or execute from a Work Order. It cannot approve
its own Work Order, grant tool authority, pass gates, merge, transition phases,
or complete goals.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Authority schema validation | script (`workflow check`) | - | deterministic field validation |
| Risk/approval mapping | script (`workflow check`) | - | approval evidence must be machine-visible |
| Delivery Graph evidence mapping | script (`workflow check`) | - | evidence refs must be replayable |
| Dispatch blocking | future reviewed slice | - | this PR is warning-first only |

## 11. Testing Layer
Unit/integration CLI tests cover:

- complete Work Order with G21/G22 passing;
- missing authority schema fields;
- critical privileged action work without approval mapping;
- missing Delivery Graph evidence refs;
- existing authority grant warnings;
- existing warning-first missing Work Order behavior.
