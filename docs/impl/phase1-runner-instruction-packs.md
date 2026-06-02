---
id: IMPL-RUNNERPACKS-271
status: Draft
traces:
  spec: [SPEC-RUNNERPACKS-271]
  verify: [VERIFY-RUNNERPACKS-271]
  ops: [OPS-RUNNERPACKS-271]
---

# IMPL: PR Conveyor Runner Instruction Packs

## 1. Purpose
Implement SPEC-RUNNERPACKS-271 as a deterministic runner instruction pack
validator and template.

## 2. Components
- `src/cli/lib/runner-instruction-pack-validator.ts`
- `shirube check runner-packs <files...>`
- `templates/runner-instructions/iyasaka-pr-conveyor-runner-packs.json`
- unit and CLI tests

## 3. Validator Behavior
The validator parses runner instruction pack JSON with:

```json
{
  "pack_version": "runner-instruction-pack/v1",
  "runner_agnostic": true,
  "common_contract": {},
  "runner_packs": []
}
```

It checks required runners, common steps, result states, required evidence,
forbidden interfaces, stop behavior, and AUN future activation.

## 4. Exit Behavior
- PASS exits 0.
- WARNING exits 0.
- BLOCK exits non-zero.

## 5. Boundary
This slice reads instruction pack files only. It does not execute runner
commands, dispatch AUN jobs, mutate GitHub state, approve execution, or merge.
