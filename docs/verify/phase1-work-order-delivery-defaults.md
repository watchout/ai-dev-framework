---
id: VERIFY-WORKORDERDEFAULTS-270
status: Draft
traces:
  spec: [SPEC-WORKORDERDEFAULTS-270]
  impl: [IMPL-WORKORDERDEFAULTS-270]
  ops: [OPS-WORKORDERDEFAULTS-270]
---

# VERIFY: Work Order Delivery Defaults

## 1. Purpose
Verify the Work Order default resolver and workflow check extension.

## 2. Required Checks
Run:

```bash
npm test -- work-order-delivery workflow
npm run type-check
npm run build:cli
npm run lint
npm run shirube -- trace verify
npm run shirube -- gate validate spec --base-ref=origin/main --link-probe=fake
npm audit --audit-level=high
git diff --check <base>...HEAD
git merge-tree --write-tree <base> HEAD
```

Full `npm test` should run before audit/merge readiness.

## 3. Expected Fixtures
| Fixture | Expected |
|---------|----------|
| R2 Work Order missing strategy/timing/mode with profile | PASS, inherited defaults |
| R3 governed defaults | PASS |
| R3 after-PR audit declaration | WARN under G21 delivery defaults |
| R3 normal PR mode declaration | WARN under G21 delivery defaults |
| R4 missing declarations with profile | PASS, serial gate defaults |
| R4 declaring PR Conveyor/after-PR/normal | WARN |
| placeholder implementation owner | BLOCK under `required_fields`, WARN under delivery defaults |
| mismatched profile ref | resolver gap |

## 4. Residual Risks
The gate is warning-first by design. Hard-block promotion is a later reviewed
slice after templates, PR evidence, queue projection, and runner instruction
packs are accepted.
