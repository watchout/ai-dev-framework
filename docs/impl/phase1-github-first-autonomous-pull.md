---
id: IMPL-GHFIRST-401
status: Draft
traces:
  spec: [SPEC-GHFIRST-401]
  verify: [VERIFY-GHFIRST-401]
  ops: [OPS-GHFIRST-401]
---

# IMPL: GitHub-First Autonomous Pull Contract

## 0. Corresponding SPEC
`docs/spec/phase1-github-first-autonomous-pull.md` /
SPEC-GHFIRST-401.

## 1. Implementation Slices

### Slice A: Contract Documentation
Add SPEC/IMPL/VERIFY/OPS documents for the GitHub-first autonomous pull model.
The docs define:

- Work Order addendum fields;
- phase goal execution model;
- runner policy model;
- GitHub queue labels;
- evidence contract;
- AUN acceleration boundary.

### Slice B: Template Contract
Update `templates/github/ISSUE_TEMPLATE/governance-work-order.md` so generated
Work Orders ask for:

- GitHub durable state URL;
- phase goal;
- runner policy;
- current owner and next action;
- acceptance criteria;
- evidence required;
- required review;
- evidence contract.

### Slice C: Example Work Order
Update `templates/work-orders/iyasaka-pr-conveyor-work-order.example.json` with
concrete `github_state_ref`, `phase_goal`, `runner_policy`, and
`evidence_contract` examples.

### Slice D: Warning-First Validator Alignment
Extend existing warning-first Work Order checks so a complete PR Conveyor Work
Order includes the new contract fields. This preserves the current migration
posture:

- complete fixtures pass;
- missing adopted fields are visible as Work Order gaps;
- missing Work Order records remain warning-first;
- no runner is dispatched;
- no GitHub label is mutated.

### Slice E: Delivery Profile Projection
Update `templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json`
so `work_order_required_fields` and profile metadata name the GitHub-first
queue and runner policy contract.

## 2. File-Level Impact
- `docs/spec/phase1-github-first-autonomous-pull.md`
- `docs/impl/phase1-github-first-autonomous-pull.md`
- `docs/verify/phase1-github-first-autonomous-pull.md`
- `docs/ops/phase1-github-first-autonomous-pull.md`
- `docs/specs/roadmap.md`
- `docs/spec/phase1-work-order-contract.md`
- `docs/spec/phase1-work-order-delivery-defaults.md`
- `docs/spec/phase1-delivery-profile-schema-validator.md`
- `src/cli/lib/workflow-state.ts`
- `src/cli/lib/work-order-delivery-defaults.ts`
- `src/cli/lib/delivery-profile-validator.ts`
- `src/cli/commands/workflow.test.ts`
- `src/cli/lib/work-order-delivery-defaults.test.ts`
- `src/cli/lib/delivery-profile-validator.test.ts`
- `src/cli/lib/github-templates.test.ts`
- `templates/github/ISSUE_TEMPLATE/governance-work-order.md`
- `templates/work-orders/iyasaka-pr-conveyor-work-order.example.json`
- `templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json`

## 3. Compatibility Rules
- `work-order/v1` remains the schema version for this migration slice.
- The new fields are additive.
- Work Order validation remains local and deterministic.
- Existing dispatch, runtime, context-pack, and authority boundaries still
  apply.
- AUN live dispatch and idle auto-pull remain out of scope.
- Implementation runners still cannot audit, QA, CTO approve, merge, or mark
  done.

## 4. Future Integration
#401 follow-up slices can add:

- repo adoption profile generation;
- GitHub query projection for runner lanes;
- evidence contract schema validation;
- runner instruction packs;
- supervised idle worker integration after watchout/agent-comms-mcp#744 proves
  runtime pull behavior.

Those follow-ups must keep GitHub as the durable state source.
