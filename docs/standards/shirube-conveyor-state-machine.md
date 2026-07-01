# Shirube Conveyor State Machine

`shirube-cell-queue/v1` is the delivery graph that lets Shirube continue after a merge without asking an LLM or operator to infer the next delivery step.

The Conveyor reads post-merge evidence, the parent SSOT, and the Cell queue. It selects the next PR unit, which may cover one or more Cells when the Rapid Delivery Accelerator batch policy allows it. It can then emit the next machine action:

- `record_post_merge_evidence`
- `open_next_pr_unit`
- `open_next_cell_pr`
- `export_work_order_for_aun`
- `request_owner_planning_decision`
- `resolve_blocked_dependency`
- `update_cell_queue`

## Commands

```bash
shirube conveyor next \
  --parent-ssot owner/repo#123 \
  --repo owner/repo \
  --after-merge-pr 205 \
  --merge-commit <sha> \
  --cell-queue .shirube/cell-queue.json \
  --post-merge-evidence .shirube/post-merge.json \
  --format json
```

`next` verifies the completed PR evidence, marks the completed Cell as merged for selection purposes, and selects exactly one next PR unit. A PR unit can contain multiple Cells when the batch policy is satisfied. It does not mutate GitHub.

```bash
shirube conveyor plan --cell-queue .shirube/cell-queue.json --cell-id CELL-ID --format json
```

`plan` emits a handoff draft, audit checklist draft, review plan draft, validation commands, allowed/forbidden paths, and an AUN-compatible Work Order preview. When `--cell-id` is omitted, it emits a delivery plan with PR units and audit units instead of assuming one PR per Cell.

```bash
shirube conveyor open-pr --cell-queue .shirube/cell-queue.json --cell-id CELL-ID --format json
```

`open-pr` is plan-only in this slice. It emits a draft PR payload for a Cell or PR unit and sets `mutation_performed=false`.

```bash
shirube conveyor export-work-order --cell-queue .shirube/cell-queue.json --cell-id CELL-ID --format json
```

`export-work-order` emits `shirube-work-order/v1` for AUN-compatible consumption. Shirube does not mutate AUN queues.

```bash
shirube conveyor record-post-merge \
  --repo owner/repo \
  --pr 205 \
  --merged-head <sha> \
  --merge-commit <sha> \
  --merged-at <iso> \
  --post-merge-smoke-or-na PASS \
  --next-step select_next_cell \
  --format json
```

`record-post-merge` records post-merge evidence and can write it to a local file. It does not claim Cell Done if unresolved follow-up blockers remain.

## Queue Selection

The Conveyor only selects Cells with:

- `status: ready_for_implementation`
- all `depends_on` Cells completed as `merged` or `skipped`
- complete Cell definition inputs: `goal`, `acceptance_criteria`, `non_scope`,
  `risk_class`, `cell_type`, `allowed_paths`, `forbidden_paths`,
  `expected_outputs`, `implementation_pr_plan`, `validation_plan`,
  `audit_checklist_ref`, and `close_condition`
- no blocked dependency

Small Cells may use `implementation_pr_plan.mode: single_pr`, but the plan must
still declare the single PR role and whether it `completes_cell`. Larger Cells
must use `mode: multi_pr` and list the planned PR stages before implementation
starts, such as schema/types, CLI dry-run, tests/evidence, docs/runbook,
activation, or post-merge evidence completion.

The Conveyor treats PR merge and Cell close separately. A PR may complete a
stage, but Cell close requires every planned PR stage to be merged or explicitly
skipped, every acceptance criterion to be satisfied, post-merge evidence to be
recorded, and any required Cell-level audit or owner approval to be complete.

If multiple Cells are ready, the Conveyor first runs the Rapid Delivery Accelerator batch policy. Safe low-risk docs/metadata/evidence Cells can become one PR unit and one audit unit. If batching is not allowed, explicit `priority` or `order` is required. Without priority/order, the Conveyor returns `BLOCKED` and `next_action=request_owner_planning_decision`.

## Rapid Delivery Units

Shirube separates the delivery units:

- Cell: design/control unit.
- PR unit: delivery container that may cover one or more Cells.
- Audit unit: verification unit for one exact PR head.
- Owner decision: final authority for one exact PR head.

`1 PR = 1 Cell` is not a Shirube invariant. The invariant is that every PR unit has a machine-derived review plan, exact-head audit unit, and owner decision sequence.

## Review Plan Integration

Before a handoff, PR unit, audit unit, or Work Order is emitted, the Conveyor includes a `review_plan_ref` and generates a draft `shirube-review-plan/v1`. Audit, additional review, and owner exact-head sequencing remain governed by the review plan and the next-action sequencing gates.

## Prohibited Behavior

The Conveyor must not:

- synthesize independent audit
- synthesize owner approval
- merge PRs
- change required checks
- mutate branch protection or rulesets
- mutate AUN queues
- bypass `review_plan`
- bypass next-action sequencing

Human intervention is required only for ambiguity, audit, additional review, owner approval, merge, or blocked dependency resolution.
