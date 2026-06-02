---
id: OPS-GITHUBQUEUEWIP-268
status: Draft
traces:
  spec: [SPEC-GITHUBQUEUEWIP-268]
  impl: [IMPL-GITHUBQUEUEWIP-268]
  verify: [VERIFY-GITHUBQUEUEWIP-268]
---

# OPS: GitHub Queue Labels and WIP Projection

## 1. Operator Use
Validate a projection file:

```bash
shirube check github-queue --strict templates/github/pr-conveyor-queue-projection.example.json
```

Emit JSON output:

```bash
shirube check github-queue --json templates/github/pr-conveyor-queue-projection.example.json
```

## 2. Required Labels
Use these labels or an equivalent projection:

```text
ready-for-implementation
implementing
evidence-ready
audit-pending
changes-requested
rework-implementing
audit-passed
merge-ready
blocked-stop-lane
```

## 3. Manual GitHub Setup
The template `templates/github/pr-conveyor-labels.json` is the label contract.
Operators may create labels manually or through an approved GitHub setup script
in a later slice.

This slice does not create live labels.

## 4. WIP Interpretation
- Fast Lane PRs over 3/repo: warning-first, strict can block.
- Governed Draft PRs over 2/repo: block.
- Rework PRs over 2/repo: warning-first, strict can block.
- Stop Lane PRs without approval over 0/repo: block.

## 5. Stop Rules
Stop and request review if:

- `blocked-stop-lane` is present without approval evidence;
- R4/Stop Lane work is queued for execution;
- GitHub labels would become a second source of completion truth;
- AUN live dispatch is requested;
- merge is treated as automatic.

## 6. AUN Boundary
AUN may mirror or consume queue projection after the safety stack is accepted.
Until #272, GitHub issue/PR labels and PR evidence remain the queue projection
surface.
