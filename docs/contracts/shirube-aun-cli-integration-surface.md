# Shirube / AUN CLI Integration Surface

Status: draft contract

This document defines the minimal public CLI surface that Shirube exposes before Rapid/Lite distribution so AUN can integrate without reading `.framework/` internals or relying on private Shirube files.

## Commands

Canonical local commands:

```sh
shirube work-order export --format json
shirube work-order validate --file work-order.json --format json
shirube work-result validate --file work-result.json --work-order work-order.json --format json
shirube work-result import --file work-result.json --work-order work-order.json --format json
```

The CLI is the stable integration boundary. MCP, if added later, must be a thin adapter over this CLI rather than a separate implementation.

## Ownership Boundary

Shirube owns:

- Work Orders
- gates
- audit and checklist requirements
- acceptance criteria
- allowed and forbidden paths
- risk tier
- owner exact-head requirements
- evidence references

AUN owns:

- runtime execution
- queue state
- conversation state
- baton delivery
- executor run identity
- runtime evidence production

Shirube does not mutate AUN queues. AUN does not own Shirube gates, owner decisions, or audit acceptance.

## Work Order Export

`shirube work-order export` emits `shirube-work-order/v1` JSON. It is dry-run/no-mutation by default and may additionally write the same JSON to `--out`.

The exported envelope includes:

- `work_order_id`
- `idempotency_key`
- `source.repo`
- `source.ref`
- `source.commit`
- `refs.framework_ref`
- `target.package`
- `target.capability`
- `cell.risk_tier`
- `task.scope`
- `task.non_scope`
- `task.allowed_paths`
- `task.forbidden_paths`
- `task.acceptance_criteria`
- `task.required_commands`
- `context_refs`
- `evidence_refs`
- `authority.owner_decision_required`
- `authority.exact_head_required`
- `handoff_boundary`

When `--target-package aun` is used, AUN can consume the JSON without parsing Shirube repo-local internals.

## Work Order Validation

`shirube work-order validate` validates `shirube-work-order/v1` JSON and returns a report-only JSON verdict:

- `PASS`
- `PASS_WITH_WARN`
- `BLOCKED`
- `FAILURE`

It does not require a DB URL and does not require the AUN package.

## Work Result Validation

`shirube work-result validate` validates `shirube-work-result/v1` JSON.

When `--work-order` is supplied, it also checks:

- `work_order_id` matches
- `idempotency_key` matches
- result repo matches the Work Order repo

It checks evidence reference shape but does not inspect AUN queue internals.

## Work Result Import

`shirube work-result import` is initially report-only/dry-run.

It validates the Work Result, returns an import report, and explicitly reports:

- `imported: false`
- `aun_state_mutated: false`
- `db_required: false`
- `owner_approval_synthesized: false`

This preserves the boundary: AUN may return a structured result, but Shirube does not mutate AUN state or synthesize approval from that result.

## Shared DB And MCP

Shared DB projection is a later optional projection layer. It must not become mandatory for local CLI use.

MCP is a later adapter over the CLI. It must not define a competing Work Order or Work Result implementation.

## Non-Scope

This CLI surface does not add:

- AUN queue mutation from Shirube
- AUN runtime execution
- mandatory shared DB mode
- DB migrations
- DB connection code
- MCP implementation
- distributed locks
- runtime restart/session recovery
- required check activation
- branch protection or ruleset mutation
- owner approval synthesis
- legacy migration
- full-overlay reconcile
