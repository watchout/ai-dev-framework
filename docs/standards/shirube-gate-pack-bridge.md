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

1. Control source.
2. Scope and non-scope.
3. Allowed paths and forbidden paths.
4. Protected surface declaration.
5. Exact head SHA.
6. Validation evidence.
7. Owner decision against the exact head.
8. Post-merge evidence requirement.

## External Exact-Head Evidence

Exact head approval should be attachable outside committed target-repo files. A committed handoff cannot safely contain its own final PR head SHA because changing the handoff changes the SHA.

For report-only pilots, use PR body/comment refs such as:

```text
handoff_ref: .shirube/control-handoffs/CH-001.yaml
validation_evidence_ref: .shirube/evidence/validation.yaml
owner_decision_ref: .shirube/evidence/owner-decision.yaml
```

`run-rapid-lite-report` forwards `validation_evidence_ref` to `check-gate-contract`, allowing `pr_head_sha` evidence to live outside the committed handoff while still being machine-checked.

## Template

Use `templates/shirube-gate-pack-bridge.yaml` for repositories without `.shirube/**`. The bridge should later be converted into repo-local overlay artifacts instead of becoming a permanent substitute for overlay adoption.
