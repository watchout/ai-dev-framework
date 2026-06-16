---
id: SPEC-PROGRESSVIEW-234
status: Draft
traces:
  impl: [IMPL-PROGRESSVIEW-234]
  verify: [VERIFY-PROGRESSVIEW-234]
  ops: [OPS-PROGRESSVIEW-234]
---

# SPEC: Report-Time Progress Visualization

## 0. Meta
- Origin Issue: #234
- Feature id: PROGRESSVIEW-001
- Phase: Phase 1 T7
- Related: #224, #225, #227, #229, #232

## 1. Purpose
Define `progress-snapshot/v1`, a deterministic report-time view that lets
operators and management see current development position across one or more
streams without reading a long prose report.

The snapshot is a projection. It must not approve audits, merge readiness,
phase closure, goal completion, or runtime execution.

## 2. Snapshot Model
`progress-snapshot/v1` contains:

- project id and generated timestamp;
- one or more streams;
- active phase id and active task id per stream;
- ordered phases with phase name, short name, intent, status, and tasks;
- task id, task name, status, issue/PR references, current gate, and summary;
- gate status for spec, impl, local verify, CI, L1, L2, L3, merge, and
  post-merge;
- current step, next required action, blockers, open audit requirements,
  last-updated timestamp, and evidence source.

Derived render state must include:

- active phase;
- current task;
- previous/current/next task neighborhood;
- phase progress percent and completed/total task count;
- whether the progress percent is approximate because partial task credit was
  counted.

## 3. Renderers
Minimum renderers:

| Surface | Renderer | Requirement |
|---|---|---|
| GitHub issue/PR comments | Markdown table | Multi-stream summary plus nearby task table. |
| CLI and short notifications | Compact text | ASCII progress bar, current gate, now, next, nearby tasks. |
| Discord/AUN/chat | Japanese admin compact text | No wide Markdown table; current phase/task, purpose, state, next, phase overview, and current-phase task list. |
| Tooling/dashboard seed | JSON | Stable `progress-snapshot/v1` payload. |

Japanese routine reports should use compact task symbols:

- done: `☑︎`
- current: `→`
- pending: leading spaces only

Long Japanese admin view is used for onboarding, first explanation, or explicit
detail requests.

## 4. Report Policy
Admin-facing progress reports should include a progress snapshot block when
structured phase/task state exists. The block is required for routine internal
dogfood status reports and optional for low-level developer-only logs.

The compact Japanese admin view must preserve enough context to answer:

- which phase is active;
- why that phase exists;
- which task is active;
- what gate or review is current;
- what the next action is;
- how all tasks in the current phase are distributed.

## 5. Multi-Stream Support
The model must represent multiple concurrent streams without collapsing them
into a single ambiguous task. Renderers must show one stream row or block per
stream and keep each stream's active phase/task/gate independent.

## 6. Transitional Adapter
Until the full Phase 1 tracker is generated from a canonical durable state,
`status-engine` output may be adapted into a single-stream snapshot. This
adapter is explicitly transitional and does not make `.framework/*` local
state a merge or phase-closure authority.

## 7. Acceptance Criteria
- SPEC/IMPL/VERIFY/OPS artifacts exist for PROGRESSVIEW-001.
- `ProgressSnapshot` is typed and test-covered.
- Markdown, compact text, Japanese admin, and JSON renderers are implemented.
- The Japanese compact renderer includes phase overview and every current-phase
  task in one-line form.
- Current phase and current task are visibly marked.
- Approximate progress is labeled when partial task credit is counted.
- Multi-stream output is supported without merged or ambiguous status.
- Existing `status` output remains unchanged unless `--progress-view` is used.

Acceptance scenario for Japanese compact output:

```gherkin
Given a progress-snapshot/v1 stream has Phase 1 as the active phase
And Phase 1 has T0 through T7 tasks
And T2 is the active task
When the Japanese compact renderer formats the snapshot
Then the output shows the active phase, active task, progress percent, current gate, and next action
And every task from T0 through T7 remains visible in one-line form
And pending tasks are shown with leading spaces instead of a wide table or verbose pending label
```

Acceptance scenario for multi-stream output:

```gherkin
Given a progress-snapshot/v1 payload contains two active streams
When the Markdown renderer formats the snapshot
Then each stream has its own phase, current task, gate, status, and next action row
And the nearby task summaries are grouped by stream
And no renderer collapses the two streams into one ambiguous current task
```

## 8. Non-Goals
- Do not build a web dashboard in Phase 1.
- Do not require Discord or AUN.
- Do not replace audit authority with a progress display.
- Do not treat snapshot generation as completion evidence.
- Do not claim public/enterprise reporting maturity from this internal renderer.

## 9. Failure Handling
- If structured phase/task state is missing, omit the snapshot or render an
  explicitly empty transitional snapshot.
- If rendered progress conflicts with GitHub PR/issue/CI/review evidence, treat
  GitHub as source of truth and regenerate the snapshot.
- If chat output wraps poorly, use compact Japanese output with bounded line
  length or split the report by stream.

## 10. 制御機構選定原則
script 選定根拠: progress rendering is deterministic transformation from a
typed snapshot. The CLI path calls pure TypeScript functions and does not ask
an LLM to decide phase, gate, merge, or completion state.

Hook 選定根拠: hooks are not adopted in this slice. Future hooks may embed a
snapshot into a local report only after a reviewed adapter calls the script
renderer.

Hook 採用時の不可避 4 case:

1. local source-edit interception before unsafe writes;
2. local secret or private-context leakage prevention before persistence;
3. local command dispatch prevention before runtime execution;
4. local emergency stop when CI/GitHub/MCP projection is unavailable.

GitHub 選定根拠: GitHub issue/PR comments are an intended output surface for
Markdown snapshots. GitHub remains evidence source of truth when it conflicts
with a rendered report.

MCP 選定根拠: MCP may later expose snapshot rendering as a read-only report
tool. It must not become an approval or merge authority.

LLM boundary: an LLM may summarize or translate a snapshot. It cannot infer
hidden progress, mark gates passed, approve review, close issues, or complete
goals from the snapshot alone.

| Requirement | Mechanism | Hook-only unavoidable case | Rationale |
|---|---|---|---|
| Snapshot derivation | script library | - | report output must be reproducible |
| Chat-safe rendering | script renderer | - | line shape and task visibility must be tested |
| GitHub Markdown rendering | script renderer | - | table output must be stable for PR comments |
| Future report embedding | reviewed adapter | cases 1-4 only for local interception | adapters must not own authority |

## 11. Testing Layer
Testing layer declaration:

- unit: progress calculation, active phase/task derivation, renderer output.
- integration: `status --progress-view` projection from `StatusResult`.
- regression: existing `status` and `status --json` behavior remains unchanged
  without `--progress-view`.
- golden snapshot: Japanese compact output keeps all current-phase task ids and
  avoids wide Markdown tables.

## 12. Review Requirements
- L0 required.
- L1 required for operator clarity and overclaim prevention.
- L2 required when status/report semantics are reviewed.
- L3 required only if a future change makes the snapshot an authority input for
  merge, phase closure, or goal completion.
