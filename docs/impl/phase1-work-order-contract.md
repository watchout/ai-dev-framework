---
id: IMPL-WORKORDER-244
status: Draft
traces:
  spec: [SPEC-WORKORDER-244]
  verify: [VERIFY-WORKORDER-244]
  ops: [OPS-WORKORDER-244]
---

# IMPL: Work Order Contract and Warning Gate

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-contract.md` / SPEC-WORKORDER-244.

## 1. Implementation Slices

### Slice A: Evidence Kind
Add workflow evidence kind:

- `work_order`.

The record is local deterministic evidence. It does not dispatch AUN queues,
execute runtimes, mutate GitHub, or grant transition authority.

### Slice B: Local Artifact Readers
Read the first non-empty Work Order record from:

- `.framework/work-order.json`;
- `.framework/work-order/latest.json`;
- `.framework/work-orders/latest.json`;
- `.framework/delivery-graph/work-order.json`;
- `.framework/aun/work-order.json`.

Root wrappers such as `work_order`, `work_order_v1`, `order`, and `orders[]`
are accepted for migration flexibility.

### Slice C: Required Field Validation
Validate:

- `schema_version: work-order/v1`;
- work order id;
- task/issue/work-package/PR/delivery graph scope;
- objective;
- handoff target;
- inputs or evidence refs;
- expected output schema;
- write scope;
- required gates;
- authority boundary;
- explicit non-claims.

### Slice D: Dispatch Contract Validation
Validate that the Work Order declares compatible dispatch surfaces for AUN,
Codex, Claude, structured invocation, or Shirube reports, plus a report/gate/
evidence sink.

### Slice E: Runtime Boundary Validation
Validate that the Work Order names runtime adapter or structured invocation
requirements, expected output schema, and write scope. Warn when Work Order
content carries direct shell commands or argv payloads.

### Slice F: Context-Pack Boundary Validation
Validate that the Work Order either cites context-pack evidence or records
explicit non-applicability. If context packs are cited, the Work Order must
declare data-only/citation-only/omit delivery and must not promote context-pack
item text to instruction.

### Slice G: Warning-First Workflow Check
Add `work_order` to `workflow check --action`.

Scoped rules:

- `G21.work_order.record.present`;
- `G21.work_order.required_fields`;
- `G21.work_order.dispatch_contract`;
- `G21.work_order.runtime_contract`;
- `G21.work_order.context_pack_boundary`;
- `G21.work_order.authority_boundary`;
- `G21.work_order.promotion_path`.

All invalid/missing Work Order findings emit WARN in the first migration slice.
Default `--fail-on block` passes warning-only findings; `--fail-on warn` fails
them for audits.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-work-order-contract.md`;
- `docs/impl/phase1-work-order-contract.md`;
- `docs/verify/phase1-work-order-contract.md`;
- `docs/ops/phase1-work-order-contract.md`;
- `docs/spec/phase1-enterprise-delivery-graph.md`;
- `docs/impl/phase1-enterprise-delivery-graph.md`;
- `docs/ops/phase1-enterprise-delivery-graph.md`;
- `docs/spec/phase1-runtime-command-adapter-policy.md`;
- `docs/impl/phase1-runtime-command-adapter-policy.md`;
- `docs/ops/phase1-runtime-command-adapter-policy.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Existing action scopes must not fail because of Work Order warnings.
- `implementation_start`, `runtime_step`, `phase_closure`, `audit_ledger`,
  `merge`, and `release` keep their current scoped rule lists.
- Work Order validation remains read-only.
- The first gate is warning-only in every profile.
- Promotion to hard BLOCK requires a later reviewed slice without changing the
  `work-order/v1` contract shape.

## 4. Future Integration
#226 should map `work_order` into the action registry and define diagnostic vs
enforcement behavior.

#227 should consume `work_order/v1` before script-controlled chain dispatch.

#240 should treat Work Order runtime fields as input to runtime adapter and
injection policy selection, not as commands.

#242 should allow Work Orders to cite Kodama `context-pack/v1` evidence by
pack id and citation metadata while preserving data-not-instruction handling.
