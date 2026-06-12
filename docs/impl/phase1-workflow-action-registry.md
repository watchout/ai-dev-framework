---
id: IMPL-WORKFLOWACTION-226
status: Draft
traces:
  spec: [SPEC-WORKFLOWACTION-226]
  verify: [VERIFY-WORKFLOWACTION-226]
  ops: [OPS-WORKFLOWACTION-226]
---

# IMPL: Workflow Action Registry and Wrapper Semantics

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-action-registry.md` /
SPEC-WORKFLOWACTION-226.

## 1. Implementation Slices

### Slice A: Action Registry
Add `src/cli/lib/workflow-action-registry.ts` with
`WORKFLOW_ACTION_REGISTRY`. Each entry defines action name, target gate,
description, and applicable rule ids.

### Slice B: Parser and Help Consumption
Update `workflow check --action` parser and help text to consume the registry.
Invalid actions should report the registry-derived allowed action list.

### Slice C: Check Report Consumption
Update `createWorkflowCheckReport` so `applicable_rule_ids` comes from
`WORKFLOW_ACTION_REGISTRY`.

### Slice D: Wrapper Registry
Add `WORKFLOW_WRAPPER_REGISTRY` to declare status, doctor, check, and explain
wrapper kinds and exit behavior.

### Slice E: Regression Tests
Add tests for:

- action name uniqueness;
- per-action rule id uniqueness;
- parser acceptance of registry actions;
- wrapper kind separation;
- check report applicable rule ids coming from the registry;
- existing doctor/check exit semantics.

## 2. File-Level Impact
- `src/cli/lib/workflow-action-registry.ts`;
- `src/cli/lib/workflow-action-registry.test.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-workflow-action-registry.md`;
- `docs/impl/phase1-workflow-action-registry.md`;
- `docs/verify/phase1-workflow-action-registry.md`;
- `docs/ops/phase1-workflow-action-registry.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Keep the currently implemented action set unchanged.
- Keep `workflow doctor` diagnostic-only.
- Keep `workflow check` threshold-based enforcement.
- Do not connect new enforcement adapters in this slice.
- Do not change the semantics of #244 Work Order, #240 runtime step, #225 audit
  ledger, or #224 phase closure gates.

## 4. Future Integration
#227 should consume `WORKFLOW_ACTION_REGISTRY` when defining
`workflow-chain/v1` transition names and allowed next actions.

Future MCP, GitHub, hook, and CI wrappers should consume
`WORKFLOW_WRAPPER_REGISTRY` or equivalent generated metadata so they cannot
mistake diagnostic commands for enforcement.
