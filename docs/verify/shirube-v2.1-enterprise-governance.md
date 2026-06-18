---
id: VERIFY-SHIRUBEV21-406
status: Draft
traces:
  spec: [SPEC-SHIRUBEV21-406]
  impl: [IMPL-SHIRUBEV21-406]
  ops: [OPS-SHIRUBEV21-406]
---

# VERIFY: Shirube v2.1 Enterprise Governance Kernel

## 0. Meta

- Origin issue: #406.
- Parent SSOT: #405.
- Corresponding SPEC: `docs/spec/shirube-v2.1-enterprise-governance.md`.
- Corresponding IMPL: `docs/impl/shirube-v2.1-enterprise-governance.md`.
- Verification class: docs/spec-only.

## 1. PR1 Verification Scope

This VERIFY document checks that PR1 documents the v2.1 kernel without changing
runtime behavior.

Required verification:

- #405 is named as parent SSOT.
- #406 PR1 source and scope are visible.
- Core object model, state machine, risk classes, policy model, evidence model,
  schema map, and implementation sequence are present.
- Core v2.1 and Advanced v2.1+ are separated.
- GitHub durable SSOT and AUN acceleration boundary are explicit.
- Codex Goal Mode is a runner policy, not architecture.
- #197 lower-level Gate Engine substrate is preserved.
- #18/#19 policy-source references are preserved.
- Non-scope forbids runtime/enforcement/live automation changes.
- Repository diff is docs/spec-only.

## 2. Contract Name Consistency Checklist

Each of these strings must appear consistently in SPEC and IMPL:

- `shirube-policy/v2.1`
- `shirube-risk-classification/v1`
- `shirube-policy-evaluation-result/v1`
- `shirube-evidence-record/v1`
- `shirube-trace-matrix/v2.1`
- `shirube-ai-change-record/v1`
- `shirube-security-evidence/v1`
- `shirube-db-evidence/v1`
- `shirube-test-evidence/v1`
- `shirube-contract-evidence/v1`

Verification method for PR1:

```bash
rg "shirube-policy/v2.1|shirube-risk-classification/v1|shirube-policy-evaluation-result/v1|shirube-evidence-record/v1|shirube-trace-matrix/v2.1|shirube-ai-change-record/v1|shirube-security-evidence/v1|shirube-db-evidence/v1|shirube-test-evidence/v1|shirube-contract-evidence/v1" docs/spec docs/impl docs/verify docs/ops docs/specs/roadmap.md
```

## 3. Source Link Checklist

PR1 must reference:

| Source | Required use |
|---|---|
| #405 | Parent SSOT. |
| #406 | Origin issue for PR1. |
| #197 | Lower-level Gate Engine / legacy discovery substrate. |
| #18/#19 | Preserved Company Dev OS policy-source references. |
| #407-#412 | Future child tracks and Core/Advanced classification. |

PR1 may reference #363/#401/#403/#404 as design lineage. It must not require
readers to inspect those issues to understand the v2.1 PR1 contract.

## 4. Docs-Only Diff Checklist

Allowed paths for PR1:

```text
docs/spec/shirube-v2.1-enterprise-governance.md
docs/impl/shirube-v2.1-enterprise-governance.md
docs/verify/shirube-v2.1-enterprise-governance.md
docs/ops/shirube-v2.1-enterprise-governance.md
docs/specs/roadmap.md
```

Forbidden path classes:

- `src/`
- `scripts/`
- `.github/`
- `.framework/`
- `.claude/`
- DB files or migrations;
- LaunchAgent files;
- Discord/AUN runtime config;
- package/dependency files;
- branch protection or label sync config.

## 5. Required Commands

Minimum PR1 checks:

```bash
git diff --check
npm test
```

Additional checks may be run when practical:

```bash
npm run lint
npm run type-check
```

PR2 fixture validation must also run the repository spec validator when
available:

```bash
npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake
```

For docs-only changes, failures outside the changed documentation scope must be
reported exactly in the Implementation Handoff rather than hidden.

## 6. Acceptance Scenarios

### Scenario: New reader understands v2.1 PR1

Given a reviewer opens the PR1 docs
When they read SPEC, IMPL, VERIFY, and OPS
Then they can identify the parent SSOT, product frame, object model, state
machine, schema map, implementation sequence, non-scope, and review path
without reading #197/#363/#401/#403/#404 individually.

### Scenario: AUN is not completion authority

Given a Work Order has an AUN ACK, queue id, or Discord projection
When Shirube v2.1 asks whether the Work Order is complete
Then the docs require durable GitHub/Shirube evidence and role verdicts
And transport evidence alone is insufficient.

### Scenario: Goal Mode remains a runner policy

Given a Work Order uses Codex Goal Mode
When the runner policy is recorded
Then Codex Goal Mode is treated as one execution policy
And the architecture remains runner-neutral.

### Scenario: Advanced features do not block first-wave core

Given cross-agent adversarial review, SLSA/in-toto, cost governance, or eval
harness work is not implemented
When PR1 is reviewed
Then PR1 can still pass because those features are Advanced v2.1+ follow-up
scope, not first-wave enforcement.

### Scenario: Runtime changes are out of scope

Given a proposed PR1 diff changes runtime code, CI enforcement, AUN dispatch,
DB schema, LaunchAgents, Discord automation, label sync, or branch protection
When the PR is reviewed
Then the PR must be blocked or split because PR1 is docs/spec-only.

## 7. PR2 Fixture Verification Addendum

PR2 verifies that #414 adds schema fixture examples and links only, without
enabling enforcement or live behavior.

Allowed PR2 paths:

```text
docs/spec/fixtures/shirube-v2.1/
docs/spec/shirube-v2.1-enterprise-governance.md
docs/impl/shirube-v2.1-enterprise-governance.md
docs/verify/shirube-v2.1-enterprise-governance.md
```

PR2 fixture inventory:

| Fixture schema id | Fixture path |
|---|---|
| `shirube-policy/v1` | [`policy.example.yml`](../spec/fixtures/shirube-v2.1/policy.example.yml) |
| `shirube-risk-classification/v1` | [`risk-classification.example.yml`](../spec/fixtures/shirube-v2.1/risk-classification.example.yml) |
| `shirube-evidence-record/v1` | [`evidence-record.example.json`](../spec/fixtures/shirube-v2.1/evidence-record.example.json) |
| `shirube-trace-matrix/v1` | [`trace-matrix.example.json`](../spec/fixtures/shirube-v2.1/trace-matrix.example.json) |
| `shirube-security-evidence/v1` | [`security-evidence.example.json`](../spec/fixtures/shirube-v2.1/security-evidence.example.json) |
| `shirube-test-evidence/v1` | [`test-evidence.example.json`](../spec/fixtures/shirube-v2.1/test-evidence.example.json) |
| `shirube-db-evidence/v1` | [`db-evidence.example.json`](../spec/fixtures/shirube-v2.1/db-evidence.example.json) |
| `shirube-contract-evidence/v1` | [`contract-evidence.example.json`](../spec/fixtures/shirube-v2.1/contract-evidence.example.json) |
| `shirube-ai-change-record/v1` | [`ai-change-record.example.json`](../spec/fixtures/shirube-v2.1/ai-change-record.example.json) |
| `shirube-architecture-map/v1` | [`architecture-map.example.json`](../spec/fixtures/shirube-v2.1/architecture-map.example.json) |

Fixture acceptance checks:

- each fixture has a `schema_version` matching the inventory;
- source links cite #405, PR #413, and #414;
- PR-scoped examples show exact-head binding expectations;
- evidence-family examples include required evidence status and optional
  reserved enterprise slots;
- role separation is explicit;
- fixtures are examples only and do not create parsers, evaluators, adapters,
  scanners, CI gates, GitHub Checks, labels, branch protection, AUN dispatch,
  DB changes, LaunchAgent changes, Discord automation, or external mutation.

### Scenario: PR3 can infer loader input

Given a future PR3 implementer opens the PR2 fixture directory
When they read only the ten fixture examples and the inventory table
Then they can infer `schema_version`, source link, exact-head binding, role
separation, required evidence, reserved enterprise metadata, and non-claim input
shape for a read-only evaluator.

### Scenario: Fixture evidence is not enforcement

Given a fixture includes policy, evidence, trace, or architecture-map data
When the PR2 change is reviewed
Then the fixture is treated as docs/data contract evidence only
And no runtime behavior, CI gate, GitHub Check, AUN dispatch, DB behavior, label
sync, branch protection, Discord automation, or external system behavior is
enabled.

## 8. Gate Completion Barrier Verification Addendum

The Gate Completion Barrier verifies the read-only machine command:

```bash
shirube conveyor check <pr-url-or-repo-pr> --format json
```

Focused verification:

- target parsing accepts GitHub PR URLs, `owner/repo#123`, and local PR numbers
  with a detected Git remote;
- docs/fixture-only paths classify without protected path hits;
- runtime, DB, queue, permission, CI, deploy, agent-routing, and scheduler paths
  are reported as protected path class hits;
- output uses stable `shirube-conveyor-check/v1` JSON shape with
  `gate_version: gate-completion-barrier/v1`;
- missing PR head or changed-file facts return `BLOCKED`;
- merge/release-readiness packets without both `release_executor` and
  `evidence_sink` return `BLOCKED`;
- legacy L1/L2 audit plus QA/check routing as the primary next gate returns
  `BLOCKED` with `legacy_review_flow_detected`;
- review queues used as `release_owner` return `BLOCKED` with
  `invalid_release_owner_review_queue`;
- completion claims without exact-head machine gate evidence return `BLOCKED`
  with `missing_exact_head_machine_gate_evidence`;
- the command remains read-only and does not mutate GitHub labels, comments,
  branches, PR state, checks, branch protection, DB, queue, AUN, Discord, or
  external systems.

Minimum commands for this barrier slice:

```bash
npm test -- src/cli/lib/conveyor-check.test.ts src/cli/commands/conveyor.test.ts
npm run type-check
npm run lint
npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake
```

Running `shirube conveyor check` against a live PR is allowed for evidence
collection because it reads through GitHub/Git only and performs no mutation.

## 9. Review Requirements

PR1 requires:

1. L1 audit for doc completeness and source alignment.
2. L2 audit because the PR defines protected governance / enterprise
   architecture direction.
3. QA/check for practical readability and handoff usability.
4. CTO review before #405 is treated as adopted direction for implementation
   beyond docs.

Passing PR1 does not approve PR2+ enforcement.

PR2 remains governed by its accepted review record and does not approve
enforcement.

For the Gate Completion Barrier, the next primary evidence is the machine gate
result at the exact head SHA. Human/LLM review after this point is advisory and
limited to verifying command behavior, JSON stability, blocker rules, tests,
and absence of unauthorized mutation. It must not restart the old broad review
conveyor as the primary acceptance path.

Passing this barrier slice does not approve branch protection, label mutation,
PR mutation, DB/queue integration, AUN dispatch, or enforcement adoption.
