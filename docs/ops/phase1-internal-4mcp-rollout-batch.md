---
id: OPS-4MCPROLLOUT-273
status: Draft
traces:
  spec: [SPEC-4MCPROLLOUT-273]
  impl: [IMPL-4MCPROLLOUT-273]
  verify: [VERIFY-4MCPROLLOUT-273]
---

# OPS: Internal 4MCP PR Conveyor Rollout Batch

## 1. Operator Use
Use the rollout guide first:

```text
docs/specs/iyasaka-internal-4mcp-pr-conveyor-rollout.md
```

Then select one Work Order from:

```text
templates/work-orders/iyasaka-internal-4mcp-pr-conveyor-first-batch.md
```

## 2. Manual Queue Operation
Before #272, use GitHub-native state:

- issue as Work Order;
- branch/PR as implementation unit;
- PR body/comment as evidence;
- label or projection as queue state;
- audit comment as review evidence;
- merge event as completion evidence.

## 3. Wave Rules
- Wave 1: Shirube, AUN stabilization, Wasurezu safety.
- Wave 2: Kodama context work, Totonoe dogfood preparation.
- Kodama and Totonoe do not block Wave 1.

## 4. Stop Rules
Stop and request review if:

- live AUN dispatch is requested;
- a Work Order requests protected R4 execution without approval/audit;
- merge is treated as a runner action;
- repo owner adoption is missing for R3/reference work;
- customer-impacting SaaS work is placed in Fast Lane.

## 5. Reporting
Every PR opened from this batch should report:

- Work Order id;
- runner identity and runtime mode;
- delivery strategy and risk class;
- verification commands and results;
- audit timing;
- residual risk;
- stop conditions encountered;
- merge authority.
