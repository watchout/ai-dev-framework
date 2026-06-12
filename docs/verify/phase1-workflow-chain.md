---
id: VERIFY-WORKFLOWCHAIN-227
status: Draft
traces:
  spec: [SPEC-WORKFLOWCHAIN-227]
  impl: [IMPL-WORKFLOWCHAIN-227]
  ops: [OPS-WORKFLOWCHAIN-227]
---

# VERIFY: Script-Controlled Workflow Chain

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-chain.md` / SPEC-WORKFLOWCHAIN-227.

## 1. Required Checks
- `npm test -- src/cli/lib/workflow-chain.test.ts src/cli/commands/workflow.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check`
- full `npm test`

## 2. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| chain status JSON | emits `workflow-chain/v1` and 19 transitions |
| missing Goal Contract in strict | chain check BLOCK before implementation start |
| missing SPEC readiness in strict | chain check BLOCK before implementation start |
| missing pre-implementation audit in strict | chain check BLOCK before implementation start |
| missing carryover ledger in strict | chain check BLOCK before implementation start |
| missing POSTMERGE evidence in strict | chain check BLOCK before goal/phase progress |
| missing phase closure record in strict | chain check BLOCK before phase closure audit |
| registry action alias | unique alias resolves to target transition |
| exact transition id | transition id wins over action alias |

## 3. Regression Boundaries
- Do not duplicate #226 checkable action rule lists.
- Do not make diagnostic wrappers blocking.
- Do not let chain status grant merge, phase, or goal authority.
- Do not require external adapters for Phase 1 local chain modeling.

## 4. Review Evidence
PR evidence must include:

- exact head;
- focused test count;
- typecheck/build/lint status;
- trace verify and spec-audit status;
- full test status;
- non-claims for merge authority, phase transition, goal completion, and
  external enforcement adapters.
