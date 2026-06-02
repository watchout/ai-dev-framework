---
id: SPEC-RUNNERPACKS-271
status: Draft
traces:
  impl: [IMPL-RUNNERPACKS-271]
  verify: [VERIFY-RUNNERPACKS-271]
  ops: [OPS-RUNNERPACKS-271]
---

# SPEC: PR Conveyor Runner Instruction Packs

## 0. Meta
- Origin Issue: #271
- Parent Issue: #266
- Depends on: #270 Work Order defaults, #267 PR evidence, #268 GitHub queue projection
- Related: #264 4MCP safety profile, #249 Governance Bone

## 1. Purpose
Define runner-agnostic instruction packs so humans, Codex, Claude Code,
headless scripts, and future AUN-dispatched runners can execute the same
bounded Work Order contract.

This slice makes runner instructions checkable. It does not dispatch runners,
execute Work Orders, enable AUN live dispatch, or merge.

## 2. Common Runner Contract
Every runner must follow the same steps:

- read Work Order;
- verify authority and lane/risk;
- execute only allowed files/actions;
- run verification;
- open/update PR or report no PR needed;
- write PR evidence;
- return result state.

## 3. Required Result States
Runner output must use one of:

- `completed_pr_opened`
- `completed_no_pr_needed`
- `blocked_requires_input`
- `blocked_requires_audit`
- `blocked_requires_approval`
- `failed_verification`
- `skipped_not_authorized`

## 4. Required Evidence
Runner output must preserve:

- runner identity;
- runtime mode;
- Work Order id;
- branch or PR ref;
- changed files;
- verification results;
- residual risk;
- stop conditions encountered.

## 5. Runner Packs
The minimum pack set is:

- human;
- Codex;
- Claude Code;
- CI/headless script;
- future AUN-dispatched runner.

The contract must not require Codex-specific `/goal` semantics. Codex may use
goal continuation locally, but the Work Order must remain executable by Claude
Code, a human, or a headless runner without that interface.

## 6. Stop Boundary
Stop conditions must instruct the runner to record a blocker and move no
further. Protected operations require approval and must not be performed by the
runner instruction pack:

- merge;
- production deploy;
- secret or credential changes;
- destructive DB/storage operations;
- customer data export;
- external sends to real users;
- billing or value transfer;
- permission broadening.

## 7. AUN Boundary
The AUN-dispatched runner pack is a future compatibility pack only.

In this slice:

- live AUN dispatch is disabled;
- AUN may not select a runner;
- AUN may not approve execution;
- AUN may not merge;
- activation is `after_safety_stack_acceptance`.

Boundary scenario:

```gherkin
Given the AUN dispatched runner pack is present
And the safety stack has not been accepted
When the runner pack check runs
Then live AUN dispatch remains disabled
And the pack cannot select a runner, approve execution, or merge
```

## 8. Gate Behavior
The first implementation adds:

- `shirube check runner-packs <files...>`;
- `--strict`;
- `--json`;
- runner instruction pack template.

Missing runner packs or contract items are warning-first unless strict mode is
used. Unsafe boundaries such as Codex-only requirements, live AUN dispatch, or
unsafe stop behavior are BLOCK.

## 9. Acceptance Criteria and Scenarios
Acceptance criteria:

- runner instructions are generated or documented from the same Work
  Order/evidence fields;
- Claude Code can use the model without Codex-like goal continuation;
- AUN can later dispatch the same unit without changing the Work Order schema;
- stop conditions instruct the runner to record a blocker and move no further
  on protected work.

Valid pack scenario:

```gherkin
Given a runner instruction pack includes human, codex, claude_code,
ci_headless_script, and aun_dispatched_runner
And all result states are declared
When `shirube check runner-packs --strict` runs
Then the result is PASS
```

Codex-only scenario:

```gherkin
Given a runner pack requires Codex-specific goal semantics
When the runner pack check runs
Then the result is BLOCK
```

AUN boundary scenario:

```gherkin
Given the AUN runner pack enables live dispatch before safety stack acceptance
When the runner pack check runs
Then the result is BLOCK
```

## 10. 制御機構選定原則
script 選定根拠: Runner instruction packs must be deterministic and auditable
before any live runner dispatcher consumes them.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may later call the same check,
but cannot own runner authority.

GitHub 選定根拠: Work Orders and PR evidence remain the native projection
surface for the initial PR Conveyor.

LLM boundary: LLM output may fill runner evidence but cannot approve protected
operations, grant merge authority, or bypass stop conditions.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Runner contract | CLI script | - | deterministic contract validation |
| Runner templates | Template JSON | - | same Work Order for human/Codex/Claude/headless |
| Stop boundary | CLI script | - | fail-closed protected operations |
| AUN compatibility | Future pack only | - | no live dispatch until safety accepted |

## 11. Testing Layer
The implementation must add unit and CLI fixtures for:

- complete runner pack;
- missing runner pack in warning and strict mode;
- Codex-specific goal requirement block;
- live AUN dispatch block;
- unsafe stop behavior block;
- directory input and JSON output.

## 12. Non-Goals
- Do not execute Work Orders.
- Do not generate live runner jobs.
- Do not enable AUN live dispatch.
- Do not implement AUN bridge (#272).
- Do not automate merge.
