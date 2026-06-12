---
id: OPS-WORKFLOWACTION-226
status: Draft
traces:
  spec: [SPEC-WORKFLOWACTION-226]
  impl: [IMPL-WORKFLOWACTION-226]
  verify: [VERIFY-WORKFLOWACTION-226]
---

# OPS: Workflow Action Registry and Wrapper Semantics

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-action-registry.md` /
SPEC-WORKFLOWACTION-226.

## 1. Operator Flow
1. Choose the workflow action from `WORKFLOW_ACTION_REGISTRY`.
2. For human diagnosis, run:

   ```bash
   shirube workflow doctor --json
   ```

3. For blocking local or adapter decisions, run:

   ```bash
   shirube workflow check --action <action> --profile <profile> --json
   ```

4. Use `--fail-on warn` only when migration or audit policy should fail
   warning findings.
5. Do not use `workflow doctor` exit 0 as pass evidence for MCP, GitHub, hook,
   CI, merge, phase, or goal transitions.

## 2. Wrapper Guidance
| Need | Use | Do not use |
|------|-----|------------|
| Debug all workflow findings | `workflow doctor` | `workflow check` without a selected action |
| Gate one action | `workflow check --action <action>` | `workflow doctor` |
| Explain a rule or action | `workflow explain <query>` | ad hoc docs grep |
| Project current state | `workflow status --json` | treating status as enforcement |

## 3. Adding an Action
To add a new checkable workflow action:

1. Add one entry to `WORKFLOW_ACTION_REGISTRY`.
2. Add or reuse deterministic rule ids.
3. Add focused tests for parser/check behavior.
4. Update SPEC/IMPL/VERIFY/OPS docs if the action changes authority or adapter
   guidance.
5. Run required checks.

Do not add the action directly to CLI parser conditionals or a separate local
map.

## 4. Adapter Guidance
| Adapter | Required behavior |
|---------|-------------------|
| MCP | expose whether a wrapper is diagnostic or enforcement |
| GitHub Check | call `workflow check` for branch/merge blocking |
| Hook | call `workflow check` only after reviewed hook adoption |
| CI | call `workflow check` with explicit action and threshold |
| AUN/runtime | consume Work Order and action registry metadata; do not infer pass from doctor |

## 5. Rollback
This slice centralizes data without changing the implemented action set. If a
regression appears, revert the registry PR and restore the previous local
parser/map while keeping #226 open for a corrected implementation.
