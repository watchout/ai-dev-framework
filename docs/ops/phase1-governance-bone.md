---
id: OPS-GOVBONE-249
status: Draft
traces:
  spec: [SPEC-GOVBONE-249]
  impl: [IMPL-GOVBONE-249]
  verify: [VERIFY-GOVBONE-249]
---

# OPS: Product-Wide Governance Bone

## 0. Corresponding SPEC
`docs/spec/phase1-governance-bone.md` / SPEC-GOVBONE-249.

## 1. Local CLI Use
For warning-first adoption:

```bash
shirube check governance --mode warning --profile infrastructure --risk medium work-order.md
```

For risky work where strict enforcement is enabled:

```bash
shirube check governance --profile hotel --risk high pull-request.md
```

For migration audits that require the skeleton even without trigger terms:

```bash
shirube check governance --require --json work-order.md
```

## 2. GitHub Template Installation
Run Shirube template installation for the product profile. The installer adds:

- `.github/workflows/governance.yml`;
- `.github/ISSUE_TEMPLATE/governance-work-order.md`;
- `.github/PULL_REQUEST_TEMPLATE/governance.md`.

The workflow reads the pull request body and validates it with the configured
profile, risk, mode, and require settings.

## 3. Environment Controls
Product repositories can configure:

| Environment variable | Default | Meaning |
|----------------------|---------|---------|
| `SHIRUBE_GOVERNANCE_PROFILE` | `default` | `default`, `infrastructure`, or `hotel` |
| `SHIRUBE_GOVERNANCE_RISK` | `low` | `low`, `medium`, `high`, or `critical` |
| `SHIRUBE_GOVERNANCE_MODE` | `warning` | `warning` or `strict` |
| `SHIRUBE_GOVERNANCE_REQUIRE` | `true` | Require fields even if trigger terms are absent |

## 4. Rollout Guidance
First phase:

- keep `SHIRUBE_GOVERNANCE_MODE=warning`;
- use the Work Order issue template for substantial work;
- use the governance PR template for action-tool, customer-data, or runtime
  changes;
- record missing fields as migration findings, not merge authority.

Later phase:

- set mode to strict for risky action-tool, customer-data, runtime/queue,
  memory/context-boundary, external-mutation, approval-policy, and
  enterprise-claim changes;
- connect the report to Delivery Graph evidence;
- add Work Order authority approval mapping from #248.

## 5. Failure Handling
If warning mode reports missing fields:

- complete the Work Order or PR body fields;
- assign a concrete implementation owner before starting implementation;
- keep the PR draft if the missing evidence affects authority, mutation, or
  rollback;
- do not claim strict governance readiness.

If strict mode blocks:

- do not dispatch action-tool work;
- add the missing governance evidence;
- rerun the same command with the same profile/risk/mode values.

## 6. ARC Reference Implementation Handling
If ARC or another architecture/design role opens implementation code without
explicit repository-owner delegation:

1. Keep or convert the PR to draft.
2. Add an ownership note that the PR is a reference implementation only.
3. Link the controlling issue/spec and adoption criteria.
4. Require repository-owner adoption before treating it as implementation
   complete.
5. Do not use the reference PR itself as merge approval, audit approval, or
   completion evidence.

Repository owners may adopt, revise, reimplement, or close the reference PR.
The gate validates this separation; it must not transfer implementation or
merge authority to ARC.

## 7. Rollback
Rollback for this slice is removing the governance workflow/template install or
setting `SHIRUBE_GOVERNANCE_MODE=warning` while a product migrates. The
validator itself is read-only and does not mutate repository state.
