---
id: SPEC-WORKFLOWACTION-226
status: Draft
traces:
  impl: [IMPL-WORKFLOWACTION-226]
  verify: [VERIFY-WORKFLOWACTION-226]
  ops: [OPS-WORKFLOWACTION-226]
---

# SPEC: Workflow Action Registry and Wrapper Semantics

## 0. Meta
- Origin Issue: #226
- Parent: #238 / Enterprise Delivery Graph
- Related: #217, #223, #227, #244

## 1. Purpose
Remove workflow action-list drift and wrapper misuse risk before broader
workflow action expansion or runner enforcement wiring.

Shirube currently exposes workflow observability through multiple wrappers:
`workflow status`, `workflow doctor`, `workflow check`, and `workflow explain`.
Only `workflow check` is an enforcement wrapper. Diagnostic wrappers may report
BLOCK decisions while exiting successfully, so action names and wrapper
semantics must be canonical and machine-readable before MCP, GitHub, hook, or
CI adapters consume them.

## 2. Canonical Action Registry
The canonical source for checkable workflow actions is
`WORKFLOW_ACTION_REGISTRY`.

Each entry must define:

- `action`;
- `target_gate`;
- human-readable `description`;
- ordered `rule_ids` used by `workflow check --action <action>`.

CLI help, parser validation, and check report generation must read from this
registry. New action names must not be added directly to parser conditionals,
help text, or local rule maps.

Initial actions:

| Action | Target gate |
|--------|-------------|
| `audit_ledger` | `audit_ledger` |
| `design_draft` | `design` |
| `implementation_start` | `implementation_start` |
| `implementation_split` | `implementation_split` |
| `phase_closure` | `phase_closure` |
| `runtime_step` | `runtime_step` |
| `work_order` | `work_order` |
| `remote_publish` | `publish` |
| `merge` | `merge_authority` |
| `release` | `release` |

## 3. Wrapper Semantics
The canonical source for wrapper semantics is `WORKFLOW_WRAPPER_REGISTRY`.

| Wrapper | Kind | Exit behavior |
|---------|------|---------------|
| `workflow status` | projection | does not fail on workflow BLOCK decisions |
| `workflow doctor` | diagnostic | does not fail on workflow BLOCK decisions |
| `workflow check` | enforcement | exits non-zero when scoped decisions cross the threshold |
| `workflow explain` | explanation | exits non-zero only when the query is unknown |

Diagnostic output is useful evidence, but it must not be wired as enforcement.
MCP tools, GitHub checks, hooks, and CI jobs that need a blocking decision must
call `workflow check --action <action>` with an explicit threshold.

## 4. Enforcement Thresholds
`workflow check` evaluates only the action-scoped rule ids from
`WORKFLOW_ACTION_REGISTRY`.

Thresholds:

- default `--fail-on block`: fail on scoped BLOCK only;
- `--fail-on warn`: fail on scoped BLOCK or WARN;
- `--fail-on observe`: fail on scoped BLOCK, WARN, or OBSERVE.

Global BLOCK findings outside the selected action may appear in the surrounding
doctor report, but they do not make an action-scoped check fail unless their
rule id is in that action's registry entry.

## 5. Source-of-Truth Placement
The action registry is below the #238 Delivery Graph parent contract. It maps
known action names to gate rules; it does not approve the action, grant merge
authority, close phases, or decide goal progress.

`work-order/v1` (#244) may name a required action or gate. `workflow-chain/v1`
(#227) may consume the action registry for transition checks. Neither may
silently add unregistered action names.

## 6. Adapter Boundary
Adapters must preserve wrapper semantics:

- CLI wrappers must use the registry for parser/help/check behavior.
- MCP tools must expose whether they are diagnostic or enforcement wrappers.
- GitHub Checks that block merge must call enforcement wrappers.
- Hooks may call enforcement wrappers only for reviewed unavoidable local
  interception cases.
- AUN/runtime dispatch must not treat `workflow doctor` exit 0 as pass
  evidence.

## 7. Gate Behavior
The first slice is a registry/semantics slice. It does not add new workflow
gates or change existing action-scoped decisions.

Acceptance scenario for action registry:

```gherkin
Given an action is listed in WORKFLOW_ACTION_REGISTRY
When the operator runs workflow check --action for that action
Then the CLI parser accepts the action
And the check report uses the registry rule ids as applicable_rule_ids
```

Acceptance scenario for wrapper misuse:

```gherkin
Given workflow doctor reports BLOCK decisions
When workflow doctor exits
Then the command exits successfully because it is diagnostic
And an enforcement adapter must call workflow check instead
```

## 8. Acceptance Criteria
- Action names and action-to-rule mappings have one TypeScript SSOT.
- CLI help, action parsing, and check report generation consume that SSOT.
- Wrapper semantics are explicit and machine-readable.
- `workflow doctor` remains diagnostic and may exit 0 with BLOCK decisions.
- `workflow check` remains the enforcement wrapper and fails by threshold.
- Tests cover action registry uniqueness and diagnostic vs enforcement
  wrapper semantics.
- Docs instruct MCP, GitHub, hook, and CI integrations to call the enforcement
  wrapper when blocking behavior is required.

## 9. Non-Goals
- Do not add new workflow actions beyond the currently implemented set.
- Do not wire new MCP, GitHub, hook, or CI enforcement in this slice.
- Do not change merge authority, phase transition authority, or goal progress
  authority.
- Do not implement the #227 workflow chain state machine.
- Do not make diagnostic wrappers blocking.

## 10. 制御機構選定原則
script 選定根拠: action parsing, rule mapping, and enforcement thresholds must
be deterministic and testable. TypeScript registry data and workflow check
logic are the canonical mechanism.

Hook 選定根拠: hooks are not adopted in this slice. Future hooks may call
`workflow check`, but they must not maintain independent action lists or treat
diagnostic wrappers as enforcement.

Hook 採用時の不可避 4 case:

1. local source-edit interception before unsafe writes;
2. local secret or private-context leakage prevention before persistence;
3. local command dispatch prevention before runtime execution;
4. local emergency stop when CI/GitHub/MCP projection is unavailable.

None of these hooks is implemented by this slice. If adopted later, each hook
must call the same registry-backed `workflow check` and record evidence that it
is not an independent control plane.

GitHub 選定根拠: GitHub Checks may later project enforcement decisions. They
must consume `workflow check` output rather than reimplementing rule selection.

MCP 選定根拠: MCP wrappers may expose diagnostic and enforcement surfaces, but
the wrapper kind must remain visible so callers do not confuse `doctor` with a
blocking check.

LLM boundary: an LLM may summarize registry entries or suggest next actions.
It cannot add unregistered actions, change wrapper authority, or infer pass
status from diagnostic output.

| Requirement | Mechanism | Hook-only unavoidable case | Rationale |
|-------------|-----------|----------------------------|-----------|
| Action list SSOT | script registry | - | parser/help/check drift must be impossible by construction |
| Action rule mapping | script registry | - | check reports must cite deterministic rule ids |
| Diagnostic wrapper semantics | script registry + tests | - | doctor output may contain BLOCK while exit remains 0 |
| Enforcement wrapper semantics | `workflow check` | - | blocking adapters need threshold-based failure |
| Future adapter consumption | docs + registry | - | GitHub/MCP/hooks must not invent independent control planes |

## 11. Testing Layer
Testing layer declaration:

- unit: registry uniqueness, parse behavior, wrapper semantics.
- integration: workflow command tests proving check reports expose registry
  rule ids and doctor/check keep different exit semantics.
- regression: existing action scopes must not inherit unrelated gate blocks.
- smoke: CLI help and workflow command smoke tests continue to pass.

The first slice must run focused workflow and registry tests plus typecheck,
build, lint, trace verify, spec audit, diff-check, and full test before ready.
