---
id: OPS-DOGFOOD-222
status: Draft
traces:
  spec: [SPEC-DOGFOOD-222]
  impl: [IMPL-DOGFOOD-222]
  verify: [VERIFY-DOGFOOD-222]
---

# OPS: Phase 1 Internal Dogfood Start Gate

## 0. Corresponding SPEC
`docs/spec/phase1-internal-dogfood-start-gate.md` / SPEC-DOGFOOD-222.

## 1. Operator Flow
For Phase 1 internal dogfood work:

1. Create or link the task issue.
2. Confirm the task traces to the Goal Contract and Phase 1 plan.
3. Create SPEC/IMPL/VERIFY/OPS or explicit non-applicability evidence.
4. Request pre-implementation audit when the task changes workflow control behavior.
5. Run `shirube workflow check --action implementation_start --profile strict --json`.
6. Start or resume only when scoped strict decisions are not BLOCK.
7. Record lifecycle notification evidence for `task_start` or `blocked`.
8. After merge, record POSTMERGE-001 evidence when the PR contributes to phase exit claims.

## 2. What BLOCK Means
A strict BLOCK means ordinary framework-led implementation must not continue until the missing evidence is supplied or an authority-approved exception is recorded.

Allowed while blocked:

- create or repair the missing evidence;
- update docs/specs for the task;
- request audit;
- record issue comments or local evidence explaining the block.

Not allowed while blocked:

- claim readiness;
- merge runtime enforcement as completed without audit;
- use LLM memory as a substitute for evidence;
- silently skip notification records.

## 3. Admin Notification Fallback
#222 requires a lifecycle record, not a specific transport.

Acceptable interim records:

- GitHub issue or PR comment with the required lifecycle fields;
- local append-only JSONL under `.framework/`;
- another configured evidence sink that produces deterministic references.

AUN/Discord delivery is optional adapter behavior and belongs to #229 unless pulled into scope by a reviewed implementation change.

## 4. Incident Handling
| Incident | Response |
|----------|----------|
| strict start succeeds with missing #222 evidence | Treat as release-blocking bug for internal dogfood. |
| standard/minimal users are unexpectedly blocked during migration | Re-check profile mapping; downgrade to WARN unless the project is unapplied or role authority is invalid. |
| GitHub Issue is treated as Goal Contract approval | Block rollout; Issue intake is not approval evidence. |
| notification adapter is missing | Use local/GitHub record fallback and keep external delivery in #229. |
| POSTMERGE-001 evidence is missing for phase-exit PR | Do not claim phase exit until the record is added or L3 approves disposition. |

## 5. Rollback
If #222 runtime enforcement blocks valid existing workflows:

- disable strict dogfood usage for affected local work;
- keep `workflow status` and `workflow doctor` read-only diagnostics available;
- revert the start wiring before reverting the evidence model if the evidence model remains compatible;
- preserve local evidence files for audit continuity.
