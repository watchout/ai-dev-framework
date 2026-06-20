# Shirube Phase Conveyor State Machine

SPEC-ID: SPEC-ADF-PHASE-001
Risk Tier: R2

## Background

Shirube needs a deterministic phase conveyor before AUN small Cells, target
repository rollout, or required-check activation can advance. Existing conveyor
checks validate PR prerequisites, but they do not model the parent planning
sequence from repo-spec and premise evidence through Cell/Impl execution
readiness.

## Purpose

Add `shirube phase check <pr-url-or-repo-pr> --format json` so reviewers and
automation can see the current Shirube phase, allowed next phase(s), blocking
findings, warnings, and the structured evidence that was required and observed.

## Non-goals

- This spec does not enable required checks.
- This spec does not modify branch protection.
- This spec does not modify rulesets.
- This spec does not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation.
- This spec does not mutate target repositories.
- This spec does not change production or deploy behavior.

## Target Scope

- `src/cli/commands/phase.ts`
- `src/cli/lib/phase-conveyor.ts`
- `src/cli/index.ts`
- `src/cli/commands/phase.test.ts`
- `src/cli/lib/phase-conveyor.test.ts`
- `.shirube/specs/SPEC-ADF-PHASE-001.md`
- `.shirube/cells/CELL-ADF-PHASE-001.yaml`
- `.shirube/impls/IMPL-ADF-PHASE-001.md`
- `.shirube/audits/AUDIT-ADF-PHASE-SPEC-001.yaml`
- `.shirube/audits/AUDIT-ADF-PHASE-IMPL-001.yaml`
- `.shirube/evidence/EVIDENCE-ADF-PHASE-001.yaml`

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-PHASE-001 | Add `shirube phase check <pr-url-or-repo-pr> --format json`. |
| REQ-ADF-PHASE-002 | Emit deterministic JSON with `schema`, `repo`, `pr`, `head_sha`, `current_phase`, `allowed_next_phases`, `verdict`, `blockers`, `warnings`, `required_evidence`, and `observed_evidence`. |
| REQ-ADF-PHASE-003 | Distinguish repo-spec drafted versus confirmed. |
| REQ-ADF-PHASE-004 | Distinguish premise spec required, drafted, and confirmed. |
| REQ-ADF-PHASE-005 | Distinguish inventory required, drafted, and confirmed. |
| REQ-ADF-PHASE-006 | Distinguish Cell drafted, Impl drafted, Impl audited, and execution ready. |
| REQ-ADF-PHASE-007 | Block or warn when Cell/Impl artifacts exist before required parent premise or inventory confirmation. |
| REQ-ADF-PHASE-008 | Block or warn when owner/domain-designer confirmation is required but missing. |
| REQ-ADF-PHASE-009 | Do not treat LLM narrative claims as confirmation without structured evidence. |
| SEC-ADF-PHASE-001 | Do not enable required checks, change branch protection, change rulesets, activate AUN/multi-agent automation, mutate target repositories, or change production/deploy behavior. |

## Phase Model

The initial state set is:

`INTAKE`, `REPO_SPEC_DRAFTED`, `REPO_SPEC_CONFIRMED`,
`PREMISE_SPEC_REQUIRED`, `PREMISE_SPEC_DRAFTED`,
`PREMISE_SPEC_CONFIRMED`, `INVENTORY_REQUIRED`,
`INVENTORY_DRAFTED`, `INVENTORY_CONFIRMED`, `CELL_DRAFTED`,
`CELL_TRACE_PASSED`, `IMPL_DRAFTED`, `IMPL_AUDITED`,
`EXECUTION_READY`, `IMPLEMENTED`, `CI_PASSED`, `CODE_AUDITED`,
`MERGED`, `POST_MERGE_VERIFIED`, `RELEASED`, `BLOCKED`,
`HUMAN_DECISION_REQUIRED`, and `WAIVER_REQUIRED`.

## Structured Evidence Inputs

The checker reads PR metadata, changed files, explicit artifact references,
changed artifact bodies, and the approved repo-spec baseline path. Repo tree
history is not used as proof for premise, inventory, Cell, Impl, audit, or
execution readiness.

The phase checker recognizes the following planning hierarchy fields when they
are present under `planning_hierarchy` or as top-level structured fields:

- `premise_required`
- `premise_ref`
- `premise_confirmed`
- `premise_confirmation_ref`
- `inventory_required`
- `inventory_ref`
- `inventory_confirmed`
- `inventory_confirmation_ref`
- `owner_confirmation_required`
- `owner_confirmation_ref`
- `domain_designer_confirmation_required`
- `domain_designer_confirmation_ref`

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-PHASE-001 | REQ-ADF-PHASE-001, REQ-ADF-PHASE-002 | `shirube phase check <PR> --format json` emits schema `shirube-phase-check/v1`. |
| AC-ADF-PHASE-002 | REQ-ADF-PHASE-003 | Repo-spec with required owner/domain-designer confirmation missing reports `REPO_SPEC_DRAFTED` and a blocking finding. |
| AC-ADF-PHASE-003 | REQ-ADF-PHASE-004 | `premise_required: true` without `premise_ref` reports `PREMISE_SPEC_REQUIRED`; a referenced but unconfirmed premise reports `PREMISE_SPEC_DRAFTED`. |
| AC-ADF-PHASE-004 | REQ-ADF-PHASE-005 | `inventory_required: true` without inventory evidence reports `INVENTORY_REQUIRED`; a referenced but unconfirmed inventory reports `INVENTORY_DRAFTED`. |
| AC-ADF-PHASE-005 | REQ-ADF-PHASE-006 | Cell, Impl, Impl audit, and execution readiness are distinguishable in deterministic output. |
| AC-ADF-PHASE-006 | REQ-ADF-PHASE-007 | Cell/Impl artifacts before required parent confirmation produce blocking findings. |
| AC-ADF-PHASE-007 | REQ-ADF-PHASE-009 | Narrative confirmation claims without structured refs are reported as insufficient and do not satisfy evidence. |
| AC-ADF-PHASE-008 | SEC-ADF-PHASE-001 | No required checks, protection, rulesets, AUN/multi-agent automation, target repo mutation, or production/deploy behavior are changed. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-PHASE-001 | REQ-ADF-PHASE-001 through REQ-ADF-PHASE-009, SEC-ADF-PHASE-001 | Run focused phase CLI/lib tests, `git diff --check origin/main...HEAD`, `npm run lint`, `npm run type-check`, `npm run build:cli`, `shirube phase check <PR_URL> --format json`, and `shirube conveyor check <PR_URL> --format json`. |

## Trace Matrix

TRACE-ADF-PHASE-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-PHASE-001 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-002 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-003 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-004 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-005 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-006 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-007 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-008 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| REQ-ADF-PHASE-009 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
| SEC-ADF-PHASE-001 | CELL-ADF-PHASE-001 | IMPL-ADF-PHASE-001 | EVIDENCE-ADF-PHASE-001 |
