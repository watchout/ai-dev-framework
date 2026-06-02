---
id: VERIFY-GITHUBQUEUEWIP-268
status: Draft
traces:
  spec: [SPEC-GITHUBQUEUEWIP-268]
  impl: [IMPL-GITHUBQUEUEWIP-268]
  ops: [OPS-GITHUBQUEUEWIP-268]
---

# VERIFY: GitHub Queue Labels and WIP Projection

## 1. Purpose
Verify GitHub-native queue label projection and WIP checks.

## 2. Required Checks
Run:

```bash
npm test -- github-queue
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
| complete projection within WIP limits | PASS |
| missing queue label in warning mode | WARNING |
| missing queue label in strict mode | BLOCK |
| Fast Lane PR WIP above 3 | WARNING or BLOCK in strict |
| Governed Draft PR WIP above 2 | BLOCK |
| Stop Lane PR without approval | BLOCK |
| directory input with valid projections | PASS |

## 4. Residual Risks
The projection is file-based and does not query GitHub live state in this slice.
That is intentional for GitHub-native-first operation before automation; future
adapters may generate the same projection from GitHub APIs.
