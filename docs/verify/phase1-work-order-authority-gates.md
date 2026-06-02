---
id: VERIFY-WORKORDERAUTH-248
status: Draft
traces:
  spec: [SPEC-WORKORDERAUTH-248]
  impl: [IMPL-WORKORDERAUTH-248]
  ops: [OPS-WORKORDERAUTH-248]
---

# VERIFY: Work Order Authority and Action-Tool Approval Gates

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-authority-gates.md` /
SPEC-WORKORDERAUTH-248.

## 1. Required Checks
- `npm test -- src/cli/commands/workflow.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check origin/main...HEAD`
- `bash scripts/detect-breaking-changes.sh origin/main`
- `npm audit --audit-level=high`

Full `npm test` is required before marking the PR ready for audit.

## 2. Test Inventory
| Test | Expected result |
|------|-----------------|
| complete Work Order | strict `work_order --fail-on warn` PASS |
| missing authority schema fields | G22 authority_schema WARN and `--fail-on warn` failure |
| critical privileged action without approvals | G22 risk_approval_mapping WARN and `--fail-on warn` failure |
| missing Delivery Graph evidence refs | G22 delivery_graph_evidence WARN and `--fail-on warn` failure |
| granted merge/phase/gate/goal authority | existing G21 authority_boundary WARN |
| missing Work Order record | existing G21 warning-first behavior |

## 3. Coverage Rationale
The focused workflow test exercises the public CLI command and JSON report
surface instead of only private helpers, because consumers depend on
`workflow check --action work_order`.

## 4. Regression Discipline
Any new authority field must have:

- a complete fixture update;
- a negative fixture;
- a stable rule id;
- documentation in SPEC/IMPL/OPS.

## 5. Known Coverage Gaps
This slice does not execute AUN queues, GitHub mutations, or runtime adapters.
Those need separate tests when dispatch enforcement is implemented.

## 6. Related Documents
- SPEC: `docs/spec/phase1-work-order-authority-gates.md`
- IMPL: `docs/impl/phase1-work-order-authority-gates.md`
- OPS: `docs/ops/phase1-work-order-authority-gates.md`
