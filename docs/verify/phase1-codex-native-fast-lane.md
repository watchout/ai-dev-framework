---
id: VERIFY-CODEXFASTLANE-275
status: Draft
traces:
  spec: [SPEC-CODEXFASTLANE-275]
  impl: [IMPL-CODEXFASTLANE-275]
  ops: [OPS-CODEXFASTLANE-275]
---

# VERIFY: Codex Native Fast Lane With Minimal AUN Coupling

## 1. Required Checks
Run:

```bash
npm test -- delivery-profile work-order workflow
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

## 2. Expected Fixtures
| Fixture | Expected |
|---------|----------|
| Bundled profile | PASS |
| R3/R4 mapped to `codex_native_fast_lane` | BLOCK |
| Fast lane missing AUN forbidden dispatch role | BLOCK |
| R2 Work Order with no runner policy | inherits `codex_native_fast_lane` |
| R3 Work Order declaring fast lane | G21 warning |

## 3. Residual Risks
This slice validates runner policy routing but does not execute runners. AUN
bridge and dispatch safety remain blocked until #272 and AUN safety acceptance.
