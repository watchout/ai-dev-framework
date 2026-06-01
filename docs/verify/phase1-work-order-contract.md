---
id: VERIFY-WORKORDER-244
status: Draft
traces:
  spec: [SPEC-WORKORDER-244]
  impl: [IMPL-WORKORDER-244]
  ops: [OPS-WORKORDER-244]
---

# VERIFY: Work Order Contract and Warning Gate

## 0. Corresponding SPEC
`docs/spec/phase1-work-order-contract.md` / SPEC-WORKORDER-244.

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
| missing Work Order record | strict `work_order` default threshold PASS with WARN |
| missing Work Order record with `--fail-on warn` | strict `work_order` FAIL |
| complete `work-order/v1` record | strict `work_order --fail-on warn` PASS |
| prompt-template shape without contract fields | `required_fields`, `dispatch_contract`, and `runtime_contract` WARN |
| context-pack text promoted to instruction | `context_pack_boundary` WARN |
| direct shell command or argv in Work Order | `runtime_contract` WARN |
| granted merge/phase/gate/goal authority values | `authority_boundary` WARN |

## 3. Regression Boundaries
- Existing action scopes must not inherit G21 warnings.
- Work Order validation must not call AUN, Codex, Claude, GitHub writes, hooks,
  MCP tools, or shell commands.
- Work Order text must not become trusted instruction.
- Work Order authority fields must not grant merge, phase, gate, or goal
  completion authority.
- Context-pack item text remains data.
- Warning-first behavior must remain visible in JSON so migration audits can use
  `--fail-on warn`.

## 4. Review Evidence
The PR must include:

- command output summary for the required checks;
- focused workflow test count;
- L1/L2 review links;
- L3 review link before promoting G21 from WARN to BLOCK;
- explicit non-claims for runner automation, runtime execution, AUN queue
  ownership, merge authority, phase transition authority, public readiness, and
  enterprise readiness.
