# Phase 0 Action-To-Surface Map

> Status: Draft for L1/L2/L3 review
> Updated: 2026-05-26
> Tracking: #212 / #215
> Related: #200, #208, #220, SPEC-DOC4L-020, IMPL-DOC4L-020, POSTMERGE-001

## 1. Purpose

This document defines where `shirube workflow check --action ...` may later be called from, and which Gate Engine gates each action is intended to represent.

Phase 0 must finish this map before wiring any automatic enforcement. The current runtime surface remains explicit observability only.

## 2. Non-Goals

- Do not introduce new runtime enforcement.
- Do not connect `workflow check` to existing commands, hooks, CI, GitHub Checks, MCP tools, or issue/PR generation in Phase 0.
- Do not treat current compatibility rule ids as the final gate catalog.
- Do not use hooks as the canonical workflow state authority.
- Do not let LLM text approve phase completion, gate pass/fail, exceptions, merge authority, or release readiness.

## 3. Current Runtime State

Current PR C / workflow observability code exposes these explicit actions:

| Action | Current status |
|---|---|
| `design_draft` | Explicit CLI check only. |
| `implementation_start` | Explicit CLI check only. |
| `implementation_split` | Explicit CLI check only. |
| `remote_publish` | Explicit CLI check only. |
| `merge` | Explicit CLI check only. |
| `release` | Explicit CLI check only. |

The current `ACTION_RULE_IDS` list uses migration aliases such as `G1.roles.required_bindings`, `G2.hearing.required_confirmation`, `G4.publish.remote`, and `G9.merge_authority.evidence`.

Those ids may remain for PR C compatibility. For PR D and later, the canonical target is the Gate Catalog v0 from `SPEC-DOC4L-020`: `G0.adoption` through `G18.change_intake`.

## 4. Surface Taxonomy

| Surface | Role | Phase 0 status |
|---|---|---|
| Explicit CLI check | Human or script runs `shirube workflow check --action ...` intentionally. | Allowed. |
| Existing command integration | A mutating Shirube command calls the check before changing state or generating output. | Disallowed until reviewed. |
| GitHub Actions / GitHub Checks | Remote workflow projects gate status into PR checks and branch protection. | Disallowed until reviewed. |
| GitHub API / PR comment projection | Gate status is written to issues, PR comments, labels, or check summaries. | Disallowed until reviewed. |
| Hook fallback | Local immediate guard for unavoidable interception points. | Disallowed until a hook allowance is approved. |
| MCP wrapper | MCP calls the same deterministic state/rule model as CLI. | Disallowed until reviewed. |

Allowed Phase 0 work is documentation, issue disposition, manual CLI inspection, and local verification. No automatic enforcement surface may be enabled before L1/L2/L3 review records approval or required corrections.

## 5. Action-To-Surface Map

| Action | User intent | Target gates | First enforceable phase | Primary surface | Secondary / fallback | Phase 0 status |
|---|---|---|---|---|---|---|
| `design_draft` | Start or publish a design draft. | G1 intake, G2 hearing, G3 role_readiness, G4 goal_contract, G5 phase_plan, G18 change_intake when changing active scope. | Phase 1 | CLI design/generate path or future design command integration. | GitHub issue/PR comment projection for visibility. | Manual observe only. |
| `implementation_split` | Split approved design into implementation tasks. | G4 goal_contract, G5 phase_plan, G6 feature_catalog, G7 task_dag, G8 spec_impl_readiness, G18 change_intake when changing scope. | Phase 1 | CLI task split / issue generation command. | GitHub issue creation or update after deterministic check. | Manual observe only. |
| `implementation_start` | Start source-editing work for a task. | G2 hearing, G3 role_readiness, G4 goal_contract, G5 phase_plan, G7 task_dag, G8 spec_impl_readiness, G9 context_pack, G10 provider_tool_policy, G11 pre_impl_audit. | Phase 1 for G2-G8/G11, Phase 2 for G9/G10 strict blocking. | CLI run/worktree/dispatch surface that prepares task context. | Hook fallback only for immediate local source-edit interception. | Manual observe only. |
| `remote_publish` | Push, create PR, or publish external workflow evidence. | G3 role_readiness, G10 provider_tool_policy, G13 ai_change_record, G14 github_check_projection, G18 change_intake when publish changes scope. | Phase 2 | CLI/GitHub API publish command. | GitHub Action or PR comment projection. | Manual observe only. |
| `merge` | Claim merge readiness or authorize merge. | G12 implementation_audit, G13 ai_change_record, G14 github_check_projection, G15 release_authority, and scheduled G16 post_merge_verify / G17 goal_progress. | Phase 2 | GitHub required check plus `merge-authority.ts` evaluator. | CLI merge-readiness report. Hooks are not sufficient. | Manual observe only. |
| `release` | Claim release readiness beyond one PR merge. | G12 implementation_audit, G13 ai_change_record, G14 github_check_projection, G15 release_authority, G16 post_merge_verify, G17 goal_progress. | Phase 2 | GitHub Actions release workflow and required checks. | CLI release-readiness report. Hooks are not sufficient. | Manual observe only. |

Phase 4 hardens these same surfaces for enterprise adoption. It should not invent a separate authority model.

## 6. Profile Behavior

| Profile | Behavior |
|---|---|
| `minimal` | Prefer OBSERVE/WARN. Do not require GitHub. Do not hard-block local-only design or exploratory work unless the user explicitly opts into blocking. |
| `standard` | WARN/BLOCK remote publication and merge/release when required evidence is missing. Local design and implementation checks may warn during migration. |
| `strict` | BLOCK missing required evidence for the action. Merge/release are fail-closed. Exceptions require structured evidence and configured authority. |

Profile behavior must be computed by deterministic rule evaluation. LLM output may suggest remediation text but must not decide the gate result.

For this map, configured authority means deterministic authority evidence from `workflow-config.ts`, `merge-authority.ts`, and, for remote merge/release workflows, a GitHub required check or equivalent check-run status. LLM text is not configured authority.

Per-action fail behavior:

| Action | Phase 0 behavior | `minimal` target | `standard` target | `strict` target | First fail-closed point |
|---|---|---|---|---|---|
| `design_draft` | Fail-open; manual observe only. | Observe/warn missing intake, hearing, role, or goal evidence. | Warn by default during migration; may block configured public/remote design publication after Phase 1 wiring. | Block missing G1-G5 or required G18 change-intake evidence after Phase 1 wiring. | Phase 1 strict; standard only where publication is configured as controlled. |
| `implementation_split` | Fail-open; manual observe only. | Observe/warn missing plan, catalog, task, or spec evidence. | Block approved task/issue generation when G4-G8 evidence is missing after Phase 1 wiring. | Block implementation split when G4-G8 or required G18 evidence is missing after Phase 1 wiring. | Phase 1 standard/strict. |
| `implementation_start` | Fail-open; manual observe only. | Observe/warn missing task readiness. | Warn during early dogfood; block only when a repository opts into standard implementation gating. | Block missing G2-G8/G11 after Phase 1 wiring; block missing G9/G10 after Phase 2 strict wiring. | Phase 1 strict for G2-G8/G11; Phase 2 strict for G9/G10. |
| `remote_publish` | Fail-open; manual observe only. | Observe/warn missing publish readiness; no GitHub requirement. | Block `draft_only`, missing publish role/policy, or missing required PR projection after Phase 2 wiring. | Block missing G3/G10/G13/G14 or required G18 evidence after Phase 2 wiring. | Phase 2 standard/strict. |
| `merge` | Fail-open; manual observe only. | Local readiness report only; no merge authority claim. | Block merge readiness when required GitHub check or merge-authority evidence is missing after Phase 2 wiring. | Fail-closed for missing G12-G15 evidence, invalid authority, or missing scheduled G16/G17 follow-up after Phase 2 wiring. | Phase 2 standard/strict through required check plus `merge-authority.ts`. |
| `release` | Fail-open; manual observe only. | Local readiness report only; no release authority claim. | Block release readiness when release workflow checks or authority evidence are missing after Phase 2 wiring. | Fail-closed for missing G12-G17 evidence, invalid authority, or failed post-merge/goal-progress evidence after Phase 2 wiring. | Phase 2 standard/strict through release workflow plus `merge-authority.ts`. |

## 7. Evidence Requirements

| Action | Minimum evidence before wiring | Target evidence package |
|---|---|---|
| `design_draft` | Intake/hearing evidence and role readiness fixture. | Goal Contract, phase plan trace, design artifact, role evidence, change-intake evidence when scope changes. |
| `implementation_split` | Approved goal/phase/design trace and issue/task output fixture. | Feature catalog, task DAG, SPEC/IMPL/VERIFY/OPS readiness, trace matrix. |
| `implementation_start` | Task trace and pre-impl audit fixture. | Context Pack hash, provider/tool policy, SPEC/IMPL/VERIFY/OPS, pre-impl audit, expected tests and acceptance criteria. |
| `remote_publish` | Publish policy fixture and role readiness fixture. | AI Change Record draft/complete status, provider/tool policy, changed-file summary, test evidence, PR/check projection payload. |
| `merge` | Merge authority fixture. | Post-implementation audit, AI Change Record, GitHub Check status, merge-authority decision, exception evidence if any. |
| `release` | Release authority fixture. | Release readiness report, GitHub Checks, merge authority, post-merge verification, goal progress coverage. |

`POSTMERGE-001` defines the record required after merge for PRs that contribute to phase exit claims. In Phase 0 it is a documentation/schema addendum only. It does not wire `workflow check` to GitHub Checks, CI, hooks, MCP, or merge automation.

Before any automatic surface is wired, the implementation issue must name the evidence fixtures and expected fail-open/fail-closed behavior for each profile.

## 8. Hook Allowance

Hooks are allowed only for documented unavoidable local interception:

- pre-tool blocking when an agent attempts source edits without required implementation readiness;
- context injection when a task must receive a reproducible Context Pack;
- session state recovery when compaction or restart would otherwise lose required state;
- post-tool verification when local changes must be inspected immediately;
- completion-time verification before an agent claims work is finished.

Hooks must call the same deterministic state/rule engine as CLI. A hook cannot become the source of phase truth, approval, merge authority, or release authority.

For the current action set:

| Action | Hook status |
|---|---|
| `design_draft` | No default hook allowance. |
| `implementation_split` | No default hook allowance. |
| `implementation_start` | Possible fallback allowance for pre-tool source-edit interception after L1/L2/L3 approval. |
| `remote_publish` | No default hook allowance; publish should be CLI/GitHub controlled. |
| `merge` | No hook allowance; merge must be GitHub/merge-authority controlled. |
| `release` | No hook allowance; release must be workflow/authority controlled. |

## 9. Wiring Gate

The following must be true before a later PR may wire any action to an automatic surface:

1. The action's target gates are approved or corrected by L1/L2/L3 review.
2. The implementation issue names the exact surface being wired.
3. The implementation issue states the profile behavior: observe, warn, or block.
4. The implementation includes deterministic fixtures for pass, warn, block, and missing-evidence cases where applicable.
5. The implementation records rollback behavior and operator remediation.
6. GitHub/public projection redacts local-sensitive or secret-bearing evidence.
7. The change preserves `shirube discover -> shirube generate` compatibility unless the profile explicitly opts into stricter behavior.

## 10. Review Decisions Needed

These are the approval points for #215:

| Decision | Required layer | Blocking scope |
|---|---|---|
| Approve or correct the action-to-gate mapping. | L1/L2/L3 | Blocks automatic wiring. |
| Approve that Phase 0 remains observe-only. | L1/L2/L3 | Blocks runtime enforcement changes. |
| Decide whether PR #208/#200 is the PR C observability vehicle or must be superseded. | L3 | Blocks Phase 0 completion claim. |
| Decide whether #91 and #123 are fixed/merged or superseded by Gate Engine issues. | L3 | Blocks final Phase 0 disposition closure, but not this mapping draft. |
| Approve hook allowance for `implementation_start`, if any. | L2/L3 | Blocks hook fallback implementation. |

## 11. T3 Exit Status

This T3 artifact satisfies the Phase 0 requirement to define an action-to-surface map before automatic enforcement is introduced.

T3 does not approve enforcement wiring. It moves #215 to review-ready state. Runtime work must wait for the review decisions above.

Phase 0 addendum #220 extends the evidence baseline with `POSTMERGE-001`. That addendum does not change the T3 observe-only status; it makes post-merge evidence explicit for Phase Closure Audit.
