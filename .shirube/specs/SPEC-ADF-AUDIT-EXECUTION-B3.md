# Shirube Audit Bridge Admissibility Command

SPEC-ID: SPEC-ADF-AUDIT-EXECUTION-B3
Risk Tier: R1

## Purpose

Implement a report-only machine Bridge that decides whether structured Shirube semantic audit output is admissible for downstream gates. The Bridge consumes structured `shirube-audit/v1` records and referenced audit item sets; it does not treat freeform LLM prose as gate evidence.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-AUDIT-B3-001 | Add `shirube audit-bridge check --format json` as a deterministic report-only CLI command. |
| REQ-ADF-AUDIT-B3-002 | Validate audit records and audit item sets against the canonical `shirube-audit/v1` structure. |
| REQ-ADF-AUDIT-B3-003 | Require every item in the referenced item set to be answered exactly once. |
| REQ-ADF-AUDIT-B3-004 | Block missing, duplicate, unknown, invalid, `FAIL` without durable evidence, placeholder/pending evidence, and `UNVERIFIED` item results. |
| REQ-ADF-AUDIT-B3-005 | Validate maker/checker separation using reviewer actor/model and implementation actor/model evidence. |
| REQ-ADF-AUDIT-B3-006 | Reuse existing artifact consistency checks for exact-head, base, placeholder/pending, and ratify-reference consistency. |
| REQ-ADF-AUDIT-B3-007 | Preserve report-only semantics: valid `BLOCKED` exits 0, while malformed input or execution failure emits `FAILURE` and exits nonzero. |
| SEC-ADF-AUDIT-B3-001 | Do not enable required checks, branch protection, rulesets, workflows, AUN, target repo mutation, production, deploy, or package changes. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-AUDIT-B3-001 | REQ-ADF-AUDIT-B3-001 | CLI returns JSON with `schema`, `verdict`, `would_block`, `admissible`, item mismatch arrays, maker/checker status, schema status, evidence status, artifact consistency, and next actions. |
| AC-ADF-AUDIT-B3-002 | REQ-ADF-AUDIT-B3-002 | Malformed audit records return `FAILURE` with nonzero exit. |
| AC-ADF-AUDIT-B3-003 | REQ-ADF-AUDIT-B3-003 | Missing and duplicate item answers return `BLOCKED` and `admissible: false`. |
| AC-ADF-AUDIT-B3-004 | REQ-ADF-AUDIT-B3-004 | Unknown items, `FAIL` without durable evidence, placeholder/pending evidence, and `UNVERIFIED` items do not silently pass. |
| AC-ADF-AUDIT-B3-005 | REQ-ADF-AUDIT-B3-005 | Reviewer actor/model equal to implementation actor/model returns `BLOCKED`. |
| AC-ADF-AUDIT-B3-006 | REQ-ADF-AUDIT-B3-006 | Head mismatch and placeholder evidence artifacts are blocked through the shared artifact primitive. |
| AC-ADF-AUDIT-B3-007 | REQ-ADF-AUDIT-B3-007 | Valid `BLOCKED` bridge reports exit 0 in report-only mode. |
| AC-ADF-AUDIT-B3-008 | SEC-ADF-AUDIT-B3-001 | No enforcement, workflow, branch protection, ruleset, AUN, target repo, production, deploy, or package behavior changes are made. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-AUDIT-B3-001 | REQ-ADF-AUDIT-B3-001 through REQ-ADF-AUDIT-B3-007 | Run `npx vitest run test/shirube/audit-bridge.test.ts test/shirube/artifact-gates.test.ts test/shirube/audit-schema.test.ts test/shirube/script-gates.test.ts`. |
| TEST-MAP-ADF-AUDIT-B3-002 | REQ-ADF-AUDIT-B3-001 | Run `npm run --silent shirube -- audit-bridge check --fixture test/shirube/fixtures/audit-bridge/valid.fixture.json --format json`. |
| TEST-MAP-ADF-AUDIT-B3-003 | SEC-ADF-AUDIT-B3-001 | Run `bash scripts/detect-breaking-changes.sh origin/main`, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, and `npm run build:cli`. |

## Trace Matrix

TRACE-ADF-AUDIT-B3-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-AUDIT-B3-001 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-002 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-003 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-004 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-005 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-006 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| REQ-ADF-AUDIT-B3-007 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-001 |
| SEC-ADF-AUDIT-B3-001 | CELL-ADF-AUDIT-EXECUTION-B3 | IMPL-ADF-AUDIT-EXECUTION-B3 | TEST-MAP-ADF-AUDIT-B3-003 |

## Non-goals

- Do not judge whether LLM semantic reasons are correct.
- Do not parse freeform audit prose as authority.
- Do not change B2 audit item content or IDs.
- Do not change `shirube-audit/v1`.
- Do not enable enforcement, required checks, branch protection, rulesets, workflow activation, AUN, target repository mutation, production, deploy, or package changes.
