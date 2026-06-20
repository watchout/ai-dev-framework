# Cell Impl

- IMPL-ID: IMPL-ADF-SCRIPT-GATES-001
- CELL-ID: CELL-ADF-SCRIPT-GATES-001
- SPEC-ID: SPEC-ADF-SCRIPT-GATES-001
- Risk Tier: R3

## Covered Requirements

- REQ-ADF-SCRIPT-GATES-001
- REQ-ADF-SCRIPT-GATES-002
- REQ-ADF-SCRIPT-GATES-003
- REQ-ADF-SCRIPT-GATES-004
- REQ-ADF-SCRIPT-GATES-005
- REQ-ADF-SCRIPT-GATES-006
- REQ-ADF-SCRIPT-GATES-007
- SEC-ADF-SCRIPT-GATES-001

## Planned File Changes

| Path | Change Type | Reason |
| --- | --- | --- |
| `schemas/shirube-repo-spec.schema.json` | add | Repo-spec v1 schema. |
| `templates/shirube-repo-spec.yaml` | add | Repo-spec template. |
| `.shirube/repo-spec.yaml` | update | Bring ai-dev-framework repo-spec up to the script-gate schema while preserving compatibility fields. |
| `.shirube/design-conformance-matrix.json` | add | Control mapping existence matrix. |
| `scripts/shirube/*.mjs` | add | Executable report-only gate checks and controllers. |
| `scripts/shirube/phases.config.json` | add | Deterministic phase transition table. |
| `test/shirube/script-gates.test.ts` | add | Fixture-backed gate tests. |
| `test/fixtures/shirube/script-gates/**` | add | Deterministic fixtures for each gate. |
| `.github/workflows/shirube-gates-report.yml` | add | Report-only PR workflow. |
| `.shirube/**SCRIPT-GATES**` | add | Governance records for this Cell. |

## Non-goals

- No required checks are enabled.
- No branch protection or rulesets are changed.
- No AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation is activated.
- No target repositories are mutated.
- No package files are changed.
- No production or deploy behavior is changed.

## Test Plan

- `npx vitest run test/shirube/script-gates.test.ts`
- `node scripts/shirube/check-repo-spec.mjs`
- `node scripts/shirube/check-planning.mjs`
- `node scripts/shirube/check-trace.mjs`
- `node scripts/shirube/check-phase.mjs`
- `node scripts/shirube/check-conformance.mjs`
- `node scripts/shirube/controller.mjs readiness`
- `node scripts/shirube/controller.mjs dev-loop`
- `node scripts/shirube/controller.mjs change-flow`
- `git diff --check origin/main...HEAD`
- `npm run lint`
- `npm run type-check`
- `npm run build:cli`
