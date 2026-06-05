---
id: OPS-M0-CONVEYOR-309-C
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-C]
  impl: [IMPL-M0-CONVEYOR-309-C]
  verify: [VERIFY-M0-CONVEYOR-309-C]
---

# M0 Conveyor Current Ops Tick OPS

Operating notes for SPEC-M0-CONVEYOR-309-C.

## Run A Tick

```text
shirube conveyor tick --fixture conveyor-fixture.json --json
```

For human output:

```text
shirube conveyor tick --fixture conveyor-fixture.json
```

## Read The Output

- `lane_queues`: current role queues.
- `reconcile_backlog`: safe transition plans waiting for guarded apply.
- `dirty_audit_queue`: audit-lane PRs with evidence, head, base, dirty, or
  dependency findings.
- `merged_stale_state_cleanup`: merged PRs still carrying stale active labels.
- `dependency_release_candidates`: stack dependents released by lower PR state.
- `human_approval_notifications`: CEO or human approval lane targets.
- `unreviewed_deployed_commit_blockers`: deployed heads not proven merged or
  exact-head audited.

## Stop Conditions

- Missing fixture.
- Requested operation includes live GitHub mutation.
- Requested operation includes merge, approval, draft removal, deploy, restart,
  launchctl, DB mutation, queue drain, Discord send, or AUN dispatch.
