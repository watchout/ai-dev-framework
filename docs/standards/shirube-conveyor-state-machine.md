# Shirube Conveyor State Machine

`shirube-cell-queue/v1` is the delivery graph that lets Shirube continue after a merge without asking an LLM or operator to infer the next Cell.

The Conveyor reads post-merge evidence, the parent SSOT, and the Cell queue. It can then emit the next machine action:

- `record_post_merge_evidence`
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

`next` verifies the completed PR evidence, marks the completed Cell as merged for selection purposes, and selects exactly one next ready Cell. It does not mutate GitHub.

```bash
shirube conveyor plan --cell-queue .shirube/cell-queue.json --cell-id CELL-ID --format json
```

`plan` emits a handoff draft, audit checklist draft, review plan draft, validation commands, allowed/forbidden paths, and an AUN-compatible Work Order preview.

```bash
shirube conveyor open-pr --cell-queue .shirube/cell-queue.json --cell-id CELL-ID --format json
```

`open-pr` is plan-only in this slice. It emits a draft PR payload and sets `mutation_performed=false`.

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
- complete required inputs: `risk_class`, `cell_type`, `allowed_paths`, `forbidden_paths`, and `expected_outputs`
- no blocked dependency

If multiple Cells are ready, explicit `priority` or `order` is required. Without priority/order, the Conveyor returns `BLOCKED` and `next_action=request_owner_planning_decision`.

## Review Plan Integration

Before a handoff or Work Order is emitted, the Conveyor includes a `review_plan_ref` and generates a draft `shirube-review-plan/v1`. Audit, additional review, and owner exact-head sequencing remain governed by the review plan and the next-action sequencing gates.

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
