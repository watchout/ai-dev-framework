# Shirube Rapid Delivery Accelerator

Rapid Delivery Accelerator makes Rapid/Lite faster without weakening exact-head control. It separates four units that were previously easy to conflate:

- Cell: design and control unit.
- PR unit: delivery container, which may cover one or more Cells.
- Audit unit: verification unit for one exact PR head.
- Owner decision: final authority for one exact PR head.

Rapid/Lite is not `1 PR = 1 Cell`. A Goal may contain many Cells, and one PR may deliver multiple Cells when policy says the batch is safe.

## Cell Batch Policy

`shirube-cell-batch-policy/v1` decides whether multiple Cells may be delivered in one PR unit.

Batching is allowed only when all of these are true:

- same repository
- same parent SSOT
- same owner
- dependencies are satisfied
- risk is `R0` or `R1`, unless a later approved policy explicitly marks the Cell batchable
- Cell type is low risk, such as `docs_only`, `docs_contract`, `metadata_only`, `evidence_completion`, or `source_ledger`
- no runtime, API, DB, migration, package, lockfile, workflow, branch protection, ruleset, permission, security, privacy, legal, or protected surface is introduced
- allowed paths and forbidden paths can be unioned safely
- one review plan can cover the combined PR unit
- one audit checklist can cover all included Cells

Batching is blocked when risk, ownership, dependency, path, or protected-surface policy is ambiguous. If multiple ready Cells cannot be safely batched and no priority/order exists, Shirube returns `request_owner_planning_decision` instead of letting an LLM choose silently.

## Audit Unit

`shirube-audit-unit/v1` represents one exact-head audit target for one PR. It may cover multiple Cells.

Rules:

- The audit unit is bound to `target_pr` and `exact_head_sha`.
- `covered_cells` lists every Cell delivered by the PR unit.
- The checklist must answer common exact-head scope items and every Cell-specific required item.
- Owner approval remains per PR exact head, not per Cell.
- If any included Cell requires a stricter review plan, the whole PR unit inherits that stricter plan.

The audit unit does not synthesize audit evidence. It only defines what the independent audit must cover.

## Scoped Re-Audit

Rebases and conflict-resolution commits correctly invalidate old exact-head audit and owner approval. Shirube may permit scoped re-audit only after machine classification.

Classifications:

- `metadata_refresh_required`
- `scoped_reaudit_allowed`
- `full_reaudit_required`
- `blocked_unclassified_head_change`

Scoped re-audit is allowed only when the previous audited head, current head, current PR exact-head metadata, changed delta, current validation, and previous PASS/PASS_WITH_WARN audit are all present, and the delta is metadata-only or active handoff restoration only.

Even when scoped re-audit is allowed, owner approval and merge readiness remain blocked until a new exact-head scoped re-audit is completed for the current head. Old audit evidence is context, not final evidence for the new head.

Full re-audit is required when functional behavior or protected surfaces change, including runtime/API/DB/schema/package/lockfile/workflow/permission surfaces.

## Conveyor Integration

`shirube conveyor plan` emits PR units and audit units. It must not assume one PR per Cell.

`shirube conveyor next` selects the next PR unit after post-merge evidence, not just the next Cell.

`shirube conveyor open-pr` may emit a draft PR plan for a PR unit that covers multiple Cells. It remains plan-only/report-only unless a later approved slice explicitly enables guarded mutation.

`shirube audit-unit build` builds an audit unit for one exact PR head.

`shirube re-audit classify` classifies head changes after rebase or conflict resolution.

## Prohibited Behavior

Rapid Delivery Accelerator must not:

- synthesize independent audit
- synthesize owner approval
- auto-merge
- activate required checks
- mutate branch protection or rulesets
- mutate AUN queues
- add DB, MCP, or runtime orchestration
- bypass review-plan policy
- bypass next-action sequencing

Codex goal mode may propose Cells and batch candidates. Shirube decides `batch_allowed`, review plan, audit unit, and next action.
