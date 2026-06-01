---
id: OPS-CONTEXTPACK-242
status: Draft
traces:
  spec: [SPEC-CONTEXTPACK-242]
  impl: [IMPL-CONTEXTPACK-242]
  verify: [VERIFY-CONTEXTPACK-242]
---

# OPS: Kodama Context-Pack Evidence Gate

## 0. Corresponding SPEC
`docs/spec/phase1-kodama-context-pack-evidence.md` /
SPEC-CONTEXTPACK-242.

## 1. Operator Flow
1. Generate or receive a Kodama `context-pack/v1` record outside Shirube.
2. Store bounded reference metadata in `.framework/context-pack.json` or
   `.framework/kodama/context-pack.json`.
3. Store the MCP structured-output contract in
   `.framework/mcp-tool-contract.json`.
4. Run `shirube workflow check --action context_pack --profile strict --json`.
5. Run `shirube workflow check --action mcp_server --profile strict --json`
   when reviewing only MCP server readiness.
6. Consume the context pack as source data only after G9 passes.
7. Add separate public/enterprise readiness evidence before making public,
   OSS, enterprise, or big-tech adoption claims.

## 2. Minimal Context-Pack Evidence
```json
{
  "pack_id": "kodama-pack-issue-242",
  "schema_version": "context-pack/v1",
  "schema_hash": "sha256:...",
  "selected_item_ids": ["kodama-src-001"],
  "citations": [
    {
      "item_id": "kodama-src-001",
      "source_ref": "github:watchout/kodama#7"
    }
  ],
  "omitted_reason_counts": {
    "irrelevant": 3,
    "sensitive_redacted": 1
  },
  "risk_labels": ["injection-risk:low"],
  "redaction_labels": ["secrets:redacted"],
  "generated_at": "2026-06-01T00:00:00.000Z",
  "items": [
    {
      "item_id": "kodama-src-001",
      "source_ref": "github:watchout/kodama#7",
      "summary": "Bounded source summary.",
      "quoted_excerpt": "Short cited excerpt.",
      "delivery": "data-only"
    }
  ]
}
```

## 3. Minimal MCP Tool Contract
```json
{
  "server_id": "kodama-mcp-local",
  "tools": [
    {
      "name": "kodama.get_context",
      "outputSchema": {
        "type": "object",
        "required": ["pack_id", "schema_version"]
      },
      "success_result": {
        "structuredContent": {
          "pack_id": "kodama-pack-issue-242",
          "schema_version": "context-pack/v1"
        }
      },
      "execution_error_result": {
        "isError": true,
        "content": [{ "type": "text", "text": "context source unavailable" }]
      }
    }
  ],
  "jsonrpc_error_policy": {
    "malformed_request": "JSON-RPC error",
    "unknown_tool": "JSON-RPC error",
    "invalid_arguments": "JSON-RPC error before tool execution",
    "execution_failure": "tool_result_isError"
  }
}
```

## 4. Public/Enterprise Readiness Evidence
Only add this record when a public, OSS, enterprise, or big-tech claim is being
made.

```json
{
  "readiness_claim": "Enterprise adoption readiness claim for context packs.",
  "auth": "Documented MCP transport authentication and local-only mode.",
  "redaction": "Secrets and sensitive excerpts are redacted.",
  "token_handling": "No tokens are stored in context packs.",
  "public_install": "Public install path documented.",
  "compatibility_matrix": ["Kodama", "AUN", "Wasurezu", "Codex", "Claude"],
  "audit_retention": "Audit retention stance documented.",
  "deployment_mode_docs": ["local", "team", "enterprise"]
}
```

## 5. What BLOCK Means
A strict G9 context-pack BLOCK means the context pack or MCP server contract is
not ready to be used as strict Shirube evidence.

Allowed while blocked:

- repair bounded metadata;
- add schema evidence, selected item ids, citations, risk labels, or redaction
  labels;
- change item delivery to `data-only`, `citation-only`, or `omit`;
- record public/enterprise readiness categories before making claims.

Not allowed while blocked:

- promote `summary` or `quoted_excerpt` to instruction;
- update gates, merge authority, lifecycle state, or phase closure from the
  context pack;
- treat tool execution failure as JSON-RPC protocol authority;
- claim public alpha, OSS quality, enterprise readiness, Kodama readiness, or
  Totonoe readiness from the pack.

## 6. Compatibility Guidance
| Surface | Guidance |
|---------|----------|
| Kodama | Owns retrieval and pack construction. Shirube validates bounded evidence refs. |
| AUN runtime adapters | May transport task context, but do not become context-pack authority. |
| Wasurezu recovery packs | May cite or summarize context packs as memory, not replace pack evidence. |
| Codex/Claude structured invocation | May receive context packs through stdin/context-pack mode; final output still requires schema validation before gate/state updates. |

## 7. Rollback
If G9 blocks migration unexpectedly, use minimal or standard profile for
diagnostic WARN output only. Strict public/enterprise claims and strict
context-pack evidence consumption must stay blocked until the missing contract
or readiness evidence is fixed.
