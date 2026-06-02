---
id: SPEC-GITHUBQUEUEWIP-268
status: Draft
traces:
  impl: [IMPL-GITHUBQUEUEWIP-268]
  verify: [VERIFY-GITHUBQUEUEWIP-268]
  ops: [OPS-GITHUBQUEUEWIP-268]
---

# SPEC: GitHub Queue Labels and WIP Projection

## 0. Meta
- Origin Issue: #268
- Parent Issue: #266
- Depends on: #269 delivery profile schema, #270 Work Order defaults, #267 PR evidence
- Related: #264 4MCP safety profile, #249 Governance Bone

## 1. Purpose
Represent PR Conveyor queue state in GitHub labels and deterministic projection
files before AUN live dispatch exists.

The first source of truth is GitHub issue/PR state:

- Work Order issue;
- PR;
- labels;
- PR evidence;
- audit comments;
- merge event.

This slice makes that state checkable. It does not create labels on GitHub,
mutate issue/PR state, dispatch runners, approve execution, or merge.

## 2. Queue Labels
Repositories using the IYASAKA internal PR Conveyor profile should define these
labels or an equivalent projection:

- `ready-for-implementation`
- `implementing`
- `evidence-ready`
- `audit-pending`
- `changes-requested`
- `rework-implementing`
- `audit-passed`
- `merge-ready`
- `blocked-stop-lane`

Each label maps to one queue state. `evidence-ready` projects
`pr_opened_evidence_ready`; `blocked-stop-lane` projects `blocked_stop_lane`.

## 3. Projection Contract
A projection document must use `projection_version:
github-queue-projection/v1` and include:

- repository;
- labels;
- WIP policy;
- items.

Items are GitHub issue/PR projections. PR WIP checks only count open pull
requests.

## 4. WIP Policy
The IYASAKA internal defaults are:

| WIP class | Limit per repo |
|-----------|----------------|
| Fast Lane PRs | 3 |
| Governed Draft PRs | 2 |
| Rework PRs | 2 |
| Stop Lane PRs without approval | 0 |

Fast Lane and Rework over-limit findings are warning-first unless strict mode is
used. Governed Draft over-limit findings are BLOCK because R3 work requires
before-merge/adoption audit discipline. Stop Lane without approval is BLOCK
because R4 work requires approval/audit before execution.

## 5. Gate Behavior
The first implementation adds:

- `shirube check github-queue <files...>`;
- `--strict`;
- `--json`;
- a label definition template;
- a queue projection example.

Missing labels or malformed projection fields are warning-first unless
`--strict` is used. Stop Lane without approval is always BLOCK.

## 6. AUN Boundary
AUN may later consume the same queue projection, but this slice does not make
AUN a control plane.

Forbidden in this slice:

- AUN live dispatch;
- AUN runner selection;
- AUN approval;
- GitHub label mutation by Shirube;
- automatic merge.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- GitHub issue/PR labels can represent conveyor state;
- WIP over-limit can be reported as warning or block depending on risk;
- the queue model works without AUN dispatch;
- future AUN integration can consume the same state model.

Valid projection scenario:

```gherkin
Given a GitHub queue projection includes all required labels
And WIP counts are within policy
When `shirube check github-queue --strict` runs
Then the result is PASS
```

Fast Lane over-limit scenario:

```gherkin
Given Fast Lane open PR count exceeds 3
When the queue projection check runs in warning mode
Then the result is WARNING
```

Stop Lane scenario:

```gherkin
Given an open R4 or Stop Lane PR has no approval evidence
When the queue projection check runs
Then the result is BLOCK
```

## 8. Implementation Contract
Implement:

- deterministic JSON projection validator;
- CLI check command;
- label template;
- projection example;
- unit and CLI tests.

## 9. Review Boundary
This slice is R3/Governed because queue state and WIP policy influence audit and
merge lane prioritization.

Required review:

- L1 spec review;
- L2 implementation audit;
- L3 before merge readiness if required by the active governance route.

## 10. 制御機構選定原則
script 選定根拠: Queue projection and WIP limits must be deterministic and
auditable before GitHub Projects or AUN consume them.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later call the same check,
but cannot own queue truth.

GitHub 選定根拠: GitHub issue/PR labels are the native queue projection surface
for the initial PR Conveyor.

LLM boundary: LLM output may draft queue projection evidence but cannot approve
Stop Lane execution, move merge authority, or merge.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Queue labels | GitHub label projection | - | visible GitHub-native state |
| WIP policy | CLI script | - | deterministic local/CI check |
| Stop Lane approval boundary | CLI script | - | fail-closed R4 safety |
| Future AUN consumption | JSON projection | - | same state model, no parallel queue |

## 11. Testing Layer
The implementation must add unit and CLI fixtures for:

- complete projection within WIP limits;
- missing queue labels in warning and strict mode;
- Fast Lane over-limit warning;
- Governed Draft over-limit block;
- Stop Lane without approval block;
- directory input and JSON output.

## 12. Non-Goals
- Do not create, edit, or delete live GitHub labels.
- Do not implement GitHub Projects automation.
- Do not implement AUN bridge (#272).
- Do not implement runner instruction packs (#271).
- Do not enable AUN live dispatch.
- Do not automate merge.
