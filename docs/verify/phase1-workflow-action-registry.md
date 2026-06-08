---
id: VERIFY-WORKFLOWACTION-226
status: Draft
traces:
  spec: [SPEC-WORKFLOWACTION-226]
  impl: [IMPL-WORKFLOWACTION-226]
  ops: [OPS-WORKFLOWACTION-226]
---

# VERIFY: Workflow Action Registry and Wrapper Semantics

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-action-registry.md` /
SPEC-WORKFLOWACTION-226.

## 1. Required Checks
- `npm test -- src/cli/lib/workflow-action-registry.test.ts src/cli/commands/workflow.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check`

Full `npm test` is required before ready state because the registry is a shared
workflow-control surface.

## 2. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| duplicate action name | registry test fails |
| duplicate rule id inside one action | registry test fails |
| known registry action | parser accepts it |
| unknown action | parser rejects it with registry-derived allowed list |
| `workflow doctor` with BLOCK findings | exits 0 and reports diagnostic status |
| `workflow check` with scoped BLOCK findings | exits non-zero |
| `workflow check --fail-on warn` with scoped WARN findings | exits non-zero |
| unrelated global BLOCK outside selected action | does not fail selected action check |

## 3. Regression Boundaries
- Do not reintroduce action lists in CLI parser conditionals.
- Do not reintroduce action-to-rule maps outside the registry.
- Do not make `workflow doctor` a blocking command.
- Do not let adapter docs recommend diagnostic wrappers for enforcement.
- Do not add new action names without a registry entry and tests.

## 4. Review Evidence
PR evidence must include:

- exact head;
- focused registry/workflow test count;
- typecheck/build/lint status;
- trace verify and spec audit status;
- full test status;
- non-claims for new enforcement adapters, merge authority, phase transition,
  goal progress, and #227 chain implementation.
