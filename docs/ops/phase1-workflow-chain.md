---
id: OPS-WORKFLOWCHAIN-227
status: Draft
traces:
  spec: [SPEC-WORKFLOWCHAIN-227]
  impl: [IMPL-WORKFLOWCHAIN-227]
  verify: [VERIFY-WORKFLOWCHAIN-227]
---

# OPS: Script-Controlled Workflow Chain

## 0. Corresponding SPEC
`docs/spec/phase1-workflow-chain.md` / SPEC-WORKFLOWCHAIN-227.

## 1. Operator Flow
Inspect the full derived chain:

```bash
shirube workflow chain status --json
```

Check a target transition:

```bash
shirube workflow chain check --action implementation_start --profile strict --json
```

Use exact transition ids for ambiguous cases:

```bash
shirube workflow chain check --action merge_authority --profile strict --json
shirube workflow chain check --action merge --profile strict --json
```

## 2. Evidence Artifacts
The first slice accepts non-empty local artifacts for chain-specific evidence:

- `.framework/goal-sufficient-conditions.json`;
- `.framework/carryover-ledger.json`;
- `.framework/feature-catalog.json`;
- `.framework/implementation-evidence.json`;
- `.framework/implementation-audit.json`;
- `.framework/postmerge-001.json`;
- `.framework/goal-progress.json`;
- `.framework/carryover-assignment.json`.

Markdown alternatives listed in the SPEC are also accepted.

## 3. Report Handling
`workflow chain status` is a projection. It must not be used as approval.

`workflow chain check` is the enforcement-capable wrapper. It still does not
grant merge, phase, or goal authority; it only reports whether deterministic
preconditions are missing.

## 4. Adapter Guidance
| Adapter | First-slice behavior |
|---------|----------------------|
| CLI | emits JSON status/check |
| GitHub | out of scope |
| MCP | out of scope |
| Hook | out of scope |
| AUN/runtime | out of scope |

## 5. Rollback
If chain derivation regresses existing workflow behavior, revert the #227 PR.
The previous workflow status/check/doctor/explain commands remain independent
and should continue to operate without `workflow-chain/v1`.
