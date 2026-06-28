# Shirube Review Plan

`shirube-review-plan/v1` is the machine-derived source for audit and additional-review sequencing.

LLMs may propose Cell count and implementation order. They must not decide the audit flow, additional review requirements, or owner-approval order from prose. Operators and LLMs must follow the `review_plan` and the gate `next_action`.

## Layers

Standard independent structured audit is the base Shirube operational audit. It verifies exact head, scope, allowed and forbidden paths, validation evidence, maker/checker separation, and reporting honesty. It is not CTO, security, legal, privacy, or CEO review.

Additional protected review is required only when machine policy derives it from `risk_class`, `cell_type`, `protected_surfaces`, changed paths, and repo policy. Free text such as `cto_review_question` is explanatory only and is not authority.

Required additional review completion is evidence-bound. A branch-supplied `shirube-additional-review/v1` file is not sufficient by itself, even when it contains PASS. The review must reconcile with trusted resolver provenance from the current runner, exact head, repo, PR, materialized path, and maker/checker separation.

## Sequencing

When `base_audit.required=true` and audit is incomplete:

- `current_phase: AUDIT_REQUIRED`
- `next_action.action: request_independent_audit`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`

When base audit is complete but required additional review is incomplete:

- `current_phase: ADDITIONAL_REVIEW_REQUIRED`
- `next_action.action: request_required_additional_review`
- `owner_approval_allowed: false`
- `merge_ready_allowed: false`

When base audit and all required additional reviews are complete but owner decision is missing:

- `current_phase: OWNER_DECISION_REQUIRED`
- `next_action.action: request_owner_exact_head_decision`
- `owner_approval_allowed: true`
- `merge_ready_allowed: false`

Owner approval before required audit completion blocks with `OWNER-SEQ-001`. Owner approval before required additional review completion blocks with `REVIEW-SEQ-001`.

## Policy

R0/R1 docs-only or docs-contract work receives the standard structured audit with the `docs_light` checklist profile. Additional protected review is not required by default.

R2 runtime foundation or policy foundation work receives the standard structured audit and additional technical-owner review when runtime, policy, permissions, database, workflow, auth, API, or external surfaces are present.

R3/R4 or protected/security/legal/privacy work receives the standard structured audit and additional protected review based on detected surfaces.

The owner exact-head decision is allowed only after all prerequisites listed in `owner_decision.allowed_after` are complete.

## Commands

Generate a plan:

```bash
node scripts/shirube/build-review-plan.mjs \
  --handoff .shirube/control-handoff.yaml \
  --changed-files changed-files.txt \
  --out .shirube/review-plan.json \
  --format json
```

Check a plan and sequence state:

```bash
node scripts/shirube/check-review-plan.mjs \
  --handoff .shirube/control-handoff.yaml \
  --review-plan .shirube/review-plan.json \
  --audit-checklist-report .shirube-rapid-lite/audit-checklist.json \
  --additional-review .shirube-rapid-lite/additional-reviews/01-technical-owner-review.yaml \
  --additional-review-source .shirube-rapid-lite/additional-review-source.json \
  --trusted-additional-review-source \
  --owner-decision .shirube/evidence/owner-decision.json \
  --actual-head "$HEAD_SHA" \
  --format json
```

## Non-Scope

The review plan does not synthesize owner approval, approve audits automatically, activate required checks, mutate branch protection or rulesets, mutate target repositories, add DB/MCP/AUN runtime behavior, or change runtime/product behavior.
