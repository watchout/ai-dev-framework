---
id: SPEC-M0-CONVEYOR-309-A-B
status: Draft
traces:
  impl: [IMPL-M0-CONVEYOR-309-A-B]
  verify: [VERIFY-M0-CONVEYOR-309-A-B]
  ops: [OPS-M0-CONVEYOR-309-A-B]
---

# SPEC: M0 Conveyor Audit Result And Reconcile

## 0. Meta
- Origin Issue: #309
- Scope: M0-A audit-report command and M0-B exact-head reconciler/transition planner
- Related: #293 PR-scoped audit evidence, #294 conveyor tick, #304 PR Cell Plan

## 1. Purpose
Make PR Conveyor audit completion durable and script-controllable before Shirube
claims internal M0 usability.

The minimum usable conveyor must not depend on ARC memory, Discord/AUN chat
statements, or mutable labels alone to decide that audit work is complete.

## 2. Authority Boundary
Audit result evidence is transition input, not merge authority.

- L1/L2/L3 auditors may post fixed `conveyor:audit-result/v1` evidence.
- The reconciler may produce deterministic label transition plans from that
  evidence.
- Merge authority remains separate.
- Implementation runners cannot approve, merge, draft-remove, or bypass CEO
  approval.
- Live AUN dispatch, DB mutation, queue drain, and Discord send remain
  forbidden in this slice.

## 3. Required Audit Result Fields
`conveyor:audit-result/v1` evidence must include:

- `repo`;
- `pr`;
- `role`;
- `verdict`;
- `head`;
- `base`;
- `route`;
- `next_state_recommendation`;
- `reported_by`;
- `recorded_at`.

Supported roles:

- `l1`;
- `l2`;
- `l3`.

Supported verdicts:

- `PASS`;
- `BLOCK`;
- `CHANGES_REQUESTED`;
- `HOLD`;
- `STALE_HEAD`;
- `NEEDS_INFO`.

## 4. Transition Rules
The reconciler may transition only when PR-local evidence matches the current
exact head, and current base when the snapshot includes base evidence.

| Current state | Evidence | Next state |
|---|---|---|
| `state:impl-l1` | L1 `PASS` with `audit:l2-required` | `state:impl-l2` |
| `state:impl-l1` | L1 `PASS` without L2 route | `state:impl-l3` |
| `state:impl-l2` | L2 `PASS` | `state:impl-l3` |
| `state:impl-l3` | L3 `PASS` | `state:done` plus `merge-ready` |
| L1/L2/L3 state | `BLOCK` or `CHANGES_REQUESTED` | `state:rework` |
| L1/L2/L3 state | `STALE_HEAD`, `NEEDS_INFO`, `HOLD`, missing or invalid evidence | no transition |

## 5. Safety Rules
- Missing fixed fields must not drive state.
- Label-only audit pass states must not drive state.
- Chat-only or in-session verdicts must not drive state.
- Stale-head evidence must keep the PR in its current audit lane.
- Dirty or conflicting PRs must not advance lanes.
- A blocked lower dependency must prevent upper PR pass transition.
- Consolidated batch verdicts must not pass multiple PRs.

## 6. Gate Behavior
This slice remains fixture/read-only.

- `conveyor audit-report` renders evidence or templates only.
- `conveyor reconcile --apply` applies planned labels only to the in-memory
  fixture result.
- No command in this slice mutates live GitHub state.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- fixed audit result evidence parses from comments and reviews;
- invalid or incomplete evidence is rejected with deterministic reasons;
- `conveyor audit-report --template` renders L1/L2/L3 fixed templates;
- reconcile reports include accepted evidence and `transition_plan`;
- `STALE_HEAD` and `NEEDS_INFO` are durable no-transition evidence;
- focused conveyor tests pass.

Missing field scenario:

```gherkin
Given a PR has a conveyor audit result without base or route
When the reconciler evaluates the PR
Then it reports missing_fixed_audit_result_fields
And it does not advance the PR state
```

Stale-head scenario:

```gherkin
Given a PR has exact-head evidence for an older head
When the reconciler evaluates the current PR head
Then it reports head_mismatch
And it keeps the current audit lane
```

No-transition verdict scenario:

```gherkin
Given an L2 auditor posts NEEDS_INFO for the current head
When the reconciler evaluates the PR
Then it accepts the evidence
And it plans no transition
```

## 8. Implementation Contract
The implementation changes:

- `src/cli/commands/conveyor.ts`;
- `src/cli/lib/conveyor-reconciler.ts`;
- conveyor command and reconciler tests;
- conveyor manifest, label-sync, and audit-sweeper fixtures.

## 9. Review Boundary
This slice is R3/Governed because it changes audit transition semantics for the
internal conveyor.

Required review:

- L1 audit for fixed schema and transition semantics;
- L2 implementation audit for parser/reconciler behavior;
- L3 or merge authority review only before merge readiness.

## 10. 制御機構選定原則
script 選定根拠: Audit transitions must be deterministic and replayable from PR
evidence before any runner or operator relies on them.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later call the same script
but cannot become the source of audit truth.

GitHub 選定根拠: GitHub PR comments/reviews host durable evidence. Labels project
state but do not prove audit completion by themselves.

LLM boundary: LLM output may draft findings but cannot satisfy audit completion
unless the fixed PR-local evidence block exists.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Fixed audit result | CLI/template | - | auditors need copyable durable evidence |
| Transition planning | script/library | - | exact-head state changes must be replayable |
| Label sync safety | fixture plan | - | no live mutation in M0-A/B |
| Chat-only rejection | script/library | - | state cannot depend on session memory |
| Merge separation | process + labels | - | merge authority remains separate |

## 11. Testing Layer
The implementation must add unit and CLI tests for:

- valid fixed audit result parsing;
- missing fixed field rejection;
- L1/L2/L3 PASS transitions;
- BLOCK and CHANGES_REQUESTED rework transitions;
- STALE_HEAD and NEEDS_INFO no-transition evidence;
- stale head and dirty PR blockers;
- label-only pass rejection;
- template rendering.

## 12. Non-Goals
- Do not implement live GitHub mutation.
- Do not implement guarded apply mode for live labels; that is M0-D.
- Do not implement current-ops tick expansion; that is M0-C.
- Do not implement user outcome gate; that is M0-E.
- Do not merge, approve, draft-remove, deploy, restart, mutate DB, drain queue,
  or send Discord.
