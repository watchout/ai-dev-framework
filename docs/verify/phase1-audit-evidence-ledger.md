---
id: VERIFY-AUDITLEDGER-225
status: Draft
traces:
  spec: [SPEC-AUDITLEDGER-225]
  impl: [IMPL-AUDITLEDGER-225]
  ops: [OPS-AUDITLEDGER-225]
---

# VERIFY: Audit Evidence and Approval Ledger

## 0. Corresponding SPEC
`docs/spec/phase1-audit-evidence-ledger.md` / SPEC-AUDITLEDGER-225.

## 1. Required Checks
- `npm run type-check`
- `npm test -- src/cli/commands/workflow.test.ts`
- `npm run build:cli`
- `git diff --check`

Full `npm test` is recommended before PR ready state. Existing unrelated
timeout hygiene remains tracked in #233 if reproduced.

## 2. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| missing `.framework/audit-ledger.json` | strict `audit_ledger` BLOCK |
| root ledger missing required fields | strict `audit_ledger` BLOCK |
| audit record missing commands or scope data | strict `record_shape` BLOCK |
| PASS record without next action or downstream gates | strict `next_action_derivable` BLOCK |
| complete machine-readable record | strict `audit_ledger` PASS |
| phase closure without L1/L2/L3 ledger citations | strict `phase_closure` BLOCK |
| phase closure with ledger citations | strict `phase_closure` PASS |

## 3. Regression Boundaries
- `workflow doctor` remains diagnostic and exits 0 even when ledger WARN/BLOCK
  decisions exist.
- `implementation_start` is not blocked by missing audit ledger unless #226/#227
  explicitly add that action dependency.
- `remote_publish`, `merge`, and `release` retain their existing rule scopes.
- Markdown comments or AUN messages do not count unless represented by ledger
  fields.

## 4. Review Evidence
The PR must include:

- command output summary for the checks above;
- L1/L2 review links;
- L3 link before using ledger records as phase-transition authority;
- explicit non-claims for Phase 1 readiness, public MVP, OSS quality, and
  enterprise readiness.
