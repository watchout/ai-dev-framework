---
id: VERIFY-4MCPFASTTRACK-264
status: Draft
traces:
  spec: [SPEC-4MCPFASTTRACK-264]
  impl: [IMPL-4MCPFASTTRACK-264]
  ops: [OPS-4MCPFASTTRACK-264]
---

# VERIFY: 4MCP Fast Track Minimum Safety Profile

## 0. Corresponding SPEC
`docs/spec/phase1-4mcp-fast-track-safety-profile.md` /
SPEC-4MCPFASTTRACK-264.

## 1. Spec PR Required Checks
- `npm run shirube -- trace verify`
- `npm run shirube -- gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check origin/codex/issue249-governance-bone...HEAD`
- `git merge-tree --write-tree origin/codex/issue249-governance-bone HEAD`

For this docs-only spec slice, type-check/build/lint/full tests are optional
but recommended before audit if the local environment is already available.

## 2. Future Implementation Required Checks
The implementation PR must run:

- focused validator and CLI tests;
- `npm run type-check`;
- `npm run build:cli`;
- `npm run lint`;
- `npm run shirube -- trace verify`;
- `npm run shirube -- gate validate spec --base-ref=origin/main --link-probe=fake`;
- `git diff --check`;
- `git merge-tree --write-tree`;
- `npm audit --audit-level=high`;
- full `npm test` before ready/merge.

## 3. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| R0 read-only with complete evidence | PASS |
| R1 local reversible mutation with allowed files and verification | PASS |
| R2 PR/comment/review request with no merge claim | PASS |
| R3 CI/dependency/MCP/tool-shape change declared Fast | BLOCK |
| R3 declared Governed with draft/reference handling | PASS or WARNING according to adoption mode |
| R4 merge/deploy/secret/destructive/external send without approval | BLOCK |
| missing implementation owner | BLOCK for implementation continuation |
| missing merge authority | BLOCK for merge-readiness claim |
| global stop/no-run sentinel active | BLOCK new Work Order start |
| ARC-created implementation PR without Draft/reference identification | BLOCK |

## 4. Regression Boundaries
- The profile must not become AUN live dispatch.
- The profile must not become automatic merge.
- The profile must not convert ARC/design ownership into repo implementation
  ownership.
- R3/R4 must not silently downgrade to Fast.
- Missing authority records must not continue as implementation.
- Context or memory evidence must not become execution authorization.

## 5. Review Evidence
Review evidence must explicitly record:

- exact head;
- stack base;
- whether #253 owner boundary is merged or still stacked;
- trace/spec validation output;
- non-claims for autonomous dispatch, merge, deploy, secrets, destructive
  operations, and external sends;
- conditional continuation instructions after PASS.
