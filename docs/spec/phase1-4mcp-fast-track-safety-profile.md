---
id: SPEC-4MCPFASTTRACK-264
status: Draft
traces:
  impl: [IMPL-4MCPFASTTRACK-264]
  verify: [VERIFY-4MCPFASTTRACK-264]
  ops: [OPS-4MCPFASTTRACK-264]
---

# SPEC: 4MCP Fast Track Minimum Safety Profile

## 0. Meta
- Origin Issue: #264
- Parent governance boundary: #249 / PR #253
- Related full autonomous mode: #263 and watchout/agent-comms-mcp#673
- ARC source: `iyasaka-arc/cross-cutting/specs/draft/2026-06-02-4mcp-completion-safety-minimum.md`
- Applies to: AUN, Shirube, Kodama, Wasurezu

## 1. Purpose
Define the minimum Shirube safety profile needed to keep current 4MCP work
moving before the full AUN-connected autonomous runner platform exists.

This profile is not autonomous delivery mode. It is a small safety layer that
lets repo-owned low and medium risk work continue quickly while shared
control-plane, destructive, or external-impact work is forced into governed,
draft/reference, or stop handling.

## 2. Authority Boundary
This profile inherits the #249 ownership model:

- `architecture_owner`;
- `implementation_owner`;
- `review_owner`;
- `merge_authority`;
- `audit_owner`.

ARC/design roles may provide specs, issues, acceptance criteria, roadmap
alignment, and gate conditions. They do not become implementation owners or
merge authorities unless the repository owner explicitly delegates that exact
repository, issue or Work Order, scope, and verification requirement.

Merge is never automatic in this profile.

## 3. Lane Classification
Every 4MCP Work Order or PR must declare one lane:

| Lane | Meaning | Default handling |
|------|---------|------------------|
| `Fast` | Repo-owned work with low/medium risk and reversible scope. | May proceed after required evidence is present. |
| `Governed` | Shared control-plane or high coordination risk. | Draft/reference PR by default; audit before merge. |
| `Stop` | Destructive, external-impact, or authority-missing work. | Do not execute until explicit approval is recorded. |

Lane names are evidence classification, not authority grants.

## 4. Risk Classes
Every 4MCP Work Order or PR must declare one risk class:

| Risk | Name | Examples | Minimum lane |
|------|------|----------|--------------|
| `R0` | Read-only | Inspect files, issues, PRs, docs, specs, non-mutating checks. | Fast |
| `R1` | Local reversible mutation | Edit allowed files, add tests, update docs, create local branch/worktree. | Fast |
| `R2` | Remote reversible mutation | Push branch, open/update PR, comment on issue/PR, request audit/review. | Fast |
| `R3` | Shared control-plane mutation | CI workflow, dependency, action-profile validator, MCP tool shape, AUN queue lifecycle, security policy. | Governed |
| `R4` | Destructive or external-impact mutation | Merge, production deploy, secret change, destructive DB/storage operation, customer data export, external send, billing/value transfer, permission broadening. | Stop |

R3 must not silently appear as Fast Lane. R4 must not proceed without explicit
approval.

## 5. Action Envelope
Every non-read-only 4MCP Work Order or PR must declare an action envelope:

- allowed files or modules;
- allowed actions;
- forbidden actions;
- stop conditions.

The envelope is a scope limiter. It must not expand implementation authority,
merge authority, or live execution authority.

## 6. Required PR Evidence
Every 4MCP PR should include:

- Work Order or issue reference;
- product/repo;
- lane;
- risk class;
- implementation owner;
- merge authority;
- scope and non-goals;
- allowed files/modules;
- changed files;
- verification commands and results;
- residual risk;
- stop conditions encountered;
- audit/review owner.

For R3 and R4, missing ownership or action-envelope evidence is not a harmless
template gap. It is a gate finding that must keep the PR draft or stopped.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- a Work Order or PR can declare lane and risk class;
- PR/template/gate evidence can require the minimum fields;
- R3 work cannot silently appear as Fast Lane;
- R4 work cannot proceed without explicit approval;
- ARC/reference PRs cannot count as implementation acceptance unless repo
  maintainers adopt them;
- the profile is usable by current 4MCP issues before the full autonomous
  runner platform is complete.

R3 scenario:

```gherkin
Given a PR changes CI workflow or dependency resolution
And the PR declares lane Fast
When the 4MCP Fast Track safety profile is evaluated
Then the check blocks because R3 work requires Governed lane handling
```

R4 scenario:

```gherkin
Given a Work Order requests merge, production deploy, secret change, or external send
And explicit approval evidence is missing
When the profile is evaluated
Then the check blocks and no implementation work starts
```

Global stop scenario:

```gherkin
Given a global stop/no-run sentinel is active
When an agent attempts to start a new Work Order
Then Shirube reports a blocker and does not start new implementation work
```

## 8. Hard Stop Minimum
Before starting a new Work Order, an agent must check:

- user requested stop;
- permission or environment change requested;
- repo is in unsafe dirty state for the requested action;
- implementation authority is missing;
- R4 action requested;
- global stop/no-run sentinel is active.

If any condition is true:

- do not start new implementation work;
- record the blocker;
- leave the worktree intact;
- move only to unrelated actionable work if the stop is local, not global.

No new Work Order may be started while a global stop/no-run sentinel is active.

## 9. 4MCP Application and Gate Behavior
### AUN
Allowed now:

- R0/R1/R2 stabilization work;
- specs, tests, safety issue wiring, and internal stabilization PRs;
- R3 only as Draft/reference PR or explicit repo-owned implementation.

Blocked:

- live autonomous runner dispatch;
- action-tool execution against real external systems;
- destructive queue lifecycle migration without approval.

### Shirube
Allowed now:

- lane/risk schema;
- PR evidence template;
- authority separation gate;
- stop/no-run sentinel design;
- governed action profile inventory and validation as repo-owned or
  draft/reference work.

Blocked:

- automatic merge;
- treating ARC-created implementation PRs as accepted implementation.

### Kodama
Allowed now:

- get_context/context-pack implementation with provenance and injection-risk
  evidence;
- profile inventory and validation.

Blocked:

- execution authorization;
- using context labels as permission grants;
- tool calls that mutate external state.

### Wasurezu
Allowed now:

- recovery/restart pack hardening;
- memory provenance;
- redaction and sensitive label work;
- approval-note evidence references.

Blocked:

- memory becoming execution authorization;
- storing secrets in recovery state;
- uncontrolled raw capture from external systems.

First implementation should be warning-first for R0-R2 evidence gaps and
fail-closed for hard stops.

Required behavior:

- missing lane/risk/evidence is visible;
- R3 without Governed lane is BLOCK;
- R4 without explicit approval is BLOCK;
- missing implementation owner, merge authority, or review/audit owner blocks
  continuation as implementation;
- global stop/no-run sentinel blocks new Work Order start;
- reference implementation PRs remain Draft or explicitly labeled until repo
  owner adoption.

## 10. 制御機構選定原則
script 選定根拠: Lane/risk/evidence and stop handling must be deterministic,
replayable, and usable without AUN live runtime.

Hook 選定根拠: Hook 不採用 in this spec slice. Hooks may call the same script
later for unavoidable local interception but must not own safety truth.

GitHub 選定根拠: PR templates and check results project evidence. They do not
grant implementation or merge authority.

LLM boundary: LLM output may draft classification and evidence text. It cannot
approve R4 execution, satisfy missing authority, clear a stop sentinel, or
merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Lane/risk classification | script/spec contract | - | deterministic safety classification |
| Owner separation | #249 governance contract + future script | - | repo ownership must not transfer to ARC or LLM output |
| Action envelope | script/spec contract | - | prevents scope expansion from prompts |
| Stop/no-run sentinel | script/spec contract first | - | local hooks may invoke later, but do not decide independently |
| PR evidence | GitHub template/check projection | - | visible evidence for reviewers and audit |

## 11. Testing Layer
The implementation slice must add unit, integration-style CLI, regression, and
smoke fixtures for:

- Fast lane R0/R1/R2 with complete evidence;
- R3 declared as Fast and blocked;
- R3 declared Governed and draft/reference;
- R4 without explicit approval and blocked;
- missing implementation owner and blocked;
- global stop/no-run sentinel and blocked Work Order start;
- ARC reference PR not counted as implementation acceptance.

## 12. Review Boundary
L1 spec review is required before implementation starts.

L2 implementation review is required for any validator, CLI, CI, template, or
workflow-state implementation of this profile.

L3 review is required before this profile is promoted to merge-readiness,
strict dispatch control, public release positioning, or full autonomous runner
safety claims.

## 13. Non-Goals
- Do not implement live AUN dispatch to Codex/Claude runners.
- Do not implement full runner scheduling.
- Do not implement automatic merge.
- Do not deploy to production.
- Do not change secrets.
- Do not perform destructive DB/storage operations.
- Do not send to external customers or users.
- Do not broaden permissions.
