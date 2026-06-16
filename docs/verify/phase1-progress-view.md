---
id: VERIFY-PROGRESSVIEW-234
status: Draft
traces:
  spec: [SPEC-PROGRESSVIEW-234]
  impl: [IMPL-PROGRESSVIEW-234]
  ops: [OPS-PROGRESSVIEW-234]
---

# VERIFY: Report-Time Progress Visualization

## 0. Corresponding SPEC
`docs/spec/phase1-progress-view.md` / SPEC-PROGRESSVIEW-234.

## 1. Required Checks
- `npm test -- src/cli/lib/progress-view.test.ts`
- `npm test -- src/cli/lib/progress-view.test.ts src/cli/lib/status-engine.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/feat/workflow-state-engine-199 --link-probe=fake`
- `git diff --check`

## 2. Fixture Matrix
| Fixture | Expected result |
|---|---|
| exact phase progress | done count renders as percent and completed/total. |
| partial progress credit | percent is prefixed with approximate marker. |
| multi-stream Markdown | each stream has independent phase/task/gate/next row. |
| nearby tasks | previous/current/next summaries render for the active stream. |
| compact text | ASCII progress bar, gate, now, next, and nearby tasks render. |
| Japanese compact | current phase/task, purpose, state, next, phase overview, and all current-phase tasks render. |
| long Japanese task | output is line-limited without wide Markdown tables. |
| JSON renderer | valid `progress-snapshot/v1` JSON is emitted. |
| `StatusResult` adapter | existing status aggregation can produce a transitional snapshot. |

## 3. Regression Boundaries
- Do not change existing `status` output without `--progress-view`.
- Do not make progress snapshots blocking evidence.
- Do not depend on AUN or Discord availability.
- Do not collapse multiple streams into one merged current task.

## 4. Review Evidence
PR evidence must include:

- exact head;
- focused test status and test count;
- typecheck/build/lint status;
- trace/spec validation status;
- non-claims for audit authority, merge authority, phase closure authority, and
  goal completion authority.
