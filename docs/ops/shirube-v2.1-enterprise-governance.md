---
id: OPS-SHIRUBEV21-406
status: Draft
traces:
  spec: [SPEC-SHIRUBEV21-406]
  impl: [IMPL-SHIRUBEV21-406]
  verify: [VERIFY-SHIRUBEV21-406]
---

# OPS: Shirube v2.1 Enterprise Governance Kernel

## 0. Meta

- Origin issue: #406.
- Parent SSOT: #405.
- Corresponding SPEC: `docs/spec/shirube-v2.1-enterprise-governance.md`.
- Corresponding IMPL: `docs/impl/shirube-v2.1-enterprise-governance.md`.
- Corresponding VERIFY: `docs/verify/shirube-v2.1-enterprise-governance.md`.
- Operational status: documentation-only adoption profile.

## 1. Operator Summary

PR1 creates the v2.1 enterprise governance map. Operators should treat it as a
reviewable direction contract, not as active enforcement.

After PR1:

- names and boundaries are stable enough for schema fixture work;
- Core v2.1 and Advanced v2.1+ are separated;
- GitHub remains durable SSOT for GitHub-backed work;
- AUN remains acceleration and transport, not completion authority;
- Codex Goal Mode is available as a runner policy, not a required dependency;
- no runtime, CI, branch protection, DB, AUN, Discord, or LaunchAgent behavior
  changes have occurred.

## 2. Adoption Status

| Capability | PR1 status | Operator action |
|---|---|---|
| Product frame | Documented. | Review for source alignment. |
| Object model | Documented. | Use names in PR2 schema fixtures. |
| State machine | Documented. | Do not enforce until evaluator PRs land. |
| R0-R4 risk classes | Documented. | Use for review language; no automatic gate. |
| Policy-as-Code | Reserved. | Do not create blocking policy checks in PR1. |
| Required Evidence Evaluator | Reserved. | Wait for read-only evaluator PR. |
| Evidence Gate | Reserved. | Wait for policy/evidence PRs and CTO review. |
| Trace Matrix | Reserved. | Use as schema target in PR2/PR3. |
| GitHub Check projection | Direction documented. | Do not add required checks or branch protection. |
| Advanced v2.1+ | Classified. | Track separately after first-wave core. |

## 3. Review And Handoff Flow

Required post-implementation flow:

```text
Implementation Handoff
  -> L1 audit
    -> L2 audit
      -> QA/check
        -> CTO review
```

Review responsibilities:

- L1 checks source alignment, completeness, and docs/spec-only scope.
- L2 checks protected governance risk, enterprise architecture boundaries,
  hidden enforcement implications, and Core/Advanced split.
- QA/check checks practical readability, handoff usefulness, and verification
  evidence.
- CTO review decides whether #405 direction may be treated as adopted for PR2+
  implementation planning.

No reviewer should treat PR1 as enabling enforcement by itself.

## 4. Runtime And Live Automation Boundary

Operators must not use PR1 to change:

- GitHub branch protection;
- required status checks;
- label sync;
- scanner workflow enforcement;
- merge queue configuration;
- AUN dispatch or queue lifecycle;
- DB schema or data;
- LaunchAgents;
- Discord/live automation;
- runtime runner wiring;
- external repository state.

If any future work needs those changes, it must be a separate protected PR with
explicit evidence, review, and rollback/stop handling.

## 5. Handoff Template

PR1 Implementation Handoff should use this shape:

```text
## Implementation Handoff

Issue: #406
Parent SSOT: #405
PR:

### Changed Files
- docs/spec/shirube-v2.1-enterprise-governance.md
- docs/impl/shirube-v2.1-enterprise-governance.md
- docs/verify/shirube-v2.1-enterprise-governance.md
- docs/ops/shirube-v2.1-enterprise-governance.md
- docs/specs/roadmap.md

### Summary
- Added Shirube v2.1 enterprise governance kernel docs.
- Fixed object names, boundaries, schema map, Core/Advanced split, and
  implementation sequence.

### Contract Names Reserved
- shirube-policy/v2.1
- shirube-risk-classification/v1
- shirube-policy-evaluation-result/v1
- shirube-evidence-record/v1
- shirube-trace-matrix/v2.1
- shirube-ai-change-record/v1
- shirube-security-evidence/v1
- shirube-db-evidence/v1
- shirube-test-evidence/v1
- shirube-contract-evidence/v1

### Tests / Checks Run
- git diff --check
- npm test
- any additional checks, or explicit reason not run

### Known Risks / Open Questions
- Direction is governance-sensitive and needs L1/L2/QA/check/CTO review.
- PR2+ must not turn projection or evaluator work into enforcement without
  protected review.

### Non-Claims
- No runtime behavior changed.
- No enforcement/CI/branch protection/label sync changed.
- No AUN/DB/LaunchAgent/Discord/live automation changed.
- #405 is not complete.

### Next Required Review
L1/L2 audit -> QA/check -> CTO review.
```

## 6. Stop Conditions For PR2+

Stop and request governance review if a follow-up PR attempts to:

- convert read-only evaluator output into blocking enforcement;
- add required GitHub checks or branch protection;
- mutate labels or workflow state from projection code;
- treat AUN ACK, Discord message, or queue id as completion evidence;
- run against live DB/queue/runtime state;
- add SLSA/in-toto, cross-agent adversarial review, cost/eval gates, or
  tamper-evident ledger work to first-wave core without CTO approval;
- broaden Codex Goal Mode into a core architecture dependency.

## 7. Rollback

Because PR1 is documentation-only, rollback is a documentation revert or
superseding docs PR. No runtime rollback, DB migration rollback, queue repair,
LaunchAgent recovery, Discord cleanup, or branch-protection revert should be
needed from PR1.
