# Shirube Gate Pack Bridge

`shirube-gate-pack-bridge/v1` is an interim bridge for repositories that are using Shirube control discipline before a full `.shirube/**` overlay exists.

It is not full Shirube V3 adoption, enforcement, required-check protection, branch protection, or CI hard-blocking. The correct operating name is `Shirube V3 Partial Pilot`, usually in `gate-pack-bridge / owner-observed` mode.

## Status Taxonomy

Each repository using Shirube-derived control must be classified as one of:

- `FULL_OVERLAY_PENDING`: formal overlay is not installed yet; only Gate Pack material may be used.
- `PARTIAL_SHIRUBE_PILOT`: some handoff, evidence, owner decision, or gate discipline is used.
- `RAPID_LITE_REPORT_ONLY`: `.shirube/**` and report-only gates are installed, with no required check.
- `OWNER_BLOCK`: `would_block=true` or equivalent means the owner must not merge without explicit exception.
- `NOT_SHIRUBE_CONTROLLED`: Shirube-style review may exist, but the repository is not under Shirube control.

Do not call partial repositories `V3 complete`, `enforced`, `fully controlled`, or `required-check protected`.

## Minimum PR Controls

A PR must not be treated as Shirube-controlled unless it records:

1. Execution context lock.
2. Control source.
3. Scope and non-scope.
4. Allowed paths and forbidden paths.
5. Protected surface declaration.
6. Exact head SHA.
7. Validation evidence.
8. Owner decision against the exact head.
9. Post-merge evidence requirement.

The execution context lock must identify the primary implementation repo, current work order, current PR, active role, and support/control/framework repo relations. A PR without execution context evidence is Gate Pack Bridge material at most; it must not be called Shirube-controlled.

## External Exact-Head Evidence

Exact head approval should be attachable outside committed target-repo files. A committed handoff cannot safely contain its own final PR head SHA because changing the handoff changes the SHA.

For report-only pilots, use PR body/comment refs such as:

```text
execution_context_ref: .shirube/execution-context.yaml
handoff_ref: .shirube/control-handoffs/CH-001.yaml
validation_evidence_ref: .shirube/evidence/validation.yaml
owner_decision_ref: .shirube/evidence/owner-decision.yaml
```

`run-rapid-lite-report` forwards `validation_evidence_ref` to `check-gate-contract`, allowing `pr_head_sha` evidence to live outside the committed handoff while still being machine-checked.

`run-rapid-lite-report` also runs `check-execution-context` before the other gates. If the execution context blocks, the aggregate report sets `would_block=true` and `owner_must_not_merge=true` while preserving report-only workflow behavior.

## Template

Use `templates/shirube-gate-pack-bridge.yaml` for repositories without `.shirube/**`. The bridge should later be converted into repo-local overlay artifacts instead of becoming a permanent substitute for overlay adoption.
