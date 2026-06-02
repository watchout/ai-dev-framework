# 10_GOVERNANCE_BONE.md - Product-Wide Script-Controlled Workflow Baseline

> Status: draft
> Tracking issue: https://github.com/watchout/ai-dev-framework/issues/249
> Cross-repo parent: https://github.com/watchout/agent-comms-mcp/issues/655

## 1. Purpose

Shirube must make the IYASAKA governance bone reusable across all products.
This is not only a prompt template. It is the control skeleton for product
development, agent-assisted implementation, action-tool execution, and audit.

The standard hierarchy is:

```text
Goal
  -> Phase
    -> Work Order
      -> PR / Change Slice
        -> Scripted Step
          -> Tool Execution
            -> Evidence / Audit Record
```

## 2. Required Fields

Every substantial issue must include:

```text
Governance Bone:
- Goal:
- Phase:
- Work Order:
- PR slice:
- Script/gate owner:
- Action tools:
- Context evidence:
- Memory/recovery evidence:
- Approval policy:
- Audit evidence:
- Rollback/replay:
```

Every substantial PR must include:

```text
Governance Evidence:
- Work Order:
- Gate profile:
- Context pack:
- Recovery pack:
- Tool execution policy:
- Human approval:
- Verification:
- Audit refs:
```

Small copy-only tasks may mark fields as `not applicable`, but must not omit the
section when a project profile requires governance evidence.

## 3. Enforcement Levels

### Level 0: Manual Clarity

The issue and PR visibly state the governance fields. Reviewers can trace the
work from goal to evidence without guessing.

### Level 1: Warning Gate

`validateGovernanceBone(..., { mode: "warning" })` reports missing fields as
warnings. This is the default adoption mode for existing products.

### Level 2: Strict Gate

`validateGovernanceBone(..., { mode: "strict" })` blocks missing fields for
risky work. Strict mode is required for action tools, customer data, external
mutation, queue/runtime behavior, approval policy, memory/context boundary, and
enterprise-readiness claims.

When mode is not explicitly supplied, `high` and `critical` risk derive strict
mode. `low` and `medium` risk derive warning mode.

### Level 3: Runtime Policy Integration

The Work Order and PR evidence must connect to AUN execution/audit policy,
Kodama context-pack evidence, and Wasurezu recovery-pack evidence.

## 4. Shirube Responsibilities

Shirube owns:

- Goal, phase, Work Order, and PR-slice decomposition.
- Script/gate ownership and deterministic flow control.
- Issue and PR skeletons.
- Warning/strict governance checks.
- Product profiles for infrastructure and hotel products.

Shirube does not own:

- AUN runtime queue or execution semantics.
- Kodama context source authority.
- Wasurezu memory/recovery source authority.
- AUN Platform operator UI semantics.
- Hotel domain business authority.

## 5. Product Profiles

Initial product profile order:

1. Core infrastructure: AUN, Shirube, Kodama, Wasurezu, AUN Platform.
2. Hotel products: Totonoe, AI Concierge, PMS, CRM.

The first deterministic profiles are:

| Profile | Intended products | Additional trigger terms |
|---------|-------------------|--------------------------|
| `default` | generic local adoption | common Work Order / approval / evidence terms |
| `infrastructure` | AUN, Shirube, Kodama, Wasurezu, AUN Platform | runtime, queue, MCP, context pack, recovery pack, memory, tool contract |
| `hotel` | Totonoe, AI Concierge, PMS, CRM | hotel, guest, reservation, booking, PMS, CRM, tenant/customer data |

Default rollout:

1. Warning mode for all active products.
2. Strict mode for risky action-tool and customer-data changes.
3. Runtime policy integration after AUN/Kodama/Wasurezu evidence is available.

## 6. Non-Negotiable Blocks

The validator must block these patterns even in warning mode:

- LLM output owns Goal, Phase, Work Order, gate, approval, or state transition.
- LLM output owns action-tool approval or external/customer-data mutation authority.
- Missing approval, context, audit, or evidence silently falls back to execution.

## 7. First Implementation Slice

The first implementation slice provides:

- `src/cli/lib/governance-bone-validator.ts`
- `shirube check governance <files...>`
- `templates/github/ISSUE_TEMPLATE/governance-work-order.md`
- `templates/github/governance-PULL_REQUEST_TEMPLATE.md`

This gives product teams a usable skeleton and gives later CLI/gate work a
tested deterministic validator.

Initial CLI usage:

```bash
shirube check governance docs/work-order.md
shirube check governance --strict docs/work-order.md
shirube check governance --profile infrastructure --risk high docs/work-order.md
shirube check governance --profile hotel --mode warning --risk high docs/work-order.md
shirube check governance --json --strict docs/work-order.md
```

Warning mode exits 0 unless a non-negotiable block is detected. Strict mode
exits non-zero when required governance fields are missing. `--mode warning`
keeps first-phase warning-only adoption explicit even when a product marks the
work high risk. Omitting `--mode` lets `high` and `critical` risk derive strict
mode.

The GitHub template installer also distributes:

- `.github/workflows/governance.yml`;
- `.github/ISSUE_TEMPLATE/governance-work-order.md`;
- `.github/PULL_REQUEST_TEMPLATE/governance.md`.

The workflow validates pull request body governance evidence in warning mode by
default. Product repositories can set `SHIRUBE_GOVERNANCE_PROFILE`,
`SHIRUBE_GOVERNANCE_RISK`, and `SHIRUBE_GOVERNANCE_MODE` to move from warning
adoption to strict blocking for risky action-tool or customer-data changes.
