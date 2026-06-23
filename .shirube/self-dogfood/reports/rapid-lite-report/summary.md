<!-- shirube-rapid-lite-gates-report/v1 -->

## Shirube Rapid/Lite Gates Report

- Verdict: `PASS_WITH_WARN`
- Report failed: `false`
- Would block: `false`
- Owner must not merge: `false`
- Report-only: `true`
- Changed files: `21`

This workflow is report-only. `BLOCKED` findings are recorded as PR-visible evidence and uploaded JSON artifacts; they do not fail this workflow or change required checks.

### Gate Summary

| Gate | Status | Verdict | Report failed | Current phase | Disposition | Would block |
| --- | --- | --- | --- | --- | --- | --- |
| adoption | ran | PASS | false | ADOPTION_READY | retrofit_accelerate | false |
| lifecycle | ran | PASS | false | EXECUTION_READY | retrofit_accelerate | false |
| gate-contract | ran | PASS_WITH_WARN | false | EXECUTION_READY |  | false |
| design-rules | ran | PASS | false |  |  | false |

### Findings

#### adoption

**Blockers**

- none

**Warnings**

- none

**Required next actions**

- none

#### lifecycle

**Blockers**

- none

**Warnings**

- none

**Required next actions**

- none

#### gate-contract

**Blockers**

- none

**Warnings**

- `RL-PR-W001` (changed_files): Changed file count exceeds the Rapid/Lite report-only threshold.

**Required next actions**

- `RL-PR-W001`: Changed file count exceeds the Rapid/Lite report-only threshold.

#### design-rules

**Blockers**

- none

**Warnings**

- none

**Required next actions**

- none

### Artifact Outputs

- adoption: `.shirube/self-dogfood/reports/rapid-lite-report/adoption.json`
- lifecycle: `.shirube/self-dogfood/reports/rapid-lite-report/lifecycle.json`
- gate-contract: `.shirube/self-dogfood/reports/rapid-lite-report/gate-contract.json`
- design-rules: `.shirube/self-dogfood/reports/rapid-lite-report/design-rules.json`
