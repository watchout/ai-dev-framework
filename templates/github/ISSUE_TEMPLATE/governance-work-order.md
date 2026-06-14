---
name: "Governance: Work Order"
about: Script-controlled Work Order for substantial product or platform work
labels: governance, work-order
---

## Summary
<!-- What outcome should this Work Order produce? -->

## Governance Bone

- Goal:
- Phase:
- Work Order:
- GitHub durable state URL:
- Risk classification:
- Delivery profile:
- Delivery strategy:
- Phase goal:
- Runner policy:
- Work unit:
- Lane:
- PR mode:
- Audit timing:
- PR slice:
- Script/gate owner:
- Action tools:
- Context evidence:
- Memory/recovery evidence:
- Evidence contract:
- Approval policy:
- Audit evidence:
- Rollback/replay:
- Architecture owner:
- Implementation owner:
- Review owner:
- Merge authority:
- Audit owner:

## Scope
- In scope:
- Non-scope / non-goals:
- Acceptance criteria:
- Role flow:
- Current owner:
- Next action:
- Evidence required:
- Required review:
- Allowed files:
- Allowed actions:
- Forbidden actions:
- Stop conditions:
- Fallback next work policy:

## Runner Policy
- Policy: codex_native_fast_lane | claude_code_autonomous_lane | headless_runtime_adapter_lane | governed_manual_lane | stop_lane
- Runtime mode:
- Bounded phase goal:
- Pull rule: startup/restart | after completion | before idle | AUN notification with GitHub URL | supervised idle worker
- Stop lane triggers:
- AUN usage: optional acceleration only; GitHub remains durable SSOT.

## GitHub Work Queue
- Needs label: needs:arc | needs:impl | needs:audit | needs:qa | needs:check | needs:cto
- Owner label: owner:<role-or-bot>
- Route label: route:fast | route:protected
- Blocked label:
- Ready/done label:

## Evidence Contract
- PR comment / handoff evidence:
- CI/check evidence:
- Review/audit evidence:
- Runtime evidence:
- Exact head SHA:
- Not sufficient: AUN ACK, queue row, outbound queued, Discord projection, TUI/tmux text, green CI alone for runtime-impacting changes.

## Risk Classification
- Level: R0 | R1 | R2 | R3 | R4
- Default handling: R0-R2 PR Conveyor after PR audit | R3 Governed before merge/adoption | R4 Serial Gate before execution
- Customer data:
- External mutation:
- Runtime/queue impact:
- Security/privacy impact:
- Enterprise readiness impact:

## Ownership Boundary
- ARC/design role:
- Repo implementation owner:
- Reference implementation: no | draft | label:
- Explicit delegation:
- Adoption decision owner:

## Required Verification
- [ ] Unit or model tests
- [ ] Integration or workflow tests
- [ ] Gate check
- [ ] Audit/evidence output

## Dependencies
- Blocks:
- Blocked by:
