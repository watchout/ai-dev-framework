# SPEC-ADF-V3-RAPID-LITE-GCM-001

Risk Tier: R3
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/458
Status: draft design baseline

## Purpose

Define the Rapid/Lite Gate Contract Matrix for Shirube V3 so that lightweight goal-mode implementation can run quickly without losing structural control.

Rapid/Lite is not a lower-quality bypass lane. It is an artifact-collapsed lane: Goal, minimal Spec, Cell, and Impl may be represented by one control handoff, but the structural invariants remain machine-checkable.

## Scope

- Define Rapid/Lite mode semantics.
- Define the initial Hard BLOCK and WARN baseline by stage.
- Define Rapid/Lite cell types and required evidence.
- Define the initial audit item_id namespace for Rapid/Lite gate checks.
- Define a hotel-lite profile mapping that can be used as the first lightweight adoption target.
- Add a Rapid/Lite control handoff template for Codex / Claude Code goal-mode instructions.

## Non-goals

- No workflow enforcement or required check activation.
- No branch protection, ruleset, or merge setting change.
- No runtime, AUN, Discord, DB, queue, LaunchAgent, production, or deploy behavior change.
- No replacement of `shirube-audit/v1`, B3, repo-spec, phase, or conformance schemas.
- No Company Dev OS profile migration in this slice.
- No Standard or Enterprise full baseline finalization.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-V3-RL-GCM-001 | Rapid/Lite must be defined as an artifact-collapsed mode, not an evidence-optional mode. |
| REQ-ADF-V3-RL-GCM-002 | The Rapid/Lite matrix must classify initial stage findings as Hard BLOCK or WARN. |
| REQ-ADF-V3-RL-GCM-003 | Hard BLOCK findings must be structural or durable-evidence findings that can be machine-checked without semantic interpretation. |
| REQ-ADF-V3-RL-GCM-004 | WARN findings must cover semantic quality, AC/TEST granularity, edge cases, coverage quality, documentation clarity, and recommended-field maturity. |
| REQ-ADF-V3-RL-GCM-005 | Rapid/Lite must define cell types and required evidence for docs-only, scaffold, code-lite, integration-lite, and protected-stop work. |
| REQ-ADF-V3-RL-GCM-006 | Rapid/Lite must define an audit item_id namespace that can be mapped into `shirube-audit/v1` item sets without creating a competing audit schema. |
| REQ-ADF-V3-RL-GCM-007 | The hotel-lite profile must inherit Rapid/Lite hard blocks while explicitly blocking protected, production, secret, and live-operation surfaces. |
| REQ-ADF-V3-RL-GCM-008 | Rapid/Lite must include mechanical bootstrap, RPS / Repository Premise Spec, and minimal spec handoff preflights before Cell and PR diff checks. |
| REQ-ADF-V3-RL-GCM-009 | Rapid/Lite must not create a separate Promise SSOT artifact, schema, or phase; RPS means Repository Premise Spec and is the first authority artifact. |
| REQ-ADF-V3-RL-GCM-010 | The Rapid/Lite handoff template must include the framework, RPS, owner-confirmation, RPS-scope, and spec-review-state fields required by the executable gate. |
| SEC-ADF-V3-RL-GCM-001 | This design slice must not authorize enforcement, protected setting mutation, external repository mutation, production activation, or live agent dispatch. |

## Acceptance Criteria

| ID | Linked Requirements | Criterion |
| --- | --- | --- |
| AC-ADF-V3-RL-GCM-001 | REQ-ADF-V3-RL-GCM-001 | The design document and matrix state that Rapid/Lite collapses artifacts but does not remove exact head, diff scope, evidence, owner decision, or CELL-ID requirements. |
| AC-ADF-V3-RL-GCM-002 | REQ-ADF-V3-RL-GCM-002, REQ-ADF-V3-RL-GCM-003 | The matrix contains stage-level Hard BLOCK entries for missing handoff, missing repo-local issue, missing CELL-ID, missing PR head, missing allowed/forbidden paths, out-of-scope diff, forbidden path touch, missing/placeholder evidence, owner decision missing, head mismatch, unauthorized next cell, and legacy-as-truth. |
| AC-ADF-V3-RL-GCM-003 | REQ-ADF-V3-RL-GCM-004 | The matrix contains WARN entries for AC/TEST granularity, semantic edge cases, coverage quality, docs clarity, recommended warnings, and PR size. |
| AC-ADF-V3-RL-GCM-004 | REQ-ADF-V3-RL-GCM-005 | The matrix defines required evidence for each Rapid/Lite cell type and states that protected-stop cannot proceed in Rapid/Lite. |
| AC-ADF-V3-RL-GCM-005 | REQ-ADF-V3-RL-GCM-006 | The matrix declares Rapid/Lite item_id values and explains that they are contract item IDs, not a replacement for `shirube-audit/v1`. |
| AC-ADF-V3-RL-GCM-006 | REQ-ADF-V3-RL-GCM-007 | The hotel-lite profile is present and inherits the Rapid/Lite hard baseline. |
| AC-ADF-V3-RL-GCM-007 | SEC-ADF-V3-RL-GCM-001 | Changed files are limited to `.shirube` design artifacts, docs, and templates. |
| AC-ADF-V3-RL-GCM-008 | REQ-ADF-V3-RL-GCM-008 | The matrix and design doc define the executable preflight order as bootstrap, RPS, minimal handoff, Cell, PR diff, validation evidence, then owner/head checks. |
| AC-ADF-V3-RL-GCM-009 | REQ-ADF-V3-RL-GCM-009 | The design doc states that RPS means Repository Premise Spec and forbids creating a separate Promise SSOT artifact, schema, or phase. |
| AC-ADF-V3-RL-GCM-010 | REQ-ADF-V3-RL-GCM-010 | The handoff template includes `framework_ref`, `framework_lock_ref`, `repo_spec_ref`, `premise_ref`, owner/premise confirmation refs, `rps_scope`, and `spec_review_state`. |

## Test / Validation Plan

- YAML parse for `.shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml`.
- YAML parse for `.shirube/cells/CELL-ADF-V3-RAPID-LITE-GCM-001.yaml`.
- YAML parse for `.shirube/audits/AUDIT-ADF-V3-RAPID-LITE-GCM-SPEC-001.yaml` and `.shirube/audits/AUDIT-ADF-V3-RAPID-LITE-GCM-IMPL-001.yaml`.
- Review that the matrix contains bootstrap, RPS, and minimal_spec_handoff contracts before Cell and PR diff checks.
- Review that the template fields required by the executable Rapid/Lite gate are present.
- Review that no `src/**`, `scripts/**`, `.github/workflows/**`, package, lockfile, deploy, or protected-setting files are changed.
- Review that the matrix does not redefine `shirube-audit/v1`; it only supplies Rapid/Lite contract item IDs for later item-set generation.

## Open Decisions

- Standard and Enterprise baselines remain future work.
- A later executable Cell may add or update `check-gate-contract` and schema validation after this design baseline is accepted.
- A later pilot Cell may graduate a subset of Rapid/Lite Hard BLOCK checks from report-only to required checks after owner approval.
