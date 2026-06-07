---
id: SPEC-M0-CONVEYOR-309-D
status: Draft
traces:
  impl: [IMPL-M0-CONVEYOR-309-D]
  verify: [VERIFY-M0-CONVEYOR-309-D]
  ops: [OPS-M0-CONVEYOR-309-D]
---

# SPEC: M0 Conveyor Guarded Apply

## 0. Meta
- Origin Issue: #309
- Scope: M0-D guarded apply mode
- Depends on: SPEC-M0-CONVEYOR-309-A-B and SPEC-M0-CONVEYOR-309-C

## 1. Purpose
Allow the conveyor to apply only safe label/comment transitions that are backed
by exact-head PR-local audit evidence.

The default behavior must remain dry-run. Live GitHub mutation requires explicit
confirmation and a final live head check.

## 2. Allowed Operations
Allowed operations:

- add PR labels;
- remove PR labels;
- post a guarded apply PR comment.

Forbidden operations:

- merge;
- approve;
- draft removal;
- deploy;
- restart or launchctl;
- DB mutation;
- queue drain;
- Discord send;
- AUN dispatch.

## 3. Required Guards
- Build from a fixture snapshot.
- Use the label sync plan derived from exact-head audit evidence.
- Block stale head, dirty/conflicting PRs, label-only audit pass, and unsafe
  merge-ready states.
- Require `--confirm-live-github` for live apply.
- Re-read the live PR head immediately before mutation and block on mismatch.
- Print the intended mutations before live apply.

## 4. Output Contract
The guarded apply dry-run output must include:

- schema;
- mode;
- dry_run;
- safe_to_apply;
- confirmation_required;
- exact_head_required;
- allowed_operations;
- forbidden_operations;
- operations;
- blocked_operations;
- underlying label_sync plan.

## 5. Acceptance Criteria
- `conveyor labels apply --fixture <file> --json` prints a dry-run plan.
- `conveyor labels apply --apply` fails without `--confirm-live-github`.
- execution checks live head before label/comment mutation.
- fake-adapter tests prove label and comment mutation order.
- no forbidden operation is reachable through the API.

## 6. Gate Behavior
The gate fails closed when the plan is unsafe, confirmation is missing, or the
live head differs from the expected head.

No command may merge, approve, remove draft state, deploy, restart, mutate DB,
drain queues, send Discord, or dispatch AUN.

## 7. Scenarios
Dry-run scenario:

```gherkin
Given exact-head L2 PASS evidence for a PR
When `conveyor labels apply --json` runs
Then it prints the label/comment operations
And it performs no mutation
```

Confirmation scenario:

```gherkin
Given a safe guarded apply plan
When `conveyor labels apply --apply` runs without confirmation
Then the command fails
And no adapter mutation is called
```

Live head scenario:

```gherkin
Given a safe guarded apply plan for head A
When the live PR head is head B
Then execution blocks with live_head_mismatch
And no labels or comments are applied
```

## 8. Implementation Contract
The implementation changes:

- `src/cli/lib/conveyor-guarded-apply.ts`;
- `src/cli/lib/conveyor-guarded-apply.test.ts`;
- `src/cli/commands/conveyor.ts`;
- `src/cli/commands/conveyor.test.ts`;
- M0-D SPEC/IMPL/VERIFY/OPS docs and roadmap trace.

## 9. Review Boundary
This slice is R3/Governed because it introduces guarded live GitHub mutation
capability.

Required review:

- L1 audit for command contract and forbidden operation boundary;
- L2 audit for exact-head guard and execution path;
- L3 or merge authority review before merge readiness.

## 10. 制御機構選定原則
script 選定根拠: Apply decisions must be deterministic and replayable from
fixture evidence before any live GitHub mutation is attempted.

Hook 選定根拠: Hook 不採用 in this slice. Hooks cannot replace explicit
confirmation and live head verification.

GitHub 選定根拠: GitHub is the target mutation surface for labels/comments only.
The command must re-read live PR head before mutating.

LLM boundary: LLM output cannot approve live apply. Only the fixed evidence,
guarded plan, explicit confirmation, and live head check authorize mutation.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Dry-run default | CLI/library | - | operators must inspect planned mutations |
| Live confirmation | CLI flag | - | prevents accidental mutation |
| Exact head check | GitHub read before mutation | - | prevents stale evidence apply |
| Forbidden operations | library constants + tests | - | scope is labels/comments only |

## 11. Testing Layer
Testing layers: unit, regression, and CLI smoke coverage.

The implementation must add tests for:

- dry-run guarded apply plan;
- blocked unsafe label sync actions;
- missing live confirmation;
- live head match execution;
- live head mismatch blocking;
- CLI dry-run JSON;
- CLI apply rejection without confirmation.

## 12. Non-Goals
- Do not implement merge automation.
- Do not implement approval automation.
- Do not remove draft state.
- Do not deploy, restart, mutate DB, drain queue, send Discord, or dispatch AUN.
- Do not implement user outcome gate; that is M0-E.
