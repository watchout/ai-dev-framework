---
id: SPEC-DOGFOOD-222
status: Draft
traces:
  impl: [IMPL-DOGFOOD-222]
  verify: [VERIFY-DOGFOOD-222]
  ops: [OPS-DOGFOOD-222]
---

# SPEC: Phase 1 Internal Dogfood Start Gate

## 0. Meta
- Origin Issue: #222
- Phase: Phase 1 internal applied dogfood
- Task: T1 Internal Dogfood Start Gate
- Related: #217, #223, #224, #225, #226, #227, #229, POSTMERGE-001

## 1. Purpose
Make Shirube internally applicable by ensuring `shirube init`, `shirube start`, and the first implementation entrypoint cannot advance normal framework-led development under strict internal dogfood when required Shirube process evidence is missing.

This is the first Phase 1 enforcement slice. It converts the Phase 1 operating rule into deterministic start/run readiness checks, without claiming public MVP, OSS quality, or enterprise readiness.

## 2. Required Evidence
Strict internal dogfood readiness requires evidence for:

1. project application state;
2. Goal Contract approval;
3. phase plan and task order;
4. feature/task trace;
5. SPEC/IMPL/VERIFY/OPS readiness for the selected task, or explicit non-applicability;
6. pre-implementation audit disposition;
7. role binding and role separation readiness;
8. hearing or human-confirmed intake evidence;
9. lifecycle notification evidence sink readiness, plus same-transition records
   for `task_start` and `blocked` events.

Missing evidence must be represented as a deterministic gate decision, not as an implicit LLM memory gap.

## 3. Gate Rules
| Rule | Gate | Strict decision when missing | Remediation |
|------|------|------------------------------|-------------|
| `G0.start_boundary.project_applied` | start_boundary | BLOCK | Run `shirube retrofit` or `shirube init` to create project state. |
| `G10.goal_contract.approved` | goal_contract | BLOCK | Create or import an approved V0/V1 Goal Contract. |
| `G10.phase_plan.present` | phase_plan | BLOCK | Create a phase plan that traces to the Goal Contract. |
| `G10.task_trace.present` | task_trace | BLOCK | Link the selected task to phase, issue, and feature/task decomposition. |
| `G10.doc4l.readiness` | doc4l | BLOCK | Add SPEC/IMPL/VERIFY/OPS docs or explicit non-applicability. |
| `G11.pre_impl_audit.disposition` | pre_impl_audit | BLOCK | Record pre-implementation audit PASS or an approved non-applicability rationale. |
| `G1.roles.required_bindings` | roles | BLOCK | Configure required role bindings. |
| `G1.roles.separation` | roles | BLOCK | Separate producer and authority roles. |
| `G2.hearing.required_confirmation` | hearing | BLOCK | Complete discovery/hearing or record human-confirmed intake. |
| `G18.admin_notice.sink_ready` | admin_notice | BLOCK | Configure a deterministic lifecycle evidence sink or local fallback. |
| `G18.admin_notice.lifecycle_record` | admin_notice | BLOCK | Emit the required same-transition `task_start` or `blocked` notification record. |

`G18` is a local lifecycle evidence requirement in #222. External adapter
delivery remains #229 unless that task is pulled forward and reviewed
separately. `G18.admin_notice.lifecycle_record` is not a pre-existing
input that must exist before `start`; it is a transition output that the
command must create before mutating session state or before exiting blocked.

## 4. Profile Behavior
| Profile | Behavior |
|---------|----------|
| minimal | Missing dogfood evidence is WARN unless the project is not applied. Intended for lightweight/local work only. |
| standard | Missing Goal Contract, phase plan, task trace, DOC4L readiness, and pre-implementation audit are WARN until the migration task enables blocking. |
| strict | Missing required evidence BLOCKS `start` and implementation entrypoints. |

Strict mode is the only mode that can be used for Phase 1 internal dogfood readiness claims.

## 5. Start/Run Boundary
`shirube start --audit-level strict` must evaluate the same action-scoped workflow rules as `shirube workflow check --action implementation_start --profile strict`.

The command may still create diagnostic output in dry-run mode, but a non-dry-run strict start must not write or resume `.framework/current-session.json` when scoped decisions are BLOCK.

## 6. Lifecycle Notification Requirement
For #222, lifecycle notification has two deterministic parts:

1. pre-transition sink readiness: a configured evidence sink, local fallback,
   or GitHub comment target is available before strict `start` can attempt a
   session transition;
2. same-transition record emission: the command writes `task_start` or
   `blocked` lifecycle evidence during the transition that produced the event.

The lifecycle record shape is:

- event type: `task_start` or `blocked`;
- task or feature id;
- phase;
- timestamp;
- actor;
- destination or fallback channel;
- result: `recorded`, `delivered`, `skipped_with_approved_rationale`, or `failed`.

If no external adapter exists, a local append-only record is acceptable in
strict mode only when it is referenced by workflow evidence. Silent omission is
not acceptable.

Same-transition semantics:

- read-only `workflow check --action implementation_start` validates sink
  readiness and reports whether required process evidence is missing; it does
  not require a `task_start` record that cannot exist yet;
- `shirube start --audit-level strict` must write `task_start` after all
  strict preconditions pass and before `.framework/current-session.json` is
  written or resumed;
- if strict preconditions fail, `shirube start` must write a `blocked` record
  containing the blocking rule ids before it exits non-zero;
- if lifecycle record emission fails, strict `start` must fail closed and must
  not write or resume the session;
- repeated dry-run checks may print the would-record lifecycle payload, but
  must not write lifecycle evidence unless an explicit future option is added.

## 7. Acceptance Criteria
Acceptance scenario for strict internal dogfood:

```gherkin
Given a Shirube project is started with the strict internal dogfood profile
And required Goal Contract, phase plan, task trace, DOC4L readiness, pre-implementation audit, or lifecycle evidence sink readiness is missing
When the operator runs `shirube workflow check --action implementation_start --profile strict --json`
Then the check fails with a deterministic BLOCK decision
And the failed decision includes rule id, gate, message, evidence refs, and remediation
```

- `workflow status --json` exposes present and missing evidence for the #222 readiness set.
- `workflow check --action implementation_start --profile strict --json` fails when any strict-required #222 evidence is missing.
- `shirube start --audit-level strict` fails before session write/resume when the implementation-start check fails.
- Fixtures prove strict mode cannot skip Goal Contract, phase plan, task trace, DOC4L readiness, pre-implementation audit, lifecycle sink readiness, or same-transition lifecycle record emission.
- Minimal/standard profiles retain migration-safe behavior and do not silently claim internal dogfood readiness.

## 8. Non-Goals
- Do not wire public GitHub Checks or branch protection.
- Do not implement hook/MCP/runtime interception.
- Do not make AUN, Discord, or any single communication adapter mandatory.
- Do not claim Phase 1 completion.
- Do not replace POSTMERGE-001 or phase closure audit.

## 9. Evidence Projection
The initial evidence projection is local-first:

- CLI JSON for `workflow status`, `workflow doctor`, `workflow check`, and `workflow explain`;
- local files under `.framework/` for lifecycle records when no external adapter is configured;
- GitHub issue or PR comments only when the operator explicitly records review, audit, or lifecycle evidence there.

Private reasoning traces and transient agent memory are not evidence by default.

## 10. 制御機構選定原則
script 選定根拠: #222 gate decisions must be deterministic, replayable, and inspectable without LLM judgment. TypeScript workflow-state evaluators and CLI checks are the primary control mechanism because they can emit stable JSON, return non-zero on scoped BLOCK decisions, and be covered by unit, integration, and regression tests.

Hook 選定根拠: hooks are intentionally not adopted in this slice. A later hook may call the same script-controlled `implementation_start` check only for unavoidable local interception, but hooks must not become canonical workflow state.

MCP/GitHub 選定根拠: MCP and GitHub Checks remain downstream wrappers. They may project the same decisions later, but #222 does not use them as the source of truth.

## 11. Testing Layer
Runtime implementation must include:

- unit tests for workflow-state rule evaluation;
- integration tests for `workflow check --action implementation_start --profile strict --json`;
- regression tests proving strict mode blocks missing Goal Contract, phase plan, task trace, DOC4L readiness, pre-implementation audit, and lifecycle notification evidence;
- smoke tests for `shirube start --audit-level strict --dry-run` and non-dry-run session write blocking.
