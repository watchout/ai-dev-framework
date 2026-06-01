---
id: OPS-AUDITLEDGER-225
status: Draft
traces:
  spec: [SPEC-AUDITLEDGER-225]
  impl: [IMPL-AUDITLEDGER-225]
  verify: [VERIFY-AUDITLEDGER-225]
---

# OPS: Audit Evidence and Approval Ledger

## 0. Corresponding SPEC
`docs/spec/phase1-audit-evidence-ledger.md` / SPEC-AUDITLEDGER-225.

## 1. Operator Flow
1. Create or update `.framework/audit-ledger.json`.
2. Add one record per L0/L1/L2/L3/L4 audit or approval event.
3. Include artifact reference, reviewer identity, verdict, evidence links,
   reproduced commands, approved scope, non-claims, conditions, supersedes or
   amends fields, phase/task/goal linkage, and next-action data.
4. Run `shirube workflow check --action audit_ledger --profile strict --json`.
5. If the record supports phase closure, cite the ledger ids from the closure
   record through `audit_ledger_refs` or L1/L2/L3 audit matrix entries.
6. Run `shirube workflow check --action phase_closure --profile strict --json`
   before any phase closure claim.

## 2. Minimal JSON Shape
```json
{
  "schema_version": "audit-ledger/v1",
  "ledger_id": "phase1-t3-ledger",
  "records": [
    {
      "audit_id": "AUDIT-P1-T3-L2",
      "artifact": {
        "type": "pr",
        "ref": "https://github.com/watchout/ai-dev-framework/pull/999"
      },
      "level": "L2",
      "reviewer": {
        "type": "agent",
        "id": "codex-audit",
        "role": "auditor",
        "source": "github"
      },
      "verdict": "PASS",
      "timestamp": "2026-05-27T00:00:00.000Z",
      "evidence_urls": [
        "https://github.com/watchout/ai-dev-framework/pull/999#issuecomment-1"
      ],
      "commands": ["npm run type-check"],
      "approved_scope": "runtime and documentation slice only",
      "explicit_non_claims": ["No Phase 1 closure claim"],
      "conditions": [],
      "supersedes": [],
      "phase": "Phase 1",
      "task": "T3 #225",
      "goal": "internal applied dogfood",
      "downstream_gates_remaining": ["L3", "merge", "postmerge"],
      "recommended_next_action": "request_l3_review"
    }
  ]
}
```

## 3. What BLOCK Means
A strict `audit_ledger` BLOCK means the record is not usable as structured
approval evidence.

Allowed while blocked:

- repair the ledger;
- add missing evidence links or commands;
- record unresolved findings for BLOCK verdicts;
- add downstream gate or next-action data.

Not allowed while blocked:

- cite the ledger as approval evidence;
- use it for phase closure;
- derive next actions from it;
- claim Phase 1 readiness from it.

## 4. Incident Handling
| Incident | Response |
|----------|----------|
| ledger missing | Create `.framework/audit-ledger.json`. |
| record shape invalid | Add the missing required fields. |
| BLOCK verdict has no finding ids | Add unresolved or blocking findings. |
| PASS verdict has no next action | Add `recommended_next_action` or downstream gates. |
| phase closure lacks ledger refs | Add root `audit_ledger_refs` or L1/L2/L3 matrix refs. |

## 5. Rollback
If the ledger gate blocks valid migration work, use minimal or standard profile
for diagnostics only. Strict evidence claims must remain blocked until the
ledger is fixed or L3 approves an explicit exception.
