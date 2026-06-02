---
id: VERIFY-RUNNERPACKS-271
status: Draft
traces:
  spec: [SPEC-RUNNERPACKS-271]
  impl: [IMPL-RUNNERPACKS-271]
  ops: [OPS-RUNNERPACKS-271]
---

# VERIFY: PR Conveyor Runner Instruction Packs

## 1. Purpose
Verify runner instruction pack coverage and safety boundaries.

## 2. Required Checks
Run:

```bash
npm test -- runner-packs
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
| complete runner pack | PASS |
| missing runner pack in warning mode | WARNING |
| missing runner pack in strict mode | BLOCK |
| Codex-specific goal requirement | BLOCK |
| live AUN dispatch enabled | BLOCK |
| unsafe stop behavior | BLOCK |
| directory input with valid runner packs | PASS |

## 4. Residual Risks
This slice validates instruction packs, not live runner execution. Runtime
dispatch and stale-runner controls remain future work and must not be inferred
from this PR.
