---
id: SPEC-PRCONVEYOREVIDENCE-267
status: Draft
traces:
  impl: [IMPL-PRCONVEYOREVIDENCE-267]
  verify: [VERIFY-PRCONVEYOREVIDENCE-267]
  ops: [OPS-PRCONVEYOREVIDENCE-267]
---

# SPEC: PR Conveyor Evidence and Audit Timing

## 0. Meta
- Origin Issue: #267
- Parent Issue: #266
- Depends on: #269 delivery profile schema, #270 Work Order defaults
- Related: #264 4MCP safety profile, #249 Governance Bone

## 1. Purpose
Require PR evidence to state delivery strategy, risk class, audit timing,
runner identity, verification, residual risk, stop conditions, and merge
authority so auditors can safely process PR Conveyor work.

This slice makes PR evidence visible and checkable. It does not automate audit,
queue transitions, runner dispatch, or merge.

## 2. Authority Boundary
PR evidence is not approval evidence by itself.

- R0-R2 PRs may move to Audit Pending after PR creation.
- R3 PRs require audit before merge or owner adoption.
- R4 work requires approval/audit before execution.
- Merge authority remains separate.
- AUN live dispatch remains disabled.

## 3. Required PR Evidence
PR Conveyor evidence must include:

- Work Order / issue;
- delivery strategy;
- lane;
- risk class;
- audit timing;
- queue state;
- runner identity;
- runtime mode;
- implementation owner;
- review owner;
- audit owner;
- merge authority;
- changed files;
- verification commands;
- verification results;
- residual risk;
- stop conditions encountered.

R3 merge-ready claims require audit refs. R4 merge-ready claims require both
audit refs and approval refs.

## 4. Audit Timing Rules
| Risk | Required timing |
|------|-----------------|
| `R0` | after PR creation, before merge |
| `R1` | after PR creation, before merge |
| `R2` | after PR creation, before merge |
| `R3` | before merge or owner adoption |
| `R4` | before execution |

R3 must not use `after_pr`. R4 must use `before_execution`.

## 5. Gate Behavior
The first implementation adds:

- `shirube check pr-evidence <files...>`;
- `--strict`;
- `--json`;
- Markdown PR body/template parsing.

Missing evidence is warning-first unless `--strict` is used. Unsafe audit timing
and unsafe merge-ready claims are BLOCK because they would misroute audit or
approval.

## 6. Template Behavior
The governance PR template must include a PR Conveyor evidence section with the
required fields. The template projects evidence for reviewers but does not grant
approval or merge authority.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- PR template makes PR Conveyor evidence visible;
- R0-R2 PR can proceed to Audit Pending after creation;
- R3/R4 evidence cannot claim merge-ready without required audit/approval;
- missing evidence fields are reported;
- check output is available as text and JSON.

R0-R2 scenario:

```gherkin
Given PR evidence declares risk_class R2
And audit_timing is after_pr
And queue_state is audit_pending
When the PR evidence check runs in strict mode
Then the result is PASS
```

R3 scenario:

```gherkin
Given PR evidence declares risk_class R3
And merge readiness is merge_ready
And audit refs are missing
When the PR evidence check runs
Then the result is BLOCK
```

R4 scenario:

```gherkin
Given PR evidence declares risk_class R4
And merge readiness is merge_ready
And approval refs are missing
When the PR evidence check runs
Then the result is BLOCK
```

## 8. Implementation Contract
Implement:

- deterministic Markdown validator;
- CLI check command;
- governance PR template update;
- PR evidence example template;
- unit and CLI tests.

## 9. Review Boundary
This slice is R3/Governed because it affects audit timing and merge-readiness
claims.

Required review:

- L1 spec review;
- L2 implementation audit;
- L3 before merge readiness if required by the active governance route.

## 10. 制御機構選定原則
script 選定根拠: PR evidence and audit timing must be deterministic and
auditable before queue projection or runner automation consumes them.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later call the same check
but cannot own audit timing truth.

GitHub 選定根拠: PR bodies/templates are the native evidence projection surface
for GitHub-native operation.

LLM boundary: LLM output may draft PR evidence but cannot satisfy missing
audit/approval refs, approve R4 execution, or merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Required PR evidence | CLI script | - | deterministic Markdown check |
| Audit timing | CLI script | - | prevents R3/R4 misrouting |
| Template projection | GitHub template | - | visible reviewer evidence |
| Merge-ready safety | CLI script | - | blocks claims without audit/approval refs |

## 11. Testing Layer
The implementation must add unit, integration-style CLI, regression, and smoke
fixtures for:

- complete R0-R2 audit-pending evidence;
- missing evidence fields;
- strict missing evidence failure;
- R3 after-PR timing block;
- R3 merge-ready without audit refs;
- R4 merge-ready without approval refs;
- directory input and JSON output.

## 12. Non-Goals
- Do not implement GitHub queue labels or WIP projection (#268).
- Do not implement runner instruction packs (#271).
- Do not implement rollout batch Work Orders (#273).
- Do not implement AUN bridge (#272).
- Do not enable live AUN dispatch.
- Do not automate merge.
