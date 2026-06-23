---
id: OPS-WORKORDERDEFAULTS-270
status: Draft
traces:
  spec: [SPEC-WORKORDERDEFAULTS-270]
  impl: [IMPL-WORKORDERDEFAULTS-270]
  verify: [VERIFY-WORKORDERDEFAULTS-270]
---

# OPS: Work Order Delivery Defaults

## 1. Operator Use
Place a delivery profile at:

```text
.framework/delivery-profile.json
```

Place a Work Order at:

```text
.framework/work-order.json
```

Then run:

```bash
shirube workflow check --action work_order --profile strict --fail-on warn --json
```

## 2. Expected Defaults
For `iyasaka-internal.pr-conveyor`:

```text
R0-R2 -> Fast / pr_conveyor / after_pr / normal
R3    -> Governed / phase_conveyor / before_merge / draft_or_reference_until_owner_adopts
R4    -> Stop / serial_gate / before_execution / blocked_until_approved
```

## 3. Manual Report Fields
Until #267 adds the PR evidence template, include:

```text
Work Order:
GitHub durable state:
Phase goal:
Runner policy:
Evidence contract:
Delivery profile:
Risk class:
Resolved lane:
Resolved delivery strategy:
Resolved audit timing:
Resolved PR mode:
Architecture owner:
Implementation owner:
Review owner:
Audit owner:
Merge authority:
Current owner:
Next action:
Evidence required:
Required review:
Stop conditions:
Verification:
```

## 4. Stop Handling
Stop and request review if:

- risk class is missing;
- owner fields are missing or placeholders;
- R3 declares after-PR audit timing;
- R4 does not resolve to serial gate before execution;
- Work Order asks the implementation runner to merge;
- AUN live dispatch is requested.

## 5. AUN Boundary
This slice does not enable AUN live dispatch. #272 owns AUN bridge work after
safety stack acceptance.
