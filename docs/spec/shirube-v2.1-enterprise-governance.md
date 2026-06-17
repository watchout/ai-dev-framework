---
id: SPEC-SHIRUBEV21-406
status: Draft
traces:
  impl: [IMPL-SHIRUBEV21-406]
  verify: [VERIFY-SHIRUBEV21-406]
  ops: [OPS-SHIRUBEV21-406]
---

# SPEC: Shirube v2.1 Enterprise Governance Kernel

## 0. Meta

- Origin issue: #406.
- Parent SSOT: #405.
- Source transition request: ARC -> ADF implementation bot, #406 comment `4735888352`.
- Related design lineage: #197, #363, #401, #403, #404.
- Related child tracks: #407, #408, #409, #410, #411, #412.
- Historical Company Dev OS policy-source references preserved by #405/#406: #18, #19.
- Change type: docs/spec only.
- Runtime activation: not allowed in PR1.

This PR1 artifact fixes names, product boundaries, schema names, and first-wave
implementation order for Shirube v2.1. It does not implement enforcement,
runtime evaluators, CI gates, AUN dispatch, database changes, branch protection,
Discord automation, LaunchAgents, or external repository mutation.

## 1. Product Frame

Shirube v2.1 is the enterprise Work Order OS and phase conveyor for governed
AI-assisted software delivery.

The product surface is:

```text
Goal
  -> Phase
    -> Work Order
      -> Change Slice / PR
        -> Scripted Step
          -> Evidence
            -> Role Verdict
              -> Transition Decision
```

Shirube owns the governance engine: risk classification, evidence requirements,
policy evaluation, traceability, role verdicts, and projection of current state.
It does not own every runner, communication channel, memory store, or source
context registry.

## 2. Source And Authority Principles

1. GitHub issue, PR, review, comment, and check state is the durable remote SSOT
   for governed repository work when the repository is GitHub-backed.
2. AUN may accelerate notification, handoff, queueing, mirroring, or evidence
   transport. AUN ACKs, queue ids, and Discord messages are not completion or
   merge authority by themselves.
3. Codex Goal Mode is a runner policy. It is not the Shirube architecture and
   must not make Codex a required core dependency.
4. LLM output may draft Work Orders, specs, evidence summaries, or reviews. It
   cannot approve risk, satisfy missing evidence, pass gates, authorize merge,
   close phases, or complete goals.
5. #197 remains the lower-level Gate Engine and legacy discovery alignment
   substrate. v2.1 builds above it rather than replacing it silently.
6. #18 and #19 remain preserved Company Dev OS policy-source references under
   #405/#406. This PR1 does not reinterpret, reopen, or complete them.

## 3. Integration Boundaries

| System | v2.1 boundary |
|---|---|
| Shirube | Work Order OS, phase conveyor, policy/evidence/trace governance, role verdict projection. |
| AUN | Optional acceleration layer for communication, dispatch, queueing, and evidence transport. |
| Kusabi | Future policy/evidence adapter surface; not implemented in PR1. |
| Kodama | Source/context registry and context-pack evidence provider; not transition authority. |
| Wasurezu | Recovery, memory, and continuity evidence provider; not execution authority. |
| AUN Platform | Operator UI/projection surface; not canonical transition logic. |
| GitHub | Durable issue/PR/check/review SSOT and projection surface for GitHub-backed repos. |
| Runners | Codex, Claude, local scripts, AUN-dispatched runners, or humans execute scoped work under a runner policy. |

Adapters may read or project Shirube state. They must not define independent
gate semantics or silently promote transport evidence into completion evidence.

## 4. Core Object Model

| Object | Purpose | Authority notes |
|---|---|---|
| Goal | Approved outcome, sufficient conditions, non-goals. | Human/governance-owned. |
| Phase | Bounded delivery stage with entry and exit criteria. | CTO/flow owner validates phase movement for protected work. |
| Work Order | Concrete request with scope, risk, runner policy, evidence contract, and stop conditions. | GitHub-backed Work Orders use issue/PR evidence as durable SSOT. |
| Change Slice / PR | Reviewable implementation or docs slice. | Cannot be complete without required evidence and role verdicts. |
| Scripted Step | Deterministic command, check, or adapter operation. | Result must be captured as evidence before it can affect state. |
| Policy | Versioned rule set for risk, evidence, role, trace, and projection decisions. | Policy-as-Code in later PRs; prose only in PR1. |
| Risk Classification | R0-R4 impact class. | Determines lane, evidence, review, and stop behavior. |
| Evidence Record | Versioned proof artifact with provenance and freshness. | Private reasoning and secrets are excluded by default. |
| Required Evidence Evaluator | Later deterministic evaluator for evidence presence, freshness, and shape. | Reserved in PR1; no evaluator is implemented. |
| Evidence Gate | Later gate that blocks or warns based on required evidence. | Reserved in PR1; no gate is wired. |
| Trace Matrix | Goal/phase/work/PR/policy/evidence/role/test relationship map. | Reserved contract name in PR1. |
| Role Verdict | L1/L2/QA/check/CTO or other configured role decision. | Must name actor, scope, head/ref, evidence, and verdict. |
| AI Change Record | AI-assisted change summary, risk, evidence, tests, and non-claims. | Required before strict remote release in later PRs. |
| GitHub Check Projection | Check-run or status projection of deterministic decisions. | Direction only in PR1; no check is created. |

## 5. Canonical Work Order State Machine

The canonical v2.1 state machine is defined as a semantic contract for later
schema and evaluator PRs:

```text
draft
  -> scoped
  -> ready_for_runner
  -> in_progress
  -> evidence_submitted
  -> review_pending
  -> audit_pending
  -> cto_review_required
  -> merge_ready
  -> merged
  -> post_merge_verification
  -> phase_evidence_ready
  -> complete
```

Any state may transition to:

```text
blocked
stopped
change_intake_required
superseded
```

State transition rules:

- A state transition must cite policy, required evidence, actor/role, and target
  artifact.
- `merge_ready` requires current-head evidence and required role verdicts.
- `complete` requires post-merge or explicitly non-merge completion evidence.
- `blocked` must cite missing evidence, policy failure, authority gap, or stop
  condition.
- `stopped` is mandatory for R4 or forbidden-scope requests without explicit
  approval.

## 6. Lanes And Risk Classes

Every governed Work Order declares a lane and risk class.

| Lane | Meaning | Default handling |
|---|---|---|
| Routine | Low/medium, reversible, repo-owned work with complete evidence. | May proceed under configured runner policy. |
| Protected | Governance, control-plane, CI, security, policy, or high coordination work. | Requires stronger evidence and L1/L2/CTO path as configured. |
| Stop | Destructive, external-impact, authority-missing, or forbidden work. | Do not execute until explicit approval is recorded. |

Risk classes:

| Risk | Name | Examples | Minimum lane |
|---|---|---|---|
| R0 | Read-only | Inspect docs, issues, PRs, logs, non-mutating checks. | Routine |
| R1 | Local reversible mutation | Edit docs/code in allowed files, add tests, create local branch. | Routine |
| R2 | Remote reversible mutation | Push branch, open/update PR, comment, request review/audit. | Routine |
| R3 | Shared control-plane mutation | CI workflow, policy evaluator, branch/label sync, MCP contract, AUN queue lifecycle, security gate. | Protected |
| R4 | Destructive or external-impact mutation | Merge, deploy, secret/permission change, DB/storage destruction, external user/customer send, billing/value transfer. | Stop |

PR1 is docs/spec-only. The local documentation edits are R1 and PR publication is
R2. It does not perform R3/R4 mutation.

## 7. Policy-As-Code Model

The canonical policy contract name is `shirube-policy/v2.1`.

A later policy artifact must be able to express:

- applicable scope: repository, branch, path, issue, PR, Work Order, phase, or
  goal;
- risk classification rules;
- required evidence by risk, lane, phase, and file/module impact;
- required role verdicts and independence constraints;
- allowed runner policies;
- stop conditions and forbidden actions;
- projection requirements for GitHub checks, comments, CLI, or reports;
- failure mode: observe, warn, block, or stop.

Policy-as-Code must be deterministic and replayable. Natural-language policy
may explain intent, but the evaluable policy must own decisions.

## 8. Evidence Model

The v2.1 evidence kernel has four required evidence families for enterprise
delivery:

| Evidence family | Reserved contract | Required when |
|---|---|---|
| Security evidence | `shirube-security-evidence/v1` | Security, auth, permissions, secrets, supply chain, CI, or external exposure is affected. |
| Test evidence | `shirube-test-evidence/v1` | Behavior, gate, evaluator, adapter, or runtime code is changed. |
| DB evidence | `shirube-db-evidence/v1` | Schema, migration, storage lifecycle, queue, or persistence behavior is changed. |
| Contract evidence | `shirube-contract-evidence/v1` | Public API, CLI, schema, MCP, runner, policy, or adapter contract is changed. |

Each evidence record must preserve:

- stable id;
- schema version;
- source artifact URI/path;
- producing actor/system;
- observed ref or head SHA when applicable;
- summary;
- freshness/currentness;
- privacy scope;
- redaction status;
- linked policy and Work Order.

## 9. Evidence Gate And Trace Matrix

The Required Evidence Evaluator and Evidence Gate are first-wave v2.1 core
concepts, but they are not implemented in PR1.

The Trace Matrix must be able to relate:

```text
Goal
  -> Phase
    -> Work Order
      -> Change Slice / PR
        -> Policy
          -> Risk
            -> Required Evidence
              -> Evidence Record
                -> Role Verdict
                  -> GitHub Check Projection
```

Trace Matrix minimum checks for later PRs:

- every protected Work Order has a parent goal/phase or explicit exception;
- every PR cites a Work Order or accepted non-applicability reason;
- every required evidence item has a current evidence record or waiver;
- every role verdict cites exact head/ref and evidence scope;
- every projected check can be traced back to deterministic policy output.

## 10. Schema Map

PR1 reserves these contract names. It does not add JSON schemas, parsers,
fixtures, evaluators, adapters, scanners, or enforcement.

| Contract | Purpose | First implementation owner |
|---|---|---|
| `shirube-policy/v2.1` | Policy-as-Code root contract. | Future PR2/PR5. |
| `shirube-risk-classification/v1` | R0-R4 risk result and rationale. | Future PR2/PR5. |
| `shirube-policy-evaluation-result/v1` | Deterministic policy decision output. | Future PR3/PR5. |
| `shirube-evidence-record/v1` | Generic evidence record envelope. | Future PR2/PR3. |
| `shirube-trace-matrix/v2.1` | Cross-artifact trace graph. | Future PR2/PR3/PR4. |
| `shirube-ai-change-record/v1` | AI-assisted change evidence. | Existing lineage, hardened in future PRs. |
| `shirube-security-evidence/v1` | Security-specific evidence. | Future PR6. |
| `shirube-db-evidence/v1` | DB/storage/queue evidence. | Future PR6. |
| `shirube-test-evidence/v1` | Test and verification evidence. | Future PR6. |
| `shirube-contract-evidence/v1` | Schema/API/CLI/MCP/runner contract evidence. | Future PR6. |

## 11. Core v2.1 Versus Advanced v2.1+

Core v2.1 first-wave scope:

- Risk Class R0-R4;
- Policy-as-Code;
- Required Evidence Evaluator;
- Evidence Gate;
- Trace Matrix;
- security, test, DB, and contract evidence;
- GitHub Check projection direction;
- role boundary and CTO flow-owner model;
- runner policy model including Codex Goal Mode.

Advanced v2.1+ follow-up scope:

- cross-agent adversarial review;
- agent attribution ledger beyond ordinary actor/provenance fields;
- tamper-evident ledger;
- SLSA/in-toto attestation generation;
- incident replay;
- cost/latency governance;
- eval harness gates.

Advanced features may be referenced by #408, #409, or #412, but they must not
be first-wave enforcement requirements.

## 12. Role Boundary And CTO Flow Owner

Shirube v2.1 keeps producer, reviewer, auditor, QA/check, and CTO flow-owner
authority separate.

| Role | Owns | Cannot own alone |
|---|---|---|
| Architecture / ARC | Direction, specs, acceptance criteria, issue decomposition, review requirements. | Repo implementation completion, merge, or runtime activation. |
| Implementation owner | Scoped docs/code changes and local verification. | Final independent audit or merge authority for own change. |
| L1 review | Completeness, source alignment, local fit. | L2 independence or CTO direction approval. |
| L2 audit | Independent governance, evidence, risk, and policy review. | Implementation ownership for same PR. |
| QA/check | Practical readability, reproducibility, handoff usability, check evidence. | Strategic adoption approval. |
| CTO flow owner | Direction adoption, protected transition approval, future enforcement sequencing. | Skipping required evidence or replacing deterministic checks with judgment. |

Protected work must have the CTO flow-owner path visible before v2.1 direction
is treated as adopted for enforcement beyond docs/spec PR1.

## 13. Runner Policy Model

Runner policy declares how scoped work may be executed. It is not architecture.

Initial policy names:

| Runner policy | Meaning |
|---|---|
| `human_manual` | Human operator performs the work and records evidence. |
| `codex_goal_mode` | Codex executes a bounded goal with explicit scope, stop conditions, and handoff. |
| `claude_code_session` | Claude Code executes a bounded local session under the same evidence contract. |
| `script_only` | Deterministic scripts perform the transition or check. |
| `aun_accelerated` | AUN transports or dispatches the Work Order, but durable state remains in GitHub/Shirube evidence. |

Every runner policy must define allowed actions, forbidden actions, evidence
sinks, timeout/stall handling, and escalation path before it can update
governed state.

## 14. Non-Scope And Protected Constraints

PR1 must not change:

- runtime behavior;
- CLI behavior;
- label sync;
- branch protection;
- GitHub Check enforcement;
- scanner workflow enforcement;
- AUN dispatch;
- DB schema or queue behavior;
- LaunchAgent behavior;
- Discord/live automation;
- cross-agent runtime wiring;
- SLSA/in-toto generation;
- external repository state.

PR1 also must not claim:

- #405 completion;
- company-wide rollout;
- enterprise readiness;
- strict enforcement readiness;
- AUN/Kusabi/Kodama/Wasurezu adapter readiness.

## 15. Acceptance Criteria

- A new reader can understand Shirube v2.1 PR1 from these docs without reading
  #197/#363/#401/#403/#404 individually.
- #405 is explicitly named as parent SSOT.
- Object names and reserved contract names are fixed for later schema PRs.
- #197 remains lower-level Gate Engine / legacy discovery alignment substrate.
- #18/#19 are preserved as Company Dev OS policy-source references.
- GitHub is durable SSOT and AUN is acceleration, not completion authority.
- Codex Goal Mode is named as a runner policy, not architecture.
- Risk Class R0-R4, Policy-as-Code, Evidence Gate, Required Evidence
  Evaluator, Trace Matrix, evidence families, and GitHub Check projection
  direction are documented.
- Core v2.1 and Advanced v2.1+ scope are separated.
- Role boundary and CTO flow-owner model are documented.
- Non-scope and protected gate constraints are explicit.
- No runtime behavior is changed by PR1.
