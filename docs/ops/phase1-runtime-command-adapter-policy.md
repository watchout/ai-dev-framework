---
id: OPS-RUNTIMEADAPTER-240
status: Draft
traces:
  spec: [SPEC-RUNTIMEADAPTER-240]
  impl: [IMPL-RUNTIMEADAPTER-240]
  verify: [VERIFY-RUNTIMEADAPTER-240]
---

# OPS: Runtime Command Adapter and Injection Policy Pack

## 0. Corresponding SPEC
`docs/spec/phase1-runtime-command-adapter-policy.md` /
SPEC-RUNTIMEADAPTER-240.

## 1. Operator Flow
1. Choose the Delivery Graph step to execute.
2. Create or select a `work-order/v1` request envelope for the dispatch, or
   record why the warning-first Work Order gate is not applicable yet.
3. Create or select a `runtime-command-adapter/v1` profile for the target
   runtime.
4. Create or select an `injection-policy-pack/v1` profile for the trust
   boundary.
5. Create a Delivery Graph step runtime binding that names adapter, policy,
   expected result schema, write scope, evidence sink, and fallback behavior.
6. Run `shirube workflow check --action work_order --profile strict --json`.
7. If the step consumes a Kodama context pack, run
   `shirube workflow check --action context_pack --profile strict --json`.
8. Run `shirube workflow check --action runtime_step --profile strict --json`.
9. Execute the runtime only after Work Order warnings are dispositioned and
   G9/G20 rules pass.
10. Validate the final structured output against the expected schema before
   updating graph state, gate state, PR/issue state, audit ledger, or merge
   authority.

## 2. Minimal Codex Adapter
```json
{
  "adapter_id": "codex-jsonl-readonly-v1",
  "runtime": "codex",
  "feature_detection": ["jsonl_stream", "json_schema_final", "tool_allowlist", "sandbox"],
  "invocation_template": {
    "argv": [
      "codex",
      "exec",
      "--json",
      "--output-schema",
      ".framework/runtime/schemas/l1-audit-result-v1.schema.json",
      "--output-last-message",
      ".framework/runtime/results/last-message.json",
      "--sandbox",
      "read-only",
      "--cd",
      "."
    ],
    "stdin_mode": "context-pack",
    "output_mode": "jsonl",
    "final_schema_ref": "l1-audit-result-v1"
  },
  "permission_profile": {
    "sandbox": "read-only",
    "allowed_tools": ["read", "rg", "sed"],
    "disallowed_tools": ["write", "network"],
    "env_allowlist": ["CI"]
  },
  "evidence_mapping": {
    "argv": "runtime_invocation.argv",
    "runtime_version": "runtime_invocation.version",
    "schema_hash": "runtime_invocation.schema_hash",
    "final_result": "runtime_result.final",
    "gate_decision": "gate_decision"
  }
}
```

## 3. Minimal Injection Policy
```json
{
  "policy_id": "strict-enterprise-v1",
  "trusted_instruction_sources": ["system", "developer", "spec_owner"],
  "trusted_policy_sources": ["docs/spec", "docs/ops", ".framework/policy-pack.json"],
  "untrusted_context_sources": [
    "github_issue_title",
    "github_issue_body",
    "github_comment",
    "pull_request_body",
    "tool_output",
    "retrieved_source"
  ],
  "prompt_assembly_rules": [
    {
      "segment": "system",
      "allowed_origin": ["system"],
      "delivery": "instruction"
    },
    {
      "segment": "developer",
      "allowed_origin": ["developer", "docs/spec"],
      "delivery": "instruction"
    },
    {
      "segment": "context",
      "allowed_origin": ["github_issue_body", "pull_request_body"],
      "delivery": "data-only"
    },
    {
      "segment": "tool_output",
      "allowed_origin": ["tool_output"],
      "delivery": "data-only"
    },
    {
      "segment": "retrieved_source",
      "allowed_origin": ["retrieved_source"],
      "delivery": "citation-only"
    }
  ],
  "shell_interpolation_policy": "no-untrusted-interpolation",
  "output_validation": {
    "required_schema": true,
    "fail_on_schema_mismatch": true,
    "allow_text_fallback": false
  }
}
```

## 4. Minimal Step Binding
```json
{
  "step_id": "PR-123.L1_AUDIT",
  "position": "L1_REVIEWER",
  "runtime_adapter": "codex-jsonl-readonly-v1",
  "injection_policy": "strict-enterprise-v1",
  "expected_result_schema": "l1-audit-result-v1",
  "write_scope": "none",
  "evidence_sink": "github-check-and-audit-ledger",
  "fallback_behavior": {
    "on_timeout": "BLOCK",
    "on_non_zero_exit": "BLOCK",
    "on_schema_mismatch": "BLOCK",
    "degraded_fallback": "manual_review_required"
  }
}
```

## 5. What BLOCK Means
A strict G20 BLOCK means the runtime step is not safe to execute as part of a
Delivery Graph transition.

Allowed while blocked:

- repair adapter, policy, or step records;
- reduce sandbox or tool permissions;
- move untrusted context into data-only context packs;
- add schema refs or fallback behavior;
- ask for manual review without updating graph state.

Not allowed while blocked:

- execute the runtime as transition authority;
- update gate/state from runtime output;
- claim audit pass, merge readiness, phase closure, or goal progress from the
  runtime output;
- interpolate GitHub/user-controlled content into argv or shell snippets.

## 6. Incident Handling
| Incident | Response |
|----------|----------|
| adapter missing | Create `.framework/runtime-command-adapter.json`. |
| injection policy missing | Create `.framework/injection-policy-pack.json`. |
| step binding missing | Create `.framework/delivery-graph-step.json`. |
| unsafe shell interpolation | Move the value into a context pack or stdin envelope. |
| untrusted context delivered as instruction | Change delivery to `data-only`, `citation-only`, or `omit`. |
| schema mismatch | Treat output as malformed and keep the step blocked. |
| non-zero runtime exit | Keep the step blocked and record command/evidence for audit. |
| timeout | Keep the step blocked or use explicit manual-review fallback. |
| excessive sandbox | Reduce permission profile or split read-only/write steps. |

## 7. Rollback
If G20 blocks migration unexpectedly, use minimal or standard profile for
diagnostic WARN output only. Strict Delivery Graph execution must remain
blocked until adapter, policy, and step contracts pass or L3 approves an
explicit exception.
