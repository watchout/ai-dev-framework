---
id: IMPL-AUNGATEPROFILE-252
status: Draft
traces:
  spec: [SPEC-AUNGATEPROFILE-252]
  verify: [VERIFY-AUNGATEPROFILE-252]
  ops: [OPS-AUNGATEPROFILE-252]
---

# IMPL: Aun Gate Lite Shirube Profile

## 0. Corresponding SPEC
`docs/spec/phase1-aun-gate-lite-profile.md` /
SPEC-AUNGATEPROFILE-252.

## 1. Implementation Intent
This document defines the implementation plan only. This PR must remain
docs-only until L1 spec review passes.

## 2. Planned Slices

### Slice A: Profile Model
Introduce a deterministic Aun Gate profile model with:

- `schema_migration`;
- `policy_evaluator`;
- `approval_lifecycle`;
- `execution_ledger`;
- `projection`;
- `product_demo`.

Each class maps to default mode, risk level, common fields, and
class-specific evidence.

### Slice B: Governance Bone Composition
Compose this profile with the #249 Governance Bone validator using the
`infrastructure` profile.

The implementation must not duplicate the Goal -> Phase -> Work Order -> PR
Slice -> Scripted Step -> Tool Execution -> Evidence hierarchy.

### Slice C: CLI Check
After L1 PASS, add a deterministic command such as:

```bash
shirube check aun-gate --pr-class policy_evaluator <files...>
```

Planned options:

- `--pr-class <class>`;
- `--mode warning|strict`;
- `--strict`;
- `--json`.

### Slice D: Non-Negotiable Blocks
The implementation must block:

- live action execution before AUN runtime stability evidence;
- silent fallback for missing approval/context/recovery/policy/audit evidence;
- cross-repository substitution of execution or approval authority.

### Slice E: Docs and CI Examples
Add operations guidance and examples for running the check in product PRs after
the validator exists.

## 3. File-Level Plan
Planned implementation files after L1 PASS:

- `src/cli/lib/aun-gate-profile-validator.ts`;
- `src/cli/lib/aun-gate-profile-validator.test.ts`;
- `src/cli/commands/check.ts`;
- `src/cli/commands/check-governance.test.ts`;
- optional template/docs examples.

This spec-only PR should only add:

- `docs/spec/phase1-aun-gate-lite-profile.md`;
- `docs/impl/phase1-aun-gate-lite-profile.md`;
- `docs/verify/phase1-aun-gate-lite-profile.md`;
- `docs/ops/phase1-aun-gate-lite-profile.md`;
- roadmap trace.

## 4. Compatibility Rules
- Do not call AUN queues, AUN runtime, or MCP tools.
- Do not mutate GitHub issues/PRs beyond manual evidence comments.
- Do not make this profile a merge-authority gate in the first implementation.
- Do not block schema/policy design solely because AUN live execution is not
  stable.
- Do block live execution enablement without stability prerequisite evidence.

## 5. Implementation Exit Condition
Implementation may start only after L1 spec review records PASS or requested
changes are resolved.
