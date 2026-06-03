# Shirube Development Roadmap

> Status: Canonical roadmap draft
> Updated: 2026-05-26
> Direction source: Issues #211 and #238, Gate Engine SPEC-DOC4L-020, GitHub-backed strict workflow, and script-control completion audit.

## 1. Roadmap Goal

Shirube's end state is:

```text
Shirube = Agentic SDLC Control Plane
```

The roadmap therefore does not optimize for "more AI coding features" first. It builds the control plane that lets AI coding agents work toward explicit product goals without skipping design, evidence, audit, merge authority, post-merge verification, phase closure, or goal progress verification.

The release ladder is:

```text
Phase 0: Direction and script-control baseline
  -> Phase 1: Internal applied dogfood
  -> Phase 2: MVP public release
  -> Phase 3: OSS-quality release
  -> Phase 4: Enterprise / Big Tech adoption readiness
```

Each phase has a release claim. A phase is not complete because tasks were implemented; it is complete only when the sufficient conditions for that phase are met and verified.

## 2. Non-Negotiable Principles

1. Goal Contract first. A feature catalog, task list, SPEC, PR, or GitHub Issue cannot replace an approved V0/V1 goal.
2. Script control by default. CLI, deterministic TypeScript evaluators, GitHub Actions, Check Runs, and GitHub APIs own state transitions and enforcement.
3. Hooks are fallback only. Allowed hook cases are pre-tool blocking, context injection, session state recovery, post-tool verification, and completion-time verification.
4. LLM output is draft evidence. It cannot approve phase completion, gate pass/fail, exception approval, release readiness, or merge authority.
5. GitHub Issue text is intake evidence only. It does not prove hearing completion, goal approval, or implementation readiness.
6. Context Pack is required before strict implementation. Generic prompts are not sufficient for strict/public workflows.
7. AI Change Record is required before strict remote release/merge readiness.
8. Remote/public claims require GitHub Check or equivalent projection.
9. Shirube core must be agent-neutral and adapter-based. AUN, Wasurezu, Kodama, Claude Code, Codex, GitHub, and internal bot names are integrations, not core assumptions.
10. No silent fallback. Missing roles, missing policy, missing GitHub access, missing evidence, missing adapter credentials, and failed validators must produce structured readiness evidence.

## 3. Readiness Ladder

| Phase | Release claim | Primary audience | Main question |
|---|---|---|---|
| 0 | Script-control baseline ready | Shirube maintainers | Can the roadmap and enforcement responsibilities be executed without LLM judgment? |
| 1 | Internal applied dogfood | Internal projects and bot fleet | Can Shirube govern its own development and internal AI work reliably? |
| 2 | MVP public release | Early external users | Can a user install Shirube and get useful local/standard workflow safety without internal infrastructure? |
| 3 | OSS-quality release | Open source users and contributors | Can the repo be public, understandable, secure, maintainable, and contributor-ready? |
| 4 | Enterprise / Big Tech adoption readiness | Large engineering organizations | Can Shirube be adopted as an AI PR safety and evidence control plane across agents, repos, providers, and policy boundaries? |

## 4. Phase 0: Direction And Script-Control Baseline

### Purpose

Unify the existing v1.2.x, framework-overhaul, Gate Engine, distribution, and #211 directions into one executable roadmap before expanding implementation.

### Current anchors

- #60: script-enforced state machine and GitHub-centric state.
- #64/#91: read-receipt enforcement and workflow/check run.
- #65: bypass audit log.
- #67: hook and settings integrity.
- #68: pre-tool-call gateway.
- #69: session lifecycle.
- #126/#127: v1.2.1 hooks and v1.2.2 plan/verify implementation.
- #136/#139: spec-audit implementation and cleanup.
- #197-#204: Gate Engine alignment and rollout.
- #211: structural intelligence / enterprise positioning.
- #238: Agentic SDLC Control Plane parent spec and enterprise delivery graph.
- #212: Phase 0 Script Control Completion Baseline.
- PR #208 / #200: workflow observability PR C.

### Scope

| Work item | Level to implement in Phase 0 |
|---|---|
| Canonical roadmap | This file is the release ladder and phase SoT. |
| Script-control completion baseline | Create or update a tracking issue that maps every open enforcement issue to Gate Engine gates. |
| Gate Engine PR C | Land workflow status, doctor, check, and explain as observability only. |
| Existing docs sync | Update stale v1.2.x status where local docs contradict GitHub. |
| Action-to-surface map | Define which action will later call `workflow check`, and from which surface. No automatic enforcement yet. |
| Legacy issue triage | Mark each old enforcement issue as active, superseded, or re-homed under Gate Engine. |

### Phase 0 Self-Dogfood Operating Frame

Phase 0 applies Shirube to Shirube itself in a lightweight strict mode. It is strict about evidence and review, but it does not pretend that the future Gate Engine is already fully automated.

Every Phase 0 task must have:

| Artifact | Requirement |
|---|---|
| Task issue or task note | A concrete objective, scope, non-goals, related issue/PR ids, and exit condition. |
| Goal trace | The task must cite which Phase 0 sufficient exit condition it advances. |
| Control mechanism note | The task must say whether it is docs, CLI/script, GitHub Actions, hook fallback, or GitHub/GH API work. |
| Evidence | File paths, command output summary, GitHub issue/PR references, or explicit "not applicable". |
| Verification | Commands/tests run, or explicit reason why no runtime test applies. |
| Disposition update | If the task touches old issues, it must mark each as active, superseded, merged, blocked, or re-homed. |

Default Phase 0 audit level is `strict` because roadmap, enforcement, workflow state, and issue disposition are framework-control-plane work.

| Layer | Required in Phase 0 | Purpose | Blocking authority |
|---|---|---|---|
| L0 script gate | Always | `git diff --check`, type-check/build/test as applicable, spec-audit/trace checks when affected | Blocks merge/work completion claim |
| L1 lead review | Always | Scope, roadmap fit, spec/control-mechanism fit, PR/issue description quality | Blocks or returns to author |
| L2 independent audit | Required for roadmap, Gate Engine, script-control, workflow, merge/release, public/OSS, or security-affecting changes | 6-axis review: design intent, scope bundle, hidden impact, regression class, SSOT alignment, honesty/evidence | Blocks or requests correction |
| L3 technical governance | Required for cross-cutting direction, phase transition, strict enforcement wiring, merge authority, public/enterprise claim, or issue disposition that retires prior work | Governance, architecture, risk, authority, and phase-boundary sanity | Blocks phase transition or merge readiness |
| L4 strategy approval | Only when public release, license, enterprise positioning, CEO-owned scope, or irreversible governance change is claimed | Strategic/product approval | Blocks public/enterprise claim |

Phase 0 uses L1/L2/L3 as review roles even before every role is mechanically enforced in workflow state. The review result must still be recorded as evidence in the task issue or PR.

Phase 0 task sizing:

| Task size | Expected duration | Examples | Required review |
|---|---|---|---|
| XS | Same-turn or single-file docs/status update | typo, link, issue status note | L0 + L1 |
| S | One bounded doc or one deterministic script/check update | roadmap subsection, one validator fixture | L0 + L1 + L2 when framework behavior is affected |
| M | One issue-disposition batch or one CLI/gate capability | action-to-surface map, workflow-state model addition | L0 + L1 + L2 + L3 |
| L | Multi-surface enforcement wiring | hook/CI/run integration, release gate wiring | Do not start in Phase 0 unless explicitly split |

Phase 0 proceeds through these batches:

1. Baseline: this roadmap, Gate Engine docs, and current PR #208/#200 status.
2. Inventory: open v1.2.x / overhaul / Gate Engine issues and PRs.
3. Disposition: assign each open item to active, re-home, supersede, block, or close-candidate.
4. Action map: define where `workflow check --action ...` may later be called.
5. Verification: run local checks and attach evidence.
6. L1/L2/L3 review: record findings and update roadmap/baseline issue.

Phase 0 execution tasks:

| Task | Issue | Purpose |
|---|---|---|
| T1 | #213 | Existing issue and PR inventory |
| T2 | #214 | Disposition matrix and re-home decisions |
| T3 | #215 | Action-to-surface map for `workflow check` |
| T4 | #216 | Baseline verification and L1/L2/L3 review evidence |
| T5 | #217 | Dogfood feedback intake and phase assignment loop |
| T6 | #220 | Formal post-merge verification gate addendum |

T3 artifact: [Phase 0 Action-To-Surface Map](./phase0-action-to-surface-map.md).
T6 artifact: [POSTMERGE-001: Post-Merge Verification Gate](./postmerge-001.md).

### Sufficient exit conditions

- `docs/specs/roadmap.md` names all release phases and completion conditions.
- Gate Engine docs define Goal Contract, Context Pack, provider/tool policy, AI Change Record, GitHub Check projection, merge authority, post-merge verification, and goal progress.
- PR #200/#208 observability surface is merged or has an explicit blocking reason.
- #212 tracks the Script Control Completion Baseline.
- #64/#65/#67/#68/#69/#91/#123/#126/#127/#136/#139/#200/#201/#202/#203/#204 each has a disposition.
- `POSTMERGE-001` defines the post-merge verification record required for PRs that contribute to phase exit claims.
- No new strict enforcement is wired before the action-to-surface map is reviewed.

### Verification

- `npm run type-check`
- targeted workflow tests for `workflow status/doctor/check/explain`
- `git diff --check`
- manual GitHub issue/PR inventory attached to the baseline issue
- post-merge records or post-merge evidence for PRs that contribute to the Phase 0 exit claim

### Not complete if

- The roadmap only lists next tasks but does not define phase exit conditions.
- Runtime wiring is introduced before the action-to-surface map is approved.
- Existing open issues remain duplicated under different names without disposition.
- A PR contributes to a phase exit claim without post-merge verification or explicit L3 disposition.

## 5. Phase 1: Internal Applied Dogfood

### Release claim

Shirube can govern its own development and at least one internal project through goal-driven, evidence-backed, script-controlled workflow.

### Scope

| Work item | Level to implement in Phase 1 |
|---|---|
| Shirube self-dogfood | Shirube repo has workflow state, roles, goal contract, and gates visible through CLI. |
| Carryover ledger | Findings from the previous phase are completed, assigned, deferred with rationale, or blocked before the next readiness claim. |
| Goal Contract | V0/V1 goal artifact approved by configured governance/human role. |
| Phase plan | Goal sufficient conditions decomposed into phases with exit criteria. |
| Feature catalog | P0/P1 catalog traced to goal sufficient conditions. |
| Task DAG | Tasks derive from approved features and preserve dependency order. |
| Enterprise Delivery Graph | Parent `delivery-graph/v1` contract links goal, phase, work package/task, PR, gate, evidence, and progress without runtime enforcement in PR A. |
| Product-wide Governance Bone | #249 provides reusable Goal -> Phase -> Work Order -> PR / Change Slice -> Scripted Step -> Tool Execution -> Evidence templates and a warning-first/strict governance check for product repos. |
| 4MCP Fast Track Minimum Safety Profile | #264 defines lane/risk/action-envelope/stop-sentinel evidence so AUN, Shirube, Kodama, and Wasurezu can continue current work before the full autonomous runner platform exists. |
| SPEC/IMPL/VERIFY/OPS readiness | Each implementation task has required docs or explicit non-applicability. |
| Workflow chain control | The development chain is modeled as deterministic state transitions before external enforcement wiring. |
| Phase Closure Audit | A closure record assembles task, audit, residual risk, non-claim, carryover, and post-merge evidence before Phase 1 completion is claimed. |
| Audit Ledger | Audit/approval evidence has a structured record shape beyond ad hoc comments. |
| Action registry and wrapper semantics | Workflow actions have a canonical registry, and diagnostic vs enforcement command behavior is explicit. |
| Pre-implementation audit | #123 behavior re-homed as Gate Engine G11 pre-impl audit or explicitly retired. |
| Read receipts | #64/#91 re-homed as evidence, not authority. |
| Bypass audit | #65 implemented enough that bypasses are tokened, logged, and visible. |
| Hook/settings integrity | #67 implemented enough that local enforcement cannot be silently disabled. |
| Session lifecycle | #69 implemented enough for 1-task-1-session and restart/compaction recovery evidence. |

### Script-control requirements

- Gate decisions are deterministic and exposed through `shirube workflow check --action ...`.
- Hooks may only call script-controlled checks for unavoidable local interception.
- GitHub Actions own remote merge/release checks where applicable.
- Local `.framework/*` is cache/draft unless the active profile explicitly permits local-only authority.

### Sufficient exit conditions

- Phase 0 carryover findings have a completed, assigned, deferred, blocked, or non-actionable disposition.
- Shirube can run `workflow status --json` and show goal, phase, feature/task, evidence, role, and publish readiness.
- Strict implementation start blocks or warns on missing Goal Contract, missing hearing, missing role readiness, missing SPEC/IMPL/VERIFY/OPS, missing pre-impl audit, and missing task trace according to profile.
- The target development chain from intake through phase closure is represented as deterministic state or a reviewed implementation split.
- Phase closure audit and audit ledger minimum records exist or are explicitly L3-dispositioned before Phase 1 completion is claimed.
- Internal dogfood report exists with at least one real Shirube PR/change traced from goal to post-implementation evidence.
- Bypass events are not invisible.
- Hook/settings changes are not invisible.
- Read receipts are recorded as provenance evidence, not treated as reviewer authority.

### Phase 1 start artifacts

| Task | Issue | Purpose |
|---|---|---|
| T0 | #223 | Phase 0 carryover ledger, task assignment, and completed-phase addendum policy. |
| T1 | #222 | Internal dogfood start gate for `init/start/run` and required process evidence. |
| T2 | #224 | Phase Closure Audit Gate. |
| T3 | #225 | `AUDITLEDGER-001` Audit Evidence and Approval Ledger. |
| T4a0 | #244 | Work Order contract and warning gate for AUN/runtime/report dispatch. |
| T4a | #240 | Runtime command adapter and injection policy pack for Delivery Graph steps. |
| T4 | #226 | Workflow Action Registry and Wrapper Semantics. |
| T5 | #227 | `CHAINCTRL-001` Script-Controlled Workflow Chain. |

T0/T1 start artifact: [Phase 1 Internal Dogfood Start](./phase1-internal-dogfood-start.md).
Parent enterprise control-plane artifact:
SPEC `docs/spec/phase1-enterprise-delivery-graph.md`, IMPL
`docs/impl/phase1-enterprise-delivery-graph.md`, VERIFY
`docs/verify/phase1-enterprise-delivery-graph.md`, OPS
`docs/ops/phase1-enterprise-delivery-graph.md`.
Runtime adapter and injection policy child artifact:
SPEC `docs/spec/phase1-runtime-command-adapter-policy.md`, IMPL
`docs/impl/phase1-runtime-command-adapter-policy.md`, VERIFY
`docs/verify/phase1-runtime-command-adapter-policy.md`, OPS
`docs/ops/phase1-runtime-command-adapter-policy.md`.
Work Order contract child artifact:
SPEC `docs/spec/phase1-work-order-contract.md`, IMPL
`docs/impl/phase1-work-order-contract.md`, VERIFY
`docs/verify/phase1-work-order-contract.md`, OPS
`docs/ops/phase1-work-order-contract.md`.
4MCP fast-track safety artifact:
SPEC `docs/spec/phase1-4mcp-fast-track-safety-profile.md`, IMPL
`docs/impl/phase1-4mcp-fast-track-safety-profile.md`, VERIFY
`docs/verify/phase1-4mcp-fast-track-safety-profile.md`, OPS
`docs/ops/phase1-4mcp-fast-track-safety-profile.md`.
T1 4-layer artifact set:
SPEC `docs/spec/phase1-internal-dogfood-start-gate.md`, IMPL
`docs/impl/phase1-internal-dogfood-start-gate.md`, VERIFY
`docs/verify/phase1-internal-dogfood-start-gate.md`, OPS
`docs/ops/phase1-internal-dogfood-start-gate.md`.

### Verification

- Unit and adapter tests for goal/phase/task/evidence models.
- CLI tests for action-scoped checks.
- Dogfood PR evidence: Goal Contract -> phase plan -> feature/task -> SPEC/IMPL/VERIFY/OPS -> implementation -> audit -> post-merge result.
- Regression fixture: GitHub Issue alone cannot satisfy hearing or goal approval.

### Not complete if

- Shirube can still start strict implementation from a generic prompt.
- Goal progress is not traceable after implementation.
- LLM statements are accepted as approval evidence.

## 6. Phase 2: MVP Public Release

### Release claim

An external early user can install Shirube, run a local or GitHub-backed workflow, and get practical AI-development safety without internal infrastructure.

### Audience

Early adopters, small teams, and developers using Claude Code, Codex, Cursor, Copilot, or generic CLI agents.

### MVP scope

| Work item | Level to implement in Phase 2 |
|---|---|
| Install path | Package install works without internal config layer. |
| Init/update/retrofit | External repo can initialize and update without internal names. |
| Minimal and standard profiles | Local-only and GitHub-backed modes are documented and usable. |
| Role binding | Generic role placeholders with `setup_required`; no internal agent fallback. |
| Workflow observability | `workflow status/doctor/check/explain` usable by external users. |
| Goal Contract starter | User can create/import an initial V0/V1 goal contract. |
| Context Pack MVP | Task-aware, hashable context pack generated for implementation start. |
| Provider/tool policy MVP | Provider, permission, sandbox/network, allowed/denied tools captured. |
| AI Change Record MVP | PR/change summary generated from task, context pack, changes, tests, and risks. |
| GitHub Check MVP | Standard profile can project core gate status to GitHub Checks or PR comments. |
| Merge authority MVP | Existing `merge-authority.ts` path remains the release authority source. |

### Out of scope for MVP

- Enterprise SSO/RBAC.
- Multi-forge support beyond GitHub.
- Full dashboard.
- Organization-wide analytics.
- Automatic broad rollout to external organizations.

### Sufficient exit conditions

- Fresh external repository can run init -> goal contract -> phase/task -> context pack -> implementation readiness check -> AI Change Record -> GitHub/PR projection.
- `draft_only` cannot publish remote artifacts.
- `approval_required` cannot publish without resolved approval role.
- Core works without AUN, Wasurezu, Kodama, internal bot names, Discord, or private memory.
- README/getting-started docs explain minimal and standard use.
- Example repository or fixture demonstrates the MVP path.

### Verification

- Fresh install smoke.
- Local-only smoke.
- GitHub-backed smoke.
- No internal-name regression scan.
- Redaction tests for Context Pack and AI Change Record projection.
- Provider-neutral tests covering at least Claude Code and Codex config shape where locally supported.

### Not complete if

- External users need hidden internal setup.
- GitHub Checks leak local/private reasoning traces.
- Context Pack or AI Change Record is optional for public release claims.

## 7. Phase 3: OSS-Quality Release

### Release claim

Shirube is safe to operate as a public open source project with clear contribution, security, compatibility, and maintenance boundaries.

### Scope

| Work item | Level to implement in Phase 3 |
|---|---|
| License | License chosen and committed. |
| Public docs | README, Getting Started, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, examples. |
| OSS readiness checker | CI blocks internal names, private paths, hardcoded internal adapters, and secret-like examples. |
| Adapter boundary | Core imports no internal-only packages. Optional integrations are adapters. |
| Distribution docs | Public package name, install, semver, migration, and compatibility documented. |
| Contributor workflow | External PR path maps to deterministic checks and human review roles. |
| Security baseline | Threat model, data classification, redaction, and vulnerability reporting documented. |
| Test discipline | Unit, integration, regression, smoke, and public fixture tests are stable in CI. |
| Backward compatibility | Migration path for v1.2.x artifacts documented and tested. |
| Public dogfood | Shirube itself uses the same public-quality flow before release. |

### Sufficient exit conditions

- Public clone can install and run documented MVP without private credentials.
- OSS readiness checker is green on main.
- Package metadata is correct.
- No internal project names or private channel assumptions remain in public core/templates/examples.
- Security reporting path exists.
- Contribution path does not depend on internal agents.
- Public docs clearly distinguish minimal, standard, strict, and enterprise-readiness claims.

### Verification

- Clean clone smoke on a machine without internal config.
- Package install dry-run.
- OSS readiness workflow.
- Secret/internal-name scan.
- Public example E2E.
- Contributor PR fixture.

### Not complete if

- A public user can accidentally believe local/minimal mode is enterprise-grade.
- Internal adapters are required for basic workflow.
- Docs promise capabilities that are only designed but not implemented.

## 8. Phase 4: Enterprise / Big Tech Adoption Readiness

### Release claim

Shirube can be evaluated by large engineering organizations as an AI PR safety gate and evidence control plane.

### Enterprise product surface

| Capability | Required level |
|---|---|
| Agent-neutral governance | Evidence preserves provider/agent identity across Claude Code, Codex, Cursor, Copilot, Gemini, internal agents, and generic CLI agents. |
| Context Pack | Every strict AI task has reproducible, hashable, redacted input context. |
| AI Change Record | Every strict AI PR has complete structured evidence before release readiness. |
| GitHub Check projection | Gate, trace, risk, authority, test, and AI Change Record status is visible in PR checks/comments. |
| Provider/tool policy | Permission mode, allowed tools, denied tools, MCP servers/tools, sandbox, and network posture are declared and checked. |
| Merge authority | Producer/authority separation is deterministic and enforced through required status checks. |
| Post-merge verification | Main branch result is verified and goal progress is updated. |
| Metrics | Trace coverage, complete AI Change Record rate, blocked unlinked changes, missing-test-evidence blocks, risky tool calls, bypass count, and time-to-merge impact are measurable. |
| Privacy/redaction | Public/remote projection never exposes secrets, private reasoning traces, or unnecessary local context. |
| Policy integration | Enterprise policy can configure roles, allowed providers, allowed tools, required checks, and exception paths. |

### Sufficient exit conditions

- Strict profile can fail closed for missing goal, missing context pack, missing provider/tool policy, missing AI Change Record, missing tests, missing approval, invalid merge authority, and missing post-merge verification.
- GitHub Check output is stable enough for branch protection.
- Evidence import from external agents preserves provenance and does not weaken gates.
- Enterprise security review package exists: architecture, threat model, data flow, audit log model, redaction policy, and operational runbook.
- At least one realistic enterprise fixture repo demonstrates the full PR safety flow.

### Verification

- Strict E2E fixture:
  goal -> phase plan -> feature catalog -> task DAG -> SPEC/IMPL/VERIFY/OPS -> Context Pack -> provider/tool policy -> implementation -> AI Change Record -> audit -> GitHub Check -> merge authority -> post-merge verify -> goal progress.
- Negative fixtures for every missing evidence type.
- Redaction/privacy tests.
- Provider/tool-policy violation tests.
- Branch-protection required-check dry-run.
- Performance smoke on a large repository fixture.

### Not complete if

- Enterprise evidence is only available in local files and not projectable to PR checks.
- Approval, merge, or exception paths rely on LLM judgment.
- Provider/tool permission posture is not captured.
- The system cannot explain why a PR is blocked in terms an engineering manager or security reviewer can audit.

## 9. Gate Engine Mapping

| Gate | Roadmap phase where it must become enforceable |
|---|---|
| G0 adoption | Phase 1 |
| G1 intake | Phase 1 |
| G2 hearing | Phase 1 |
| G3 role_readiness | Phase 1 |
| G4 goal_contract | Phase 1 |
| G5 phase_plan | Phase 1 |
| G6 feature_catalog | Phase 1 |
| G7 task_dag | Phase 1 |
| G8 spec_impl_readiness | Phase 1 |
| G9 context_pack | Phase 2 |
| G10 provider_tool_policy | Phase 2 |
| G11 pre_impl_audit | Phase 1 |
| G12 implementation_audit | Phase 2 |
| G13 ai_change_record | Phase 2 |
| G14 github_check_projection | Phase 2 |
| G15 release_authority | Phase 2 |
| G16 post_merge_verify | Phase 2 |
| G17 goal_progress | Phase 2 |
| G18 change_intake | Phase 1 |

Phase 4 hardens all gates for enterprise use. The table above names the first phase where a gate must be useful and enforceable for its intended profile.

Phase 0 addendum #220 defines the `POSTMERGE-001` record schema before Phase 1 implementation expansion. This does not make G16 enforceable in Phase 0; it makes the evidence record explicit so Phase Closure Audit can require it.

## 10. Existing Issue Disposition

| Issue/PR | Roadmap disposition |
|---|---|
| #60 | Parent historical epic for deterministic control; keep as context, but roadmap execution is now phase-based. |
| #64 | Re-home as read-receipt evidence under G11/G12/G13. |
| #65 | Phase 1 bypass audit requirement. |
| #66 | Review model policy; keep only where it supports producer/authority separation. |
| #67 | Phase 1 hook/settings integrity. |
| #68 | Phase 2/4 provider/tool policy and pre-tool gateway, with strict enterprise hardening in Phase 4. |
| #69 | Phase 1 session lifecycle and recovery evidence. |
| #91 | Either fix and merge into read-receipt evidence path or close as superseded by Gate Engine implementation. |
| #123 | Re-home into G11 pre-impl audit, or close if superseded by a deterministic Gate Engine check. |
| #126 | Implement only the allowed hook surfaces needed by Phase 1. |
| #127 | Split: Plan/verify pieces become Context Pack, post-merge verify, and evidence checks. |
| #136/#139 | Phase 0/1 spec-audit completion and cleanup. |
| #160 | Role binding and workflow policy are Phase 1 for internal/public correctness and Phase 4 for enterprise policy. |
| #169 | Phase 1 and Phase 4 strict dogfood E2E evidence. |
| #197 | Architectural parent for Gate Engine. |
| #200 / PR #208 | Phase 0 observability surface. |
| #201 | Phase 1 hearing/design/goal bridge. |
| #202 | Phase 1/2 enforcement expansion. |
| #203 | Phase 3/4 MCP/public-grade surface after core gates stabilize. |
| #204 | Phase 0/1 hardening before broad rollout. |
| #211 | Phase 4 positioning and enterprise adoption target. |

## 11. Implementation Order

### Slice A: Baseline and cleanup

1. Land or resolve PR #208 / #200.
2. Create Script Control Completion Baseline issue.
3. Update stale status docs and close/re-home duplicated legacy issues.
4. Add tests for current workflow observability.

### Slice B: Internal goal-driven workflow

1. Add Goal Contract model and artifact adapter.
2. Add phase plan, feature catalog, and task DAG evidence adapters.
3. Wire G4-G8/G18 decisions into workflow state.
4. Re-home #123/#64/#65/#67/#69 into Gate Engine evidence and checks.
5. Dogfood on Shirube itself.

### Slice C: MVP public path

1. Add Context Pack model/generator.
2. Add provider/tool policy model.
3. Add AI Change Record model/generator.
4. Add GitHub Check / PR comment projection with redaction.
5. Add public install/readme/examples.

### Slice D: OSS-quality hardening

1. Finalize license and public repo docs.
2. Add OSS readiness checker and public clean clone smoke.
3. Ensure adapter-only optional integrations.
4. Add contributor and security workflows.
5. Public dogfood report.

### Slice E: Enterprise readiness

1. Strict full-flow enterprise fixture.
2. Metrics and audit report generation.
3. Policy configuration for providers/tools/roles.
4. Branch-protection and required-check guidance.
5. Enterprise security review package.

## 12. Phase Transition Authority

| Transition | Required authority |
|---|---|
| Phase 0 -> Phase 1 | Maintainer/architecture owner approves baseline and issue disposition. |
| Phase 1 -> Phase 2 | Release owner approves internal dogfood evidence and MVP scope. |
| Phase 2 -> Phase 3 | Release owner and security/review roles approve public release readiness. |
| Phase 3 -> Phase 4 | Product/enterprise owner approves enterprise positioning and security package. |
| Any public or enterprise claim | Human/governance approval required; LLM output is not approval. |

## 13. Stop Conditions

Pause roadmap expansion and fix the control plane first if any of the following occur:

- Strict implementation can start without Goal Contract or Context Pack evidence.
- Remote publish can occur under `draft_only`.
- GitHub Issue body is treated as goal approval.
- Hook or local file state becomes canonical workflow authority.
- AI Change Record or GitHub Check projection leaks secret-bearing context.
- Bypass or exception happens without audit evidence.
- Provider/tool permission posture is unknown for an AI-generated PR.

## 14. Roadmap Maintenance

This file is the release ladder SoT. Detailed feature specs remain in the 4-layer docs and GitHub Issues.

Roadmap updates must:

- state which phase changes;
- update sufficient exit conditions when scope changes;
- update Issue disposition when work is re-homed or superseded;
- avoid adding features without naming the phase claim they support;
- preserve the script-control-first principle.
