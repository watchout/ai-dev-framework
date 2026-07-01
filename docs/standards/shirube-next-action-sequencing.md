# Shirube Next-Action Sequencing

Shirube gate reports must provide one machine-readable next action. Operators and LLMs must follow `next_action`; they must not infer the process order from partial blocker lists.

## Required Fields

Relevant gate reports and the Rapid/Lite aggregate include:

```yaml
current_phase: AUDIT_REQUIRED
next_action:
  action: request_independent_audit
  responsible_role: auditor
  allowed_actor_role: independent_reviewer
  reason: Independent machine-readable audit is required for exact head <sha>.
owner_approval_allowed: false
merge_ready_allowed: false
forbidden_next_actions:
  - owner_exact_head_approval
```

## Audit Before Owner

When audit is required, independent audit completion precedes owner exact-head approval.
When the machine-derived review plan requires additional protected review, that review also precedes owner exact-head approval.
When a PR head changes after audit or owner approval, the old exact-head evidence is no longer final evidence for the new head. Shirube must classify the head-change delta before it can decide whether a full audit, scoped re-audit, or metadata refresh is required.

Audit completion requires all of:

- machine-readable structured audit evidence;
- target repo and PR match the active PR;
- exact head matches the active PR head;
- reviewer actor differs from implementation actor;
- audit source is independent, such as a PR comment, review, or owner-accepted external audit reference;
- verdict is `PASS` or accepted `PASS_WITH_WARN`;
- required checklist items are answered exactly once.

Useful audit prose is not enough unless it is structured and machine-readable. Machine-readable audit is not enough unless it is independent and exact-head bound.
Audit completion is recomputed from observable report fields, structured audit fields, and trusted source provenance. A report's self-asserted `audit_completion.*_matches`, `audit_completion.independent`, or `audit_completion.complete` booleans are not authority.
The trusted source provenance must itself match the active exact head, repo, and PR, and it must bind to the same materialized structured audit path referenced by the audit checklist report. Shirube must not combine independence from one artifact with head/repo/PR claims from an unrelated report.
The audit checklist report must come from the current trusted `check-audit-checklist` execution path. A repo-local or PR-body-referenced `audit_checklist_report_ref` may be displayed and may propagate blockers, but it is not by itself audit-completion evidence.
Comment-backed audit source metadata must come from the trusted structured-audit resolver/base workflow path. A branch-authored `shirube-comment-backed-audit-source/v1` file that only claims `source_type: github_pr_comment` is not independent provenance.
Fields such as `trusted_base_workflow`, `generated_by`, or `resolver_schema` are not authority when they are merely read from a target-branch or PR-body referenced file. The current runner must attach trusted-source context after resolving/fetching the audit source in the report result directory.
Sequencing also recomputes maker/checker separation from the structured audit artifact itself; a checklist report that says PASS cannot override a reviewer/implementation actor match.

## Sequencing Rules

If PR body/control metadata still names the old exact head after rebase or conflict resolution:

- `current_phase: METADATA_REFRESH_REQUIRED`
- `next_action.action: refresh_exact_head_metadata`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`

If the head changed and the delta is metadata-only conflict resolution or active-handoff restoration:

- `current_phase: SCOPED_REAUDIT_REQUIRED`
- `next_action.action: request_scoped_reaudit`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`

Scoped re-audit is only allowed when the previous audited head and current head are known, the delta is available, the functional diff is unchanged or narrowed, no runtime/API/DB/schema/package/lockfile/workflow/permission surface was newly introduced, allowed and forbidden paths still pass, current-head validation has rerun, PR exact-head metadata is current, and the previous audit verdict was `PASS` or accepted `PASS_WITH_WARN`.

If the head changed and functional behavior, package/lockfile state, or protected runtime surfaces changed:

- `current_phase: AUDIT_REQUIRED`
- `next_action.action: request_independent_audit`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`

For `full_reaudit_required`, evidence marked `audit_type: scoped_reaudit` is not sufficient even when it targets the current exact head. The current-head audit evidence must be a full or independent re-audit artifact, such as `audit_type: full_reaudit` or `audit_type: independent_structured_audit`.

If audit is required and not complete:

- `current_phase: AUDIT_REQUIRED`
- `next_action.action: request_independent_audit`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`
- `forbidden_next_actions` includes `owner_exact_head_approval`

If audit is complete and owner decision is missing:

- `current_phase: OWNER_DECISION_REQUIRED`
- `next_action.action: request_owner_exact_head_decision`
- `owner_approval_allowed: true`
- `merge_ready_allowed: false`

If audit is complete but required additional review is missing:

- `current_phase: ADDITIONAL_REVIEW_REQUIRED`
- `next_action.action: request_required_additional_review`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`
- `forbidden_next_actions` includes `owner_exact_head_approval`

If owner exact-head approval appears before required audit completion:

- the report must block with `OWNER-SEQ-001`
- owner approval is not accepted
- merge readiness is not accepted

If owner exact-head approval appears before required scoped re-audit completion:

- the report must block with `HEAD-CHANGE-001`
- owner approval is not accepted
- merge readiness is not accepted

If owner exact-head approval appears before required additional review completion:

- the report must block with `REVIEW-SEQ-001`
- owner approval is not accepted
- merge readiness is not accepted

If audit, required additional reviews, and owner exact-head approval match the current head:

- `current_phase: MERGE_READY`
- `merge_ready_allowed: true`

## YAML Stub Order

For Full Operational YAML stub UX, generate or present the audit stub before the owner decision stub:

1. structured audit response
2. audit source / machine evidence references
3. required additional review evidence, when the review plan requires it
4. owner exact-head decision

The owner decision stub is policy-only until independent audit completion exists. Pending owner files must not synthesize approval.

## Scoped Re-Audit For Head Changes

Rebases and conflict-resolution commits correctly invalidate previous exact-head audit and owner approval. Shirube may allow a scoped re-audit instead of a full audit only for machine-classified metadata-only deltas. The scoped re-audit must still be independent, machine-readable, and exact-head bound to the new current head. It must reference both the previous audited head and the current head so reviewers can verify the delta that was scoped.

The `head_change` report object records:

```yaml
head_change:
  previous_audited_head: <sha>
  current_head: <sha>
  classification: scoped_reaudit_allowed
  functional_diff_changed: false
  metadata_only_conflict_resolution: true
  required_next_action: request_scoped_reaudit
```

Allowed classifications are:

- `full_reaudit_required`
- `scoped_reaudit_allowed`
- `metadata_refresh_required`
- `blocked_unclassified_head_change`

Old audit evidence whose exact head does not match the current PR head must not unlock owner approval or merge readiness by itself.
Scoped re-audit evidence must not unlock owner approval when the head-change classifier says `full_reaudit_required`.

## Non-Scope

This rule does not synthesize owner approval, automatically approve audits, activate required checks, mutate branch protection or rulesets, change runtime behavior, add DB/MCP/AUN runtime integration, or mutate target repositories.
