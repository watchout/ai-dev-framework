---
id: VERIFY-4MCPROLLOUT-273
status: Draft
traces:
  spec: [SPEC-4MCPROLLOUT-273]
  impl: [IMPL-4MCPROLLOUT-273]
  ops: [OPS-4MCPROLLOUT-273]
---

# VERIFY: Internal 4MCP PR Conveyor Rollout Batch

## 1. Required Checks
Run:

```bash
npm run shirube -- trace verify
npm run shirube -- gate validate spec --base-ref=origin/main --link-probe=fake
git diff --check <base>...HEAD
```

No focused runtime test is required because this slice changes docs and
templates only.

## 2. Manual Review Points
Verify that:

- rollout is GitHub-native before AUN;
- Shirube, AUN, Wasurezu, Kodama, and Totonoe are represented;
- Wave 1 excludes Kodama/Totonoe as blockers;
- AUN Work Orders do not enable live dispatch;
- Wasurezu Work Orders target recovery/memory safety;
- Kodama Work Orders target context-pack/get_context;
- Totonoe Work Orders are deferred until 4MCP minimum readiness;
- R0-R2, R3, and R4 audit timing matches the delivery profile;
- merge is not automated.

## 3. Acceptance Evidence
The PR evidence should include:

- changed docs/templates;
- trace verification result;
- spec gate result;
- diff check result;
- residual risk statement that the batch is guidance until adopted by each
  repo owner.
