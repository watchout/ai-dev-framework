# Shirube / AUN Work Order Contract

Status: draft contract

This contract defines the machine-readable envelope that Shirube can hand to AUN without requiring AUN to parse `.framework/` internals or human PR text.

The contract is intentionally small. Shirube remains the owner of SSOT, Work Orders, delivery graph, gates, audit, acceptance checks, and stop reasons. AUN may execute or coordinate work from this envelope, but AUN does not become the owner of Shirube governance state.

## Canonical Artifacts

- Work Order schema: `schemas/shirube/work-order.v1.schema.json`
- Work Result schema: `schemas/shirube/work-result.v1.schema.json`
- Evidence reference schema: `schemas/core/evidence-ref.v1.schema.json`
- Event schema: `schemas/core/event.v1.schema.json`
- Ready fixture: `fixtures/orchestration/shirube-work-order.ready-for-aun.json`
- Result fixtures:
  - `fixtures/orchestration/aun-work-result.completed.json`
  - `fixtures/orchestration/aun-work-result.failed.json`

## Boundary

Shirube owns:

- Work Order identity and scope
- Cell / Spec / Impl references
- risk tier
- allowed and forbidden paths
- validation commands and evidence requirements
- owner exact-head policy
- LLM non-authority policy
- audit and acceptance evidence requirements

AUN may own:

- executor identity
- queue or dispatch state outside Shirube
- run id
- completion or failure result envelope
- runtime logs referenced as evidence

AUN must not infer governance approval from prose. Owner approval, audit evidence, validation evidence, and post-merge evidence must be referenced through structured fields.

## Work Order Lifecycle

The `shirube-work-order/v1` envelope is ready for AUN when:

- `status` is `READY_FOR_AUN`
- `repo.full_name` is concrete
- `cell.cell_id` and `cell.risk_tier` are concrete
- `task.allowed_paths` and `task.forbidden_paths` are concrete
- `task.required_evidence` includes machine-readable evidence names
- `authority.llm_final_authority_allowed` is `false`
- `authority.owner_decision_required` and `authority.exact_head_required` describe merge authority
- `refs.framework_ref`, `refs.repo_spec_ref`, and `refs.handoff_ref` are concrete

The envelope can be projected to a shared DB later, but DB projection is not required for local CLI use.

## Work Result Contract

AUN or another executor returns `shirube-work-result/v1`.

Required result facts:

- `work_result_id`
- `work_order_id`
- `status`
- `repo.full_name`
- `executor.system`
- `executor.actor`
- `summary`
- `started_at`
- `finished_at`

For `COMPLETED`, result evidence should include validation or work-result evidence references. For `FAILED`, the `failure` object is required and must contain a machine-readable code, message, retryability, and required next actions when available.

## Evidence References

Use `core-evidence-ref/v1` for references to:

- audit result
- acceptance check result
- Kodama `context-pack/v1`
- Kusabi restart/recovery evidence
- validation result
- gate report
- owner decision
- work result
- post-merge evidence

Evidence references point to authoritative artifacts. They are not the authority by themselves.

## Validators

Use the local report-only validators:

```sh
node scripts/shirube/validate-work-order.mjs \
  --file fixtures/orchestration/shirube-work-order.ready-for-aun.json \
  --format json

node scripts/shirube/validate-work-result.mjs \
  --file fixtures/orchestration/aun-work-result.completed.json \
  --work-order fixtures/orchestration/shirube-work-order.ready-for-aun.json \
  --format json
```

The validators do not require a database URL. They do not dispatch work, mutate target repositories, or synthesize owner approval.

## Non-Scope

This contract does not add:

- shared DB runtime requirement
- Shirube-owned queue
- distributed lock ownership
- runtime restart/session recovery
- target repository mutation
- required check activation
- branch protection or ruleset mutation
- AUN-specific migration
- agent-mem-specific migration
- root `.shirube` upgrade engine
