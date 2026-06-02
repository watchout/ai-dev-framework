---
id: OPS-AUNGATEPROFILE-252
status: Draft
traces:
  spec: [SPEC-AUNGATEPROFILE-252]
  impl: [IMPL-AUNGATEPROFILE-252]
  verify: [VERIFY-AUNGATEPROFILE-252]
---

# OPS: Aun Gate Lite Shirube Profile

## 0. Corresponding SPEC
`docs/spec/phase1-aun-gate-lite-profile.md` /
SPEC-AUNGATEPROFILE-252.

## 1. Spec-Only Operation
Until L1 spec review passes, operators must treat this profile as design
guidance only.

Do not:

- wire CI checks;
- dispatch AUN queues;
- call AUN runtime;
- claim merge authority;
- claim live execution readiness.

## 2. Manual L1 Report Format
Manual L1 review should report:

- PR URL;
- exact head;
- PR class taxonomy correctness;
- evidence field completeness;
- AUN/Shirube/Kodama/Wasurezu/product authority separation;
- live-execution boundary correctness;
- whether implementation may begin.

## 3. Future CLI Usage
After implementation and L2 review, expected usage is:

```bash
shirube check aun-gate --pr-class policy_evaluator pr-body.md
```

For warning-first schema/profile preparation:

```bash
shirube check aun-gate --pr-class schema_migration --mode warning pr-body.md
```

For execution ledger work:

```bash
shirube check aun-gate --pr-class execution_ledger --strict pr-body.md
```

## 4. Runtime Stability Handling
AUN runtime stability is external prerequisite evidence.

If runtime stability is missing:

- schema and policy design may continue with no-live-execution boundary;
- live execution, action dispatch, and production broker enablement must stay
  blocked;
- missing stability evidence must be reported explicitly, not treated as
  allowed.

## 5. Rollback
Rollback for this spec-only PR is reverting the docs and roadmap trace. No
runtime, MCP, AUN queue, GitHub workflow, or product system state is mutated by
this PR.
