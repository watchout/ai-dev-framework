---
id: SPEC-CONTEXTPACK-242
status: Draft
traces:
  impl: [IMPL-CONTEXTPACK-242]
  verify: [VERIFY-CONTEXTPACK-242]
  ops: [OPS-CONTEXTPACK-242]
---

# SPEC: Kodama Context-Pack Evidence Gate

## 0. Meta
- Origin Issue: #242
- Parent: #238 / Enterprise Delivery Graph
- Related runtime boundary: #240 runtime-command-adapter/v1 and
  injection-policy-pack/v1
- Related Kodama source: watchout/kodama#7

## 1. Purpose
Make Kodama `context-pack/v1` a first-class Shirube evidence reference without
copying unbounded source text or treating retrieved item text as authority.

This slice is not a blocker for Kodama's local `get_context` MVP. It defines
the Shirube-side evidence, MCP contract, and public/enterprise readiness gates
that must exist before public alpha, OSS quality, enterprise, or big-tech
adoption claims can rely on context packs.

## 2. Source-of-Truth Boundary
`context-pack/v1` is input evidence in the #238 hierarchy. It may provide
bounded source context for a task, review, audit, or runtime step. It cannot:

- approve or complete a gate;
- change instruction hierarchy;
- change shell execution or tool approval policy;
- update lifecycle state by itself;
- override system, developer, spec, ops, or runtime policy.

Kodama fields such as `summary` and `quoted_excerpt` are source data. They must
be delivered as data-only or citation-only context unless a separate trusted
policy source explicitly promotes a different artifact through deterministic
review. The context pack itself is never that trusted promotion.

## 3. MCP Structured Output Contract
MCP servers that provide structured context-pack data must declare a stable tool
contract before Shirube treats their results as strict evidence.

Required contract expectations:

```ts
type McpToolContract = {
  tools: Array<{
    name: string;
    outputSchema: unknown;
    success_result: {
      structuredContent: unknown;
    };
    execution_error_result: {
      isError: true;
      content?: unknown;
    };
  }>;
  jsonrpc_error_policy: {
    malformed_request: string;
    unknown_tool: string;
    invalid_arguments: string;
    execution_failure: "tool_result_isError" | false;
  };
};
```

Protocol-level JSON-RPC errors are reserved for malformed requests, unknown
tools, and invalid arguments before tool execution. Tool execution failures use
stable tool results with `isError: true`.

## 4. G9 Context-Pack Evidence
Shirube evidence may reference a Kodama pack by bounded metadata:

```ts
type ContextPackEvidence = {
  pack_id: string;
  schema_version: "context-pack/v1";
  schema_hash?: string;
  schema_evidence?: unknown;
  selected_item_ids: string[];
  citations?: unknown[];
  source_refs?: unknown[];
  omitted_reason_counts: Record<string, number>;
  risk_labels: string[];
  sensitivity_labels?: string[];
  redaction_labels?: string[];
  generated_at: string;
  items?: Array<{
    item_id: string;
    source_ref: string;
    summary?: string;
    quoted_excerpt?: string;
    delivery: "data-only" | "citation-only" | "omit";
  }>;
};
```

The evidence must carry provenance and bounded excerpts. It must not embed
unbounded raw source fields such as full raw source text.

## 5. Public and Enterprise Readiness
Public/enterprise readiness is separate from ordinary implementation readiness.
A context-pack gate may pass for local/internal use while public or enterprise
claims remain blocked.

Before public alpha, OSS quality, enterprise, or big-tech adoption claims, the
readiness record must cover:

- auth and authorization posture;
- redaction and privacy behavior;
- token/secret handling;
- public install path;
- compatibility matrix;
- audit and retention stance;
- deployment mode documentation.

## 6. Workflow Rules
`shirube workflow check --action context_pack --profile strict --json` evaluates
the context-pack evidence surface.

`shirube workflow check --action mcp_server --profile strict --json` evaluates
only the MCP structured-output subset.

| Rule | Gate | Strict decision when invalid |
|------|------|------------------------------|
| `G9.context_pack.evidence.present` | context_pack | BLOCK |
| `G9.context_pack.required_fields` | context_pack | BLOCK |
| `G9.context_pack.provenance_bounds` | context_pack | BLOCK |
| `G9.context_pack.data_not_instruction` | context_pack | BLOCK |
| `G9.mcp_tool_contract.present` | mcp_server | BLOCK |
| `G9.mcp_tool_contract.structured_output` | mcp_server | BLOCK |
| `G9.mcp_tool_contract.error_boundary` | mcp_server | BLOCK |
| `G9.context_pack.public_enterprise_readiness` | context_pack_public_readiness | BLOCK only when a public/enterprise claim is made without readiness evidence |

Minimal and standard profiles may warn during migration. Strict mode blocks the
scoped action before the context pack can be used as authoritative Shirube
evidence.

## 7. Acceptance Criteria and Scenarios
- MCP contract expectations define `structuredContent`, `outputSchema`, stable
  `isError` tool-result errors, and JSON-RPC protocol error boundaries.
- G9 context-pack evidence can reference `context-pack/v1` by `pack_id`,
  selected item ids, citations/source refs, and schema evidence.
- Evidence includes omitted counts, risk labels, sensitivity/redaction labels,
  and `generated_at`.
- Context-pack item text is documented and validated as data, not trusted
  instruction.
- Public/enterprise readiness remains separate from ordinary implementation
  readiness.
- Compatibility guidance covers Kodama, AUN runtime adapters, Wasurezu recovery
  packs, and Codex/Claude structured invocation paths.

Acceptance scenario for context-pack evidence:

```gherkin
Given a Kodama context-pack evidence record includes bounded citations and selected item ids
And the MCP tool contract declares outputSchema and successful structuredContent
When the strict context_pack workflow check evaluates the evidence
Then the G9 context_pack and mcp_tool_contract rules pass
And the pack item text remains source data, not trusted instruction
```

Acceptance scenario for public readiness claims:

```gherkin
Given a context-pack evidence record claims enterprise adoption readiness
And auth, redaction, token handling, public install, compatibility, audit retention, or deployment docs are missing
When the strict context_pack workflow check evaluates public readiness
Then G9.context_pack.public_enterprise_readiness blocks the claim
And ordinary local context-pack evidence remains a separate readiness surface
```

## 8. Non-Goals
- Do not implement Kodama retrieval.
- Do not block Kodama local `get_context` MVP.
- Do not own AUN runtime dispatch.
- Do not generate shell commands from context packs.
- Do not claim public, OSS, enterprise, Kodama, or Totonoe readiness.

## 9. Review Boundary
L1/L2 review is required before this G9 evidence gate is used by strict Shirube
workflow checks.

L3 is required before context-pack evidence is used as merge authority, phase
transition authority, public readiness evidence, or enterprise positioning
support.

## 10. 制御機構選定原則
script 選定根拠: context-pack evidence and MCP tool contracts must be
deterministically replayable before source context influences gates, runtime
steps, audits, or public/enterprise claims. TypeScript workflow-state
evaluators and `workflow check` JSON output are the primary control mechanism.

Hook 選定根拠: hooks are not canonical in this slice. They may call the same G9
checks but must not decide context-pack authority independently.

GitHub 選定根拠: GitHub issue/PR text may be cited by a context pack, but it is
untrusted source data unless separately promoted by a trusted policy artifact.

MCP 選定根拠: MCP is the structured transport surface. It must expose
`structuredContent` and `outputSchema` and must not convert tool execution
failures into protocol authority.

LLM boundary: an LLM may summarize context-pack data. It cannot approve the
pack, promote item text to instruction, or make public/enterprise readiness
claims.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Context-pack evidence validation | script (`workflow check`) | - | deterministic metadata validation is the authority |
| MCP structured-output contract validation | script (`workflow check`) | - | tool contract and error boundary checks must be replayable |
| Public/enterprise readiness claim guard | script (`workflow check`) | - | readiness claims must be separated from ordinary implementation pass |
| Instruction-promotion guard | script (`workflow check`) | - | source text cannot promote itself to instruction authority |

= 全 requirement が script 制御。Hook 不採用。

## 11. Testing Layer
Context-pack implementation must include:

- unit tests for metadata selection and validation helpers where they are split
  from command fixtures;
- integration workflow command fixtures for missing context-pack and MCP
  contract records;
- regression fixture for complete Kodama context-pack and MCP structured
  output;
- regression fixture for missing schema/provenance/risk metadata;
- regression fixture for unbounded raw source text;
- regression fixture for instruction delivery;
- regression fixture for MCP execution failure as JSON-RPC protocol error;
- regression fixtures for separate public/enterprise readiness.
