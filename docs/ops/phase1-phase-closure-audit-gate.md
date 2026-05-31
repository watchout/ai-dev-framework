---
id: OPS-PHASECLOSURE-224
status: Draft
traces:
  spec: [SPEC-PHASECLOSURE-224]
  impl: [IMPL-PHASECLOSURE-224]
  verify: [VERIFY-PHASECLOSURE-224]
---

# OPS: Phase Closure Audit Gate

## 0. Corresponding SPEC
`docs/spec/phase1-phase-closure-audit-gate.md` /
SPEC-PHASECLOSURE-224.

## 1. Operator Flow
1. Create or update `.framework/phase-closure.json`.
2. Include the exact phase objective and readiness claim.
3. List completed tasks and merged PRs.
4. Attach L0 evidence and L1/L2/L3 coverage.
5. Confirm unresolved blockers are empty.
6. Assign and justify every deferred/non-blocking carryover.
7. Record residual risks, explicit non-claims, next entry conditions, and
   reopen/escalation criteria.
8. Attach POSTMERGE-001 evidence for every PR that supports the phase claim.
9. Cite audit ledger record ids for L1/L2/L3 closure coverage.
10. Run `shirube workflow check --action phase_closure --profile strict --json`.
11. Request L1/L2/L3 review before using the result as a phase transition claim.

The required registers must be present at the closure record root. Do not rely
on nested `tasks`, `prs`, or `postmerge_evidence` fields inside unrelated
carryover objects to satisfy the closure claim. Boolean `false` and placeholder
values such as `missing`, `pending`, `todo`, or `tbd` are treated as absent.

## 2. What BLOCK Means
A strict BLOCK means Shirube must not claim the phase complete.

Allowed while blocked:

- repair the closure record;
- add missing audit evidence;
- move non-blocking findings into justified carryovers;
- request audit.

Not allowed while blocked:

- claim phase readiness;
- close the phase;
- imply MVP, OSS, public, or enterprise readiness;
- use chat memory as evidence.

## 3. Incident Handling
| Incident | Response |
|----------|----------|
| closure record missing | Create `.framework/phase-closure.json` from the required shape. |
| unresolved blockers remain | Keep the phase open or get L3-approved disposition. |
| carryover has no safety rationale | Add owner, reason, target phase/task, and non-claim. |
| POSTMERGE evidence missing | Add PR post-merge evidence before closure. |
| audit ledger refs missing | Add root `audit_ledger_refs` or per-level audit matrix refs. |
| phase closure check passes but evidence is stale | Reopen/escalate under the closure record criteria. |

## 4. Rollback
If the gate blocks valid local migration work, use minimal or standard profile
for diagnostics only. Strict phase closure claims must remain blocked until the
closure record is fixed or L3 approves an exception.
