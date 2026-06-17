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

## 7. Review Requirements

PR1 requires:

1. L1 audit for doc completeness and source alignment.
2. L2 audit because the PR defines protected governance / enterprise
   architecture direction.
3. QA/check for practical readability and handoff usability.
4. CTO review before #405 is treated as adopted direction for implementation
   beyond docs.

Passing PR1 does not approve PR2+ enforcement.
