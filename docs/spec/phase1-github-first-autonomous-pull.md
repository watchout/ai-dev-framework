---
id: SPEC-GHFIRST-401
status: Draft
traces:
  impl: [IMPL-GHFIRST-401]
  verify: [VERIFY-GHFIRST-401]
  ops: [OPS-GHFIRST-401]
---

# SPEC: GitHub-First Autonomous Pull Contract

## 0. Meta
- Origin Issue: #401
- Parent: #363 / Company Dev OS two-lane operating model
- Canonical Company Dev OS source: watchout/iyasaka-arc#18
- Related rollout: watchout/iyasaka-arc#17
- Related AUN runtime puller: watchout/agent-comms-mcp#744
- Paired memory/recovery adoption: watchout/agent-memory#177

## 1. Purpose
Define the Shirube/ADF contract for GitHub-first, AUN-accelerated autonomous
pull operation.

GitHub issues and PRs are the durable source of truth for Work Orders, phase
goals, current owner, next action, acceptance criteria, decisions, reviews,
checks, and completion evidence. AUN may notify, mirror, dispatch, or transport
evidence, but AUN state is not sufficient by itself.

This slice makes the contract explicit before live pullers, runtime workers, or
automatic label mutation rely on it.

## 2. Operating Invariants
- GitHub issue/PR state is the durable SSOT.
- AUN is an acceleration layer only.
- Normal operation must not require OS cron.
- Bots pull GitHub work on startup/restart, after task completion, before idle,
  when an AUN notification carries a GitHub URL, and through an approved
  supervised idle worker once the runtime puller is accepted.
- Runner execution must be bounded by phase goals, not open-ended sessions.
- Implementation, audit, QA/check, CTO, and merge authority remain separate.
- Merge is not done. Runtime or post-merge evidence is required before done for
  runtime-impacting or user-impacting changes.
- ACKs, queue IDs, projected text, or green CI alone do not prove completion.

## 3. Work Order Addendum
`work-order/v1` remains the schema version for this migration slice, but
GitHub-first operation requires these additional fields or equivalent aliases:

```ts
type GitHubFirstWorkOrderFields = {
  github_state_ref: {
    issue_url: string;
    pr_url?: string;
    durable_state: "github_issue_pr" | string;
  };
  phase_goal: PhaseGoalV1;
  runner_policy: RunnerPolicyV1;
  evidence_contract: EvidenceContractV1;
  acceptance_criteria: string[];
  role_flow: string[];
  current_owner: string;
  next_action: string;
  evidence_required: string[];
  required_review: string[];
};
```

Existing `objective`, `scope`, and `non_goals` satisfy the Goal, Scope, and
Non-scope fields when they are concrete. A Work Order must still include the
#244 runtime, dispatch, context, authority, and promotion fields.

## 4. Phase Goal Model
Phase goals are bounded execution units that a runner can complete without
human relay until a stop condition is hit.

```ts
type PhaseGoalV1 = {
  phase_id: string;
  phase_type:
    | "design_plan"
    | "implementation"
    | "self_check"
    | "audit"
    | "qa_check"
    | "protected_decision"
    | "post_merge_completion";
  goal: string;
  scope: string[];
  non_scope: string[];
  acceptance_criteria: string[];
  target_files_or_modules?: string[];
  allowed_implementation_actions: string[];
  required_checks: string[];
  stop_conditions: string[];
  evidence_writeback: string[];
  next_phase_handoff: string;
};
```

Routine implementation phases may continue automatically while the phase goal
remains in scope and no stop condition is hit. Protected phases fail closed and
handoff to the correct role.

## 5. Runner Policy Model
Shirube represents runner policy. It must not hard-code Codex as the core
architecture.

Supported initial policies:

| Policy | Use |
|---|---|
| `codex_native_fast_lane` | GitHub label queue is SSOT; Codex Goal Mode or persistent local session executes bounded phase goals; PR body/comment is evidence SSOT; AUN optional. |
| `claude_code_autonomous_lane` | Claude Code executes bounded PR-sized Work Orders with the same phase, evidence, and stop contract. |
| `headless_runtime_adapter_lane` | A supervised runtime adapter executes bounded phase goals when supported. |
| `governed_manual_lane` | Human or non-autonomous runner uses the same GitHub evidence contract. |
| `stop_lane` | Protected, unsafe, unsupported, or approval-boundary work records a blocker and waits for the correct role. |

Every policy must preserve:

- GitHub issue/PR as durable SSOT;
- phase goal boundaries;
- Current Owner and Next Action;
- required checks and evidence;
- hard stop for protected boundaries;
- no self-approval across implementation, audit, QA, CTO, or merge roles;
- merge != done.

## 6. GitHub Work Queue Contract
Repos adopting this contract must define labels or equivalent structured
fields for:

- `needs:arc`
- `needs:impl`
- `needs:audit`
- `needs:qa`
- `needs:check`
- `needs:cto`
- `owner:<bot-or-role>`
- `route:fast`
- `route:protected`
- `blocked:aun`
- `ready:merge`
- `done:runtime-evidence`

Bot queries must be recorded in the repo adoption profile. AUN degradation must
not block work discovery when GitHub contains a valid next phase.

## 6.1 Evidence Contract
Completion and readiness evidence must be written back to GitHub.

Required evidence classes:

- Work Order and phase goal source issue URL;
- branch or PR URL and exact head SHA;
- changed files and implementation handoff;
- local checks, CI checks, or explicit trigger non-applicability;
- review/audit/QA/CTO links when required by route;
- runtime or post-merge evidence before done when runtime behavior changes;
- residual risk and accepted debt.

Not sufficient as completion evidence:

- AUN ACK;
- queue row exists;
- outbound queued;
- Discord projection;
- TUI/tmux text visible;
- green CI alone for runtime-impacting changes.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- Shirube docs define GitHub-first / AUN-accelerated operation.
- Work Order and task templates include durable GitHub state, phase goal,
  runner policy, owner/next-action, review, and evidence fields.
- Work Order examples include `phase_goal`, `runner_policy`, and
  `evidence_contract`.
- Delivery profile validation requires the new Work Order field names in
  `work_order_required_fields`.
- Repo adoption guidance includes GitHub work queue pull rules.
- AUN is documented as acceleration, not SSOT.
- The PR explicitly states that live AUN puller/runtime rollout remains out of
  scope.

GitHub SSOT scenario:

```gherkin
Given a Work Order has a GitHub issue URL and an optional PR URL in github_state_ref
And AUN has a queued notification for the same work
When a runner chooses the next phase
Then the runner uses the GitHub issue or PR as durable state
And the AUN queue row is only acceleration evidence
```

Runner policy scenario:

```gherkin
Given a Work Order declares runner_policy codex_native_fast_lane
And the phase_goal type is implementation
When the implementation runner completes the allowed actions and checks
Then it writes evidence to the GitHub PR
And it hands off to audit instead of self-approving
```

Protected stop scenario:

```gherkin
Given a phase goal reaches a protected governance or runtime boundary
When the active runner is not the required approval role
Then the runner records a blocker in GitHub
And the next action routes to the required review or CTO role
```

## 8. Repo Adoption Profile
Each adopting repo must record:

- operating doc or AGENTS update location;
- owner/needs labels or equivalent fields;
- GitHub query/filter used by bots to find work;
- runner policy allowed for that repo;
- fallback behavior when AUN is degraded;
- required evidence before merge;
- required evidence before done;
- protected route and CTO/owner escalation conditions.

## 9. Gate Behavior
This slice may update warning-first validators and templates. It does not make
autonomous pull hard enforcement. Promotion to hard BLOCK requires a later
reviewed slice with runtime evidence.

## 10. 制御機構選定原則
script 選定根拠: Work Order, phase goal, runner policy, and evidence contract
validation must be deterministic, replayable, and usable without live AUN. The
existing TypeScript workflow and delivery-profile validators own this slice.

Hook 選定根拠: Hook 不採用 in this slice. Startup or idle checks may later call
the same deterministic GitHub pull rules, but hooks must not own state truth or
completion evidence.

GitHub 選定根拠: GitHub issue/PR state is the durable SSOT for queue selection,
phase handoff, review, checks, and completion evidence. Labels and comments
project state; they do not grant merge authority by themselves.

AUN 選定根拠: AUN may notify, mirror, dispatch, or transport evidence, but AUN
ACKs, queue IDs, and outbound rows are not sufficient evidence.

LLM boundary: Codex, Claude Code, or another runner may execute a bounded phase
goal. It cannot approve its own audit, QA, CTO decision, merge, protected
operation, or done claim.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|---|---|---|---|
| Work Order field contract | script validator and templates | - | deterministic schema and field checks |
| Phase goal boundary | script validator and GitHub evidence | - | bounded runner execution without prompt-only state |
| Runner policy | script/profile contract | - | runner-agnostic behavior before live dispatch |
| Evidence contract | GitHub PR/issue comments, checks, and reviews | - | durable audit trail independent of AUN |
| AUN fallback | GitHub queue contract | - | work discovery must continue while AUN is degraded |

= 全 requirement が script/GitHub 制御。Hook 不採用。

## 11. Testing Layer
Implementation must include:

- unit tests for Work Order delivery defaults with GitHub-first fields;
- unit tests for delivery profile required field projection;
- integration-style workflow check fixture proving a complete Work Order still
  passes `--fail-on warn`;
- regression tests for generated Work Order template prompts;
- smoke verification with `trace verify` for the new 4-layer docs.

## 12. Non-Goals
- Do not implement the AUN state-daemon or GitHub puller here.
- Do not mutate production/runtime state.
- Do not bypass audit, QA/check, CTO, or merge authority.
- Do not require OS cron as the normal development loop.
- Do not claim AUN rollout approval.
- Do not claim runtime completion from template or docs updates alone.
