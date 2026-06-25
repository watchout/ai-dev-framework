# Orchestration DB Projection Contract

Status: draft contract

This document defines how Shirube facts can be projected into a future shared orchestration database without making the database mandatory for local Shirube usage.

The canonical interface remains the CLI and local artifacts. The shared DB is a projection for visibility, linking, and orchestration handoff.

## Projection Principle

Projection is additive:

- local Shirube commands continue to work without a DB URL
- `.framework/` and local run state remain valid for standalone mode
- projected rows must be reconstructable from structured Shirube artifacts
- projection must not create new governance authority
- projection must not synthesize owner approval

## Shared Core Contracts

Core schemas:

- `schemas/core/event.v1.schema.json`
- `schemas/core/evidence-ref.v1.schema.json`

Core projection targets:

- `core.events`
- `core.evidence_refs`
- `core.artifact_refs`
- `core.entity_links`
- `core.outbox`

Important event types:

- `ssot.generated`
- `plan.generated`
- `work_order.ready`
- `gate.started`
- `gate.passed`
- `gate.blocked`
- `task.completed`
- `task.failed`

## Shirube Projection Targets

The future shared DB may include these Shirube-owned projection tables:

- `shirube.work_orders`
- `shirube.gate_runs`
- `shirube.acceptance_checks`
- `shirube.delivery_graph_nodes`
- `shirube.delivery_graph_edges`
- `shirube.ssot_refs`
- `shirube.run_state_snapshots`

These tables are projections of Shirube facts. They are not AUN queues and they are not distributed locks.

## Work Order Projection

`shirube.work_orders` should be populated from `shirube-work-order/v1`:

| Column | Source |
|---|---|
| `work_order_id` | `work_order_id` |
| `status` | `status` |
| `repo_full_name` | `repo.full_name` |
| `head_sha` | `repo.head_sha` |
| `cell_id` | `cell.cell_id` |
| `spec_id` | `cell.spec_id` |
| `impl_id` | `cell.impl_id` |
| `risk_tier` | `cell.risk_tier` |
| `cell_type` | `cell.cell_type` |
| `allowed_paths` | `task.allowed_paths` |
| `forbidden_paths` | `task.forbidden_paths` |
| `required_evidence` | `task.required_evidence` |
| `owner_actor` | `authority.owner_actor` |
| `owner_decision_required` | `authority.owner_decision_required` |
| `exact_head_required` | `authority.exact_head_required` |
| `framework_ref` | `refs.framework_ref` |
| `handoff_ref` | `refs.handoff_ref` |
| `repo_spec_ref` | `refs.repo_spec_ref` |

## Work Result Projection

`shirube.work_results` or an equivalent result projection should be populated from `shirube-work-result/v1`:

| Column | Source |
|---|---|
| `work_result_id` | `work_result_id` |
| `work_order_id` | `work_order_id` |
| `status` | `status` |
| `repo_full_name` | `repo.full_name` |
| `head_sha` | `repo.head_sha` |
| `executor_system` | `executor.system` |
| `executor_actor` | `executor.actor` |
| `summary` | `summary` |
| `failure_code` | `failure.code` |
| `started_at` | `started_at` |
| `finished_at` | `finished_at` |

## Evidence Projection

`core.evidence_refs` should use `core-evidence-ref/v1`.

Expected evidence kinds include:

- `audit_result`
- `acceptance_check_result`
- `context_pack`
- `restart_recovery`
- `validation_result`
- `gate_report`
- `owner_decision`
- `work_result`
- `post_merge`

Kodama context packs and Kusabi restart/recovery artifacts are attached as evidence refs. Shirube does not take ownership of Kodama retrieval or Kusabi recovery state.

## Event Projection

`core.events` should use `core-event/v1`.

For a ready Work Order, emit:

```json
{
  "schema_version": "core-event/v1",
  "event_type": "work_order.ready",
  "aggregate": {
    "type": "work_order",
    "id": "WO-..."
  }
}
```

For completed or failed work, emit `task.completed` or `task.failed` and attach the related `shirube-work-result/v1` evidence.

## Opt-In Runtime

This contract does not require DB runtime now.

A future runtime projection adapter may be enabled by explicit environment/config such as:

- `SHIRUBE_ORCHESTRATION_DB_URL`
- `SHIRUBE_ORCHESTRATION_PROJECTION=enabled`

When unset, local CLI behavior must remain unchanged.

## Non-Scope

This contract does not implement:

- database migrations
- DB connection code
- job queue ownership
- distributed locks
- branch protection or ruleset changes
- required check activation
- target repository mutation
- AUN-specific migration
- agent-mem-specific migration
- root `.shirube` upgrade engine
