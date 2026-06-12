---
id: VERIFY-DELIVERYPROFILE-269
status: Draft
traces:
  spec: [SPEC-DELIVERYPROFILE-269]
  impl: [IMPL-DELIVERYPROFILE-269]
  ops: [OPS-DELIVERYPROFILE-269]
---

# VERIFY: Delivery Profile Schema and Validator

## 1. Purpose
Verify that the delivery profile validator enforces SPEC-DELIVERYPROFILE-269
without enabling runner dispatch or merge automation.

## 2. Required Checks
Run:

```bash
npm test -- delivery-profile
npm run type-check
npm run build:cli
npm run lint
npm run shirube -- trace verify
npm run shirube -- gate validate spec --base-ref=origin/main --link-probe=fake
npm audit --audit-level=high
git diff --check <base>...HEAD
git merge-tree --write-tree <base> HEAD
```

Full `npm test` should run before L2/merge readiness unless explicitly
dispositioned.

## 3. Expected Fixtures
| Fixture | Expected |
|---------|----------|
| Bundled IYASAKA internal profile | PASS |
| Missing root field in warning mode | WARNING |
| Missing root field in strict mode | BLOCK |
| Unknown strategy | BLOCK |
| R4 mapped to PR Conveyor and after-PR audit | BLOCK |
| Codex-only runner contract | BLOCK |
| Automatic merge policy | BLOCK |
| Directory input with valid JSON profiles | PASS |

## 4. Residual Risks
JSON schema validation is intentionally implemented as deterministic TypeScript
logic for this slice. A formal JSON Schema export may be added later if external
tooling needs it.

## 5. Merge Readiness
Do not mark the PR ready or merge on local validation alone. This is an R3
cross-cutting governance validator and requires audit evidence before merge.
