---
id: IMPL-SHIRUBEV21-406
status: Draft
traces:
  spec: [SPEC-SHIRUBEV21-406]
  verify: [VERIFY-SHIRUBEV21-406]
  ops: [OPS-SHIRUBEV21-406]
---

# IMPL: Shirube v2.1 Enterprise Governance Kernel

## 0. Meta

- Origin issue: #406.
- Parent SSOT: #405.
- Corresponding SPEC: `docs/spec/shirube-v2.1-enterprise-governance.md`.
- Implementation class: docs/spec-only PR1.
- Runtime activation: none.

This IMPL document describes the implementation map and future PR sequence. It
does not describe code changes in PR1 because no code, runtime, CI, DB, AUN,
Discord, LaunchAgent, label sync, branch protection, or external repo mutation
is allowed.

## 1. PR1 Artifact Layout

PR1 uses the repository's existing 4-layer documentation convention:

```text
docs/spec/shirube-v2.1-enterprise-governance.md
docs/impl/shirube-v2.1-enterprise-governance.md
docs/verify/shirube-v2.1-enterprise-governance.md
docs/ops/shirube-v2.1-enterprise-governance.md
```

The recommended directory layout from the #406 transition request maps into the
4-layer files as follows:

| Requested artifact | 4-layer location |
|---|---|
| `README.md` / product overview | SPEC sections 1-3 and OPS section 1. |
| `PRODUCT_CONTRACT.md` | SPEC sections 1-3, 12-14. |
| `OBJECT_MODEL.md` | SPEC section 4. |
| `STATE_MACHINE.md` | SPEC section 5. |
| `SCHEMA_MAP.md` | SPEC section 10. |
| `RISK_POLICY_MODEL.md` | SPEC sections 6-7. |
| `EVIDENCE_MODEL.md` | SPEC sections 8-9. |
| `INTEGRATION_BOUNDARIES.md` | SPEC section 3 and OPS sections 2-4. |
| `IMPLEMENTATION_SEQUENCE.md` | This IMPL document. |

## 2. PR1 Implementation Actions

PR1 actions:

1. Add the four v2.1 docs listed above.
2. Add a short roadmap pointer from `docs/specs/roadmap.md`.
3. Reserve contract names for later schema and evaluator PRs.
4. Document Core v2.1 versus Advanced v2.1+ boundaries.
5. Document the implementation sequence for future PRs.
6. Run documentation-focused verification.
7. Publish one PR linked to #406.
8. Post an Implementation Handoff with changed files, checks, risks, and next
   required review.

PR1 must stop if any of the above requires runtime, enforcement, CI gate, label,
branch protection, DB, AUN, Discord, LaunchAgent, or external repo mutation.

## 3. Reserved Contract Names

These names are stable from PR1 forward:

```text
shirube-policy/v2.1
shirube-risk-classification/v1
shirube-policy-evaluation-result/v1
shirube-evidence-record/v1
shirube-trace-matrix/v2.1
shirube-ai-change-record/v1
shirube-security-evidence/v1
shirube-db-evidence/v1
shirube-test-evidence/v1
shirube-contract-evidence/v1
```

PR1 does not create machine-readable schemas for these contracts. Future PRs
must preserve the names unless CTO review explicitly supersedes them.

## 4. Core v2.1 First-Wave Sequence

The first-wave implementation sequence after PR1 is:

| PR | Scope | GitHub track | Enforcement allowed? |
|---|---|---|---|
| PR2 | Schema fixtures only for reserved contract names. | #410/#411 support. | No. |
| PR3 | Read-only evaluator for policy/evidence/trace inputs. | #410/#411 support. | No mutation; read-only decisions only. |
| PR4 | GitHub Check projection of deterministic results. | #407/#411 support. | Projection only until branch protection review. |
| PR5 | Policy evaluator for `shirube-policy/v2.1` and R0-R4. | #410 support. | Governed rollout only after review. |
| PR6 | Security/test/DB/contract evidence adapters. | #407/#410/#411 support. | Adapter evidence only until enforcement review. |

The original #406 body mentions additional PR2-PR10 concepts. v2.1 PR1 maps
those into the first-wave sequence above:

| Historical item | v2.1 placement |
|---|---|
| contract schemas and fixtures | PR2. |
| read-only state engine | PR3. |
| role verdict validation | PR3/PR5, depending on whether it is read-only or enforcing. |
| label/state reconciler integration | Later protected PR after projection and CTO review. |
| Gate 0 / defect fixture policy | PR5/PR6 after schema and evaluator evidence exists. |
| completion gate integration | Later protected PR after post-merge evidence model is reviewed. |
| Goal Mode runner instruction packs | Later runner-policy PR; Codex Goal Mode remains a runner policy. |
| adoption readiness check | Later readiness PR after evidence adapters exist. |
| AUN/Kusabi/Kodama adapters | Later adapter PRs; not first-wave enforcement. `Wasurezu` remains a legacy alias/tooling/runtime name for Kusabi where still present, not a separate integration product. |

## 5. Child Track Mapping

| Issue | Title summary | v2.1 classification |
|---|---|---|
| #407 | Machine-enforced CI security gates and AI/MCP review boundaries. | Core evidence/check direction; enforcement later. |
| #408 | Cross-agent adversarial review and agent attribution ledger. | Advanced v2.1+. |
| #409 | Tamper-evident ledger, SLSA/in-toto, incident replay. | Advanced v2.1+. |
| #410 | Risk-class Policy-as-Code and required evidence evaluator. | Core v2.1 first wave. |
| #411 | Semantic drift, trace matrix, spec-to-test verification. | Core v2.1 first wave; semantic drift hardening may extend later. |
| #412 | Cost/latency budgets, eval harness gates, rollout replay. | Advanced v2.1+ except basic rollout evidence references. |

## 6. Future Schema Fixture Direction

PR2 should add schema fixtures without enabling enforcement. Minimum fixtures:

```text
fixtures/shirube-v2.1/policy/basic.json
fixtures/shirube-v2.1/risk/r0-docs-only.json
fixtures/shirube-v2.1/risk/r3-control-plane.json
fixtures/shirube-v2.1/evidence/test-evidence-present.json
fixtures/shirube-v2.1/evidence/security-evidence-missing.json
fixtures/shirube-v2.1/trace/work-order-to-pr.json
fixtures/shirube-v2.1/policy-result/block-missing-evidence.json
```

Fixture PR2 must not add runtime scanners, GitHub checks, label sync, queue
dispatch, or branch protection.

### 6.1 PR2 Non-Enforcing Behavioral Forward Contract

PR2 schema fixtures should prove these behavior contracts without enabling
runtime enforcement:

- AUN conveyor labels/comments are projection data for Shirube states and
  verdicts, not independent state-machine authority.
- `shirube-evidence-record/v1` accepts the reserved optional ledger/provenance/
  policy/model/cost slots while keeping hashing, ledger append, and cost
  accounting unimplemented.
- Kusabi is the canonical memory/recovery/continuity product name; Wasurezu may
  appear only as legacy alias/tooling/runtime metadata, while
  `watchout/agent-memory` / `agent-memory` remains the repo/package identity.

The PR2 fixture result is schema compatibility evidence only. It must not
create parsers, evaluators, adapters, scanners, GitHub Checks, labels, branch
protection, or live automation.

## 7. Read-Only Evaluator Direction

PR3 may add pure functions that read fixture-like inputs and return:

```typescript
type ShirubePolicyDecision = {
  schema_version: "shirube-policy-evaluation-result/v1";
  decision: "PASS" | "WARN" | "BLOCK" | "STOP" | "OBSERVE";
  policy_refs: string[];
  evidence_refs: string[];
  missing_evidence: string[];
  risk: "R0" | "R1" | "R2" | "R3" | "R4";
  lane: "Routine" | "Protected" | "Stop";
  deterministic: true;
};
```

PR3 must be read-only. It may expose CLI/report output only if the command is
clearly non-mutating and reviewed as observability.

## 8. GitHub Check Projection Direction

PR4 may project deterministic decisions to GitHub Checks or PR comments after
schema and read-only evaluator evidence exists.

Projection rules:

- include policy id, risk, lane, decision, missing evidence, and remediation;
- include exact head SHA for PR-scoped checks;
- redact secrets and private reasoning;
- never update branch protection in the same PR;
- never make a new required check until CTO/maintainer review approves it.

## 9. Policy Evaluator Direction

PR5 may evaluate `shirube-policy/v2.1` against Work Orders, PRs, evidence, and
trace records.

Required negative fixtures:

- R3 declared as Routine;
- R4 without explicit approval;
- missing security evidence for security-impact work;
- missing test evidence for behavior/evaluator/runtime changes;
- missing DB evidence for schema/storage/queue changes;
- missing contract evidence for schema/API/CLI/MCP/runner changes;
- role verdict missing exact head/ref;
- AUN ACK presented as completion authority.

## 10. Evidence Adapter Direction

PR6 may add adapters that collect or normalize evidence records. Adapter rules:

- adapters produce evidence records only;
- adapters do not approve transitions;
- adapters do not mutate GitHub labels, branch protection, queues, DB, runtime,
  LaunchAgents, Discord, or external systems;
- each adapter documents privacy/redaction behavior;
- DB/queue evidence adapters require protected review before any live data path.

## 11. Enforcement Boundary

The following require separate protected PRs after PR1:

- CI gate enforcement;
- GitHub Check required-status adoption;
- branch protection or merge queue changes;
- label/state reconciler integration;
- runtime apply mode;
- AUN dispatch or queue lifecycle integration;
- DB migrations;
- LaunchAgent changes;
- Discord/live automation;
- SLSA/in-toto generation;
- cross-agent runtime review wiring;
- external repo rollout.

## 12. Handoff Requirements

The PR1 Implementation Handoff must include:

- changed files;
- summary of docs/spec artifacts created;
- contract names defined/reserved;
- tests/checks run;
- known risks or open questions;
- confirmation that no enforcement/runtime/live automation changes were made;
- next required review: L1/L2 audit, then QA/check, then CTO review for v2.1
  direction.
