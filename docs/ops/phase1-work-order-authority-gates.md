---
id: OPS-WORKORDERAUTH-248
status: Draft
traces:
  spec: [SPEC-WORKORDERAUTH-248]
  impl: [IMPL-WORKORDERAUTH-248]
  verify: [VERIFY-WORKORDERAUTH-248]
---

# OPS: Work Order Authority and Action-Tool Approval Gates

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-authority-gates.md` /
SPEC-WORKORDERAUTH-248.

## 1. Operator Flow
1. Create or update `.framework/work-order.json`.
2. Fill #244 base Work Order fields.
3. Add #248 authority fields: repo, parent issue, PR/change slice, branch
   policy, owner roles, risk, allowed tool classes, approvals, evidence,
   rollback, context inputs, and report format.
4. Add Delivery Graph evidence refs for Kodama, Wasurezu, AUN, verification,
   approval, and exceptions where applicable.
5. Run:

```bash
shirube workflow check --action work_order --profile strict --fail-on warn --json
```

## 2. Deploy
This is a CLI/docs/test change. No daemon, queue, migration, or GitHub App
deployment is required.

## 3. Monitoring
Monitor the JSON report for:

- `G22.work_order.authority_schema`;
- `G22.work_order.risk_approval_mapping`;
- `G22.work_order.delivery_graph_evidence`.

Warnings mean the Work Order is not ready for strict action-tool dispatch.

## 4. Failure Response
If G22 warns:

- fill the missing schema or evidence refs;
- keep the PR draft if the warning affects action tools, customer data, or
  external mutation;
- do not claim dispatch readiness.

## 5. Rollback
Rollback is a PR revert. The slice is read-only and warning-first, so no data
repair is required.

## 6. Known Operational Debt
- G22 is advisory until a later reviewed hard-block promotion.
- #248 approval semantics are not yet projected to AUN.
- Exception record shape is referenced but not enforced beyond evidence refs.

## 7. Related Documents
- SPEC: `docs/spec/phase1-work-order-authority-gates.md`
- IMPL: `docs/impl/phase1-work-order-authority-gates.md`
- VERIFY: `docs/verify/phase1-work-order-authority-gates.md`
