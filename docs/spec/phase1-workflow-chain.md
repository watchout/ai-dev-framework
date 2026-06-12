---
id: SPEC-WORKFLOWCHAIN-227
status: Draft
traces:
  impl: [IMPL-WORKFLOWCHAIN-227]
  verify: [VERIFY-WORKFLOWCHAIN-227]
  ops: [OPS-WORKFLOWCHAIN-227]
---

# SPEC: Script-Controlled Workflow Chain

## 0. Meta
- Origin Issue: #227
- Parent: #238 / Enterprise Delivery Graph
- Depends on: #226 workflow action registry
- Related: #222, #223, #224, #225, #240, #244

## 1. Purpose
Define `workflow-chain/v1`, a deterministic Phase 1 chain model for Shirube
dogfood development. The chain turns the conceptual intake-to-postmerge flow
into ordered transitions with required evidence, authority boundaries, and
machine-readable PASS/WARN/BLOCK/OBSERVE results.

This slice is local/CLI/JSON control. It does not make the chain a merge,
phase-transition, or goal-completion authority.

## 2. Chain Version
The chain schema version is `workflow-chain/v1`.

`workflow-chain/v1` is derived from:

- `workflow-state/v1` gate decisions;
- #226 `WORKFLOW_ACTION_REGISTRY` mappings where a transition has a checkable
  workflow action;
- local chain evidence artifacts for transitions not yet represented by
  `workflow-state/v1` rules.

## 3. Target Chain
The full target chain is listed and versioned in `WORKFLOW_CHAIN_TRANSITIONS`.

| Order | Transition | Registry action |
|-------|------------|-----------------|
| 1 | `intake_hearing` | `design_draft` |
| 2 | `goal_contract_approval` | - |
| 3 | `sufficient_conditions` | - |
| 4 | `phase_plan` | - |
| 5 | `carryover_ledger` | - |
| 6 | `feature_catalog` | - |
| 7 | `task_issue` | - |
| 8 | `doc4l_readiness` | - |
| 9 | `pre_impl_audit` | - |
| 10 | `implementation_start` | `implementation_start` |
| 11 | `implementation_evidence` | - |
| 12 | `implementation_audit` | `audit_ledger` |
| 13 | `pr_publish` | `remote_publish` |
| 14 | `merge_authority` | `merge` |
| 15 | `merge` | `merge` |
| 16 | `postmerge_verify` | - |
| 17 | `goal_progress_update` | - |
| 18 | `phase_closure_audit` | `phase_closure` |
| 19 | `carryover_assignment` | - |

Transition ids are chain ids. Registry actions are checkable workflow actions
from #226 and must not be invented locally.

## 4. Required Evidence
Transitions backed by existing workflow rules consume `workflow-state/v1`
decisions. Transitions that do not yet have lower-level rules require local
chain artifacts:

- `.framework/goal-sufficient-conditions.json|md`;
- `.framework/carryover-ledger.json|md`;
- `.framework/feature-catalog.json|md` or `.framework/features.json`;
- `.framework/implementation-evidence.json|md`;
- `.framework/implementation-audit.json|md`;
- `.framework/postmerge-001.json|md` or `.framework/postmerge.json`;
- `.framework/goal-progress.json|md`;
- `.framework/carryover-assignment.json|md`.

The first slice validates presence and non-empty content only for these
chain-local artifacts. Shape hardening can be promoted in later reviewed
slices.

## 5. Authority Semantics
Every transition declares an authority owner and forbidden authority:

- LLM output cannot approve transition validity.
- Chain status cannot grant merge authority.
- Chain status cannot complete a phase.
- Chain status cannot complete a goal.

The chain may identify missing prerequisites and allowed next work; it cannot
silently substitute for human or governance approval.

## 6. Profile Behavior
Missing chain-local artifacts are profile-sensitive:

- `strict`: BLOCK;
- `standard`: WARN;
- `minimal`: WARN.

Existing `workflow-state/v1` decisions keep their original profile behavior.
`workflow chain check --fail-on block|warn|observe` decides exit status from
the scoped chain decisions.

## 7. CLI Behavior
`workflow chain status --json` emits the full chain report.

`workflow chain check --action <transition-or-action> --json` evaluates all
transitions up to and including the target transition. Exact transition ids are
preferred. Unique registry action aliases may resolve to their transition.

Strict chain checks must not allow a later transition when prior required
transitions are BLOCK.

Acceptance scenario for prior-step blocking:

```gherkin
Given workflow-chain/v1 has a target transition implementation_start
And the carryover_ledger transition has missing required evidence
When the operator runs workflow chain check --action implementation_start --profile strict --json
Then the chain check fails
And the scoped decisions include a BLOCK for G22.workflow_chain.carryover_ledger.present
```

Acceptance scenario for diagnostic projection:

```gherkin
Given workflow-chain/v1 has missing POSTMERGE-001 evidence
When the operator runs workflow chain status --json
Then the command emits the chain report without granting merge, phase, or goal authority
And an enforcement adapter must call workflow chain check with an explicit target transition
```

## 8. Acceptance Criteria
- The 19-step target chain is listed and versioned.
- Each transition has deterministic required rules and/or artifacts.
- Each transition has declared authority semantics.
- CLI status and check output are machine-readable.
- Strict checks block missing Goal Contract, SPEC/IMPL/VERIFY/OPS readiness,
  pre-implementation audit, carryover ledger, POSTMERGE evidence, and phase
  closure record.
- The chain consumes #226 action registry rule ids; it does not maintain an
  independent checkable action list.

## 9. Non-Goals
- Do not wire GitHub, MCP, hook, AUN, or CI enforcement in this slice.
- Do not grant merge authority.
- Do not grant phase-transition authority.
- Do not grant goal-completion authority.
- Do not make `workflow-chain/v1` the final enterprise runner.
- Do not fully validate chain-local artifact schemas in the first slice.

## 10. 制御機構選定原則
script 選定根拠: transition validity must be deterministic. The chain model is
implemented as TypeScript data plus pure derivation from `workflow-state/v1`
and local artifact presence.

Hook 選定根拠: hooks are not adopted in this slice. Future hooks may call
`workflow chain check`, but they must not maintain independent transition
lists.

Hook 採用時の不可避 4 case:

1. local source-edit interception before unsafe writes;
2. local secret or private-context leakage prevention before persistence;
3. local command dispatch prevention before runtime execution;
4. local emergency stop when CI/GitHub/MCP projection is unavailable.

GitHub 選定根拠: GitHub Checks may later project chain decisions, but this slice
only emits CLI JSON.

MCP 選定根拠: MCP may later expose chain status/check as structured tools. It
must preserve the distinction between report projection and authority.

LLM boundary: an LLM may summarize chain state. It cannot approve a transition,
skip a prior transition, invent an action, or infer pass from a diagnostic
report.

| Requirement | Mechanism | Hook-only unavoidable case | Rationale |
|-------------|-----------|----------------------------|-----------|
| Ordered target chain | script registry | - | transition order must be stable |
| Prior-step enforcement | `workflow chain check` | - | later actions must cite earlier evidence |
| Artifact presence | script file checks | - | early dogfood needs deterministic local evidence |
| Adapter projection | future CLI/JSON consumers | - | adapters must not become control planes |
| Emergency local stop | future reviewed hook | cases 1-4 | only local interception can stop unsafe writes before persistence |

## 11. Testing Layer
Testing layer declaration:

- unit: chain order, transition id uniqueness, action alias resolution.
- integration: CLI `workflow chain status/check` JSON behavior.
- regression: strict missing Goal Contract, SPEC readiness, pre-implementation
  audit, carryover ledger, POSTMERGE evidence, and phase closure record.
- smoke: existing workflow status/check/explain behavior remains unchanged.

Required validation before ready state:

- focused workflow-chain and workflow command tests;
- type-check;
- build:cli;
- lint;
- trace verify;
- spec audit;
- diff-check;
- full test.
