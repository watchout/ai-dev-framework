---
id: OPS-M0-CONVEYOR-309-D
status: Draft
traces:
  spec: [SPEC-M0-CONVEYOR-309-D]
  impl: [IMPL-M0-CONVEYOR-309-D]
  verify: [VERIFY-M0-CONVEYOR-309-D]
---

# M0 Conveyor Guarded Apply OPS

Operating notes for SPEC-M0-CONVEYOR-309-D.

## Dry Run

```text
shirube conveyor labels apply --fixture conveyor-fixture.json --json
```

Inspect:

- `operations`;
- `blocked_operations`;
- `safe_to_apply`;
- `forbidden_operations`;
- expected heads.

## Live Apply

Live apply requires explicit confirmation:

```text
shirube conveyor labels apply \
  --fixture conveyor-fixture.json \
  --apply \
  --confirm-live-github
```

The command re-reads each PR head through GitHub before editing labels or
posting the guarded apply comment.

## Stop Conditions

- unsafe label sync plan;
- missing `--confirm-live-github`;
- live head mismatch;
- request for merge, approval, draft removal, deploy, restart, DB mutation,
  queue drain, Discord send, or AUN dispatch.
