# Shirube Cell Semantics Gate

Shirube Cell semantics make the front side of Rapid/Lite script-controlled:

- LLM proposes.
- Script decides.
- Gate enforces.
- Owner approves.

This gate is intentionally smaller than the Rapid Delivery Accelerator. It does not implement delivery waves, batching, audit units, merge queues, or automatic PR creation. It controls the metadata required before those larger accelerators can be safe.

## Cell And PR Meaning

A Cell is a meaningful outcome unit. A PR is a delivery container.

A Cell may span multiple PR stages, including `route_metadata`, `implementation`, `verification`, `docs`, `evidence_completion`, `canary`, `activation`, and `post_merge`.

A PR merge is not Cell completion unless the PR declares `completes_cell: true` and all required Cell stages and post-merge evidence are complete.

## Implementation PR Plan

Every Cell must declare an `implementation_pr_plan` before implementation
starts. The plan makes the User view and GitHub view explicit:

- User view: one Cell is being advanced.
- GitHub view: one or more PRs implement planned Cell stages.

Small Cells may declare `mode: single_pr` with exactly one planned PR. Large
Cells must declare `mode: multi_pr` and list each PR stage before the first
implementation PR opens.

```yaml
implementation_pr_plan:
  mode: single_pr
  prs:
    - id: PR-A
      pr_role: implementation_pr
      title: Implement the Cell in one PR
      completes_cell: true
```

For multi-PR Cells, planned PR roles should map to concrete stage work such as
schema/types, CLI dry-run, tests/evidence, docs/runbook, activation, or
post-merge evidence completion. The Cell close condition remains separate from
individual PR merge.

## Machine Ref Rule

Machine ref fields must be absent until they contain a real repo-local path or comment URL.

Invalid placeholder values include:

- `pending`
- `TBD`
- `TODO`
- `none`
- `null`
- `n/a`
- `<pending>`
- `<fill-me>`
- `external-owner-final-decision-required`
- `pending-owner-final-decision`

If a machine ref field contains a placeholder, `check-pr-body-metadata.mjs` emits `METADATA-REF-001`, sets `current_phase=METADATA_REFRESH_REQUIRED`, and sets `next_action=remove_placeholder_machine_refs`.

Pending evidence belongs in prose, not in machine ref fields. Missing audit evidence remains a clean audit state: `AUDIT_REQUIRED` with `next_action=request_independent_audit`.

## Cell Lifecycle

`shirube-cell-lifecycle/v1` defines the current Cell stage:

```yaml
cell_lifecycle:
  schema_version: shirube-cell-lifecycle/v1
  cell_id: CELL-EXAMPLE-001
  cell_goal: Implement and verify one meaningful outcome.
  stage: route_metadata
  stage_order: 1
  completes_cell: false
  next_stage: implementation
  next_expected_action: open_implementation_pr_for_same_cell
  next_expected_command: example command --dry-run --json
  cell_completion_definition: The outcome is implemented, verified, audited, merged, and post-merge evidence is recorded.
```

When `completes_cell=false`, reports must keep:

- `cell_complete=false`
- `next_cell_selection_allowed=false`
- `same_cell_continuation_required=true`
- `next_stage=<declared stage>`

## PR Role

`shirube-pr-role/v1` declares what the PR is doing for the Cell:

```yaml
pr_role:
  schema_version: shirube-pr-role/v1
  role: route_metadata_pr
  completes_cell: false
  expected_next_action: open_implementation_pr_for_same_cell
  expected_next_stage: implementation
```

`route_metadata_pr` creates or updates handoff, checklist, evidence, or route metadata for a later implementation stage. It does not complete the Cell by default.

`ref_update_pr` updates metadata or pinned refs. It must not claim runtime/product Cell completion.

The current `pr_role.role` must appear in `implementation_pr_plan.prs`. A
`single_pr` plan must contain exactly one planned PR; a `multi_pr` plan may
contain multiple planned PRs, but each planned PR must declare `pr_role`,
`title`, and `completes_cell`.

## Audit Format

Structured audit item results are strict:

- `PASS`
- `FAIL`
- `N/A`
- `UNVERIFIED`

`PASS_WITH_WARN` is allowed only at audit or aggregate level, not as an item result. Warning details belong in `notes` or audit-level warnings.

Legacy `checklist_results` must be normalized safely to `items[]` or blocked once with `AUDIT-FORMAT-001`. One root format issue must not expand into many `AUDIT-LIST-004` unanswered-item blockers.

## Route Metadata Profile

For route metadata PRs:

- exact-head audit remains required before PR merge
- owner exact-head decision remains required after audit and required reviews
- no runtime/API/DB/package/live execution is allowed
- `completes_cell=false`
- `next_stage=implementation`
- `next_expected_action=open_implementation_pr_for_same_cell`

After a route metadata PR merges, Conveyor records stage completion only. It must continue the same Cell and must not silently select a different Cell.

## Non-Scope

This gate does not add:

- Cell batching
- Audit Unit composition
- Delivery Wave planning
- merge queue automation
- audit synthesis
- owner approval synthesis
- automatic merge
- required check activation
- branch protection or ruleset mutation
- DB, MCP, or AUN runtime behavior
