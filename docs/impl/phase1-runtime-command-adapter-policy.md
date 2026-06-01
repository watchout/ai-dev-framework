---
id: IMPL-RUNTIMEADAPTER-240
status: Draft
traces:
  spec: [SPEC-RUNTIMEADAPTER-240]
  verify: [VERIFY-RUNTIMEADAPTER-240]
  ops: [OPS-RUNTIMEADAPTER-240]
---

# IMPL: Runtime Command Adapter and Injection Policy Pack

## 0. Corresponding SPEC
`docs/spec/phase1-runtime-command-adapter-policy.md` /
SPEC-RUNTIMEADAPTER-240.

## 1. Implementation Slices

### Slice A: Runtime Evidence Kinds
Add workflow evidence kinds for:

- `runtime_adapter`;
- `injection_policy`;
- `runtime_step`.

These evidence records are local deterministic records. They do not execute a
runtime and do not grant approval authority.

### Slice B: Local Artifact Readers
Read the first non-empty local runtime records from:

- `.framework/runtime-command-adapter.json`;
- `.framework/runtime-adapter.json`;
- `.framework/runtime/adapter.json`;
- `.framework/runtime/adapters.json`;
- `.framework/delivery-graph/runtime-command-adapter.json`;
- `.framework/injection-policy-pack.json`;
- `.framework/injection-policy.json`;
- `.framework/runtime/injection-policy-pack.json`;
- `.framework/delivery-graph/injection-policy-pack.json`;
- `.framework/delivery-graph-step.json`;
- `.framework/runtime-step.json`;
- `.framework/runtime/step.json`;
- `.framework/delivery-graph/step.json`.

JSON root objects are accepted directly. Root wrappers such as `adapter`,
`runtime_adapter`, `policy`, `injection_policy`, `step`, and `steps[]` are
accepted for migration flexibility.

### Slice C: Adapter Validation
Validate `runtime-command-adapter/v1` fields:

- adapter id;
- runtime enum;
- feature detection enum;
- argv, stdin mode, output mode, and optional final schema ref;
- Codex and Claude recommended CLI flags and required values where the runtime
  is explicit;
- permission profile sandbox and env allowlist;
- optional tool allowlists/disallowlists;
- evidence mapping for argv, runtime version, schema hash, final result, and
  gate decision.

The validator rejects text output for strict gate/state advancement.

### Slice D: Injection Policy Validation
Validate `injection-policy-pack/v1` fields:

- policy id;
- trusted instruction sources;
- trusted policy sources;
- untrusted context sources;
- prompt assembly rules;
- `no-untrusted-interpolation` shell interpolation policy;
- output validation with required schema, fail-on-schema-mismatch, and no text
  fallback.

Untrusted `context`, `tool_output`, and `retrieved_source` segments cannot be
delivered as `instruction`.

### Slice E: Delivery Graph Step Validation
Validate step runtime binding fields:

- step id;
- position;
- runtime adapter ref;
- injection policy ref;
- expected result schema;
- write scope;
- evidence sink;
- fallback behavior for timeout, non-zero exit, and schema mismatch.

The step validator cross-checks adapter and policy ids, blocks final schema
mismatch, and enforces least-privilege sandbox/write-scope compatibility for
`none`, `read-only`, `workspace-write`, `repo-write`, and `host-specific`
write scopes.

### Slice F: Workflow Check Surface
Add `runtime_step` to `workflow check --action`.

Scoped rules:

- `G20.runtime_step.adapter.present`;
- `G20.runtime_step.injection_policy.present`;
- `G20.runtime_step.step_contract.present`;
- `G20.runtime_step.adapter.contract`;
- `G20.runtime_step.shell_interpolation`;
- `G20.runtime_step.injection_policy.contract`;
- `G20.runtime_step.step_contract.shape`;
- `G20.runtime_step.output_schema`;
- `G20.runtime_step.permission_scope`.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-runtime-command-adapter-policy.md`;
- `docs/impl/phase1-runtime-command-adapter-policy.md`;
- `docs/verify/phase1-runtime-command-adapter-policy.md`;
- `docs/ops/phase1-runtime-command-adapter-policy.md`;
- `docs/spec/phase1-enterprise-delivery-graph.md`;
- `docs/impl/phase1-enterprise-delivery-graph.md`;
- `docs/ops/phase1-enterprise-delivery-graph.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- `runtime_step` is a new action scope and must not change pass/fail behavior
  for existing action scopes.
- Missing runtime adapter records may add WARN/BLOCK decisions to whole-state
  observability, but only `runtime_step` consumes the new G20 rules.
- Existing `implementation_start`, `phase_closure`, `audit_ledger`, `merge`,
  and `release` scopes retain their current rule lists.
- Runtime validation remains read-only. It must not execute commands, mutate
  `.framework`, update GitHub, or infer approvals from runtime output.
- Strict mode may BLOCK runtime execution readiness, but it does not claim
  Phase 1 or enterprise readiness.

## 4. Future Integration
#226 should map `runtime_step` into the action registry and define diagnostic,
enforcement, and injection wrapper semantics for G20.

#227 should consume `runtime_step` before local/script-controlled chain
execution.

Later Delivery Graph runner slices should attach the final structured runtime
result to AI Change Record, audit ledger, GitHub projection, and post-merge
verification evidence.
