---
id: SPEC-AUDITLEDGER-225
status: Draft
traces:
  impl: [IMPL-AUDITLEDGER-225]
  verify: [VERIFY-AUDITLEDGER-225]
  ops: [OPS-AUDITLEDGER-225]
---

# SPEC: Audit Evidence and Approval Ledger

## 0. Meta
- Origin Issue: #225
- Phase: Phase 1 internal applied dogfood
- Task: T3 AUDITLEDGER-001
- Related: #224, #226, #227, #232, POSTMERGE-001

## 1. Purpose
Create the Phase 1 minimum audit evidence and approval ledger so Shirube does
not rely on ad hoc GitHub, AUN, Discord, or agent memory comments for
L0/L1/L2/L3/L4 review evidence.

The ledger is evidence, not approval authority by itself. Scripts validate the
ledger shape and later workflow chain tasks may consume the records to derive
next actions.

## 2. Canonical Local Record
The canonical local file is `.framework/audit-ledger.json`.

Markdown may be accepted only when equivalent front matter or key-value
metadata can be parsed deterministically. Private reasoning and transient chat
memory are not ledger records.

Top-level required fields:

1. `schema_version`, normally `audit-ledger/v1`;
2. `ledger_id`;
3. `records`, a non-empty array.

Each record must include:

1. `audit_id`;
2. artifact type and reference;
3. audit level: `L0`, `L1`, `L2`, `L3`, or `L4`;
4. reviewer or approver identity and role/source;
5. verdict: `PASS`, `WARN`, `BLOCK`, or `CONDITIONALLY_PASS`;
6. timestamp;
7. evidence references, such as URLs, AUN message ids, or source ids;
8. reproduced commands or checks;
9. approved scope;
10. explicit non-claims;
11. conditions or required follow-ups, even when empty;
12. supersedes or amends relationship, even when empty;
13. phase, task, and goal linkage;
14. next-action derivation data.

Next-action derivation can be represented by `recommended_next_action`,
`next_action`, unresolved finding ids for BLOCK verdicts, or downstream gate
fields for PASS/WARN/CONDITIONALLY_PASS verdicts.

## 3. Gate Rules
| Rule | Gate | Strict decision when missing or invalid | Remediation |
|------|------|------------------------------------------|-------------|
| `G19.audit_ledger.record.present` | audit_ledger | BLOCK | Create `.framework/audit-ledger.json`. |
| `G19.audit_ledger.required_fields` | audit_ledger | BLOCK | Fill root `schema_version`, `ledger_id`, and `records`. |
| `G19.audit_ledger.record_shape` | audit_ledger | BLOCK | Add every required field to every audit record. |
| `G19.audit_ledger.next_action_derivable` | audit_ledger | BLOCK | Add next-action or finding/gate data to every audit record. |
| `G12.phase_closure.audit_ledger_refs` | phase_closure | BLOCK | Cite ledger record ids for L1/L2/L3 phase closure coverage. |

Minimal and standard profiles may WARN during migration. Strict mode is
required before using the ledger as Phase 1 internal dogfood evidence.

## 4. CLI Behavior
`shirube workflow check --action audit_ledger --profile strict --json` must fail
when the ledger is missing or incomplete.

`shirube workflow check --action phase_closure --profile strict --json` must
also require phase closure records to cite audit ledger records for L1/L2/L3
coverage.

Both checks are read-only. They must not create audit records, mutate phase
state, close issues, request reviews, or infer approvals from LLM text.

## 5. Acceptance Criteria
- Missing audit ledger produces strict BLOCK for
  `G19.audit_ledger.record.present`.
- Ledger root records missing schema, id, or records produce strict BLOCK.
- Incomplete audit records produce strict BLOCK for
  `G19.audit_ledger.record_shape`.
- Records without next-action derivation data produce strict BLOCK.
- A complete machine-readable ledger passes `audit_ledger` in strict mode.
- Phase closure strict checks require L1/L2/L3 ledger citations.
- Existing `implementation_start`, `remote_publish`, `merge`, and `release`
  action scopes do not inherit `audit_ledger` decisions.

## 6. Non-Goals
- Do not implement immutable enterprise retention in Phase 1.
- Do not make AUN, GitHub, or Discord mandatory.
- Do not use the ledger as merge authority by itself.
- Do not claim Phase 1 readiness, public MVP, OSS quality, or enterprise
  readiness from this task alone.

## 7. Acceptance Scenario
Acceptance scenario for strict audit ledger validation:

```gherkin
Given a Shirube project has no complete audit ledger record
When the operator runs `shirube workflow check --action audit_ledger --profile strict --json`
Then the check fails with deterministic G19 audit_ledger BLOCK decisions
And the failed decision includes rule id, gate, message, evidence refs, and remediation
```

Acceptance scenario for a complete ledger record:

```gherkin
Given `.framework/audit-ledger.json` contains a complete `audit-ledger/v1` record
When the operator runs `shirube workflow check --action audit_ledger --profile strict --json`
Then the check passes for the audit_ledger action scope
And unrelated action scopes are not blocked by audit_ledger rules
```

## 8. Evidence Projection
Ledger evidence is projected as:

- `workflow status --json` evidence records with kind `audit_ledger`;
- `workflow check --action audit_ledger --profile strict --json`;
- `workflow explain G19.audit_ledger.* --json`;
- local `.framework/audit-ledger.json`;
- GitHub issue or PR comments only when they quote or link exact ledger record
  ids.

## 9. Manual Review Boundary
L1/L2 review is required before merging this ledger implementation.

L3 is required before ledger records become phase-transition authority input.
Passing `audit_ledger` only proves the local ledger shape is complete.

## 10. 制御機構選定原則
script 選定根拠: Audit ledger readiness must be deterministic, replayable,
and inspectable without LLM judgment. TypeScript workflow-state evaluators and
CLI checks are the primary control mechanism because they emit stable JSON,
return non-zero on scoped BLOCK decisions, and can be covered by fixtures.

Hook 選定根拠: hooks are intentionally not adopted in this slice. A later hook
may call the same script-controlled `audit_ledger` check only for unavoidable
local interception, but hooks must not become canonical audit evidence or
approval authority.

MCP/GitHub 選定根拠: MCP wrappers and GitHub Checks remain downstream
projection surfaces. They may project `G19.audit_ledger.*` decisions later,
but #225 does not use them as the source of truth.

## 11. Testing Layer
Runtime implementation must include:

- unit or command fixtures for missing audit ledger records;
- unit or command fixtures for incomplete root fields;
- regression fixtures for incomplete record shape;
- regression fixtures for missing next-action derivation data;
- positive fixtures where strict `audit_ledger` passes;
- smoke coverage that phase closure cites audit ledger records without changing
  unrelated action scopes.
