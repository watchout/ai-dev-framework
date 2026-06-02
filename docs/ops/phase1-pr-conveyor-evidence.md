---
id: OPS-PRCONVEYOREVIDENCE-267
status: Draft
traces:
  spec: [SPEC-PRCONVEYOREVIDENCE-267]
  impl: [IMPL-PRCONVEYOREVIDENCE-267]
  verify: [VERIFY-PRCONVEYOREVIDENCE-267]
---

# OPS: PR Conveyor Evidence and Audit Timing

## 1. Operator Use
Validate a PR body saved as Markdown:

```bash
shirube check pr-evidence --strict pull-request.md
```

Validate a directory of PR evidence fixtures:

```bash
shirube check pr-evidence --json templates/pr-evidence
```

## 2. Required Manual Fields
Every PR Conveyor PR should include:

```text
Work Order:
Delivery strategy:
Lane:
Risk class:
Audit timing:
Queue state:
Runner identity:
Runtime mode:
Implementation owner:
Review owner:
Audit owner:
Merge authority:
Changed files:
Verification commands:
Verification results:
Residual risk:
Stop conditions encountered:
```

## 3. Audit Timing
- R0-R2: PR can move to `audit_pending` after PR creation.
- R3: audit before merge or owner adoption.
- R4: approval/audit before execution.

## 4. Stop Rules
Stop and request review if:

- R3 uses `after_pr`;
- R3 claims merge-ready without audit refs;
- R4 claims merge-ready without audit and approval refs;
- PR evidence suggests automatic merge;
- AUN live dispatch is requested.

## 5. AUN Boundary
This slice does not enable AUN live dispatch. #272 owns AUN bridge work after
safety stack acceptance.
