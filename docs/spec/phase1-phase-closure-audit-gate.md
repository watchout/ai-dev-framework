---
id: SPEC-PHASECLOSURE-224
status: Draft
traces:
  impl: [IMPL-PHASECLOSURE-224]
  verify: [VERIFY-PHASECLOSURE-224]
  ops: [OPS-PHASECLOSURE-224]
---

# SPEC: Phase Closure Audit Gate

## 0. Meta
- Origin Issue: #224
- Phase: Phase 1 internal applied dogfood
- Task: T2 Phase Closure Audit Gate
- Related: #217, #222, #223, #225, #233, #234, POSTMERGE-001

## 1. Purpose
Prevent Shirube from claiming a phase is complete until deterministic closure
evidence exists and the closure record proves the claim is bounded, audited,
and safe to carry into the next phase.

This is a Phase 1 control slice. It does not claim MVP, OSS, public, or
enterprise readiness by itself.

## 2. Required Closure Record
A phase closure claim requires a record with:

1. phase identifier;
2. phase objective;
3. exact readiness claim;
4. completed tasks;
5. merged PRs;
6. L0 evidence summary;
7. L1/L2/L3 coverage matrix;
8. unresolved blockers;
9. deferred or non-blocking items and why each is safe to carry;
10. residual risk register;
11. explicit non-claims;
12. next-phase entry conditions;
13. reopen or escalation criteria;
14. POSTMERGE-001 evidence for PRs that contribute to the phase exit claim.

The normative local shape is JSON at `.framework/phase-closure.json`.
Markdown is acceptable only when equivalent front matter or key-value metadata
can be parsed deterministically.

Required closure registers are resolved from the closure record root. Aliases
such as `tasks` or `prs` are valid only when they are root fields or explicit
containers inside the matching top-level register. Unrelated nested fields must
not satisfy `completed_tasks`, `merged_prs`, audit coverage, or POSTMERGE
requirements.

Empty placeholders do not count as evidence. This includes empty strings,
empty arrays or objects, explicit boolean `false`, and common placeholder
strings such as `none`, `missing`, `pending`, `todo`, or `tbd`.

## 3. Gate Rules
| Rule | Gate | Strict decision when missing or invalid | Remediation |
|------|------|------------------------------------------|-------------|
| `G12.phase_closure.record.present` | phase_closure | BLOCK | Create a phase closure record before claiming phase completion. |
| `G12.phase_closure.required_fields` | phase_closure | BLOCK | Fill every required closure field, including audit coverage and non-claims. |
| `G12.phase_closure.blockers_cleared` | phase_closure | BLOCK | Resolve blockers or move them to justified non-blocking carryovers. |
| `G12.phase_closure.carryovers_justified` | phase_closure | BLOCK | Add a safety rationale for every deferred/non-blocking carryover. |
| `G12.phase_closure.postmerge_evidence` | phase_closure | BLOCK | Link POSTMERGE-001 evidence for every merged PR that supports the phase claim. |

Minimal and standard profiles may emit WARN while Phase 1 migration is in
progress. Strict mode is required for any Shirube-internal phase closure claim.

## 4. CLI Behavior
`shirube workflow check --action phase_closure --profile strict --json`
must fail when the closure record is missing or incomplete.

The check is read-only. It must not infer readiness from LLM memory, chat
messages, or unstructured prose that lacks deterministic fields.

## 5. Acceptance Criteria
- Missing phase closure record produces a strict BLOCK for
  `G12.phase_closure.record.present`.
- A partial record missing completed tasks, L0 evidence, audit coverage,
  carryover rationale, or POSTMERGE evidence produces strict BLOCK decisions.
- Explicit `false` audit, carryover rationale, or POSTMERGE values produce
  strict BLOCK decisions.
- Nested unrelated `tasks` or `prs` aliases do not satisfy root closure
  registers.
- A complete closure record passes the `phase_closure` action in strict mode.
- `workflow explain` can explain the phase closure rules and their evidence.
- Trace verification remains complete across SPEC/IMPL/VERIFY/OPS.

## 6. Non-Goals
- Do not wire GitHub branch protection.
- Do not close a phase automatically.
- Do not require every future finding to be implemented before closure; require
  unresolved or deferred items to be assigned, justified, and non-claimed.
- Do not approve Phase 1 readiness, public MVP, OSS quality, or enterprise
  readiness from this task alone.

## 7. Acceptance Criteria
Acceptance scenario for strict phase closure:

```gherkin
Given a Shirube project has no complete phase closure record
When the operator runs `shirube workflow check --action phase_closure --profile strict --json`
Then the check fails with deterministic G12 phase_closure BLOCK decisions
And the failed decision includes rule id, gate, message, evidence refs, and remediation
```

The runtime boundary is the read-only workflow state/check layer.

This task may add deterministic validation logic and CLI projection for
`phase_closure`, but it must not mutate project phase state, close issues,
merge PRs, change branch protection, or publish external readiness claims.

## 8. Evidence Projection
Phase closure evidence is projected as:

- `workflow check --action phase_closure --profile strict --json`;
- `workflow explain G12.phase_closure.* --json`;
- local `phase_closure` evidence records inside `workflow-state/v1`;
- GitHub PR or issue comments only when they summarize the deterministic
  closure record and link to exact artifacts.

Private reasoning traces, transient agent memory, and unstructured chat logs
are not canonical evidence.

## 9. Manual Review Boundary
L1/L2 review is required before merging this gate implementation.

L3 is required before any team uses this gate result as a phase transition
claim. Passing `phase_closure` only proves the local closure record shape and
required evidence are present; it does not approve the phase itself.

## 10. 制御機構選定原則
script 選定根拠: Phase closure readiness must be deterministic, replayable,
and inspectable without LLM judgment. TypeScript workflow-state evaluators and
CLI checks are the primary control mechanism because they can emit stable JSON,
return non-zero on scoped BLOCK decisions, and be covered by fixtures.

Hook 選定根拠: hooks are intentionally not adopted in this slice. A future hook
may call the same script-controlled `phase_closure` check, but hooks must not
become canonical phase readiness evidence.

MCP/GitHub 選定根拠: MCP and GitHub Checks remain downstream wrappers. They may
project `G12.phase_closure.*` decisions later, but #224 does not use them as
the source of truth.

## 11. Testing Layer
Runtime implementation must include:

- unit or command fixtures for missing closure record;
- fixtures for partial closure records with missing required fields;
- fixtures for unresolved blockers;
- fixtures for deferred carryovers without safety rationale;
- fixtures for merged PRs without POSTMERGE evidence;
- a positive fixture where strict `phase_closure` passes.

The test layer must prove action scoping: `phase_closure` must not be treated
as `implementation_start`, `merge`, or `release`.
