# Shirube Delivery Flow v2 Standard SSOT Update

SPEC-ID: SPEC-ADF-DELIVERY-FLOW-454-A
Risk Tier: R3
Route: route:ceo-approval
Dependency: PR #453 / issue #451 report-only script gates

## Purpose

Implement PR 454-A from issue #454 as a standard-only SSOT update. This slice updates the Shirube governance standard and derived governance-flow snapshot without changing schemas, scripts, enforcement, branch protection, rulesets, AUN, target repositories, or production behavior.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-DELIVERY-FLOW-454-A-001 | The standard defines one canonical SSOT table for risk-tier gate, review, authority, and rollout chains. |
| REQ-ADF-DELIVERY-FLOW-454-A-002 | R0 is defined as mechanical gates only and auto-merge candidate only, not active auto-merge. |
| REQ-ADF-DELIVERY-FLOW-454-A-003 | R1/R2 require mechanical gates, one standardized semantic audit, Bridge admissibility, and owner merge. |
| REQ-ADF-DELIVERY-FLOW-454-A-004 | R3/R4 require mechanical gates, semantic audit, human authority, and staged rollout. |
| REQ-ADF-DELIVERY-FLOW-454-A-005 | route:ceo-approval requires CEO ratification before merge or activation. |
| REQ-ADF-DELIVERY-FLOW-454-A-006 | The standard defines Part A machine reconciliation, Part B list-driven LLM semantic audit, and Bridge machine admissibility. |
| REQ-ADF-DELIVERY-FLOW-454-A-007 | Merge gates consume Bridge output, not freeform LLM prose. |
| REQ-ADF-DELIVERY-FLOW-454-A-008 | The standard defines maker/checker separation for reviewer actor/model and implementation actor/model where required. |
| REQ-ADF-DELIVERY-FLOW-454-A-009 | The standard defines CTO responsibilities without reintroducing CTO as a routine per-PR bottleneck. |
| REQ-ADF-DELIVERY-FLOW-454-A-010 | `docs/governance-flow.md` is defined as derived snapshot/reference only, with the standard as canonical. |
| SEC-ADF-DELIVERY-FLOW-454-A-001 | This slice does not change schemas, scripts, enforcement, required checks, branch protection, rulesets, AUN, target repositories, production, deploy, or runtime behavior. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-DELIVERY-FLOW-454-A-001 | REQ-ADF-DELIVERY-FLOW-454-A-001 through REQ-ADF-DELIVERY-FLOW-454-A-005 | The standard contains a single risk-tier delivery chain SSOT table covering R0, R1/R2, R3/R4, and route:ceo-approval. |
| AC-ADF-DELIVERY-FLOW-454-A-002 | REQ-ADF-DELIVERY-FLOW-454-A-006, REQ-ADF-DELIVERY-FLOW-454-A-007 | The standard defines Part A / Part B / Bridge and states that merge gates consume Bridge output, not LLM prose. |
| AC-ADF-DELIVERY-FLOW-454-A-003 | REQ-ADF-DELIVERY-FLOW-454-A-008 | The standard defines maker/checker separation and self-approval prohibition. |
| AC-ADF-DELIVERY-FLOW-454-A-004 | REQ-ADF-DELIVERY-FLOW-454-A-009 | The standard defines CTO responsibilities for R3/R4, route:ceo-approval, enforce changes, post-merge rollup, sampling, and drift escalation. |
| AC-ADF-DELIVERY-FLOW-454-A-005 | REQ-ADF-DELIVERY-FLOW-454-A-010 | `docs/governance-flow.md` declares itself a derived snapshot and does not compete with the standard. |
| AC-ADF-DELIVERY-FLOW-454-A-006 | SEC-ADF-DELIVERY-FLOW-454-A-001 | No schema, script, workflow enforcement, branch protection, ruleset, AUN, target repo, production, deploy, or runtime change is included. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-DELIVERY-FLOW-454-A-001 | REQ-ADF-DELIVERY-FLOW-454-A-001 through SEC-ADF-DELIVERY-FLOW-454-A-001 | Run `git diff --check`, YAML parse for `.shirube/**/*.yaml`, `npx vitest run test/shirube/script-gates.test.ts`, local Shirube report-only gates, `npm run lint`, `npm run type-check`, and `npm run build:cli`. |

## Trace Matrix

TRACE-ADF-DELIVERY-FLOW-454-A-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-DELIVERY-FLOW-454-A-001 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-002 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-003 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-004 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-005 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-006 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-007 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-008 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-009 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| REQ-ADF-DELIVERY-FLOW-454-A-010 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
| SEC-ADF-DELIVERY-FLOW-454-A-001 | CELL-ADF-DELIVERY-FLOW-454-A | IMPL-ADF-DELIVERY-FLOW-454-A | EVIDENCE-ADF-DELIVERY-FLOW-454-A |
