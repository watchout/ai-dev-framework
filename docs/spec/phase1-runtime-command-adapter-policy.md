---
id: SPEC-RUNTIMEADAPTER-240
status: Draft
traces:
  impl: [IMPL-RUNTIMEADAPTER-240]
  verify: [VERIFY-RUNTIMEADAPTER-240]
  ops: [OPS-RUNTIMEADAPTER-240]
---

# SPEC: Runtime Command Adapter and Injection Policy Pack

## 0. Meta
- Origin Issue: #240
- Parent: #238 / PR #239 Enterprise Delivery Graph
- Phase: Phase 1 child/follow-up spec and minimum runner validation
- Complements: #226, #227, #242, #244, #204, #168

## 1. Purpose
Add deterministic execution contracts for Delivery Graph steps so Shirube can
invoke Codex, Claude, or future runtimes with typed input, least privilege,
schema-validated output, and audit-ready evidence before any graph state, gate
state, PR status, issue state, or merge authority record changes.

This slice introduces two versioned artifacts:

- `runtime-command-adapter/v1`;
- `injection-policy-pack/v1`.

LLMs and agent runtimes may produce candidate work or review output. They do
not approve the transition. The Shirube runner validates the adapter, policy,
step contract, permission scope, and final schema result before a step can
advance.

## 2. Source-of-Truth Placement
`delivery-graph/v1` owns which step is being evaluated. A runtime adapter and
injection policy only describe how that step may be executed.

`work-order/v1` (#244) may provide the verified request envelope that names the
handoff target, runtime adapter need, expected output schema, write scope,
context-pack refs, required gates, and non-claims. It does not replace the
runtime adapter, injection policy, or Delivery Graph step binding.

Hierarchy additions under the #238 parent contract:

| Artifact | Owns | Cannot replace |
|----------|------|----------------|
| `runtime-command-adapter/v1` | runtime invocation shape, stdin/output mode, sandbox/tool/env permissions, evidence mapping | gate verdict, merge authority, phase closure |
| `injection-policy-pack/v1` | trusted vs untrusted source handling, prompt assembly delivery mode, shell interpolation policy, output validation policy | system/developer instructions, human approval, deterministic schema validation |
| Delivery Graph step runtime binding | adapter ref, policy ref, expected result schema, write scope, evidence sink, retry/degraded behavior | the adapter or policy definitions themselves |

These artifacts may block execution readiness. They do not complete the step by
themselves.

## 3. `runtime-command-adapter/v1`
Minimum schema:

```ts
type RuntimeCommandAdapter = {
  adapter_id: string;
  runtime: "codex" | "claude" | "custom";
  min_version?: string;
  feature_detection: Array<
    | "jsonl_stream"
    | "stream_json"
    | "json_schema_final"
    | "tool_allowlist"
    | "sandbox"
    | "mcp_config"
    | "session_resume"
  >;
  invocation_template: {
    argv: string[];
    stdin_mode: "none" | "prompt" | "json-envelope" | "context-pack";
    output_mode: "jsonl" | "json" | "text";
    final_schema_ref?: string;
  };
  permission_profile: {
    sandbox: "read-only" | "workspace-write" | "danger-full-access" | "host-specific";
    allowed_tools?: string[];
    disallowed_tools?: string[];
    env_allowlist: string[];
  };
  evidence_mapping: Record<string, string>;
};
```

Strict adapters must provide evidence mapping for:

- command argv;
- runtime version;
- schema hash;
- final structured result;
- gate decision evidence.

Codex profiles should use `codex exec --json --output-schema <FILE>
--output-last-message <FILE> --sandbox <SANDBOX_MODE> --cd <DIR>` where
available.

Claude profiles should use `claude -p --output-format stream-json|json
--json-schema --permission-mode --allowedTools/--disallowedTools --mcp-config`
where available.

Strict adapter validation treats required value-taking flags as invalid when the
value is missing or the next flag is accidentally used as the value.

## 4. `injection-policy-pack/v1`
Minimum schema:

```ts
type InjectionPolicyPack = {
  policy_id: string;
  trusted_instruction_sources: string[];
  trusted_policy_sources: string[];
  untrusted_context_sources: string[];
  prompt_assembly_rules: Array<{
    segment: "system" | "developer" | "task" | "context" | "tool_output" | "retrieved_source";
    allowed_origin: string[];
    delivery: "instruction" | "data-only" | "citation-only" | "omit";
  }>;
  shell_interpolation_policy: "no-untrusted-interpolation";
  output_validation: {
    required_schema: boolean;
    fail_on_schema_mismatch: boolean;
    allow_text_fallback: boolean;
  };
};
```

Strict policy packs must:

- keep trusted instructions and trusted policy sources explicit;
- list user/GitHub/tool/retrieval context as untrusted where applicable;
- deliver untrusted context as `data-only`, `citation-only`, or `omit`;
- treat Kodama `context-pack/v1` item `summary` and `quoted_excerpt` as
  source data, not system/developer/runtime instructions;
- forbid untrusted shell interpolation;
- require schema validation;
- fail on schema mismatch;
- disallow text fallback for gate/state updates.

## 5. Delivery Graph Step Runtime Binding
Every executable strict Delivery Graph step must declare:

- Work Order ref or explicit non-applicability once #244 is promoted beyond
  warning-only migration;
- runtime adapter profile;
- injection policy pack;
- expected output schema;
- allowed workspace/write scope;
- evidence sink;
- retry/degraded fallback behavior for timeout, non-zero exit, and malformed
  output.

Example:

```json
{
  "step_id": "PR-123.L1_AUDIT",
  "position": "L1_REVIEWER",
  "runtime_adapter": "claude-stream-json-readonly-v1",
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

## 6. Runner Validation
`shirube workflow check --action runtime_step --profile strict --json` is the
minimum runner validation for this slice.

Gate rules:

| Rule | Gate | Strict decision when invalid |
|------|------|------------------------------|
| `G20.runtime_step.adapter.present` | runtime_step | BLOCK |
| `G20.runtime_step.injection_policy.present` | runtime_step | BLOCK |
| `G20.runtime_step.step_contract.present` | runtime_step | BLOCK |
| `G20.runtime_step.adapter.contract` | runtime_step | BLOCK |
| `G20.runtime_step.shell_interpolation` | runtime_step | BLOCK |
| `G20.runtime_step.injection_policy.contract` | runtime_step | BLOCK |
| `G20.runtime_step.step_contract.shape` | runtime_step | BLOCK |
| `G20.runtime_step.output_schema` | runtime_step | BLOCK |
| `G20.runtime_step.permission_scope` | runtime_step | BLOCK |

Minimal and standard profiles may WARN during migration. Strict mode BLOCKs
before runtime execution.

Strict write-scope compatibility is:

| Step write scope | Required sandbox fit |
|------------------|----------------------|
| `none` / `read-only` | `read-only` |
| `workspace-write` / `repo-write` | `workspace-write` |
| `host-specific` | `host-specific` or `danger-full-access` |

## 7. Acceptance Scenarios and Security Requirements
Acceptance scenario for runtime step validation:

```gherkin
Given a Delivery Graph step declares a runtime adapter and injection policy
And the runtime adapter output is not schema-valid for the expected result schema
When the strict runtime_step runner evaluates the step before gate/state update
Then the runtime_step check fails with a G20 output_schema BLOCK
And the Delivery Graph step cannot advance from runtime output
```

Acceptance scenario for untrusted GitHub context:

```gherkin
Given a Delivery Graph step receives a GitHub issue body as context
And the injection policy marks GitHub issue bodies as untrusted context
When prompt assembly is validated for a strict runtime_step
Then the GitHub issue body is delivered as data-only or citation-only
And it is not delivered as instruction text
```

Security requirements:

- User, GitHub, tool, and retrieval content must not be interpolated directly
  into shell commands, workflow YAML, or privileged instruction segments.
- External context must be delivered as data with provenance, not authority.
- Context packs consumed through stdin/context-pack mode must pass the G9
  context-pack and MCP structured-output contract checks before they are used
  as strict Shirube evidence.
- Runtime output must be schema-validated before it can update graph state,
  gate state, PR status, issue state, or merge authority.
- Hooks may enforce immediate guardrails but must not be the sole authority for
  Delivery Graph transitions.
- GitHub Actions jobs generated by Shirube must use least permissions and keep
  read-only agent jobs separate from write/PR jobs.

## 8. Acceptance Criteria
- Schemas for `runtime-command-adapter/v1` and `injection-policy-pack/v1` are
  documented.
- `workflow check --action runtime_step` validates adapter, policy, step
  schema, write scope, output schema, and unsafe interpolation before
  execution.
- Codex JSONL and Claude stream-json fixtures pass.
- Schema mismatch, text fallback, unsafe shell interpolation, untrusted GitHub
  context as instruction, timeout fallback gaps, non-zero-exit fallback gaps,
  and malformed-output fallback gaps block strict `runtime_step`.
- A malformed runtime output cannot advance a gate because schema mismatch and
  text fallback are strict BLOCK conditions.

## 9. Non-Goals and Manual Review Boundary
- Do not execute Codex, Claude, or custom runtimes in this slice.
- Do not create GitHub Checks or MCP tools in this slice.
- Do not store AI Change Records in this slice.
- Do not claim Phase 1, public OSS, enterprise, Kodama, or Totonoe readiness.
- Do not make runtime adapter records approval authority.

L1/L2 review is required before merging this runtime validation slice.

L3 is required before runtime adapter validation is used as merge authority or
phase transition authority. Human/product approval remains required for
enterprise positioning claims.

## 10. 制御機構選定原則
script 選定根拠: Runtime step readiness must be deterministic, replayable,
and inspectable before any LLM or agent runtime output can update graph state,
gate state, issue state, PR state, audit records, or merge authority.
TypeScript workflow-state evaluators and `workflow check --action runtime_step`
are the primary control mechanism because they emit stable JSON and can be
covered with fixtures.

Hook 選定根拠: hooks are not adopted as canonical authority in this slice. A
hook may call the same G20 script checks for unavoidable local interception,
but hooks must not decide transition validity, approve runtime output, mutate
Delivery Graph state, or become the only enforcement point.

GitHub 選定根拠: GitHub is an untrusted context and projection surface for
issue/PR/check evidence. GitHub issue titles, bodies, comments, branch names,
and workflow inputs must be data with provenance unless a trusted policy source
explicitly promotes them through deterministic review.

MCP 選定根拠: MCP tools may expose or invoke the same validated runtime-step
state later. They must not maintain an independent adapter/policy authority
model.

LLM boundary: runtime output may propose a result. It cannot approve its own
schema validity, gate pass/fail, exception approval, merge readiness, phase
closure, or goal progress.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Adapter contract validation | script (`workflow check`) | — | deterministic JSON validation is the authority |
| Injection policy validation | script (`workflow check`) | — | trusted/untrusted source handling must be replayable |
| Output schema validation | script (`workflow check` plus future schema runner) | — | malformed output must block before state update |
| Permission scope validation | script (`workflow check`) | — | sandbox/write-scope fit must be machine-checkable |

= 全 requirement が script 制御。Hook 不採用。

## 11. Testing Layer
Runtime implementation must include:

- focused workflow command fixtures for missing adapter/policy/step records;
- Codex JSONL positive fixture;
- Claude stream-json positive fixture;
- unsafe GitHub shell interpolation regression;
- untrusted context delivered as instruction regression;
- schema mismatch and text fallback regression;
- timeout, non-zero exit, and malformed-output fallback regression;
- trace verification for this 4-layer artifact set.
