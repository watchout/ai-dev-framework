# PR Cell Plan Rollout

This runbook explains how Codex goal mode, Claude Code, AUN, and manual
operators use the same PR Cell Plan without creating separate task systems.

The Cell Plan is the shared source of truth. Runners may render prompts and
handoffs from it, auditors may render audit requests from it, and operators may
inspect lane state from it. None of those surfaces may treat generated text as a
new authority source.

## Fixture Inventory

Example fixtures live in:

```text
templates/work-orders/pr-cell-plans/
```

Included examples:

- `large-batch.pr-cell-plan.json` - independent implementation cells, one
  dependent cell, and a human approval gate.
- `dependency-blocked-stack.pr-cell-plan.json` - stacked work where upper cells
  hold when the foundation cell is blocked.
- `dependency-blocked-stack.runtime.json` - runtime state that demonstrates the
  blocked dependency hold.
- `emergency-hotfix.pr-cell-plan.json` - an urgent R3 patch that still stops
  before merge, approval, live dispatch, or production mutation.
- `saas-ui-batch.pr-cell-plan.json` - SaaS UI work split into UI/API slices plus
  manual verification.

## Shared Commands

Validate a Cell Plan fixture:

```bash
shirube conveyor cell-plan validate \
  --fixture templates/work-orders/pr-cell-plans/large-batch.pr-cell-plan.json \
  --json
```

Validate a blocked stack with runtime dependency state:

```bash
shirube conveyor cell-plan validate \
  --fixture templates/work-orders/pr-cell-plans/dependency-blocked-stack.pr-cell-plan.json \
  --runtime templates/work-orders/pr-cell-plans/dependency-blocked-stack.runtime.json \
  --json
```

Render implementation, audit request, and handoff templates:

```bash
shirube conveyor cell-plan template \
  --fixture templates/work-orders/pr-cell-plans/large-batch.pr-cell-plan.json \
  --cell CORE \
  --pr 123 \
  --head <exact-head> \
  --base main \
  --json
```

## Surface Responsibilities

Codex goal mode:

- reads the Cell Plan;
- selects only eligible implementation cells;
- uses the generated implementation prompt and handoff;
- posts PR evidence with exact head and validation commands;
- stops on forbidden operations or missing evidence.

Claude Code:

- uses the same generated prompt and handoff shape;
- must not reinterpret free prose as extra scope;
- must keep edits inside the selected cell boundary;
- reports blocked dependencies instead of continuing through them.

AUN:

- may mirror the Work Order, Cell Plan id, cell id, PR number, and head SHA;
- must not live-dispatch runners from these fixtures;
- must not mutate queue state, labels, or comments from fixture-only output;
- should treat GitHub PR-local exact-head evidence as the transition source.

Manual operators:

- validate the fixture before dispatching work;
- use generated audit request templates so L1/L2/L3 results are durable;
- confirm labels match the current PR state before requesting audit;
- do not use chat-only acknowledgements as conveyor state evidence.

## Stop Rules

Stop and route back to implementation or the appropriate authority when:

- validation returns findings;
- a dependency is blocked or lacks required evidence;
- a cell requires merge, live operation, production DB/storage mutation, secret
  mutation, or CEO approval;
- exact head, base, validation commands, or non-goal evidence is missing;
- generated templates are edited to remove forbidden operations or audit route.

## C5 Acceptance Check

The fixture test suite validates every shipped `*.pr-cell-plan.json` fixture,
builds lane output, renders templates for the first implementation cell, and
checks the blocked-stack runtime behavior. This keeps the rollout examples tied
to the same deterministic parser and lane planner used by the CLI.
