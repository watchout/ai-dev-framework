# Phase 1 Internal Dogfood Start

> Status: Phase 1 T0/T1 start artifact
> Updated: 2026-05-26
> Tracking: #223, #222
> Related: #217, #224, #225, #226, #227, POSTMERGE-001

## 1. Purpose

This document starts Phase 1 without claiming Phase 1 readiness.

Phase 1 begins from the completed Phase 0 script-control baseline and applies the
Phase 0 self-dogfood operating frame to Shirube itself. The first Phase 1 goal is
to turn the current manual strict process into deterministic internal dogfood
control.

## 2. SPEC

### 2.1 Entry Claim

Phase 1 may start because Phase 0 is complete and the Phase 0 addendum
`POSTMERGE-001` has been merged, post-merge verified, and closed.

Phase 1 is not complete at start. Internal applied dogfood readiness remains
unclaimed until the Phase 1 sufficient exit conditions in `roadmap.md` are met.

### 2.2 Phase 1 First Work Order

| Order | Issue | Work item | Role in Phase 1 |
|---|---|---|---|
| T0 | #223 | Phase 0 Carryover Ledger, Task Assignment, and Addendum Policy | Prevent Phase 0 findings from remaining unassigned intake comments. |
| T1 | #222 | Internal Dogfood Start Gate | Make `init/start/run` unable to skip required process evidence under strict internal dogfood. |
| T2 | #224 | Phase Closure Audit Gate | Define closure evidence before the next phase completion claim. |
| T3 | #225 | `AUDITLEDGER-001` Audit Evidence and Approval Ledger | Structure L0/L1/L2/L3/L4 evidence and approver records. |
| T4 | #226 | Workflow Action Registry and Wrapper Semantics | Prevent action drift and diagnostic/enforcement wrapper misuse. |
| T5 | #227 | `CHAINCTRL-001` Script-Controlled Workflow Chain | Model the full development chain as deterministic state transitions. |

### 2.3 Operating Rules

Every Phase 1 task must include:

- task issue or task note;
- goal and phase trace;
- control mechanism note;
- SPEC/IMPL/VERIFY/OPS readiness or explicit non-applicability;
- L0 evidence;
- audit routing;
- disposition update for touched carryovers or old issues;
- `POSTMERGE-001` evidence when a PR contributes to a phase exit claim.

LLM output may draft artifacts, summarize state, or propose remediation. It must
not approve transition validity, phase readiness, merge authority, exceptions, or
closure claims.

### 2.4 Completed Phase Addendum Policy

Completed phases are immutable baseline records by default. Shirube must not
silently insert normal work into a completed phase.

Findings discovered after phase closure must be classified as:

- `completed`;
- `carry_forward`;
- `pre_next_phase_blocker`;
- `phase_addendum`;
- `reopen_phase`;
- `non_actionable`;
- `blocked`.

`phase_addendum` is allowed only as a linked addendum issue with explicit audit
and authority records. It is not a normal insertion into the closed phase task
list. `reopen_phase` requires L3 disposition, and L4 when public, enterprise,
business, or irreversible governance claims are affected.

### 2.5 Chain-Control Target

The target chain for Phase 1 modeling is:

1. intake / hearing;
2. Goal Contract approval;
3. V0/V1 goal sufficient conditions;
4. phase plan and phase exit criteria;
5. prior-phase carryover ledger;
6. feature catalog;
7. task DAG / task issue;
8. SPEC/IMPL/VERIFY/OPS readiness;
9. pre-implementation audit;
10. implementation start;
11. implementation evidence;
12. implementation audit;
13. PR publish / AI Change Record;
14. merge authority;
15. merge;
16. `POSTMERGE-001` verification;
17. goal progress update;
18. phase closure audit;
19. carryover assignment.

Phase 1 must make this chain visible and checkable through local CLI/JSON before
GitHub Check, hook, MCP, runtime, or release-workflow enforcement is claimed.

## 3. IMPL

Phase 1 starts with docs/schema and deterministic CLI planning, not broad
runtime enforcement.

Implementation order:

1. Update the roadmap so #223-#227 are visible Phase 1 tasks.
2. Use #223 to close the Phase 0 carryover ledger gap.
3. Use #222 to define and wire the first internal start/run gate checks.
4. Define #227 chain state and transition checks after the first start gate
   baseline is scoped.
5. Connect #224, #225, and #226 as inputs to the chain rather than duplicating
   them.

This artifact does not implement runtime enforcement. It authorizes Phase 1
planning and docs/schema work under the Phase 0 self-dogfood operating frame.

## 4. VERIFY

Minimum L0 verification for this artifact:

- `git diff --check`;
- `npm run build:cli`;
- `node dist/cli/index.js trace verify`.

Future verification for #222/#227 must include fixtures proving strict internal
dogfood cannot skip missing Goal Contract, SPEC/IMPL/VERIFY/OPS readiness,
pre-implementation audit, carryover ledger, post-merge evidence, or phase closure
records.

## 5. OPS

Operational handling:

- Keep #217 open as the live dogfood finding intake.
- Treat #223 as the current Phase 0 to Phase 1 transition ledger.
- Do not close #223 until every Phase 0 finding has a disposition.
- Do not claim Phase 1 readiness until #222 and the required supporting chain
  controls are implemented, verified, audited, and post-merge recorded.
- If a Phase 1 finding appears during this work, create or update an issue before
  implementation and assign it to a phase.

## 6. Exit Status

This document starts Phase 1 work. It does not complete #222, #223, or Phase 1.
