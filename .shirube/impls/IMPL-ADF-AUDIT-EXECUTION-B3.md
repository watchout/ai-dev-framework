# Cell Impl

- IMPL-ID: IMPL-ADF-AUDIT-EXECUTION-B3
- CELL-ID: CELL-ADF-AUDIT-EXECUTION-B3
- SPEC-ID: SPEC-ADF-AUDIT-EXECUTION-B3
- Risk Tier: R1

## Covered Requirements

- REQ-ADF-AUDIT-B3-001
- REQ-ADF-AUDIT-B3-002
- REQ-ADF-AUDIT-B3-003
- REQ-ADF-AUDIT-B3-004
- REQ-ADF-AUDIT-B3-005
- REQ-ADF-AUDIT-B3-006
- REQ-ADF-AUDIT-B3-007
- SEC-ADF-AUDIT-B3-001

## Planned File Changes

| Path | Change Type | Reason |
| --- | --- | --- |
| `src/cli/commands/audit-bridge.ts` | add | Register the report-only `shirube audit-bridge check` command. |
| `src/cli/lib/shirube-audit-bridge.ts` | add | Implement structured audit record, item set, maker/checker, and artifact consistency checks. |
| `src/cli/index.ts` | update | Register the new command. |
| `test/shirube/audit-bridge.test.ts` | add | Cover PASS, BLOCKED, and FAILURE report-only semantics. |
| `test/shirube/fixtures/audit-bridge/**` | add | Provide deterministic bridge fixtures. |
| `.shirube/**ADF-AUDIT-EXECUTION-B3**` | add | Record B3 governance artifacts. |

## Non-goals

- No semantic judgment of LLM audit reason correctness.
- No freeform prose parsing as authority.
- No B2 audit item content or ID changes.
- No `shirube-audit/v1` schema changes.
- No enforcement, required checks, branch protection, rulesets, workflow activation, AUN, target repository mutation, production, deploy, package, or lockfile changes.

## Test Plan

- `git diff --check origin/main...HEAD`
- `bash scripts/detect-breaking-changes.sh origin/main`
- `npx vitest run test/shirube/audit-bridge.test.ts test/shirube/artifact-gates.test.ts test/shirube/audit-schema.test.ts test/shirube/script-gates.test.ts`
- `npm run lint`
- `npm run type-check`
- `npm run build:cli`
- `npm run --silent shirube -- audit-bridge check --fixture test/shirube/fixtures/audit-bridge/valid.fixture.json --format json`
- `npm run --silent shirube -- conveyor check https://github.com/watchout/ai-dev-framework/pull/<B3-PR> --format json`
