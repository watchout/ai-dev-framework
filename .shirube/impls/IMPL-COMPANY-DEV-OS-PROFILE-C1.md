# Cell Impl

- IMPL-ID: IMPL-COMPANY-DEV-OS-PROFILE-C1
- CELL-ID: CELL-COMPANY-DEV-OS-PROFILE-C1
- SPEC-ID: SPEC-COMPANY-DEV-OS-PROFILE-C1
- Risk Tier: R3

## Covered Requirements

- REQ-COMPANY-DEV-OS-C1-001
- REQ-COMPANY-DEV-OS-C1-002
- REQ-COMPANY-DEV-OS-C1-003
- REQ-COMPANY-DEV-OS-C1-004
- REQ-COMPANY-DEV-OS-C1-005
- REQ-COMPANY-DEV-OS-C1-006
- REQ-COMPANY-DEV-OS-C1-007
- REQ-COMPANY-DEV-OS-C1-008
- SEC-COMPANY-DEV-OS-C1-001

## Planned File Changes

| Path | Change Type | Reason |
| --- | --- | --- |
| `.shirube/specs/SPEC-COMPANY-DEV-OS-PROFILE-C1.md` | add | C1 profile draft requirements, fixtures, audit item-set, checks, and non-scope. |
| `.shirube/cells/CELL-COMPANY-DEV-OS-PROFILE-C1.yaml` | add | Cell boundary, allowed paths, required evidence, stop conditions, and execution contract. |
| `.shirube/impls/IMPL-COMPANY-DEV-OS-PROFILE-C1.md` | add | Implementation plan, artifact map, and validation scope. |
| `.shirube/company-dev-os/canonical-profile.draft.yaml` | add | Non-authoritative Company Dev OS canonical profile draft. |
| `.shirube/company-dev-os/profile-fixtures/valid-minimal-profile.fixture.yaml` | add | Data-only positive fixture for later C2 validator work. |
| `.shirube/company-dev-os/profile-fixtures/role-vocab-conflict.fixture.yaml` | add | Data-only blocker fixture for unresolved role vocabulary conflicts. |
| `.shirube/company-dev-os/profile-fixtures/missing-authority-owner.fixture.yaml` | add | Data-only blocker fixture for missing protected-surface authority owner. |
| `.shirube/company-dev-os/profile-fixtures/missing-maker-checker.fixture.yaml` | add | Data-only blocker fixture for missing maker/checker separation. |
| `.shirube/company-dev-os/profile-fixtures/enforcement-attempt.fixture.yaml` | add | Data-only blocker fixture for forbidden projection/enforcement attempts. |
| `.shirube/company-dev-os/profile-fixtures/overlay-precedence-conflict.fixture.yaml` | add | Data-only blocker fixture for unresolved overlay precedence conflicts. |
| `.shirube/audits/AUDIT-ITEM-SET-COMPANY-DEV-OS-PROFILE-C1.yaml` | add | B3-compatible C1 audit item set for exact-head codex-audit review. |

## Source Review Inputs

- `.shirube/specs/SPEC-COMPANY-DEV-OS-PROFILE-C0.md`
- `.shirube/cells/CELL-COMPANY-DEV-OS-PROFILE-C0.yaml`
- `.shirube/impls/IMPL-COMPANY-DEV-OS-PROFILE-C0.md`
- `.shirube/company-dev-os/evidence-schema.json`
- `.shirube/company-dev-os/roles/*.role.json`
- `.shirube/audit-item-sets/stage-3-spec-audit.yaml`
- `.shirube/audit-item-sets/stage-6-impl-audit.yaml`
- `.shirube/audit-item-sets/stage-9-impl-to-code-audit.yaml`
- `schemas/shirube-audit.schema.json`
- #466 C1 implementation handoff
- #405 SSOT link for C1 dispatch

## Implementation Notes

1. Keep all changed files under `.shirube/**`.
2. Encode the canonical profile as draft data, not as authoritative policy.
3. Carry every C0 gap into `c0_gap_handling` with a named status and follow-up.
4. Keep fixtures data-only and label negative fixtures as expected future-validator blockers.
5. Add only an audit item set for C1; do not create an exact-head audit record before the PR head exists.
6. Make the draft profile explicit that AUN/Discord identity, AGENTS/runtime overlay output, and projection targets remain read-only or candidate/template only.

## Artifact Evidence Labels

These labels are intended for the PR body and conveyor check:

- Feature Spec: `.shirube/specs/SPEC-COMPANY-DEV-OS-PROFILE-C1.md`
- Cell Record: `.shirube/cells/CELL-COMPANY-DEV-OS-PROFILE-C1.yaml`
- Impl Artifact: `.shirube/impls/IMPL-COMPANY-DEV-OS-PROFILE-C1.md`
- Spec-to-Cell Trace: `TRACE-COMPANY-DEV-OS-PROFILE-C1`
- Required Test Mapping: `TEST-MAP-COMPANY-DEV-OS-C1-001`
- Execution Contract: `CONTRACT-COMPANY-DEV-OS-PROFILE-C1`
- Spec Audit: `AUDIT-ITEM-SET-COMPANY-DEV-OS-PROFILE-C1`
- Impl Audit: `AUDIT-ITEM-SET-COMPANY-DEV-OS-PROFILE-C1`

The `Spec Audit` and `Impl Audit` labels above identify the committed review item set only. The actual exact-head audit record remains required from `codex-audit` after the draft PR exists.

## Non-goals

- No runtime behavior changes.
- No CLI behavior changes.
- No schema or profile validator changes.
- No B3 audit bridge behavior changes.
- No active workflow changes.
- No required check activation.
- No branch protection or ruleset mutation.
- No AUN queue/control implementation, AUN DB/schema mutation, AUN agent routing mutation, Discord, queue, LaunchAgent, or transport changes.
- No target repository mutation.
- No production or deploy behavior changes.
- No package or lockfile changes.
- No replacement or removal of existing Company Dev OS overlays.
- No authoritative adoption of the Shirube profile.
- No C2 validator or doctor implementation.

## Test Plan

- `git diff --check origin/main...HEAD`
- `bash scripts/detect-breaking-changes.sh origin/main`
- YAML parse for changed `.yaml` / `.yml` files
- `npm run lint`
- `npm run type-check`
- `npm run build:cli`
- `npm run --silent shirube -- conveyor check https://github.com/watchout/ai-dev-framework/pull/<PR> --format json`

## B3 Audit Record Boundary

C1 commits only `.shirube/audits/AUDIT-ITEM-SET-COMPANY-DEV-OS-PROFILE-C1.yaml`.

`codex-audit` must produce the actual `shirube-audit/v1` audit record at the exact PR head. The implementation bot must not pre-fill a PASS record with placeholder head, placeholder evidence refs, or self-approval.
