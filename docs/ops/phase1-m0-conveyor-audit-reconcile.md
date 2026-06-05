---
id: OPS-M0-CONVEYOR-309-A-B
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-A-B]
  impl: [IMPL-M0-CONVEYOR-309-A-B]
  verify: [VERIFY-M0-CONVEYOR-309-A-B]
---

# M0 Conveyor Audit Result And Reconcile OPS

Operating notes for SPEC-M0-CONVEYOR-309-A-B.

## Render An Audit Template

```text
shirube conveyor audit-report --template \
  --repo watchout/ai-dev-framework \
  --pr 307 \
  --role l1 \
  --head <current-head> \
  --base main \
  --route standard
```

The auditor fills `verdict`, findings, and evidence, then posts the block to the
PR conversation or review. Session-only or chat-only verdicts are not transition
evidence.

## Reconcile A Fixture

```text
shirube conveyor reconcile --fixture conveyor-fixture.json --json
```

Use `--apply` only to apply planned labels to the in-memory fixture result.
This command still does not mutate GitHub.

## Stop Conditions

- missing `head`, `base`, `route`, or `next_state_recommendation`;
- evidence head or base does not match the current snapshot;
- PR is dirty or conflicting;
- lower dependency is blocked;
- requested operation includes merge, approval, draft removal, deploy, AUN
  dispatch, DB mutation, queue drain, or Discord send.
