# Shirube Report-Only Script Gate Environment

SPEC-ID: SPEC-ADF-SCRIPT-GATES-001
Risk Tier: R3

## Purpose

Implement the report-only script gate backbone described in issue #451. The
slice adds repo-spec validation, planning hierarchy checks, spec-to-Cell trace
checks, phase transition checks, design conformance mapping checks, controller
aggregation, and a report-only PR workflow.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-SCRIPT-GATES-001 | Add repo-spec schema, template, and executable repo-spec check. |
| REQ-ADF-SCRIPT-GATES-002 | Add planning hierarchy gate for premise, inventory, and owner confirmation evidence. |
| REQ-ADF-SCRIPT-GATES-003 | Add spec-to-Cell trace check for REQ-ID coverage and Cell required fields. |
| REQ-ADF-SCRIPT-GATES-004 | Add phase check with allowed transitions and remediation. |
| REQ-ADF-SCRIPT-GATES-005 | Add design conformance matrix existence check without implementation meaning judgment. |
| REQ-ADF-SCRIPT-GATES-006 | Add readiness, dev-loop, and change-flow controllers that aggregate script gates. |
| REQ-ADF-SCRIPT-GATES-007 | Add report-only PR workflow that comments, uploads artifacts, and exits 0 during pilot. |
| SEC-ADF-SCRIPT-GATES-001 | Do not enable required checks, branch protection, rulesets, AUN, target repo mutation, production, or fleet runtime behavior. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-SCRIPT-GATES-001 | REQ-ADF-SCRIPT-GATES-001 | Repo-spec fixtures cover PASS, missing canonical pin, missing role, missing SOC2 categories, and empty terminology warning. |
| AC-ADF-SCRIPT-GATES-002 | REQ-ADF-SCRIPT-GATES-002 | Planning fixtures cover missing premise, missing inventory, missing owner confirmation, and PASS. |
| AC-ADF-SCRIPT-GATES-003 | REQ-ADF-SCRIPT-GATES-003 | Trace fixtures cover full coverage, uncovered REQ, orphan Cell mapping, and missing Cell fields. |
| AC-ADF-SCRIPT-GATES-004 | REQ-ADF-SCRIPT-GATES-004 | Phase fixtures cover allowed transition, invalid transition, and undeclared phase. |
| AC-ADF-SCRIPT-GATES-005 | REQ-ADF-SCRIPT-GATES-005 | Conformance fixtures cover mapped controls, unmapped controls, and forbidden meaning judgment. |
| AC-ADF-SCRIPT-GATES-006 | REQ-ADF-SCRIPT-GATES-006 | Controller fixtures cover PASS aggregation and representative BLOCK aggregation. |
| AC-ADF-SCRIPT-GATES-007 | REQ-ADF-SCRIPT-GATES-007 | Workflow is report-only, writes a PR comment, uploads artifacts, and does not configure required checks. |
| AC-ADF-SCRIPT-GATES-008 | SEC-ADF-SCRIPT-GATES-001 | Branch protection, rulesets, AUN, target repositories, package files, production, deploy, and runtime behavior are unchanged. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-SCRIPT-GATES-001 | REQ-ADF-SCRIPT-GATES-001 through REQ-ADF-SCRIPT-GATES-007 | Run `npx vitest run test/shirube/script-gates.test.ts`, local script gates, `git diff --check`, `npm run lint`, `npm run type-check`, and `npm run build:cli`. |

## Trace Matrix

TRACE-ADF-SCRIPT-GATES-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-SCRIPT-GATES-001 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-002 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-003 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-004 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-005 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-006 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| REQ-ADF-SCRIPT-GATES-007 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
| SEC-ADF-SCRIPT-GATES-001 | CELL-ADF-SCRIPT-GATES-001 | IMPL-ADF-SCRIPT-GATES-001 | EVIDENCE-ADF-SCRIPT-GATES-001 |
