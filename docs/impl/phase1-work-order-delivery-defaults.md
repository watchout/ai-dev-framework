---
id: IMPL-WORKORDERDEFAULTS-270
status: Draft
traces:
  spec: [SPEC-WORKORDERDEFAULTS-270]
  verify: [VERIFY-WORKORDERDEFAULTS-270]
  ops: [OPS-WORKORDERDEFAULTS-270]
---

# IMPL: Work Order Delivery Defaults

## 1. Purpose
Implement SPEC-WORKORDERDEFAULTS-270 as a deterministic resolver and
warning-first Work Order gate extension.

## 2. Components
- `src/cli/lib/work-order-delivery-defaults.ts` resolves defaults from a
  delivery profile and Work Order.
- `workflow check --action work_order` emits
  `G21.work_order.delivery_profile_defaults`.
- `templates/github/ISSUE_TEMPLATE/governance-work-order.md` includes delivery
  profile fields.
- `templates/work-orders/iyasaka-pr-conveyor-work-order.example.json` provides
  a runner-agnostic structured Work Order example.

## 3. Resolver Behavior
The resolver:

- requires concrete owner fields;
- requires action-envelope fields;
- reads `risk_class`;
- reads the selected profile's `strategy_by_risk`;
- resolves lane, delivery strategy, audit timing, and PR mode;
- marks whether values were inherited or declared;
- warns on R3 after-PR audit timing;
- warns on R3 normal PR mode;
- warns on R4 values that are not serial-gate, before-execution, and
  blocked-until-approved.

## 4. Workflow Check
The delivery-default finding remains warning-first. Missing or unsafe delivery
defaults produce WARN decisions unless a later promotion slice changes
enforcement. The existing `G21.work_order.required_fields` rule blocks a
present Work Order with missing or placeholder required fields.

The check can use `.framework/delivery-profile.json` or the bundled internal
profile template when running in this repository.

## 5. Boundary
This slice does not dispatch runners, mutate queue labels, create PR evidence
checks, enable AUN live dispatch, or merge.
