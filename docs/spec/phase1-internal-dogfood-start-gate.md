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
9. lifecycle notification record for `task_start` and `blocked` events.

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
| `G18.admin_notice.lifecycle_record` | admin_notice | BLOCK | Record `task_start` or `blocked` notification evidence. |

`G18` is a local lifecycle evidence requirement in #222. External adapter delivery remains #229 unless that task is pulled forward and reviewed separately.

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
For #222, lifecycle notification is satisfied by a deterministic record in local or GitHub evidence:

- event type: `task_start` or `blocked`;
- task or feature id;
- phase;
- timestamp;
- actor;
- destination or fallback channel;
- result: `recorded`, `delivered`, `skipped_with_approved_rationale`, or `failed`.

If no external adapter exists, a local append-only record is acceptable in strict mode only when it is referenced by workflow evidence. Silent omission is not acceptable.

## 7. Non-Goals
- Do not wire public GitHub Checks or branch protection.
- Do not implement hook/MCP/runtime interception.
- Do not make AUN, Discord, or any single communication adapter mandatory.
- Do not claim Phase 1 completion.
- Do not replace POSTMERGE-001 or phase closure audit.

## 8. Acceptance Criteria
- `workflow status --json` exposes present and missing evidence for the #222 readiness set.
- `workflow check --action implementation_start --profile strict --json` fails when any strict-required #222 evidence is missing.
- `shirube start --audit-level strict` fails before session write/resume when the implementation-start check fails.
- Fixtures prove strict mode cannot skip Goal Contract, phase plan, task trace, DOC4L readiness, pre-implementation audit, and lifecycle notification evidence.
- Minimal/standard profiles retain migration-safe behavior and do not silently claim internal dogfood readiness.
