---
id: VERIFY-GHFIRST-401
status: Draft
traces:
  spec: [SPEC-GHFIRST-401]
  impl: [IMPL-GHFIRST-401]
  ops: [OPS-GHFIRST-401]
---

# VERIFY: GitHub-First Autonomous Pull Contract

## 0. Corresponding SPEC
`docs/spec/phase1-github-first-autonomous-pull.md` /
SPEC-GHFIRST-401.

## 1. Required Checks
Run:

```bash
npm test -- src/cli/lib/work-order-delivery-defaults.test.ts src/cli/lib/delivery-profile-validator.test.ts src/cli/lib/github-templates.test.ts src/cli/commands/workflow.test.ts
npm run type-check
npm run build:cli
npm run lint
npm run shirube -- trace verify
npx tsx src/cli/index.ts gate validate spec --base-ref=origin/feat/workflow-state-engine-199 --link-probe=fake
git diff --check
```

Full `npm test` is recommended before merge readiness.

## 2. Expected Fixtures
| Fixture | Expected |
|---|---|
| complete Work Order with GitHub state, phase goal, runner policy, and evidence contract | strict `work_order --fail-on warn` PASS |
| Work Order missing GitHub-first phase contract fields | delivery defaults report `envelope:*` gaps |
| delivery profile missing required GitHub-first Work Order field names | delivery profile validator reports missing field |
| generated governance Work Order template | contains GitHub durable state, runner policy, evidence contract, and AUN non-SSOT prompts |
| existing prompt-only Work Order shape | still BLOCKs required fields and WARNs dispatch/runtime gaps |

## 3. Regression Boundaries
- No runtime puller starts.
- No AUN queue, ACK, or dispatch row is read as completion evidence.
- No GitHub label is mutated by validation.
- No merge authority is granted.
- No self-approval across implementation, audit, QA/check, CTO, or merge roles.
- Green CI alone is not enough for runtime-impacting done claims.

## 4. Review Evidence
The PR must include:

- changed file list;
- command output summary;
- explicit non-claims for AUN rollout, idle auto-pull, runtime execution, label
  mutation, merge authority, and done state;
- next required L1/L2/L3/CTO review route because #401 is protected governance.
