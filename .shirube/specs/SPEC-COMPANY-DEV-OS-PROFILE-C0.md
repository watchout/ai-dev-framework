# Company Dev OS To Shirube Canonical Profile C0

SPEC-ID: SPEC-COMPANY-DEV-OS-PROFILE-C0
Risk Tier: R3
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/405#issuecomment-4763962869
Work Order: https://github.com/watchout/ai-dev-framework/issues/466

## Purpose

Create the first read-only inventory and mapping slice for converting Company Dev OS into a Shirube canonical governance profile.

This C0 artifact does not make Shirube authoritative over Company Dev OS. It records current Company Dev OS rules, maps them to proposed Shirube canonical profile fields, and identifies gaps or conflicts that must be resolved before any read-only projection, shadow validation, or enforcement work.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-COMPANY-DEV-OS-C0-001 | Inventory current Company Dev OS governance sources, including external source files, local dry-run overlays, role boundary tables, flow rules, high-risk triggers, evidence rules, maker/checker rules, and bot identity constraints. |
| REQ-COMPANY-DEV-OS-C0-002 | Map Company Dev OS rules to Shirube canonical profile field candidates without silently dropping protected governance semantics. |
| REQ-COMPANY-DEV-OS-C0-003 | Identify role vocabulary conflicts, authority ambiguities, and protected-surface stop conditions before profile drafting. |
| REQ-COMPANY-DEV-OS-C0-004 | Separate read-only projection candidates from control, enforcement, AUN queue, DB, workflow, branch protection, ruleset, production, and deploy behavior. |
| REQ-COMPANY-DEV-OS-C0-005 | Define adoption states from legacy overlay through enforcement authorization, without authorizing later states in C0. |
| SEC-COMPANY-DEV-OS-C0-001 | Do not change runtime code, CLI behavior, active workflows, required checks, branch protection, rulesets, AUN/Discord/DB/queue/LaunchAgent behavior, production/deploy behavior, packages, lockfiles, target repositories, or existing Company Dev OS overlays. |

## 1. Source Inventory

| Source | Current source location | Role in C0 | Status | Notes |
| --- | --- | --- | --- | --- |
| Company Dev OS root | `watchout/iyasaka-arc/company-dev-os/README.md` | Defines internal development operating model, standard roles, completion criteria, and first rollout target. | mapped | Source states that Company Dev OS is an internal development operating standard, not an Aun Stack product feature spec. |
| Placement | `watchout/iyasaka-arc/company-dev-os/PLACEMENT.md` | Defines standard flow, LLM placement, handoff handling, and state transition as output. | mapped | Standard flow is `spec -> arc -> repo-specific bot -> audit -> qa -> check -> cto when high-risk`. |
| Apply guide | `watchout/iyasaka-arc/company-dev-os/APPLY_GUIDE.md` | Defines non-destructive overlay application, risk tiers, first agent-comms-mcp rollout, and explicit non-authorized live changes. | mapped | Existing `AGENTS.md` / `CLAUDE.md` and repo SSOT win on conflict. |
| Runtime activation | `watchout/iyasaka-arc/company-dev-os/RUNTIME_ACTIVATION.md` | Defines AUN agent identity, Discord identity, permission baseline, evidence requirements, and not-yet-done boundaries. | partial | C0 inventories it only. No AUN registration, Discord identity, DB rows, or live routing is authorized. |
| Agent ID registry | `watchout/iyasaka-arc/company-dev-os/AGENT_ID_REGISTRY.md` | Defines short `dev-*` operational agent IDs and AUN registration template. | partial | Conflicts with older short local role names `spec`, `arc`, `audit`, `qa`, `check`, `cto`; canonical profile must reconcile aliases. |
| Common AGENTS overlay | `watchout/iyasaka-arc/company-dev-os/company-common/AGENTS.md` | Defines Definition of Done, low/medium/high risk gates, separation of duties, non-negotiable rules, and mandatory evidence shape. | mapped | Completion requires audit, practical checks, handoff, and exact-head evidence where applicable. |
| Role matrix | `watchout/iyasaka-arc/company-dev-os/company-common/docs/role-matrix.md` | Defines role split, default LLM, responsibility, required output, and separation rule. | mapped | Same model family may be used only with separate sessions and role prompts. |
| Review gates | `watchout/iyasaka-arc/company-dev-os/company-common/docs/review-gates.md` | Defines low, medium, and high-risk gates plus state gate rule. | mapped | Audit result without transition or transition request is incomplete. |
| State transition standard | `watchout/iyasaka-arc/company-dev-os/company-common/docs/state-transition-standard.md` | Defines state names, owners, transition request structure, and read-only auditor boundary. | mapped | Canonical profile must preserve state transition request structure. |
| Audit verdict template | `watchout/iyasaka-arc/company-dev-os/company-common/docs/audit-verdict-template.md` | Defines verdict fields and invalid verdict conditions. | mapped | No exact head, no source request, or PASS with unresolved blocker is invalid. |
| Evidence pack template | `watchout/iyasaka-arc/company-dev-os/company-common/docs/evidence-pack-template.md` | Defines target, audit chain, checks, state transitions, residual risk, reproduction, and next handoff fields. | mapped | Evidence must be short, link raw evidence where possible, and mark assumptions. |
| Handoff packet template | `watchout/iyasaka-arc/company-dev-os/company-common/docs/handoff-packet-template.md` | Defines current state, decisions, evidence links, risks, next action, blockers, role/agent, and stop conditions. | mapped | Next action must be concrete and name approval or state transition blockers. |
| Agent-comms profile | `watchout/iyasaka-arc/company-dev-os/repo-profiles/agent-comms-mcp/AGENTS.md` | Defines AUN high-risk protected surfaces, mandatory gates, recovery done gate, and forbidden operations without explicit approval. | mapped | Queue, routing, Discord, daemon, DB, auth, deploy, and recovery claims are protected. |
| ai-dev-framework profile | `watchout/iyasaka-arc/company-dev-os/repo-profiles/ai-dev-framework/AGENTS.md` | Defines Shirube focus areas and L2/L3 triggers for runner, state transition, audit lane, merge readiness, safety profile, and route classification changes. | mapped | C0 is inventory only and does not change these surfaces. |
| Local dry-run overlay | `.company-dev-os/README.md`, `.company-dev-os/runtime-boundaries.json`, `.company-dev-os/aun-discord-runtime.dry-run.json` | Repository-local runtime boundary snapshot generated from Company Dev OS. | partial | Local files are untracked and not modified by C0. They document dry-run only boundaries and no live AUN/Discord registration. |
| Current Shirube repo policy | `.shirube/repo-spec.yaml`, `.shirube/agent-policy.yaml`, `.shirube/company-dev-os/roles/*.role.json` | Existing Shirube scaffold and role-profile material in this repo. | mapped | C0 maps Company Dev OS into future profile candidates without changing current policy. |

## 2. Role Vocabulary Inventory

| Company Dev OS role | Current source location | Current LLM / host | Required output | Candidate `role_id` | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| spec | `PLACEMENT.md`, `COMMON_BOT_RUNTIME_POLICY.md`, local `.company-dev-os/runtime-boundaries.json` | Claude | Feature Goal, business flow, acceptance criteria, non-goals, handoff to arc. | `dev-goal` with alias `spec` | partial | Source uses `spec`; registry uses `dev-goal`. Alias policy is required. |
| arc | `PLACEMENT.md`, `.shirube/company-dev-os/roles/arc.role.json` | Codex | Technical Design, target modules/files, PR breakdown, implementation order, test strategy, implementation handoff. | `dev-tech` or `dev-lead` with alias `arc` | conflict | `arc` combines technical design and development lead responsibilities that registry splits into `dev-tech` and `dev-lead`. |
| repo-specific implementation bot | `PLACEMENT.md`, `APPLY_GUIDE.md`, local `.company-dev-os/runtime-boundaries.json` | Existing repo runtime | Implementation PR, implementation handoff, changed files, checks run, known risks, next review. | `dev-impl` plus repo-specific alias | mapped | Must remain bounded by Cell/Impl scope and cannot self-approve. |
| audit | `company-common/AGENTS.md`, `review-gates.md`, `audit-verdict-template.md` | Codex | Primary audit, secondary audit, verdict, required fixes, rework instruction, CTO review required. | `dev-l1`, `dev-l2`, `dev-contract` | partial | Generic `audit` is a lane; canonical profile must split L1, L2, and contract audit where required. |
| qa | `PLACEMENT.md`, `COMMON_BOT_RUNTIME_POLICY.md` | Codex | Technical Practical Check, commands, scenarios, failure modes, verdict, required fixes. | `dev-check` or `dev-release` depending gate | conflict | Company Dev OS uses `qa` for Codex technical check, while registry uses `dev-check` for technical practical check and Company Dev OS uses `check` for Claude human acceptance. |
| check | `PLACEMENT.md`, `COMMON_BOT_RUNTIME_POLICY.md` | Claude | Human Practical Acceptance, stuck points, operational issues, product fixes, verdict. | `dev-field` | mapped | Human / field acceptance must remain separate from technical practical check. |
| cto | `PLACEMENT.md`, `review-gates.md`, `repo-profiles/*/AGENTS.md` | Codex | GO / CONDITIONAL GO / NO-GO, critical risks, required before merge, accepted debt, rollback/recovery notes, state transition request, rework instruction. | `dev-l3` | mapped | High-risk / protected governance decisions require exact-head and route authorization. |
| state transition operator | `state-transition-standard.md`, `AGENT_ID_REGISTRY.md` | Codex | Transition result or State Transition Request. | `dev-state` | mapped | Only this role should receive label/status/comment write in the future profile. |
| release risk reviewer | `review-gates.md`, `AGENT_ID_REGISTRY.md` | Codex | Release Risk Review before merge/demo/deploy/recovery-complete claim. | `dev-release` | mapped | No deploy authority by default. |
| evidence / handoff | `evidence-pack-template.md`, `handoff-packet-template.md`, `AGENT_ID_REGISTRY.md` | Codex | Evidence Pack, Handoff Packet. | `dev-evidence`, `dev-handoff` | partial | Source says handoff is an output item rather than a common bot; registry lists optional logical agents. |
| value / decision / ops / risk | `COMMON_BOT_RUNTIME_POLICY.md`, `AGENT_ID_REGISTRY.md` | Claude | Business value, decision log, ops process, customer risk review. | `dev-value`, `dev-decision`, `dev-ops`, `dev-risk` | partial | Excluded from initial standard flow but registered as optional logical agents. |

## 3. Role Boundary Mapping

| old_source_rule | current_source_location | shirube_canonical_field_candidate | projection_target_candidate | status | risk_if_lost | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Existing org structure remains; only LLM placement, evidence, completion, and handoff are standardized. | `README.md`, `role-matrix.md` | `role_id`, `required_outputs`, `projection_targets` | Profile docs, generated AGENTS overlay candidate. | mapped | Governance migration could be mistaken for org redesign. | Preserve human organization and map only operational lanes. |
| `spec` owns What / Why / Who / flow / acceptance and cannot approve high-risk technical changes alone. | `PLACEMENT.md`, `COMMON_BOT_RUNTIME_POLICY.md` | `allowed_actions`, `forbidden_actions`, `required_outputs`, `authority_owner` | GitHub issue comment template, AGENTS overlay candidate. | partial | Product intent could become technical approval. | Alias `spec` to `dev-goal`; keep final technical approval separate. |
| `arc` owns technical design, PR breakdown, and repo bot handoff, but does not implement, audit, or approve. | `PLACEMENT.md`, `.shirube/company-dev-os/roles/arc.role.json` | `allowed_actions`, `forbidden_actions`, `required_outputs`, `maker_checker / SoD` | Technical design comment, implementation dispatch. | conflict | One role could design, implement, and approve itself. | Canonical profile must split `dev-tech` and `dev-lead` or define `arc` as composite read-only planning role. |
| Repo-specific implementation bot may edit and PR only within approved scope. | `runtime-boundaries.json`, `APPLY_GUIDE.md` | `allowed_actions`, `forbidden_actions`, `maker_checker / SoD`, `evidence_requirements` | PR body, implementation handoff. | mapped | Implementation could exceed Cell scope or self-approve. | Align with Shirube Cell allowed_paths and execution_contract. |
| Audit roles are read/comment by default and must emit rework instruction or transition request when blocked. | `AGENTS.md`, `audit-verdict-template.md`, `state-transition-standard.md` | `gate_sequence`, `transition_request_structure`, `rework_instruction_structure`, `non_completion_states` | PR audit comment, issue state request. | mapped | PASS could remain in-session and never affect PR state. | B3 can later check structured audit admissibility. |
| Technical practical check and human/field acceptance are different gates. | `PLACEMENT.md`, `COMMON_BOT_RUNTIME_POLICY.md` | `gate_sequence`, `required_outputs`, `projection_targets` | QA/check comments and evidence pack. | mapped | CI green could be mistaken for operator success. | Preserve technical vs human acceptance split. |
| CTO / L3 handles high-risk technical Go/No-Go only. | `review-gates.md`, repo profiles | `risk_tier`, `protected_surface_triggers`, `authority_owner` | PR exact-head GO comment. | mapped | Routine work could bottleneck on CTO or high-risk work could skip CTO. | Shirube standard already separates routine owner merge from protected authority. |
| State transition authority is separate from audit content. | `state-transition-standard.md`, `RUNTIME_ACTIVATION.md` | `allowed_actions`, `forbidden_actions`, `transition_request_structure`, `authority_owner` | Label/status/comment projection. | mapped | Auditors without write permission could produce non-actionable PASS. | Future profile should grant state transition only to `dev-state`. |
| Discord-visible identity and AUN agent_id are identity, not broad authority. | `RUNTIME_ACTIVATION.md`, `AGENT_ID_REGISTRY.md` | `role_id`, `allowed_actions`, `forbidden_actions`, `projection_targets` | AUN inventory rows, Discord identity plan. | partial | Bot identity could be interpreted as permission escalation. | C0 does not create Discord apps, tokens, or AUN DB rows. |

## 4. Gate / Transition Mapping

| old_source_rule | current_source_location | shirube_canonical_field_candidate | projection_target_candidate | status | risk_if_lost | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Standard flow is `spec -> arc -> repo-specific implementation bot -> audit -> qa -> check -> cto when high-risk`. | `PLACEMENT.md`, `APPLY_GUIDE.md` | `gate_sequence`, `completion_states`, `non_completion_states` | GitHub issue/PR status comment, future generated overlay. | mapped | Work could skip design, audit, practical check, or human acceptance. | C0 does not enforce this sequence. |
| Low-risk work requires implementation handoff, L1 audit, and evidence/handoff if follow-up exists. | `review-gates.md` | `risk_tier`, `gate_sequence`, `evidence_requirements` | PR template/profile candidate. | mapped | Minor work could still lose audit evidence. | Map to Shirube R0/R1 later; no version bump in C0. |
| Medium-risk work requires Feature Goal, Technical Design, PR Cell Plan, L1, L2, technical practical check, human acceptance if human-facing, evidence pack, and handoff. | `review-gates.md` | `risk_tier`, `gate_sequence`, `evidence_requirements`, `completion_states` | PR body, audit record, evidence pack. | mapped | User-facing or integration work could merge without semantic and practical validation. | Potential mapping to Shirube R1/R2 needs C1 decision. |
| High-risk work requires all medium gates plus integration contract audit when applicable, L3/CTO, release risk before merge/demo/deploy, and explicit human approval when operational/customer risk exists. | `review-gates.md`, repo profiles | `risk_tier`, `protected_surface_triggers`, `authority_owner`, `gate_sequence` | Protected route comment, state transition request. | mapped | Protected governance or production-risk changes could bypass human authority. | Potential mapping to Shirube R3 and route:ceo-approval requires C1/C2. |
| Gate result must include state transition applied, state transition request emitted, or blocked reason. | `review-gates.md`, `state-transition-standard.md` | `transition_request_structure`, `completion_states`, `non_completion_states` | GitHub comment/state projection. | mapped | Audit PASS would not advance durable state. | This is a protected rule and must not be lost. |
| Invalid audit verdicts include no exact head, no source request, no evidence checked, PASS with blocker, PASS with no next state, and in-session-only verdict. | `audit-verdict-template.md` | `evidence_requirements`, `transition_request_structure`, `non_completion_states` | Structured audit record, B3 bridge input. | mapped | Freeform prose could be treated as gate evidence. | Aligns with B3 Bridge admissibility. |
| Default states include start, impl, impl-l1, impl-l2, impl-l3, release-risk, practical-check, human-acceptance, merge-ready, blocked, rework, done. | `state-transition-standard.md` | `completion_states`, `non_completion_states`, `gate_sequence` | GitHub labels/status fields where non-enforcing. | partial | State names could fragment by repo. | Exact label names may vary, but state semantics must stay stable. |

## 5. Risk Tier And Protected-Surface Mapping

| old_source_rule | current_source_location | shirube_canonical_field_candidate | projection_target_candidate | status | risk_if_lost | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Low risk examples are typo, docs-only, small copy change, isolated fixture update. | `review-gates.md` | `risk_tier` | PR metadata, Cell risk tier candidate. | partial | Low risk could under-document follow-up evidence. | Candidate maps near Shirube R0/R1; C1 must decide exact mapping. |
| Medium risk examples are new feature, API behavior, UI flow, workflow, integration. | `review-gates.md`, `AGENTS.md` | `risk_tier`, `gate_sequence` | PR metadata, profile field. | partial | Behavior-changing work could skip L2 or practical checks. | Candidate maps near Shirube R1/R2 depending protected surface. |
| High risk includes auth, permissions, DB migration, data loss, agent communication, memory recovery, audit logs, production deploy, hotel business-critical flow. | `AGENTS.md`, `review-gates.md`, `APPLY_GUIDE.md` | `risk_tier`, `protected_surface_triggers`, `authority_owner` | Protected route comment, owner approval record. | mapped | Protected or customer-critical work could merge without L3/release risk review. | Candidate maps to Shirube R3 or route:ceo-approval depending authority. |
| AUN protected surfaces include state daemon, launchd/tmux/process lifecycle, queue lifecycle, Discord live write, routing/actionability, DB/schema/migration, auth/secrets/tokens, replay protection, hotfix deploy. | `repo-profiles/agent-comms-mcp/AGENTS.md`, `agent-comms-mcp-apply-runbook.md` | `protected_surface_triggers`, `forbidden_actions`, `authority_owner` | AUN read-only inventory row, future protected route record. | mapped | AUN queue/control changes could be treated as ordinary implementation. | C0 authorizes inventory only. |
| Shirube protected surfaces include default runner policy, state transition automation, audit lane rules, merge readiness criteria, safety profile changes, high-risk route classification. | `repo-profiles/ai-dev-framework/AGENTS.md` | `protected_surface_triggers`, `authority_owner`, `gate_sequence` | Shirube profile docs, PR metadata. | mapped | Governance self-change could skip L2/L3. | C0 changes only .shirube docs/spec records. |
| No role receives deploy, secret, DB mutation, queue drain, live Discord write, or state daemon restart authority by default. | `RUNTIME_ACTIVATION.md`, `AGENT_ID_REGISTRY.md` | `forbidden_actions`, `allowed_actions`, `authority_owner` | AUN profile candidate, AGENTS overlay candidate. | mapped | Identity registration could accidentally grant live operational authority. | This is a blocking stop condition for C1+. |

## 6. Evidence And Completion-State Mapping

| old_source_rule | current_source_location | shirube_canonical_field_candidate | projection_target_candidate | status | risk_if_lost | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Done is not just implementation or green CI. | `README.md`, `AGENTS.md`, `agent-comms-mcp/AGENTS.md` | `completion_states`, `non_completion_states`, `evidence_requirements` | Evidence Pack, Handoff Packet, PR post-merge evidence. | mapped | Technical ACK, queue id, or green CI could be declared real completion. | Preserve recovery done gate for AUN. |
| Mandatory evidence shape includes repo, issue/PR, exact head, scope reviewed, checks run, findings, verdict, next state, and who acts next. | `AGENTS.md`, `RUNTIME_ACTIVATION.md` | `evidence_requirements`, `transition_request_structure` | Audit result, evidence pack, GitHub comments. | mapped | Audit chain becomes non-reproducible. | Aligns with Shirube exact-head evidence. |
| Evidence Pack includes decision/design evidence, implementation evidence, audit chain, checks, state transitions, approvals, release/demo/deploy evidence, residual risks, reproduction, and next handoff. | `evidence-pack-template.md` | `evidence_requirements`, `completion_states` | `.shirube/evidence`, PR comment, future projection. | partial | Follow-up worker lacks durable proof. | C0 does not create a canonical evidence schema for Company Dev OS. |
| Handoff Packet names target, state, changed decisions, evidence links, risks, next action, blockers, suggested role, first files, and stop conditions. | `handoff-packet-template.md` | `required_outputs`, `evidence_requirements`, `non_completion_states` | Issue/PR handoff comment. | mapped | Work resumes without concrete next action or blocker. | Handoff remains an output, not necessarily separate bot. |
| AUN recovery complete means the intended operator can perform the target job end to end and observe actionable, logged, recoverable status. | `agent-comms-mcp/AGENTS.md`, `agent-comms-mcp-apply-runbook.md` | `completion_states`, `evidence_requirements`, `protected_surface_triggers` | AUN read-only recovery evidence projection. | mapped | ACK or queue id could be mistaken for operational recovery. | Must remain a protected Company Dev OS rule. |

## 7. Read-Only Projection Candidates

| Projection target candidate | Allowed in C0? | Candidate source fields | Status | Boundary |
| --- | --- | --- | --- | --- |
| GitHub issue comments | planning only | `transition_request_structure`, `rework_instruction_structure`, `required_outputs` | mapped | C0 documents shape only and does not post generated comments beyond PR handoff. |
| GitHub PR comments | planning only | `evidence_requirements`, `gate_sequence`, `authority_owner` | mapped | No enforcement or required check activation. |
| GitHub labels/status fields where already non-enforcing | planning only | `completion_states`, `non_completion_states` | partial | No label mutation, ruleset mutation, or branch protection mutation in C0. |
| AUN inventory/premise rows | planning only | `role_id`, `allowed_actions`, `forbidden_actions`, `projection_targets` | partial | No AUN DB rows, queue control, live dispatch, or Discord write. |
| Repo AGENTS/runtime overlay generation candidates | planning only | `role_id`, `gate_sequence`, `protected_surface_triggers`, `evidence_requirements` | partial | Existing overlays are not replaced or removed before shadow validation. |
| Structured audit bridge input | planning only | `gate_sequence`, `evidence_requirements`, `maker_checker / SoD` | mapped | B3 can check admissibility after codex-audit produces structured records; C0 does not generate audit records. |

## 8. Adoption State Machine

| State | Meaning | Entry evidence | Allowed next states | C0 authorization |
| --- | --- | --- | --- | --- |
| LEGACY_OVERLAY_ACTIVE | Company Dev OS remains active as existing docs, runtime overlays, and repo-specific AGENTS/CLAUDE instructions. | Existing Company Dev OS source refs and local dry-run overlay refs. | PROFILE_DRAFTED | Current state only. |
| PROFILE_DRAFTED | A Shirube canonical profile draft exists with mapped fields and explicit gaps. | C1 profile draft, C0 mapping trace. | PROFILE_AUDITED | Not authorized by C0. |
| PROFILE_AUDITED | Profile draft has semantic audit and machine admissibility evidence. | Audit record, B3 bridge output, exact-head evidence. | READONLY_PROJECTED | Not authorized by C0. |
| READONLY_PROJECTED | Profile is projected to comments/labels/inventory/overlay candidates without control authority. | Projection record, affected target list, rollback/removal plan. | SHADOW_VALIDATED | Not authorized by C0. |
| SHADOW_VALIDATED | Read-only projection has been compared against legacy overlay behavior and no protected rule is lost. | Shadow comparison, gap closure evidence, owner confirmation. | CONTROL_READY_CANDIDATE | Not authorized by C0. |
| CONTROL_READY_CANDIDATE | Profile is a candidate for mechanical control, pending protected authority. | CTO/CEO route evidence, enforcement plan, rollback plan. | ENFORCEMENT_AUTHORIZED | Not authorized by C0. |
| ENFORCEMENT_AUTHORIZED | Separate approved protected-settings Cell authorizes enforcement or control. | Exact protected approval, branch/ruleset/workflow/AUN authorization. | separate implementation Cell | Not authorized by C0. |

## 9. Gaps / Conflicts / Stop Conditions

### Gaps And Conflicts

| ID | Type | Description | Blocking for later phase? | Required resolution path |
| --- | --- | --- | ---: | --- |
| GAP-C0-001 | vocabulary | `arc` currently combines technical design, PR breakdown, and implementation handoff; registry separates `dev-tech` and `dev-lead`. | yes | C1 must choose canonical role split or alias rule. |
| GAP-C0-002 | vocabulary | Company Dev OS uses `qa` for Codex technical practical check and `check` for Claude human acceptance; registry uses `dev-check` and `dev-field`. | yes | C1 must define canonical names and projection aliases. |
| GAP-C0-003 | authority | Runtime activation says L3/CTO has conditional merge authority, but exact authority owner and route for protected settings must be repo-specific. | yes | C1/C2 must bind `authority_owner` to Shirube route records. |
| GAP-C0-004 | evidence | Company Dev OS evidence pack is markdown; Shirube profile may need machine-readable evidence schema before projection. | yes | C1/C2 must decide canonical evidence artifact shape or projection adapter. |
| GAP-C0-005 | AUN identity | Agent ID registry defines AUN registration rows, but C0 does not verify actual AUN DB/schema compatibility. | yes | Separate AUN read-only inventory premise is required before any DB/action work. |
| GAP-C0-006 | overlay precedence | Existing repo AGENTS/CLAUDE/SSOT win on conflict, but conflict resolution priority is not yet machine-readable. | yes | C1 must define projection precedence and conflict reporting. |
| GAP-C0-007 | state names | State model permits repo-specific labels while requiring stable semantics. | yes | C1/C2 must define state alias table and non-enforcing projection mapping. |

### Blocking Stop Conditions For Later Phases

- unmapped protected governance rule
- conflicting role vocabulary
- ambiguous authority owner
- unverified runtime behavior claim
- missing evidence model
- missing maker/checker mapping
- any request to mutate AUN queue/DB/control path
- any request to mutate branch protection/rulesets/required checks/workflows
- any request to replace existing Company Dev OS overlays before shadow validation
- any request to create Discord apps, tokens, live writes, or LaunchAgent changes
- any request to treat read-only projection as enforcement

## 10. Non-Scope And Enforcement Boundary

C0 does not implement or change:

- AUN queue/control implementation
- AUN DB/schema mutation
- agent routing or runtime behavior
- Discord / LaunchAgent / transport
- branch protection / rulesets / required checks
- GitHub workflow activation or enforcement
- target repository mutation
- production/deploy behavior
- package or lockfile
- CLI validator / schema validator
- replacement/removal of existing Company Dev OS overlays
- marking Shirube profile as authoritative beyond read-only design

Read-only projection planning is allowed only as future design. Any move from C0 inventory to C1 profile draft, C2 validator, C3 AUN projection contract, C4 shadow pilot, or C5+ enforcement requires a separate approved Cell.

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-COMPANY-DEV-OS-C0-001 | REQ-COMPANY-DEV-OS-C0-001 | Source inventory includes external Company Dev OS sources, local dry-run overlay references, role tables, standard flow, high-risk triggers, evidence rules, and maker/checker constraints. |
| AC-COMPANY-DEV-OS-C0-002 | REQ-COMPANY-DEV-OS-C0-002 | Mapping tables use `old_source_rule`, `current_source_location`, `shirube_canonical_field_candidate`, `projection_target_candidate`, `status`, `risk_if_lost`, and `notes`. |
| AC-COMPANY-DEV-OS-C0-003 | REQ-COMPANY-DEV-OS-C0-003 | Gaps and conflicts identify role vocabulary, authority, evidence, AUN identity, overlay precedence, and state alias blockers. |
| AC-COMPANY-DEV-OS-C0-004 | REQ-COMPANY-DEV-OS-C0-004 | Read-only projection candidates are explicitly separated from control and enforcement behavior. |
| AC-COMPANY-DEV-OS-C0-005 | REQ-COMPANY-DEV-OS-C0-005 | Adoption state machine lists LEGACY_OVERLAY_ACTIVE, PROFILE_DRAFTED, PROFILE_AUDITED, READONLY_PROJECTED, SHADOW_VALIDATED, CONTROL_READY_CANDIDATE, and ENFORCEMENT_AUTHORIZED. |
| AC-COMPANY-DEV-OS-C0-006 | SEC-COMPANY-DEV-OS-C0-001 | PR changes are docs/spec-only `.shirube/**` artifacts and do not mutate runtime, CLI, workflows, branch protection, rulesets, AUN, production, packages, or overlays. |

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-COMPANY-DEV-OS-C0-001 | REQ-COMPANY-DEV-OS-C0-001 through REQ-COMPANY-DEV-OS-C0-005 | Review this spec for required sections, mapping columns, stop conditions, and non-scope boundaries. |
| TEST-MAP-COMPANY-DEV-OS-C0-002 | SEC-COMPANY-DEV-OS-C0-001 | Run `git diff --check origin/main...HEAD`, `bash scripts/detect-breaking-changes.sh origin/main`, YAML parse for `.shirube/**/*.yaml`, `npm run lint`, `npm run type-check`, `npm run build:cli`, and Shirube conveyor check for the PR. |

## Trace Matrix

TRACE-COMPANY-DEV-OS-PROFILE-C0-001

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-COMPANY-DEV-OS-C0-001 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-001 |
| REQ-COMPANY-DEV-OS-C0-002 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-001 |
| REQ-COMPANY-DEV-OS-C0-003 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-001 |
| REQ-COMPANY-DEV-OS-C0-004 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-001 |
| REQ-COMPANY-DEV-OS-C0-005 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-001 |
| SEC-COMPANY-DEV-OS-C0-001 | CELL-COMPANY-DEV-OS-PROFILE-C0 | IMPL-COMPANY-DEV-OS-PROFILE-C0 | TEST-MAP-COMPANY-DEV-OS-C0-002 |
