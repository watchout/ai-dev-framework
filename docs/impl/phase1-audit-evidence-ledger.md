---
id: IMPL-AUDITLEDGER-225
status: Draft
traces:
  spec: [SPEC-AUDITLEDGER-225]
  verify: [VERIFY-AUDITLEDGER-225]
  ops: [OPS-AUDITLEDGER-225]
---

# IMPL: Audit Evidence and Approval Ledger

## 0. Corresponding SPEC
`docs/spec/phase1-audit-evidence-ledger.md` / SPEC-AUDITLEDGER-225.

## 1. Implementation Slices

### Slice A: Evidence Kind and Reader
Add `audit_ledger` to `WorkflowEvidenceKind`.

Read the first non-empty deterministic local ledger from:

- `.framework/audit-ledger.json`;
- `.framework/audit-ledger.md`;
- `.framework/audit/ledger.json`;
- `.framework/audit-ledger/latest.json`;
- `.framework/audits/ledger.json`;
- `docs/management/audit-ledger.md`.

### Slice B: Ledger Validation
Validate the root ledger fields and every audit record.

Record validation must distinguish:

- root field gaps;
- record shape gaps;
- next-action derivation gaps.

Boolean `false`, placeholder strings, empty strings, and empty records do not
count as evidence. Empty `conditions` and `supersedes` arrays may count as
present fields because some PASS records have no conditions or superseded
records.

### Slice C: Workflow Decisions
Project the validator through read-only `workflow-state/v1` decisions:

- `G19.audit_ledger.record.present`;
- `G19.audit_ledger.required_fields`;
- `G19.audit_ledger.record_shape`;
- `G19.audit_ledger.next_action_derivable`.

The `audit_ledger` action scope includes only these rules.

### Slice D: Phase Closure Citation
Extend phase closure validation with
`G12.phase_closure.audit_ledger_refs`.

The closure record passes this rule when it has either:

- a non-empty root `audit_ledger_refs` / `audit_records` register; or
- L1/L2/L3 audit matrix entries with explicit `audit_id`, `audit_ref`,
  `ledger_ref`, `ledger_record_id`, or `record_id`.

### Slice E: Documentation and Fixtures
Add focused command fixtures that cover:

- missing ledger;
- incomplete ledger record;
- complete ledger record;
- phase closure missing ledger citations;
- phase closure complete record with ledger citations.

## 2. File-Level Impact
- `src/cli/lib/workflow-state.ts`;
- `src/cli/lib/workflow-observability.ts`;
- `src/cli/commands/workflow.ts`;
- `src/cli/commands/workflow.test.ts`;
- `docs/spec/phase1-audit-evidence-ledger.md`;
- `docs/impl/phase1-audit-evidence-ledger.md`;
- `docs/verify/phase1-audit-evidence-ledger.md`;
- `docs/ops/phase1-audit-evidence-ledger.md`.

## 3. Compatibility Rules
- Do not create or mutate ledger files from `workflow check`.
- Do not require GitHub or AUN to validate local ledger shape.
- Do not make `audit_ledger` blocks affect unrelated action scopes.
- Do not treat unstructured comments as evidence unless they are represented
  by a deterministic ledger field.
- Preserve #224 phase closure behavior except for the new ledger-citation
  requirement.

## 4. Future Integration
#226 should move the temporary `G19.audit_ledger.*` rule family into the
canonical action registry if the registry assigns a different gate id.

#227 should consume valid ledger records when deriving the next action after
review completion.
