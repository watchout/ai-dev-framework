---
id: VERIFY-CONTEXTPACK-242
status: Draft
traces:
  spec: [SPEC-CONTEXTPACK-242]
  impl: [IMPL-CONTEXTPACK-242]
  ops: [OPS-CONTEXTPACK-242]
---

# VERIFY: Kodama Context-Pack Evidence Gate

## 0. Corresponding SPEC
`docs/spec/phase1-kodama-context-pack-evidence.md` /
SPEC-CONTEXTPACK-242.

## 1. Required Checks
- `npm test -- src/cli/commands/workflow.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check`

Full `npm test` is recommended before PR ready state.

## 2. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| missing context-pack and MCP contract records | strict `context_pack` BLOCK |
| complete Kodama context-pack + MCP contract | strict `context_pack` PASS |
| missing schema/provenance/risk metadata | strict `required_fields` BLOCK |
| unbounded raw source text field | strict `provenance_bounds` BLOCK |
| context-pack item delivered as instruction | strict `data_not_instruction` BLOCK |
| MCP tool lacks `outputSchema` or success `structuredContent` | strict `structured_output` BLOCK |
| MCP execution failure uses JSON-RPC error or lacks `isError: true` | strict `error_boundary` BLOCK |
| public/enterprise claim without readiness record | strict `public_enterprise_readiness` BLOCK |
| public/enterprise claim with all readiness categories | strict `context_pack` PASS |

## 3. Regression Boundaries
- `workflow check --action implementation_start` must not inherit G9
  context-pack blocks.
- `workflow check --action runtime_step` must not execute or validate Kodama
  retrieval in this slice.
- Context-pack item text must not alter instruction hierarchy, shell execution,
  tool approval, lifecycle policy, gate pass/fail, merge authority, or phase
  closure.
- Public/enterprise readiness must stay separate from ordinary implementation
  gate pass.

## 4. Review Evidence
The PR must include:

- command output summary for the required checks;
- focused workflow test count;
- L1/L2 review links;
- L3 review link before using context-pack evidence as merge authority or phase
  transition authority;
- explicit non-claims for public alpha, OSS quality, enterprise readiness,
  Kodama readiness, Totonoe readiness, and runtime execution readiness.
