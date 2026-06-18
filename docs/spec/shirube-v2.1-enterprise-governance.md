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
| Kusabi | Canonical product/display name for memory, recovery, and continuity evidence. `Wasurezu` is the legacy alias/tooling/runtime name where still present. Repo/package identity remains `watchout/agent-memory` / `agent-memory` unless a separate CEO-approved rename PR exists. |
| Kodama | Source/context registry and context-pack evidence provider; not transition authority. |
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

### 5.1 Phase And Verdict Vocabulary Ownership

Shirube owns the canonical Work Order state machine, phase vocabulary, verdict
vocabulary, and merge-readiness semantics.

AUN conveyor labels, comments, queue views, and audit-result comments are
projections of Shirube state. They are not an independent second state machine,
and adapter/projection surfaces must not define independent gate semantics or
override Shirube state.

Canonical verdict vocabulary for v2.1 is:

```text
PASS
WARN
BLOCK
STOP
OBSERVE
```

Projection mapping examples:

| Shirube canonical state/verdict | AUN conveyor label/comment projection | Authority owner |
|---|---|---|
| `audit_pending` | `needs:l2-audit` | Shirube state machine owns the required audit state; AUN label only projects it. |
| L2 role verdict `PASS` | `audit:l2-passed` | Shirube role-verdict contract owns the verdict; AUN label only projects current-head evidence. |
| `merge_ready` | `state:merge-ready` | Shirube merge-readiness semantics own the state; AUN must not mark merge readiness independently. |
| Current-head audit evidence | `conveyor:audit-result/v1` PR comment | Shirube evidence contract owns sufficiency; AUN comment is transport/projection evidence. |

These examples align the Shirube canonical vocabulary with AUN #766 conveyor
labels/comments without making AUN projection authority.

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

Acceptance scenario for first-wave Policy-as-Code:

```gherkin
Given a protected Work Order declares risk class R3 and cites `shirube-policy/v2.1`
When the future read-only policy evaluator checks required evidence for that Work Order
Then the evaluator returns `shirube-policy-evaluation-result/v1` with a deterministic decision, cited policy refs, cited evidence refs, and no runtime mutation
```

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

The core `shirube-evidence-record/v1` envelope also reserves optional,
forward-compatible fields for Advanced v2.1+ provenance, ledger, policy, model,
and cost metadata:

| Field | Status in PR1 | Purpose |
|---|---|---|
| `ledger_seq` | Reserved optional field. | Future append/ordering metadata. |
| `prev_evidence_hash` | Reserved optional field. | Future tamper-evident ledger link. |
| `evidence_hash` | Reserved optional field. | Future evidence integrity metadata. |
| `policy_version` | Reserved optional field. | Policy version observed when evidence was produced or evaluated. |
| `model_version` | Reserved optional field. | AI/model version metadata when applicable. |
| `token_cost` | Reserved optional field. | Future cost/latency governance metadata. |

These are reservations only. PR1 does not implement hashing, ledger append,
SLSA/in-toto, cost accounting, evaluators, or enforcement.

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
| `shirube-evidence-record/v1` | Generic evidence record envelope with reserved optional `ledger_seq`, `prev_evidence_hash`, `evidence_hash`, `policy_version`, `model_version`, and `token_cost` slots. | Future PR2/PR3. |
| `shirube-trace-matrix/v2.1` | Cross-artifact trace graph. | Future PR2/PR3/PR4. |
| `shirube-ai-change-record/v1` | AI-assisted change evidence. | Existing lineage, hardened in future PRs. |
| `shirube-security-evidence/v1` | Security-specific evidence. | Future PR6. |
| `shirube-db-evidence/v1` | DB/storage/queue evidence. | Future PR6. |
| `shirube-test-evidence/v1` | Test and verification evidence. | Future PR6. |
| `shirube-contract-evidence/v1` | Schema/API/CLI/MCP/runner contract evidence. | Future PR6. |

Control mechanism selection for the schema map:

script 選定根拠: schema reservation, policy evaluation, evidence gating, and
Trace Matrix checks must be deterministic, replayable, and testable from
versioned artifacts before any state transition or projection can be trusted.
PR1 records the names only; later PRs must implement any evaluator as script-
controlled logic rather than LLM judgment.

Hook 選定根拠: Hook 不採用 in PR1. Hooks may later call the same deterministic
script for local interception when an unavoidable case is reviewed, but hooks
must not own schema truth, policy decisions, evidence sufficiency, GitHub Check
projection, merge authority, or phase completion.

### 10.1 PR2 Fixture Inventory

PR2 adds reviewable example contract fixtures under
`docs/spec/fixtures/shirube-v2.1/`. These artifacts are docs/data fixtures only:
they define the loader-facing `schema_version` strings and example input shapes
for the future PR3 read-only evaluator, but they do not add schemas, parsers,
runtime code, GitHub Checks, CI gates, adapters, scanners, branch protection,
label sync, AUN dispatch, DB changes, LaunchAgent changes, Discord automation,
or external repository mutation.

PR1 names `shirube-policy/v2.1` and `shirube-trace-matrix/v2.1` as v2.1
governance-kernel contract directions. PR2 fixes the first fixture schema ids
for loader examples as `shirube-policy/v1` and `shirube-trace-matrix/v1`.
No evaluator may treat either set as enforcement-ready until a later reviewed
schema/evaluator PR defines normalization and deterministic behavior.

Every fixture must make the following readable without external context:

- source links to #405, #413, and #414;
- exact-head binding expectations for PR-scoped decisions;
- role separation between producer, review, audit, QA/check, and CTO flow owner;
- required evidence or an explicit not-required reason;
- optional reserved enterprise slots where evidence metadata is represented.

| Fixture schema id | Fixture path | Owner track | Future evaluator PR |
|---|---|---|---|
| `shirube-policy/v1` | [`policy.example.yml`](fixtures/shirube-v2.1/policy.example.yml) | #410 policy/evidence core. | PR3 read-only loader/evaluator. |
| `shirube-risk-classification/v1` | [`risk-classification.example.yml`](fixtures/shirube-v2.1/risk-classification.example.yml) | #410 R0-R4 policy core. | PR3 read-only loader/evaluator. |
| `shirube-evidence-record/v1` | [`evidence-record.example.json`](fixtures/shirube-v2.1/evidence-record.example.json) | #410/#411 evidence core. | PR3 read-only loader/evaluator. |
| `shirube-trace-matrix/v1` | [`trace-matrix.example.json`](fixtures/shirube-v2.1/trace-matrix.example.json) | #411 traceability core. | PR3 read-only loader/evaluator. |
| `shirube-security-evidence/v1` | [`security-evidence.example.json`](fixtures/shirube-v2.1/security-evidence.example.json) | #407/#410 security evidence. | PR3 read-only loader/evaluator; PR6 adapter evidence. |
| `shirube-test-evidence/v1` | [`test-evidence.example.json`](fixtures/shirube-v2.1/test-evidence.example.json) | #410/#411 test evidence. | PR3 read-only loader/evaluator; PR6 adapter evidence. |
| `shirube-db-evidence/v1` | [`db-evidence.example.json`](fixtures/shirube-v2.1/db-evidence.example.json) | #410 DB/storage evidence. | PR3 read-only loader/evaluator; PR6 adapter evidence. |
| `shirube-contract-evidence/v1` | [`contract-evidence.example.json`](fixtures/shirube-v2.1/contract-evidence.example.json) | #410/#411 contract evidence. | PR3 read-only loader/evaluator; PR6 adapter evidence. |
| `shirube-ai-change-record/v1` | [`ai-change-record.example.json`](fixtures/shirube-v2.1/ai-change-record.example.json) | #411 AI-assisted change trace. | PR3 read-only loader/evaluator. |
| `shirube-architecture-map/v1` | [`architecture-map.example.json`](fixtures/shirube-v2.1/architecture-map.example.json) | #405/#411 boundary trace. | PR3 read-only loader/evaluator. |

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

### 11.1 Testing Layer For Future PRs

PR1 has no runtime testing layer because it is docs/spec-only. Future PR2+
implementation must add testing appropriate to the artifact type:

- schema fixture tests for contract shape and negative examples;
- read-only evaluator unit tests for R0-R4, missing evidence, and stop cases;
- projection tests that prove GitHub output is exact-head and redacted;
- adapter tests that prove evidence production does not mutate runtime state;
- regression tests that AUN ACK, queue id, or Discord projection alone cannot
  satisfy completion authority.

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
- AUN/Kusabi/Kodama adapter readiness. `Wasurezu` remains a legacy alias for
  Kusabi tooling/runtime naming where still present.

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
- Shirube canonical phase/verdict vocabulary and AUN conveyor projection
  mapping are documented.
- `shirube-evidence-record/v1` reserves forward-compatible ledger/provenance/
  policy/model/cost fields without implementing them.
- Kusabi is the canonical memory/recovery/continuity product name, with
  Wasurezu preserved only as a legacy alias/tooling/runtime name.
- Non-scope and protected gate constraints are explicit.
- No runtime behavior is changed by PR1.
