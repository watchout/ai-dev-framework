---
id: OPS-RUNNERPACKS-271
status: Draft
traces:
  spec: [SPEC-RUNNERPACKS-271]
  impl: [IMPL-RUNNERPACKS-271]
  verify: [VERIFY-RUNNERPACKS-271]
---

# OPS: PR Conveyor Runner Instruction Packs

## 1. Operator Use
Validate the default pack:

```bash
shirube check runner-packs --strict templates/runner-instructions/iyasaka-pr-conveyor-runner-packs.json
```

Emit JSON output:

```bash
shirube check runner-packs --json templates/runner-instructions/iyasaka-pr-conveyor-runner-packs.json
```

## 2. Manual Runner Rule
Each runner handles one bounded Work Order and returns one result state. The
runner must not continue through a stop condition or protected operation.

## 3. Result States
Use:

```text
completed_pr_opened
completed_no_pr_needed
blocked_requires_input
blocked_requires_audit
blocked_requires_approval
failed_verification
skipped_not_authorized
```

## 4. Runner-Specific Notes
- Human: manually follow the same Work Order fields and PR evidence template.
- Codex: may use local goal continuation, but it is not required by the pack.
- Claude Code: execute the bounded Work Order directly and return evidence.
- CI/headless: run only with explicit allowed files/actions and commands.
- AUN dispatched runner: future-only until safety stack acceptance.

## 5. Stop Rules
Stop and record a blocker if:

- implementation authority is missing;
- lane/risk requires audit or approval first;
- allowed files/actions are missing or exceeded;
- verification fails;
- protected operations are requested;
- AUN live dispatch is requested before #272.

## 6. AUN Boundary
The AUN runner pack is compatibility metadata only. It is inactive until safety
stack acceptance and must not be used to dispatch live work in this slice.
