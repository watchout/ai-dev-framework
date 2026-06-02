---
id: VERIFY-AUNGATEPROFILE-252
status: Draft
traces:
  spec: [SPEC-AUNGATEPROFILE-252]
  impl: [IMPL-AUNGATEPROFILE-252]
  ops: [OPS-AUNGATEPROFILE-252]
---

# VERIFY: Aun Gate Lite Shirube Profile

## 0. Corresponding SPEC
`docs/spec/phase1-aun-gate-lite-profile.md` /
SPEC-AUNGATEPROFILE-252.

## 1. Spec-Only PR Checks
This spec-only PR requires:

- `npm run shirube -- trace verify`;
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`;
- `git diff --check origin/main...HEAD`;
- `bash scripts/detect-breaking-changes.sh origin/main`.

Runtime tests are not required for this spec-only PR because no validator or CLI
implementation is included.

## 2. Future Implementation Checks
After L1 PASS and implementation begins, the implementation PR must run:

- focused validator and CLI tests;
- `npm run type-check`;
- `npm run build:cli`;
- `npm run lint`;
- `npm run shirube -- trace verify`;
- spec-audit;
- `git diff --check`;
- breaking-change detection;
- full `npm test`.

## 3. Future Fixture Matrix
Future implementation tests must cover:

| Fixture | Expected result |
|---------|-----------------|
| complete policy_evaluator profile | strict PASS |
| schema_migration missing migration evidence | warning finding in default mode |
| execution_ledger missing runtime stability prerequisite | strict BLOCK |
| live execution claim before stability evidence | BLOCK in warning and strict mode |
| projection claims execution authority | BLOCK |
| product_demo missing context/recovery refs | strict BLOCK |
| invalid PR class | option error |
| JSON output | structured findings for CI/audit |

## 4. Review Evidence
L1 evidence must include:

- exact head;
- docs-only diff confirmation;
- trace verify;
- spec-audit;
- diff-check;
- explicit non-claims for AUN runtime, MCP server exposure, live execution,
  merge authority, phase transition authority, and enterprise readiness.

L2 evidence is not applicable until implementation exists.
