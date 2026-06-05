---
id: SPEC-M0-CONVEYOR-309-C
status: Draft
traces:
  impl: [IMPL-M0-CONVEYOR-309-C]
  verify: [VERIFY-M0-CONVEYOR-309-C]
  ops: [OPS-M0-CONVEYOR-309-C]
---

# SPEC: M0 Conveyor Current Ops Tick

## 0. Meta
- Origin Issue: #309
- Scope: M0-C current-ops tick
- Depends on: SPEC-M0-CONVEYOR-309-A-B

## 1. Purpose
`conveyor tick` must produce one deterministic operating view for the current
PR conveyor state before Shirube claims internal M0 usability.

The tick is read-only. It turns fixture evidence into queues and blockers that
operators can audit without relying on ARC memory, chat summaries, or manual
guesswork.

## 2. Required Output
The JSON tick manifest must include `current_ops` with:

- lane queues by role;
- reconcile backlog;
- dirty audit queue;
- merged stale state cleanup;
- dependency release candidates;
- human approval notifications;
- unreviewed deployed commit blockers.

The human-readable `conveyor tick` output must include the same current-ops
sections and counts.

## 3. Safety Boundary
M0-C is read-only.

- `safe_to_apply` is always `false`.
- No GitHub label or comment mutation is performed.
- No merge, approval, draft removal, deploy, restart, launchctl, DB mutation,
  queue drain, Discord send, or AUN dispatch is allowed.
- Live discovery is still fixture-gated; missing `--fixture` remains an error.

## 4. Classification Rules
- Reconcile backlog contains PRs with safe transition plans.
- Dirty audit queue contains audit-lane PRs with skipped or finding reason
  codes.
- Merged stale cleanup contains merged PRs that still carry active audit or
  action labels.
- Human approval notifications contain CEO/human approval lane targets.
- Unreviewed deployed commit blockers contain deployments whose head is neither
  known merged nor represented by exact-head PASS audit evidence.

## 5. Acceptance Criteria
- `conveyor tick --json` exposes `current_ops`.
- `conveyor tick` prints current-ops counts and non-empty sections.
- Existing lane behavior remains deterministic.
- Focused manifest and command tests pass.

## 6. Gate Behavior
The tick must fail closed when no fixture is provided. Live discovery remains a
future slice and cannot be inferred from the local checkout or GitHub state.

The manifest may recommend work, cleanup, or notification targets, but it must
not execute any mutation.

## 7. Scenarios
Current ops scenario:

```gherkin
Given a fixture with PR lanes, audit evidence, dependencies, merged PRs, and deployments
When `conveyor tick --json` runs
Then the manifest includes `current_ops`
And the manifest lists each queue and blocker separately
```

Human-readable scenario:

```gherkin
Given a fixture with a safe transition plan
When `conveyor tick` runs without `--json`
Then the output includes current-ops counts
And it prints a Reconcile backlog section
```

## 8. Implementation Contract
The implementation changes:

- `src/cli/lib/conveyor-manifest.ts`;
- `src/cli/lib/conveyor-manifest.test.ts`;
- `src/cli/commands/conveyor.ts`;
- `src/cli/commands/conveyor.test.ts`;
- M0-C SPEC/IMPL/VERIFY/OPS docs and roadmap trace.

## 9. Review Boundary
This slice is R3/Governed because it changes the operator view used to decide
what work moves next.

Required review:

- L1 audit for queue semantics and read-only boundary;
- L2 audit for derived blocker correctness;
- L3 or merge authority review only before merge readiness.

## 10. 制御機構選定原則
script 選定根拠: The current-ops tick must be deterministic and replayable from
fixture evidence. A script/library boundary makes the queue derivation auditable.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later invoke the same tick,
but cannot be the source of current-ops truth.

GitHub 選定根拠: GitHub labels/comments are evidence inputs only. This slice does
not perform live GitHub discovery or mutation.

LLM boundary: LLM output may summarize a tick, but cannot add or remove queue
items unless the fixture evidence supports them.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Current ops queues | script/library | - | queue derivation must be replayable |
| Human-readable output | CLI | - | operators need inspectable output |
| Live mutation boundary | process + tests | - | M0-C is read-only |
| Deployed blocker surfacing | fixture evidence | - | deployed heads must be explicit inputs |

## 11. Testing Layer
The implementation must add unit and CLI tests for:

- JSON `current_ops` shape;
- lane queue counts;
- reconcile backlog;
- dirty audit queue;
- merged stale cleanup;
- dependency release candidates;
- human approval notifications;
- unreviewed deployed commit blockers;
- human-readable current-ops sections.

## 12. Non-Goals
- Do not implement live GitHub discovery.
- Do not implement guarded apply mode; that is M0-D.
- Do not implement user outcome gate; that is M0-E.
- Do not mutate labels or comments.
- Do not merge, approve, draft-remove, deploy, restart, mutate DB, drain queue,
  or send Discord/AUN messages.
