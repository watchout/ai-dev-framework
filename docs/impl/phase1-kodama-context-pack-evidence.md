---
id: IMPL-CONTEXTPACK-242
status: Draft
traces:
  spec: [SPEC-CONTEXTPACK-242]
  verify: [VERIFY-CONTEXTPACK-242]
  ops: [OPS-CONTEXTPACK-242]
---

# IMPL: Kodama Context-Pack Evidence Gate

## 0. Corresponding SPEC
`docs/spec/phase1-kodama-context-pack-evidence.md` /
SPEC-CONTEXTPACK-242.

## 1. Implementation Slices

### Slice A: Evidence Kinds
Add workflow evidence kinds for:

- `context_pack`;
- `mcp_tool_contract`;
- `public_readiness`.

These records are local deterministic evidence. They do not retrieve Kodama
data, execute MCP tools, or grant approval authority.

### Slice B: Local Artifact Readers
Read the first non-empty local records from:

- `.framework/context-pack.json`;
- `.framework/context-pack/latest.json`;
- `.framework/context-packs/latest.json`;
- `.framework/kodama-context-pack.json`;
- `.framework/kodama/context-pack.json`;
- `.framework/mcp-tool-contract.json`;
- `.framework/mcp/server-contract.json`;
- `.framework/mcp/tool-contract.json`;
- `.framework/kodama/mcp-tool-contract.json`;
- `.framework/public-enterprise-readiness.json`;
- `.framework/oss-enterprise-readiness.json`;
- `.framework/context-pack-readiness.json`;
- `.framework/kodama/readiness.json`.

Root wrappers such as `context_pack`, `pack`, `mcp_tool_contract`, `contract`,
and readiness wrappers are accepted for migration flexibility.

### Slice C: Context-Pack Validation
Validate:

- `pack_id`;
- `schema_version: context-pack/v1`;
- schema hash or schema/version evidence;
- selected item ids;
- citations or source refs;
- omitted reason counts;
- high-risk or injection-risk labels;
- sensitivity or redaction labels;
- `generated_at`;
- bounded provenance with no unbounded raw source text;
- no instruction delivery or trusted-instruction promotion for item text.

### Slice D: MCP Tool Contract Validation
Validate:

- tool name;
- declared `outputSchema` for structured tools;
- successful tool-result fixture with `structuredContent`;
- execution failure fixture with `isError: true`;
- JSON-RPC errors reserved for malformed requests, unknown tools, and invalid
  arguments before tool execution.

### Slice E: Public/Enterprise Readiness Separation
When a context-pack record or readiness record makes a public, OSS, enterprise,
or big-tech adoption/readiness claim, require a separate readiness record with:

- auth;
- redaction;
- token handling;
- public install;
- compatibility matrix;
- audit/retention;
- deployment mode docs.

No claim means this rule passes without requiring the readiness record.

### Slice F: Workflow Check Surface
Add workflow check actions:

- `context_pack`;
- `mcp_server`.

Scoped rules:

- `G9.context_pack.evidence.present`;
- `G9.context_pack.required_fields`;
- `G9.context_pack.provenance_bounds`;
- `G9.context_pack.data_not_instruction`;
- `G9.mcp_tool_contract.present`;
- `G9.mcp_tool_contract.structured_output`;
- `G9.mcp_tool_contract.error_boundary`;
- `G9.context_pack.public_enterprise_readiness`.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-kodama-context-pack-evidence.md`;
- `docs/impl/phase1-kodama-context-pack-evidence.md`;
- `docs/verify/phase1-kodama-context-pack-evidence.md`;
- `docs/ops/phase1-kodama-context-pack-evidence.md`;
- `docs/spec/phase1-enterprise-delivery-graph.md`;
- `docs/impl/phase1-enterprise-delivery-graph.md`;
- `docs/ops/phase1-enterprise-delivery-graph.md`;
- `docs/spec/phase1-runtime-command-adapter-policy.md`;
- `docs/impl/phase1-runtime-command-adapter-policy.md`;
- `docs/ops/phase1-runtime-command-adapter-policy.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Existing action scopes must not inherit G9 context-pack blocks unless they
  explicitly opt into `context_pack` or `mcp_server`.
- `runtime_step` may continue to use `stdin_mode: context-pack`, but this slice
  does not execute runtime steps or inject pack text.
- Missing context-pack records may add WARN/BLOCK decisions to whole-state
  observability, but only the new action scopes consume these G9 rules.
- Public/enterprise readiness claims fail closed without changing local Kodama
  MVP readiness.

## 4. Future Integration
#226 should map `context_pack` and `mcp_server` into the action registry.

#227 should use the same G9 checks before script-controlled chains consume
context-pack evidence.

Later Delivery Graph runner slices should attach accepted context-pack refs to
AI Change Records, audit ledger entries, GitHub Checks, and phase/goal progress
evidence without copying raw source payloads.
