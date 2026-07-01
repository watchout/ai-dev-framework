---
id: SPEC-SHIRUBEV30-RECONCILIATION-405
status: Draft
traces:
  parent_issue: [405]
  compatibility_spec: [SPEC-SHIRUBEV21-406]
---

# SPEC: Shirube 3.0 Vocabulary Reconciliation

## 0. Meta

| Field | Value |
|---|---|
| Origin issue | #405 |
| Source handoff | #405 comment `4737984848` |
| Cell | `shirube-3.0-spec-reconciliation-cell-0` |
| Risk | R0 docs/spec only |
| Change class | Canonical docs/spec artifact |
| Next blocked Cell | `shirube-3.0-bootstrap-gate-cell-1` |

This artifact is the canonical docs/spec reconciliation for Shirube 3.0
vocabulary. It freezes how v2.1 `Work Order` / `Change Slice` vocabulary maps
to 3.0 `Phase` / `Cell` vocabulary before the bootstrap machine-gate Cell
begins.

Formal Shirube 3.0 adoption remains protected governance / CEO approval gated.
Until that approval and the reconciliation PR merge, Shirube 3.0 is accepted
forward planning direction and v2.1 remains the last merged docs-backed spec.

## 1. Purpose

Define the canonical Shirube 3.0 object vocabulary and lifecycle so planning,
implementation, machine gates, merge handoff, and evidence no longer diverge
between v2.1 and 3.0 terms.

The canonical 3.0 flow is:

```text
Hearing / Discovery
-> SSOT
-> Phase Plan
-> Cell Plan
-> Design Consolidation / Enterprise Fit Gate
-> Cell Intake Gate
-> Cell Goal Mode Implementation
-> Cell Debug Loop
-> Cell Machine Gate
-> Cell Narrow Verification
-> Release Owner Merge
-> Cell Post-merge Evidence
-> Phase Completion Gate
-> Phase Completion Evidence
-> Next Phase / Cell
```

Machine evidence remains the completion basis. Comments, queue ACKs, broad
review prose, or handoff prose may support verification, but they do not replace
exact-head gate evidence, required approvals, or post-merge evidence.

## 2. Non-Goals

This Cell does not implement runtime behavior.

This Cell does not create GitHub Checks, mutate branch protection, update
labels, update PRs, post comments, mutate queues, write AUN or Discord state,
touch DB/storage, change merge authority, activate production, or start
`shirube-3.0-bootstrap-gate-cell-1`.

This Cell does not make Shirube 3.0 finally authoritative. Formal 3.0 adoption
remains protected governance / CEO approval gated while #405 carries
`route:ceo-approval` / `protected:governance`.

## 3. User Stories

- As a release owner, I can tell whether a PR represents a Cell PR, a Phase
  completion claim, or only a compatibility Change Slice.
- As an implementation bot, I can receive one Cell with one implementation Work
  Order and know that I must not span multiple Cells by default.
- As an auditor, I can check `PASS_WITH_WARN` merge semantics by risk class
  without treating required evidence gaps as warnings.
- As a future AUN integrator, I can map Shirube Work Orders to AUN baton or
  delivery envelope vocabulary without claiming runtime integration in this
  docs-only Cell.
- As a future implementation owner, I cannot receive a Cell implementation
  handoff until design ownership, boundaries, protected surfaces, evidence path,
  and merge authority separation have a durable gate record.

## 4. Functional Requirements

### 4.1 Canonical Mapping Table

| Term | 3.0 definition | v2.1 compatibility | Forward use |
|---|---|---|---|
| Goal | Business, product, or top-level outcome. | Same concept as v2.1 Goal. | Keep as the top-level objective. |
| Phase | Product, business, roadmap, or SSOT meaning unit. | Same level as v2.1 Phase, but no longer assumed to be one PR. | Phase Plan and Phase Completion Gate. |
| Work Order | Orchestration envelope for assigning Cell lifecycle work to an actor or system. | v2.1 Work Order remains valid as orchestration envelope vocabulary. | Keep for AUN/Shirube dispatch, handoff, evidence routing, and lifecycle requests. |
| Implementation Work Order | Work Order that defines and authorizes exactly one Cell implementation target. | Refines the v2.1 Work Order for 3.0 Cell implementation. | Required exactly once per Cell implementation lifecycle. |
| Operational Work Order | Work Order that drives a lifecycle step for an existing Cell. | Preserves v2.1 operational assignment semantics. | Zero or more may drive debug, verification, merge handoff, post-merge evidence, or rework for the same Cell. |
| Cell | Implementation-optimized unit for goal-mode execution, debug loop, machine gate, merge, rollback, and evidence. | New 3.0 primary implementation unit. | Normal PR, gate, merge, rollback, and evidence unit. |
| Change Slice | Concrete diff/change-scope compatibility term. | v2.1 Change Slice becomes compatibility vocabulary for a Cell's concrete diff or PR scope. | Prefer Cell; retain `change_slice_id` only as compatibility metadata when needed. |
| PR | GitHub review, CI, merge, and evidence vessel. | v2.1 often paired Change Slice / PR. | Normally a Cell PR, not a Phase PR. |
| Trace Matrix | Coverage and evidence relationship view. | v2.1 Trace Matrix remains useful, but it is not canonical membership storage. | Reference the dedicated membership manifest and show coverage/evidence relationships. |

### 4.2 Work Order to Cell Cardinality

Cardinality is frozen as:

```text
implementation Work Order : Cell = 1 : 1
operational Work Order : Cell = N : 1
Work Order : multiple Cells = disallowed by default
```

Rules:

- An `implementation Work Order` defines and authorizes exactly one Cell
  implementation target.
- A Cell must have exactly one implementation Work Order for its implementation
  lifecycle.
- Zero or more `operational Work Orders` may drive lifecycle steps for the same
  Cell, such as debug, verification, merge handoff, post-merge evidence, or
  rework.
- A Work Order must not span multiple Cells by default.
- Future cross-Cell orchestration must use a parent coordination record that
  references separate per-Cell Work Orders, not one Cell-spanning Work Order.

### 4.3 Dedicated Membership Manifest Contract

The dedicated Phase/Cell/Work Order membership manifest is canonical.
The Trace Matrix is a referencing and coverage view that consumes or cites this
manifest.

Minimum manifest contract:

```yaml
schema_version: shirube-phase-cell-membership/v1
phases:
  - phase_id: <id>
    title: <title>
    acceptance_criteria: []
    required_cell_ids: []
    optional_cell_ids: []
    deferred_cell_ids: []
    evidence_sink: <url>
cells:
  - cell_id: <id>
    phase_ids: []
    required_for_phase_done: true|false
    risk_class: R0|R1|R2|R3|R4
    cell_pr: <url|null>
    gate_evidence: <url|null>
    post_merge_evidence: <url|null>
    rollback_impact_phase_ids: []
    status: planned|in_progress|merged|done|deferred|blocked
work_orders:
  - work_order_id: <id>
    targets_cell_id: <cell_id>
    type: implementation|operational
    dispatched_via: <github|aun|manual|codex|claude|other>
    evidence_sink: <url|null>
    status: planned|in_progress|done|blocked|deferred
```

Manifest rules:

- Every implementation Cell must have exactly one `work_orders[]` item with
  `type: implementation` and `targets_cell_id` set to that Cell.
- Operational Work Orders may share the same `targets_cell_id`.
- Phase Completion Gate reads `phases[]`, `cells[]`, and `work_orders[]`.
- A Cell rollback that affects multiple Phases must update or invalidate
  completion status for every Phase in `rollback_impact_phase_ids`.
- Trace Matrix references the manifest for coverage, evidence, policy, verdict,
  and check relationships. It does not become the canonical membership source.

### 4.4 Manifest Mutation Authority

Canonical manifest changes happen through normal repository PRs.

Implementation bots may edit the manifest only when the Cell intake explicitly
includes that docs/spec or manifest change in scope.

AUN, queue runners, GitHub checks, runtime agents, schedulers, Discord bridges,
or DB integrations must not mutate the canonical manifest in this Cell.

Future runtime sync is separate non-scope and requires its own approved Cell.

### 4.5 PASS_WITH_WARN Merge Semantics

Gate verdict merge semantics:

```yaml
PASS:
  merge_eligible: true
PASS_WITH_WARN:
  r0_r2_default: may_merge_if_non_blocking_warning_recorded
  r3_non_protected_warning_default: may_merge_if_non_blocking_warning_recorded_and_release_owner_accepts
  r3_protected_surface_warning_default: requires_domain_security_or_cto_acceptance
  r4_default: not_merge_eligible_unless_explicit_stop_lane_go_accepts_warning
BLOCKED:
  merge_eligible: false
```

Rules:

- Required evidence gaps are `BLOCKED`, not warnings.
- Protected approval gaps are `BLOCKED`, not warnings.
- Exact-head mismatch is `BLOCKED`.
- Known blocking defects are `BLOCKED`.
- `PASS_WITH_WARN` may become merge-eligible only when the warning is
  non-blocking for the risk lane, recorded in the evidence sink, and accepted by
  the required release owner or approval actor.

### 4.6 Design Consolidation / Enterprise Fit Gate

`Design Consolidation / Enterprise Fit Gate` is the mandatory
pre-implementation design gate between `Cell Plan` and `Cell Intake Gate`.

Purpose:

- validate architecture ownership;
- validate system boundaries;
- validate enterprise fit;
- validate protected surfaces;
- validate role and authority boundaries;
- validate stop conditions;
- prevent the old L1/L2 audit -> QA/check conveyor from returning as the
  primary route;
- ensure machine evidence remains primary;
- ensure review remains narrow verification rather than primary acceptance;
- ensure merge authority remains separate from goal-mode implementation.

This gate is pre-implementation design consolidation. It is not broad L1/L2
audit, QA/check, or CTO review for ordinary R0-R2 work. It confirms the Cell is
ready to enter Cell Intake; it does not replace Cell Machine Gate evidence,
release-owner judgment, exact-head checks, or required protected approvals.

Checklist:

- Shirube ownership is clear.
- AUN / GitHub / runner boundaries are clear.
- No second governance state machine is introduced.
- Protected surfaces are identified.
- Risk class is not under-classified.
- Read vs write/apply/send/dispatch are separated where required.
- Dry-run vs apply are separated where required.
- R3/R4 surfaces have required approval path.
- Rollback / recovery is representable.
- Exact-head evidence path is clear.
- `release_owner` / `release_executor` / `evidence_sink` are concrete or
  explicitly pending.
- Old broad L1/L2 audit -> QA/check is not the primary route.

Gate record requirement:

- No Cell Intake is valid unless a Design Consolidation / Enterprise Fit Gate
  record exists, or the Cell explicitly inherits a still-valid gate record.
- An inherited gate record is still valid only when the Cell's SSOT, Phase Plan,
  Cell Plan, risk class, protected surfaces, authority boundaries, stop
  conditions, and evidence path have not materially changed.
- Future Cells must not receive implementation handoff without this gate record.
- `shirube-3.0-spec-reconciliation-cell-0` may use retroactive Design
  Consolidation verification because the gate was identified after
  implementation began.
- The Cell 0 exception must not apply to `shirube-3.0-bootstrap-gate-cell-1` or
  any later Cell.

Minimum gate record fields:

```yaml
design_consolidation_gate:
  gate_version: shirube-design-consolidation-enterprise-fit/v1
  cell_id: <id>
  source_cell_plan: <url|path>
  verdict: PASS|BLOCKED
  checklist:
    shirube_ownership_clear: true|false
    aun_github_runner_boundaries_clear: true|false
    no_second_governance_state_machine: true|false
    protected_surfaces_identified: true|false
    risk_not_under_classified: true|false
    read_write_apply_send_dispatch_separated: true|false
    dry_run_apply_separated: true|false
    r3_r4_approval_path_present: true|false
    rollback_recovery_representable: true|false
    exact_head_evidence_path_clear: true|false
    release_owner_executor_evidence_sink_concrete_or_pending: true|false
    old_audit_qa_not_primary_route: true|false
  inherited_from: <gate-record-url|null>
  evidence_sink: <url>
```

### 4.7 Cell Intake Risk to Required Gates Binding

Cell Intake must compute or record:

```yaml
risk_class: R0|R1|R2|R3|R4
protected_surfaces: []
required_gates: []
required_evidence: []
required_approvals: []
merge_conditions: []
stop_conditions: []
```

Rules:

- Unknown risk escalates; it does not downgrade.
- R2/R3/R4 mixing splits Cells or escalates to the highest class.
- R3 requires relevant domain, security, or CTO approval evidence.
- R4 is stop lane and cannot proceed by goal-mode self-authorization.
- Cell Machine Gate reports `required_gates`, `satisfied_gates`, and
  `missing_gates`.

Cell Intake consumes the Design Consolidation / Enterprise Fit Gate record. If
the record is missing, stale, or `BLOCKED`, Cell Intake is invalid and the Cell
must not enter goal-mode implementation.

### 4.8 Completion State Definitions

`Cell Done` means:

- the Cell PR is merged;
- exact-head Cell Machine Gate evidence exists;
- post-merge evidence exists;
- no known blocking defect remains for that Cell;
- deferred follow-up, if any, is explicitly recorded with reason and risk.

`Phase Done` means:

- all required Cells for the Phase are Cell Done;
- Phase acceptance criteria are satisfied;
- Phase-level smoke or evidence passes where applicable;
- deferred Cells are explicitly recorded with reason, risk, and follow-up.

`Release Ready` means:

- required Phases are Phase Done;
- release-level machine gate passes;
- release owner, release executor, and evidence sink are concrete;
- required R3/R4 approvals are present.

`Production Done` means production authority and operation evidence are present:

```yaml
production_authority:
  required_for: R4
  approval_actor: <ceo|cto|security|domain-owner as policy requires>
  approval_evidence: <url>
  operation_evidence: <url>
  post_release_smoke: PASS|WARN|FAIL
  rollback_status: <recorded>
```

Production Done cannot be claimed from Cell Done, Phase Done, Release Ready, or
goal-mode output alone.

### 4.9 AUN Vocabulary Reservation

This docs/spec artifact reserves only vocabulary mapping:

```text
Shirube Work Order
<-> AUN baton / delivery envelope
<-> #766 phase_handoff envelope
```

Reserved meaning:

- Shirube Work Order is the orchestration envelope.
- AUN baton / delivery envelope is a compatible transport or dispatch envelope.
- #766 `phase_handoff` envelope is a compatible handoff envelope reference.

This reservation does not implement AUN runtime behavior and does not claim AUN
integration complete.

### 4.10 v2.1 Compatibility and 3.0 Adoption

v2.1 compatibility rules:

- v2.1 Work Order remains valid as orchestration envelope vocabulary.
- v2.1 Change Slice becomes compatibility vocabulary for a Cell's concrete
  diff/PR scope.
- PR is now normally `Cell PR`, not `Phase PR`.
- v2.1 evidence, policy, risk-lane, role boundary, and traceability ideas are
  absorbed into 3.0 rather than discarded.

Formal 3.0 adoption rules:

- 3.0 is accepted forward planning direction.
- v2.1 docs remain the last merged docs-backed spec until this reconciliation
  docs PR merges.
- Final 3.0 authoritative adoption remains protected governance / CEO approval
  gated while #405 retains `route:ceo-approval` / `protected:governance`.
- `shirube-3.0-bootstrap-gate-cell-1` remains blocked until this reconciliation
  Cell merges, post-merge evidence is recorded, and its own Design
  Consolidation / Enterprise Fit Gate record exists.

## 5. Interfaces

The canonical interfaces introduced by this artifact are the membership
manifest contract in section 4.3 and the Design Consolidation / Enterprise Fit
Gate record in section 4.6.

```text
schema_version: shirube-phase-cell-membership/v1
gate_version: shirube-design-consolidation-enterprise-fit/v1
```

These interfaces are docs/spec only. No schema parser, CLI command, GitHub
Check, runtime sync, queue adapter, DB model, or AUN integration is created by
this Cell.

Consumers may reference the contract in future docs/spec, impl, verify, ops,
fixtures, or runtime Cells, but those consumers must be implemented and reviewed
separately.

## 6. Non-Functional Requirements

- Determinism: Gate and completion terms must be replayable from durable
  manifest, PR, check, evidence, and approval records.
- Traceability: Phase/Cell/Work Order relationships must be visible without
  reading transient chat history.
- Authority separation: Goal-mode implementation cannot approve risk, merge,
  production activation, or its own missing evidence.
- Compatibility: v2.1 terms remain interpretable while 3.0 terms become the
  forward planning vocabulary.
- R0 scope: this Cell must remain docs/spec only.

## 7. Acceptance Criteria

Acceptance criteria:

- docs/spec contains the Phase / Work Order / Cell / Change Slice / PR mapping
  table in section 4.1.
- Work Order to Cell cardinality is explicit in section 4.2.
- `work_orders[]` exists in the membership manifest contract in section 4.3.
- dedicated membership manifest is canonical and Trace Matrix is a
  referencing/coverage view.
- manifest mutation authority is defined.
- PASS_WITH_WARN semantics include R3 non-protected warning default.
- Design Consolidation / Enterprise Fit Gate is defined as mandatory before
  Cell Intake, including checklist, gate record requirement, future Cell rule,
  and Cell 0 retroactive verification exception.
- Cell Intake risk-to-required-gates binding is defined and consumes the Design
  Consolidation / Enterprise Fit Gate record.
- Cell Done, Phase Done, Release Ready, and Production Done are defined.
- AUN baton / delivery envelope / #766 `phase_handoff` vocabulary is reserved
  without runtime implementation.
- v2.1 vocabulary compatibility is documented.
- formal 3.0 adoption remains protected governance / CEO approval gated.

Gherkin scenario:

```gherkin
Given a Shirube 3.0 Cell has one implementation Work Order, zero or more operational Work Orders, a membership manifest entry, and a Design Consolidation / Enterprise Fit Gate record
When the Cell Machine Gate evaluates merge readiness for the exact PR head
Then it can map the PR to one Cell and one implementation Work Order
And it treats required evidence gaps or protected approval gaps as BLOCKED
And it treats only recorded non-blocking lane-appropriate warnings as PASS_WITH_WARN
```

Design gate scenario:

```gherkin
Given a future Shirube 3.0 Cell has a Cell Plan but no Design Consolidation / Enterprise Fit Gate record
When an implementation handoff is requested
Then the handoff is BLOCKED before Cell Intake
And the Cell must not enter goal-mode implementation
```

## 8. Assumptions and Dependencies

- Parent SSOT and decision history live in #405.
- v2.1 docs-backed governance vocabulary lives in
  `docs/spec/shirube-v2.1-enterprise-governance.md`.
- This artifact is created before `shirube-3.0-bootstrap-gate-cell-1`.
- `shirube-3.0-spec-reconciliation-cell-0` may use retroactive Design
  Consolidation verification only because the gate was identified after
  implementation began.
- `shirube-3.0-bootstrap-gate-cell-1` and later Cells cannot inherit the Cell 0
  exception.
- A future implementation Cell may create schemas, fixtures, validators, or
  runtime sync only after this reconciliation contract merges and the relevant
  Cell intake authorizes that work.

## 9. Review Boundary

Narrow spec verification for this Cell checks:

- the handoff acceptance criteria are represented;
- B1 and E1-E5 from the reconciliation review are represented;
- the Design Consolidation / Enterprise Fit Gate correction is represented;
- only docs/spec files changed;
- no runtime, AUN, GitHub mutation, branch protection, queue, DB, Discord, or
  merge authority behavior was added;
- docs/spec validation and whitespace checks pass;
- formal 3.0 adoption remains protected governance / CEO approval gated.

The Design Consolidation / Enterprise Fit Gate is pre-implementation design
consolidation. The old broad L1/L2 audit -> QA/check conveyor is not the
primary route for this Cell or later Cells.

## 10. Control Mechanism Selection

script 選定根拠: docs/spec validation and `git diff --check` are deterministic,
replayable checks for this R0 Cell. Future gates that consume the membership
manifest must also be script-controlled before they can affect transition,
merge-readiness, or completion state.

The Design Consolidation / Enterprise Fit Gate record is a prerequisite record
for Cell Intake. Future implementation may validate that record with scripts,
but this Cell only freezes the docs/spec contract.

Hook 選定根拠: hooks are outside this Cell. A hook may later call a deterministic
script, but it must not become the canonical source for membership, risk,
approval, merge, production, or completion decisions.

GitHub rationale: GitHub issues and PRs provide durable evidence sinks and
review context. This Cell does not mutate GitHub state.

LLM boundary: an LLM may draft or edit this docs/spec artifact. It cannot
approve formal 3.0 adoption, satisfy required gates, authorize merge, or claim
production completion.

| Requirement | Mechanism | Hook-only unavoidable case | Rationale |
|---|---|---|---|
| Vocabulary reconciliation | docs/spec review | - | canonical prose is the source contract for later implementation |
| Membership contract | docs/spec manifest contract | - | future parsers must consume a frozen shape |
| Design Consolidation gate record | docs/spec gate contract | - | future Cells need a durable pre-implementation design record before handoff |
| R0 scope guard | `git diff --check` and changed-file review | - | verifies docs/spec-only boundaries without runtime mutation |
| Spec corpus validation | `gate validate spec` | - | deterministic repository validation is already available |

## 11. Testing Layer

This R0 docs/spec Cell does not require unit, integration, e2e, or smoke tests
because it does not change runtime behavior.

Regression validation for this Cell is:

- repo docs/spec validation when available;
- `git diff --check`;
- changed-file review confirming only docs/spec files changed.

Lint and type-check are not required for the artifact itself unless the repo's
standard docs/spec PR path requires them.

## 12. Non-Scope Checklist

This Cell must not add or change:

- runtime behavior;
- CLI behavior;
- GitHub Check creation;
- branch protection;
- label, PR, or comment mutation;
- AUN, Discord, DB, queue, scheduler, LaunchAgent, or baton delivery behavior;
- merge authority;
- production activation;
- `shirube-3.0-bootstrap-gate-cell-1`.
