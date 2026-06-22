# Cell Impl

- IMPL-ID: IMPL-ADF-V3-RAPID-LITE-GCM-001
- CELL-ID: CELL-ADF-V3-RAPID-LITE-GCM-001
- SPEC-ID: SPEC-ADF-V3-RAPID-LITE-GCM-001
- Risk Tier: R3

## Purpose

Add a design-only Rapid/Lite Gate Contract Matrix baseline for Shirube V3.

## Covered Requirements

- REQ-ADF-V3-RL-GCM-001
- REQ-ADF-V3-RL-GCM-002
- REQ-ADF-V3-RL-GCM-003
- REQ-ADF-V3-RL-GCM-004
- REQ-ADF-V3-RL-GCM-005
- REQ-ADF-V3-RL-GCM-006
- REQ-ADF-V3-RL-GCM-007
- REQ-ADF-V3-RL-GCM-008
- REQ-ADF-V3-RL-GCM-009
- REQ-ADF-V3-RL-GCM-010
- SEC-ADF-V3-RL-GCM-001

## Planned File Changes

| Path | Change Type | Reason |
| --- | --- | --- |
| `.shirube/specs/SPEC-ADF-V3-RAPID-LITE-GCM-001.md` | add | Feature Spec for Rapid/Lite Gate Contract Matrix design baseline. |
| `.shirube/cells/CELL-ADF-V3-RAPID-LITE-GCM-001.yaml` | add | Cell boundary, allowed/forbidden paths, evidence, and stop conditions. |
| `.shirube/impls/IMPL-ADF-V3-RAPID-LITE-GCM-001.md` | add | Implementation plan for this design slice. |
| `.shirube/audits/AUDIT-ADF-V3-RAPID-LITE-GCM-SPEC-001.yaml` | add | Structured spec-audit scaffold for design-only change. |
| `.shirube/audits/AUDIT-ADF-V3-RAPID-LITE-GCM-IMPL-001.yaml` | add | Structured impl-audit scaffold for design-only change. |
| `.shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml` | add | Machine-readable Rapid/Lite Hard/WARN baseline and item ID namespace. |
| `docs/standards/shirube-v3-rapid-lite-gate-contract-matrix.md` | add | Human-readable design explanation and usage guidance. |
| `templates/shirube-control-handoff.rapid-lite.yaml` | add | Lightweight goal-mode handoff template for Codex / Claude Code. |

## Implementation Notes

This Cell intentionally adds design artifacts only. The matrix is structured so the executable Rapid/Lite gate can read the same design baseline without re-deciding the Rapid/Lite baseline.

The design baseline includes the mechanical bootstrap / RPS amendment required by #470: bootstrap, RPS, and minimal handoff checks precede Cell boundary and PR diff checks. RPS means Repository Premise Spec; this Cell does not create a separate Promise SSOT artifact, schema, or phase.

The matrix does not redefine `shirube-audit/v1`. It defines Rapid/Lite contract item IDs that can be mapped into existing `shirube-audit/v1` item sets in a later Cell.

## Non-goals

- No executable gate or CLI command.
- No JSON schema or validator enforcement in this slice.
- No workflow, required check, branch protection, ruleset, or protected setting change.
- No runtime, AUN, Discord, DB, queue, LaunchAgent, production, deploy, package, or lockfile change.
- No Company Dev OS migration.

## Validation Plan

- Parse YAML design artifacts.
- Confirm changed files are inside Cell `allowed_paths`.
- Confirm no `forbidden_paths` are touched.
- Confirm Rapid/Lite explicitly keeps exact head, diff scope, evidence, owner decision, and CELL-ID as non-optional invariants.
- Confirm Rapid/Lite explicitly keeps framework/RPS/owner-confirmation/RPS-scope/spec-review-state as non-optional preflight inputs before PR diff checks.
- Confirm hotel-lite is a profile using the Rapid/Lite baseline, not a separate process.

## Known Risks

- The Rapid/Lite baseline is intentionally narrow. It should not be used for protected surfaces until Standard or Enterprise mode is selected.
- A later executable gate must preserve the Hard/WARN classifications in the matrix unless an owner-approved design Cell changes them.
- The user shorthand `lapid` is treated only as an alias for Rapid/Lite; the canonical mode name is `rapid-lite`.

## Next Review

- Review that the Hard BLOCK list is small, structural, and immediately useful for hotel-lite.
- Review that WARN entries do not hide critical safety issues.
- Review that Standard/Enterprise finalization remains out of scope.
