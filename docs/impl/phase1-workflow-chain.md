---
id: IMPL-WORKFLOWCHAIN-227
status: Draft
traces:
  spec: [SPEC-WORKFLOWCHAIN-227]
  verify: [VERIFY-WORKFLOWCHAIN-227]
  ops: [OPS-WORKFLOWCHAIN-227]
---

# IMPL: Script-Controlled Workflow Chain

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-chain.md` / SPEC-WORKFLOWCHAIN-227.

## 1. Implementation Slices

### Slice A: Chain Registry
Add `src/cli/lib/workflow-chain.ts` with `WORKFLOW_CHAIN_TRANSITIONS`.

### Slice B: Derived Chain Report
Create `workflow-chain/v1` reports from `workflow-state/v1`, #226 registry
rule ids, and local chain artifact presence.

### Slice C: Chain Check
Add scoped chain check behavior that evaluates every transition up to the
target transition and fails by `--fail-on` threshold.

### Slice D: CLI
Add:

- `workflow chain status`;
- `workflow chain check --action <transition-or-action>`.

### Slice E: Tests
Add unit and CLI regressions for target-chain order, action resolution, and
strict missing evidence.

## 2. File-Level Impact
- `src/cli/lib/workflow-chain.ts`;
- `src/cli/lib/workflow-chain.test.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-workflow-chain.md`;
- `docs/impl/phase1-workflow-chain.md`;
- `docs/verify/phase1-workflow-chain.md`;
- `docs/ops/phase1-workflow-chain.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Keep `workflow status`, `workflow doctor`, `workflow check`, and
  `workflow explain` behavior unchanged.
- Keep #226 registry as the source for checkable action aliases.
- Keep chain-local artifacts presence-only in this first slice.
- Do not connect new external enforcement adapters.

## 4. Future Integration
Later slices can:

- promote chain-local artifact schema validation;
- connect Work Order dispatch to chain target transitions;
- project chain decisions into Delivery Graph evidence;
- expose chain check through MCP/GitHub/hook/CI adapters after review.
