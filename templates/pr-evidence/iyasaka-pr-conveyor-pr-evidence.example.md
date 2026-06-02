## PR Conveyor Evidence

- Work Order: SHIRUBE-CONVEYOR-001
- Delivery strategy: pr_conveyor
- Lane: Fast
- Risk class: R2
- Audit timing: after_pr
- Queue state: audit_pending
- Runner identity: human | codex | claude_code | ci_headless_script
- Runtime mode: manual | codex exec | claude code | ci headless
- Implementation owner: Shirube repo maintainer or delegated implementer
- Review owner: Shirube reviewer
- Audit owner: Shirube audit owner
- Merge authority: Shirube repo maintainer
- Changed files: list changed files or link to PR files tab
- Verification commands: focused tests, type-check, build, lint, gates
- Verification results: PASS/FAIL summary with exact commands
- Residual risk: remaining risk or none
- Stop conditions encountered: none or list
- Audit refs: required before R3 merge/adoption; optional for R0-R2 before audit
- Approval refs: required before R4 execution/merge-ready claim
- Merge readiness: audit_pending

## Audit Timing Rules

- R0-R2: after PR creation, move to `audit_pending`.
- R3: audit before merge or owner adoption.
- R4: approval/audit before execution.
- Merge is not automatic.
- AUN live dispatch is not enabled by this evidence.
