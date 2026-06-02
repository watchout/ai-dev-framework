---
id: IMPL-WORKORDERAUTH-248
status: Draft
traces:
  spec: [SPEC-WORKORDERAUTH-248]
  verify: [VERIFY-WORKORDERAUTH-248]
  ops: [OPS-WORKORDERAUTH-248]
---

# IMPL: Work Order Authority and Action-Tool Approval Gates

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-authority-gates.md` /
SPEC-WORKORDERAUTH-248.

## 1. Implementation Slices

### Slice A: Validation Model
Extend `WorkOrderValidation` with:

- `authoritySchemaGaps`;
- `riskApprovalGaps`;
- `deliveryGraphEvidenceGaps`.

### Slice B: G22 Decisions
Add three warning-first work_order scoped decisions:

- `G22.work_order.authority_schema`;
- `G22.work_order.risk_approval_mapping`;
- `G22.work_order.delivery_graph_evidence`.

### Slice C: Authority Schema Checks
Validate repo, issue, parent issue, PR/change slice, branch policy, scope,
non-goals, owner roles, authority level, risk, affected systems, allowed tool
classes, approvals, evidence, rollback, context inputs, and report format.

### Slice D: Risk Approval Checks
Validate risk values and warn when:

- privileged action-tool classes are paired with low or medium risk;
- high/critical or privileged work lacks approval evidence;
- critical risk lacks strict, multi-agent, L3, or explicit human approval
  mapping;
- audit level is missing.

### Slice E: Delivery Graph Evidence Checks
Validate context-pack, Wasurezu recovery, AUN execution/audit, verification,
approval, and Delivery Graph evidence mapping refs.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`
- `src/cli/lib/workflow-observability.ts`
- `src/cli/commands/workflow.test.ts`
- `docs/spec/phase1-work-order-authority-gates.md`
- `docs/impl/phase1-work-order-authority-gates.md`
- `docs/verify/phase1-work-order-authority-gates.md`
- `docs/ops/phase1-work-order-authority-gates.md`
- `docs/specs/roadmap.md`
- `package-lock.json`

## 3. Compatibility Rules
- Existing G21 decisions remain warning-first.
- Missing Work Order record still emits only the existing G21 missing-record
  warning.
- G22 rules apply only when a Work Order artifact is present.
- Existing action scopes outside `work_order` do not inherit G22 decisions.
- The first slice does not hard-block default `--fail-on block` runs.

## 4. Future Integration
Later slices may promote G22 from warning to hard-block for action-tool dispatch
after L3 review and dogfood evidence.

#249 Governance Bone templates can provide issue/PR skeletons that feed this
Work Order authority schema.
