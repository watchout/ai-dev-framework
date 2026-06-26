# Shirube Control State Completeness

The Control State Completeness gate verifies whether a Rapid/Lite repository has enough machine-readable Shirube control state to trust later lifecycle, owner, and merge claims.

This gate reconciles state across artifacts. It is not a file-existence check.

## Command

```bash
node scripts/shirube/check-control-state-completeness.mjs \
  --execution-context-report .shirube-rapid-lite/execution-context.json \
  --repo-spec .shirube/repo-spec.yaml \
  --source-mirror .shirube/source-mirrors/control-issue.yaml \
  --adoption-report .shirube-rapid-lite/adoption.json \
  --lifecycle-report .shirube-rapid-lite/lifecycle.json \
  --gate-contract-report .shirube-rapid-lite/gate-contract.json \
  --design-rule-report .shirube-rapid-lite/design-rules.json \
  --audit-checklist-report .shirube-rapid-lite/audit-checklist.json \
  --review-plan-report .shirube-rapid-lite/review-plan.json \
  --enforcement-policy-report .shirube-rapid-lite/enforcement-policy.json \
  --handoff .shirube/control-handoffs/CH-001.yaml \
  --matrix .shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml \
  --changed-files .shirube-rapid-lite/changed-files.txt \
  --validation .shirube/evidence/validation.yaml \
  --owner-decision .shirube/evidence/owner-decision.yaml \
  --audit-record .shirube/audits/AUDIT-001.json \
  --audit-item-set .shirube/audit-item-sets/stage-6-impl-audit.yaml \
  --audit-checklist .shirube/audit-checklists/AUDIT-CHECKLIST-001.yaml \
  --structured-audit .shirube/audits/AUDIT-001.yaml \
  --post-merge .shirube/evidence/post-merge.yaml \
  --format json
```

`BLOCKED` and `CONTROL_BLOCKED` remain report-only when called from `run-rapid-lite-report`; they set `would_block=true` and `owner_must_not_merge=true`.

## Output States

- `CONTROL_COMPLETE`: all required control states are present and mutually consistent.
- `CONTROL_COMPLETE_WITH_WARNINGS`: all hard requirements pass, but warnings need owner review.
- `CONTROL_PARTIAL`: state is machine-readable but incomplete for full trust.
- `CONTROL_BLOCKED`: one or more control-state hard blockers are present.
- `CONTROL_FAILURE`: a report failure or malformed state prevents trust.

## Required Inventory

The gate inventories:

- execution context report, active role, and repo relations;
- RPS / PRS;
- source mirrors;
- adoption, lifecycle, gate-contract, design-rule, audit-checklist, review-plan, enforcement-policy, and readiness reports;
- handoff, allowed paths, forbidden paths, protected surfaces, and required evidence;
- validation evidence, owner exact-head decision, formal audit/reviewer audit when required, post-merge evidence, and open blockers.
- audit checklist report and structured per-item audit response when full operational audit acceptance is requested.

## Cross-Checks

The gate reconciles:

- execution context primary repo against the RPS repo;
- source mirror references against declared control source references;
- work order, PR, and `CELL-ID` across context, handoff, lifecycle, reports, and audit records;
- adoption disposition against lifecycle phase;
- lifecycle phase against gate-contract and design-rule verdicts;
- enforcement policy mode against aggregate/report state;
- changed files against allowed and forbidden paths;
- protected surfaces against the matrix or configured taxonomy;
- required evidence names against concrete evidence refs;
- owner exact-head decision against PR/gate head;
- audit item records against required audit item sets;
- checklist-required audit responses against `shirube-audit-checklist/v1` via `check-audit-checklist`, including independent source provenance and exact-head/repo/PR binding;
- machine-derived `shirube-review-plan/v1` requirements for base audit, additional reviews, and owner-decision prerequisites;
- post-merge evidence before `COMPLETE`;
- full-control claims against full-readiness evidence;
- report failures so they cannot be ignored.

It also emits sequencing fields: `current_phase`, `next_action`, `owner_approval_allowed`, `merge_ready_allowed`, and `forbidden_next_actions`. When audit is required but incomplete, Control State Completeness must make `request_independent_audit` the next action instead of surfacing owner approval as the operator's next step.
An audit checklist report that only self-asserts `audit_completion.complete` or related match booleans is incomplete until the observable audit/report fields and trusted source provenance reconcile.
If an audit source artifact exists but targets a different head, repo, PR, or materialized audit path, the audit remains incomplete and Control State Completeness must block with `CSC-012`.
If a review-plan report requires additional review, Control State Completeness consumes that report and blocks missing or stale additional review evidence with `CSC-018`. It must not infer CTO/security/legal/privacy review requirements from prose; those requirements come from `shirube-review-plan/v1`.

## Hard Block IDs

- `CSC-001 missing_execution_context`
- `CSC-002 missing_rps_or_prs`
- `CSC-003 source_mirror_missing_for_declared_control_source`
- `CSC-004 handoff_missing_or_cell_id_mismatch`
- `CSC-005 allowed_forbidden_paths_missing`
- `CSC-006 protected_surface_not_in_taxonomy`
- `CSC-007 required_evidence_missing_ref`
- `CSC-008 owner_head_mismatch`
- `CSC-009 adoption_lifecycle_mismatch`
- `CSC-010 gate_contract_blocked_but_lifecycle_allows_progress`
- `CSC-011 design_rule_blocked_but_owner_ready_claimed`
- `CSC-012 audit_required_but_missing`
- `CSC-013 audit_item_set_incomplete_or_duplicate`
- `CSC-014 post_merge_required_but_missing`
- `CSC-015 full_control_claim_without_full_readiness`
- `CSC-016 stale_artifact_reference`
- `CSC-017 report_failure_ignored`
- `CSC-018 required_additional_review_missing`

For P0 audit checklist hardening, use the `AUDIT-LIST-*` findings from `check-audit-checklist` as the authoritative itemized audit readiness result. Missing, duplicate, unanswered, or unsupported executable audit items must block full operational audit acceptance even when freeform audit prose says PASS. Control State Completeness consumes `audit-checklist.json` when provided and propagates `AUDIT-LIST-*` blockers instead of converting them into freeform prose.

Owner exact-head approval before required independent audit completion is invalid and blocks with `OWNER-SEQ-001`. The correct next action is independent audit completion for the current exact head. See [Shirube Next-Action Sequencing](shirube-next-action-sequencing.md).
Owner exact-head approval before required additional review completion is invalid and blocks with `REVIEW-SEQ-001`. The correct next action is the review plan's required additional review.

## Runner Integration

`run-rapid-lite-report` runs gates in this visible order:

1. execution-context
2. adoption
3. gate-contract
4. design-rules
5. audit-checklist, when checklist or structured audit refs are present
6. review-plan, when explicit refs or handoff policy require it
7. lifecycle, after gate/audit/review reports are available
8. enforcement-policy, when a policy is present
9. control-state-completeness

Control-state completeness consumes the earlier gate reports and writes `.shirube-rapid-lite/control-state-completeness.json`. Audit checklist and review-plan evidence are conditional for Rapid/Lite: missing checklist/review-plan evidence is only a hard blocker when the handoff, profile, or risk/surface policy requires it.

This gate does not enable required checks, mutate branch protection/rulesets, change runtime behavior, alter package files, change B3 or `shirube-audit/v1`, or mutate external repositories.
