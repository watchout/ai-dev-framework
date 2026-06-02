---
id: SPEC-AUNGATEPROFILE-252
status: Draft
traces:
  impl: [IMPL-AUNGATEPROFILE-252]
  verify: [VERIFY-AUNGATEPROFILE-252]
  ops: [OPS-AUNGATEPROFILE-252]
---

# SPEC: Aun Gate Lite Shirube Profile

## 0. Meta
- Origin Issue: #252
- Parent context: #238 Enterprise Delivery Graph
- Related governance bone: #249
- Related Work Order authority: #248
- Related governed action surface profile: #254
- External AUN roadmap: watchout/agent-comms-mcp#655 and #657

## 1. Purpose
Define Shirube profile and gate behavior for Aun Gate Lite PRs before AUN live
execution is stable.

This profile does not implement AUN. It defines how Shirube should classify,
review, and evidence Aun Gate Lite PR classes so AUN implementation slices can
be evaluated without blurring repository authority boundaries.

## 2. Authority Boundary
AUN owns:

- agent, tool, permission, approval, execution, and audit core models;
- policy evaluator semantics;
- approval lifecycle;
- execution attempt ledger;
- queue/runtime/connector safety;
- read-only operator projections.

Shirube owns:

- Work Order authority requirements;
- Governance Bone fields;
- warning/strict gate profile mapping;
- evidence requirements before implementation starts;
- non-claim and live-execution boundary checks.

Kodama and Wasurezu provide evidence. They do not authorize AUN execution.

AUN Platform and product repositories consume or project evidence. They do not
redefine execution truth.

## 3. PR Classes
The profile uses these PR classes:

| Class | AUN slice | Default mode | Required stance |
|-------|-----------|--------------|-----------------|
| `schema_migration` | PR-1 schema/migration | warning | schema and migration evidence, no live execution |
| `policy_evaluator` | PR-2 policy evaluator | strict | deterministic policy fixtures and allow/deny/pending/block evidence |
| `approval_lifecycle` | PR-3 approval lifecycle | strict | approval state model, approval evidence, audit evidence |
| `execution_ledger` | PR-4 execution ledger/broker | strict | runtime stability prerequisite, attempt ledger, approval, audit, rollback |
| `projection` | PR-5 operator projection | warning | read-only projection and stale/missing projection behavior |
| `product_demo` | PR-6 Totonoe/product demo | strict | product Work Order, context/recovery refs, approval, audit, rollback |

The default mode is the minimum profile stance. A stricter product or migration
audit may always run strict mode.

## 4. Required Common Fields
Every Aun Gate Lite PR must declare:

- Goal;
- Phase;
- Work Order;
- Risk classification;
- PR / Change Slice;
- Script/gate owner;
- Action tools;
- Context evidence;
- Memory/recovery evidence;
- Approval policy;
- Audit evidence;
- Rollback/replay;
- Aun Gate PR class;
- Live execution boundary.

These fields may be provided through the #249 Governance Bone aliases.

## 5. Class-Specific Evidence
`schema_migration` requires:

- schema or migration evidence;
- migration rollback or replay plan;
- explicit no-live-execution boundary.

`policy_evaluator` requires:

- deterministic test evidence;
- policy fixture matrix;
- allow, deny, pending approval, and blocked decision evidence.

`approval_lifecycle` requires:

- approval policy;
- approval state model;
- approval evidence refs;
- audit evidence refs;
- recovery refs where approval state may affect resume/handoff.

`execution_ledger` requires:

- AUN runtime stability prerequisite evidence;
- execution attempt ledger shape;
- approval evidence;
- audit evidence;
- rollback/replay policy.

`projection` requires:

- read-only projection claim;
- stale/missing projection behavior;
- projection audit evidence;
- explicit no-execution-authority boundary.

`product_demo` requires:

- product Work Order;
- context evidence;
- memory/recovery evidence;
- approval policy;
- audit evidence;
- rollback/replay policy.

## 6. Live Execution Boundary
Runtime stability does not block schema, policy, or profile design.

Runtime stability does block live action execution enablement. Any PR that
claims live tool execution, live action dispatch, or production execution
before AUN runtime stability prerequisites pass is blocked by profile policy.

The profile must also block silent fallback when approval, context, recovery,
policy, or audit evidence is missing.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- Aun Gate Lite PR classes are explicit and deterministic.
- Shirube can distinguish schema/policy/profile preparation from live action
  execution.
- Risky execution work is strict-gated.
- Schema and projection work can start warning-first when live execution is not
  enabled.
- Work Order, context refs, recovery refs, approval policy, audit evidence, and
  rollback/replay fields are required for risky slices.
- AUN Platform, Kodama, Wasurezu, Shirube, and product repos cannot substitute
  for AUN execution authority.

Policy evaluator scenario:

```gherkin
Given an Aun Gate Lite PR is classified as policy_evaluator
And the PR declares deterministic policy fixtures and allow/deny decision evidence
When the Shirube Aun Gate profile check runs
Then the PR uses strict mode
And missing policy fixture evidence blocks the check
```

Schema migration scenario:

```gherkin
Given an Aun Gate Lite PR is classified as schema_migration
And the PR declares schema evidence, migration rollback, and no live execution
When the Shirube Aun Gate profile check runs in default mode
Then missing future runtime execution evidence is not required
And missing migration evidence remains visible as a warning
```

Live execution boundary scenario:

```gherkin
Given an Aun Gate Lite PR claims live action execution
And AUN runtime stability prerequisite evidence is missing
When the Shirube Aun Gate profile check runs
Then the check blocks even if warning mode was requested
```

## 8. Non-Goals
- Do not implement AUN live execution.
- Do not claim AUN runtime stability.
- Do not own AUN queue state or AUN execution ledger persistence.
- Do not make Shirube an MCP server in this slice.
- Do not make Kodama or Wasurezu execution authorities.
- Do not make AUN Platform a source of execution truth.
- Do not grant merge authority, phase transition authority, or goal completion.

## 9. Review Boundary
L1 spec review is required before implementation starts.

L2 implementation review is required for any validator, CLI, CI, or template
implementation of this profile.

L3 review is required before this profile blocks live execution dispatch,
merge authority, cross-repo release claims, or public/enterprise positioning.

## 10. 制御機構選定原則
script 選定根拠: The future check must be deterministic, replayable, and
usable in local CI without AUN runtime availability.

Hook 選定根拠: Hook 不採用 in this spec slice. Hooks may call the same script in
future local-interception cases, but they must not own Aun Gate policy truth.

GitHub 選定根拠: GitHub PR comments and checks are evidence projection surfaces.
They do not grant execution, approval, or merge authority by themselves.

LLM boundary: LLM output may draft Work Orders and profile evidence. It cannot
approve execution, pass policy, satisfy runtime stability, or substitute for
human approval.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| PR class mapping | script/spec contract | - | deterministic class-to-evidence mapping |
| Governance Bone fields | #249 script contract | - | shared Work Order and evidence skeleton |
| Live execution boundary | script/spec contract | - | AUN stability is external prerequisite evidence |
| AUN execution | not implemented here | - | AUN repository owns execution truth |

## 11. Testing Layer
Future implementation must include unit tests, regression tests, and CLI smoke
tests.

Unit tests must cover:

- each PR class default mode and required fields;
- missing common Governance Bone fields;
- missing class-specific evidence;
- live execution claim without runtime stability evidence;
- cross-repository authority substitution;
- warning mode for schema/projection preparation;
- strict mode for policy, approval, execution ledger, and product demo slices;
- JSON output for CI/audit consumption.

Regression tests must prove schema/profile preparation remains allowed before
AUN live execution stability, while live execution enablement remains blocked.

CLI smoke tests must prove invalid PR classes fail deterministically and valid
PR-class reports are machine-readable.
