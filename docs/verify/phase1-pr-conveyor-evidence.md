---
id: VERIFY-PRCONVEYOREVIDENCE-267
status: Draft
traces:
  spec: [SPEC-PRCONVEYOREVIDENCE-267]
  impl: [IMPL-PRCONVEYOREVIDENCE-267]
  ops: [OPS-PRCONVEYOREVIDENCE-267]
---

# VERIFY: PR Conveyor Evidence and Audit Timing

## 1. Purpose
Verify PR evidence fields and audit timing checks.

## 2. Required Checks
Run:

```bash
npm test -- pr-evidence
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
| complete R2 audit-pending evidence | PASS |
| placeholder runner identity | WARNING or BLOCK in strict |
| R3 after-PR audit timing | BLOCK |
| R3 merge-ready without audit refs | BLOCK |
| R4 merge-ready without approval refs | BLOCK |
| directory input with valid PR evidence | PASS |

## 4. Residual Risks
Markdown parsing is shallow by design. This slice validates evidence fields and
unsafe claims; later queue projection may add GitHub API-backed state checks.
