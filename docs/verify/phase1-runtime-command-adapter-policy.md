---
id: VERIFY-RUNTIMEADAPTER-240
status: Draft
traces:
  spec: [SPEC-RUNTIMEADAPTER-240]
  impl: [IMPL-RUNTIMEADAPTER-240]
  ops: [OPS-RUNTIMEADAPTER-240]
---

# VERIFY: Runtime Command Adapter and Injection Policy Pack

## 0. Corresponding SPEC
`docs/spec/phase1-runtime-command-adapter-policy.md` /
SPEC-RUNTIMEADAPTER-240.

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
| missing adapter/policy/step records | strict `runtime_step` BLOCK |
| complete Codex JSONL adapter + strict policy + step | strict `runtime_step` PASS |
| complete Claude stream-json adapter + strict policy + step | strict `runtime_step` PASS |
| required runtime CLI flag value is missing or replaced by the next flag | strict `adapter.contract` BLOCK |
| argv contains GitHub issue title interpolation | strict `shell_interpolation` BLOCK |
| untrusted GitHub context delivered as instruction | strict `injection_policy.contract` BLOCK |
| final schema ref differs from step expected schema | strict `output_schema` BLOCK |
| policy allows text fallback | strict `injection_policy.contract` and `output_schema` BLOCK |
| fallback behavior lacks schema-mismatch disposition | strict `step_contract.shape` BLOCK |
| read-only step uses write-capable sandbox | strict `permission_scope` BLOCK |
| `repo-write` or `host-specific` step uses incompatible sandbox | strict `permission_scope` BLOCK |

## 3. Regression Boundaries
- `workflow check --action implementation_start` must not inherit G20 runtime
  blocks.
- `workflow check --action phase_closure` must not inherit G20 runtime blocks.
- `workflow check --action audit_ledger` must not inherit G20 runtime blocks.
- Runtime validation must not execute Codex, Claude, shell commands, GitHub
  writes, hooks, or MCP tools.
- Text fallback cannot satisfy strict gate/state update readiness.
- Untrusted context in GitHub issue/PR/comment fields remains data, not
  instruction.

## 4. Review Evidence
The PR must include:

- command output summary for the required checks;
- focused test count for `workflow.test.ts`;
- L1/L2 review links;
- L3 review link before using G20 as merge authority or phase transition
  authority;
- explicit non-claims for Phase 1 readiness, public MVP, OSS quality,
  enterprise readiness, Kodama readiness, and Totonoe readiness.
