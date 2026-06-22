# Company Dev OS Shirube Canonical Profile C1

SPEC-ID: SPEC-COMPANY-DEV-OS-PROFILE-C1
Risk Tier: R3
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/405#issuecomment-4765382843
Work Order: https://github.com/watchout/ai-dev-framework/issues/466
Predecessor: PR #467 / COMPANY-DEV-OS-PROFILE-C0

## Purpose

Create the first read-only Shirube canonical governance profile draft for Company Dev OS.

C1 resolves the C0 inventory into a draft profile shape, adds data-only fixtures for later validator work, and commits a B3-compatible `shirube-audit/v1` audit item set for the C1 review. It does not make the profile authoritative, replace existing Company Dev OS overlays, or implement validator/enforcement behavior.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-COMPANY-DEV-OS-C1-001 | Add a non-authoritative Company Dev OS canonical profile draft under `.shirube/company-dev-os/` with the required C1 top-level sections. |
| REQ-COMPANY-DEV-OS-C1-002 | Preserve and map existing Company Dev OS role aliases, including `spec`, `arc`, `implementation`, `audit`, `qa`, `check`, and `cto`, while defining draft canonical role IDs for the `dev-*` role vocabulary. |
| REQ-COMPANY-DEV-OS-C1-003 | Preserve maker/checker separation, one bot equals one role equals one LLM, and state transition authority separation from audit content. |
| REQ-COMPANY-DEV-OS-C1-004 | Map Company Dev OS low, medium, and high risk classes to draft Shirube risk/gate profiles without changing live policy. |
| REQ-COMPANY-DEV-OS-C1-005 | Define draft evidence, completion, transition request, rework instruction, projection, overlay precedence, adoption, authority owner, non-authority, and stop-condition semantics. |
| REQ-COMPANY-DEV-OS-C1-006 | Provide explicit C1 treatment for every C0 gap `GAP-C0-001` through `GAP-C0-007`. |
| REQ-COMPANY-DEV-OS-C1-007 | Add data-only profile fixtures covering valid minimal profile shape and required future-validator blockers. |
| REQ-COMPANY-DEV-OS-C1-008 | Add a committed B3-compatible `shirube-audit/v1` audit item set for C1 semantic review and leave the exact-head audit record to `codex-audit`. |
| SEC-COMPANY-DEV-OS-C1-001 | Do not change runtime code, CLI behavior, schemas, B3 behavior, validators, workflows, required checks, branch protection, rulesets, AUN/Discord/DB/queue/LaunchAgent behavior, production/deploy behavior, packages, lockfiles, target repositories, or existing Company Dev OS overlays. |

## Draft Profile Contract

The canonical profile draft must remain explicitly non-authoritative:

```yaml
schema_version: shirube-company-dev-os-profile/v0-draft
profile_id: company-dev-os-canonical-profile-draft
status: draft_readonly_not_authoritative
source_inventory: C0
```

The profile must include these top-level sections:

- `source_refs`
- `role_ids`
- `role_aliases`
- `roles`
- `maker_checker_rules`
- `risk_tiers`
- `protected_surface_triggers`
- `gate_sequences`
- `transition_request_structure`
- `rework_instruction_structure`
- `evidence_requirements`
- `completion_states`
- `non_completion_states`
- `projection_targets`
- `overlay_precedence`
- `adoption_states`
- `stop_conditions`
- `authority_owners`
- `non_authority_boundaries`

## C0 Gap Handling

C1 must include a `c0_gap_handling` section that covers each C0 gap:

| Gap ID | Required C1 treatment |
| --- | --- |
| GAP-C0-001 | Resolve or carry the `arc` composite role versus `dev-tech` / `dev-lead` split. |
| GAP-C0-002 | Resolve or carry the `qa` / `check` / `dev-check` / `dev-field` naming conflict. |
| GAP-C0-003 | Bind or explicitly defer repo-specific authority owner mapping. |
| GAP-C0-004 | Define or explicitly defer markdown evidence pack to machine-readable evidence model compatibility. |
| GAP-C0-005 | Keep AUN identity compatibility as unverified unless separately inventoried. |
| GAP-C0-006 | Make overlay precedence machine-readable or name it as a blocker. |
| GAP-C0-007 | Define state aliases or name them as a blocker. |

Each gap row must include:

- `gap_id`
- `status`
- `profile_field`
- `risk_if_wrong`
- `required_followup`

Allowed statuses are `draft_resolved`, `carried_blocker`, `deferred_to_C2`, and `deferred_to_AUN_readonly`.

## Fixtures

The fixtures are data-only inputs for later C2 validator/doctor work. C1 does not add a validator or assert that these fixtures are currently machine-enforced.

Required fixtures:

| Fixture | Expected future validator meaning |
| --- | --- |
| `valid-minimal-profile.fixture.yaml` | Contains required draft sections and one safe role, gate, and projection mapping. |
| `role-vocab-conflict.fixture.yaml` | Demonstrates an unresolved `arc` / `dev-tech` / `dev-lead` conflict. |
| `missing-authority-owner.fixture.yaml` | Demonstrates a high-risk protected surface without an authority owner. |
| `missing-maker-checker.fixture.yaml` | Demonstrates a gate path lacking maker/checker separation. |
| `enforcement-attempt.fixture.yaml` | Demonstrates a projection target attempting workflow, ruleset, AUN, or control mutation. |
| `overlay-precedence-conflict.fixture.yaml` | Demonstrates an AGENTS / CLAUDE / SSOT precedence conflict without resolution. |

## B3-Compatible Audit Item Set

C1 must add a committed `shirube-audit/v1` item set using `document_type: audit_item_set`.

Required item IDs:

- `C1-PROFILE-SCHEMA-DRAFT`
- `C1-C0-GAP-HANDLING`
- `C1-ROLE-ALIAS-MAKER-CHECKER`
- `C1-GATE-RISK-AUTHORITY-MAPPING`
- `C1-EVIDENCE-COMPLETION-MODEL`
- `C1-READONLY-PROJECTION-BOUNDARY`
- `C1-FIXTURE-COVERAGE`
- `C1-SCOPE-NONENFORCEMENT`

The exact-head audit record is not committed by the implementation bot. `codex-audit` must produce the audit record at the PR head and may use the committed C1 item set as the item-set reference.

## Non-Scope

C1 does not implement or change:

- runtime behavior
- CLI behavior
- schema validators or profile validators
- B3 audit bridge behavior
- AUN queue/control/DB/agent routing
- Discord, LaunchAgent, transport, or live identity behavior
- branch protection, rulesets, required checks, workflow activation, or enforcement
- target repository mutation
- production or deploy behavior
- package or lockfile content
- existing Company Dev OS overlay replacement or removal
- authoritative adoption of the Shirube profile
- C2 validator/doctor implementation
- C3 AUN projection contract
- C4 shadow projection pilot

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-COMPANY-DEV-OS-C1-001 | REQ-COMPANY-DEV-OS-C1-001 | `canonical-profile.draft.yaml` is present, marked `draft_readonly_not_authoritative`, and includes all required top-level sections. |
| AC-COMPANY-DEV-OS-C1-002 | REQ-COMPANY-DEV-OS-C1-002, REQ-COMPANY-DEV-OS-C1-003 | Role aliases, canonical role IDs, maker/checker separation, and state transition authority boundaries are represented in the profile. |
| AC-COMPANY-DEV-OS-C1-003 | REQ-COMPANY-DEV-OS-C1-004, REQ-COMPANY-DEV-OS-C1-005 | Risk tiers, protected surfaces, gate sequences, evidence requirements, transition/rework structures, completion states, projection targets, overlay precedence, adoption states, and authority owners are represented as draft profile data. |
| AC-COMPANY-DEV-OS-C1-004 | REQ-COMPANY-DEV-OS-C1-006 | Every C0 gap row appears with status, profile field, risk, and required follow-up. |
| AC-COMPANY-DEV-OS-C1-005 | REQ-COMPANY-DEV-OS-C1-007 | All six required data-only fixtures exist under `.shirube/company-dev-os/profile-fixtures/`. |
| AC-COMPANY-DEV-OS-C1-006 | REQ-COMPANY-DEV-OS-C1-008 | The committed C1 audit item set uses `shirube-audit/v1`, `document_type: audit_item_set`, and contains all required C1 item IDs. |
| AC-COMPANY-DEV-OS-C1-007 | SEC-COMPANY-DEV-OS-C1-001 | The PR changes only `.shirube/**` docs/spec/profile artifacts and does not mutate runtime, CLI, schemas, workflows, enforcement, AUN, target repositories, packages, production, deploy, or existing overlays. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-COMPANY-DEV-OS-C1-001 | REQ-COMPANY-DEV-OS-C1-001 through REQ-COMPANY-DEV-OS-C1-006 | Review the profile draft for required sections, role/risk/evidence/projection semantics, and C0 gap handling. |
| TEST-MAP-COMPANY-DEV-OS-C1-002 | REQ-COMPANY-DEV-OS-C1-007 | Review each profile fixture for the expected future-validator positive or negative case. |
| TEST-MAP-COMPANY-DEV-OS-C1-003 | REQ-COMPANY-DEV-OS-C1-008 | Parse the audit item set as YAML and verify the required C1 item IDs are present. |
| TEST-MAP-COMPANY-DEV-OS-C1-004 | SEC-COMPANY-DEV-OS-C1-001 | Run `git diff --check origin/main...HEAD`, `bash scripts/detect-breaking-changes.sh origin/main`, YAML parse for changed YAML files, `npm run lint`, `npm run type-check`, `npm run build:cli`, and Shirube conveyor check for the PR. |

## Trace Matrix

TRACE-COMPANY-DEV-OS-PROFILE-C1

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-COMPANY-DEV-OS-C1-001 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-002 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-003 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-004 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-005 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-006 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-001 |
| REQ-COMPANY-DEV-OS-C1-007 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-002 |
| REQ-COMPANY-DEV-OS-C1-008 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-003 |
| SEC-COMPANY-DEV-OS-C1-001 | CELL-COMPANY-DEV-OS-PROFILE-C1 | IMPL-COMPANY-DEV-OS-PROFILE-C1 | TEST-MAP-COMPANY-DEV-OS-C1-004 |
