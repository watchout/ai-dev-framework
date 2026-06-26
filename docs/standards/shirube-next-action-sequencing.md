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

## Sequencing Rules

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

## Non-Scope

This rule does not synthesize owner approval, automatically approve audits, activate required checks, mutate branch protection or rulesets, change runtime behavior, add DB/MCP/AUN runtime integration, or mutate target repositories.
