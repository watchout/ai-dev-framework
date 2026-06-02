---
id: OPS-4MCPFASTTRACK-264
status: Draft
traces:
  spec: [SPEC-4MCPFASTTRACK-264]
  impl: [IMPL-4MCPFASTTRACK-264]
  verify: [VERIFY-4MCPFASTTRACK-264]
---

# OPS: 4MCP Fast Track Minimum Safety Profile

## 0. Corresponding SPEC
`docs/spec/phase1-4mcp-fast-track-safety-profile.md` /
SPEC-4MCPFASTTRACK-264.

## 1. Intended Use
Use this profile for current 4MCP completion work when full autonomous runner
control is not ready but ordinary repo work should continue.

Products:

- AUN;
- Shirube;
- Kodama;
- Wasurezu.

## 2. Minimal Work Order Evidence
```text
Work Order / Issue:
Product / Repo:
Lane: Fast | Governed | Stop
Risk: R0 | R1 | R2 | R3 | R4
Architecture owner:
Implementation owner:
Review owner:
Merge authority:
Audit owner:
Scope:
Non-goals:
Allowed files/modules:
Allowed actions:
Forbidden actions:
Stop conditions:
Verification commands:
Rollback plan:
Residual risk:
```

## 3. Minimal PR Evidence
```text
Work Order / Issue:
Product / Repo:
Lane:
Risk:
Implementation owner:
Merge authority:
Scope / non-goals:
Allowed files/modules:
Changed files:
Verification commands/results:
Residual risk:
Stop conditions encountered:
Audit / review owner:
Reference implementation: no | draft | label:
```

## 4. Lane Guidance
Fast Lane:

- use for R0-R2 repo-owned work;
- keep scope within declared files/modules;
- do not claim merge authority.

Governed Lane:

- use for R3 shared control-plane work;
- keep PR draft unless repo owner implementation authority is explicit;
- require audit before merge readiness.

Stop Lane:

- use for R4 work;
- do not execute before explicit approval;
- record blocker and leave worktree intact.

## 5. Product Guidance
AUN:

- allow internal stabilization and safety wiring;
- block live autonomous dispatch until full safety stack exists.

Shirube:

- build this profile and deterministic checks;
- block automatic merge and reference PR adoption without repo-owner decision.

Kodama:

- allow context-pack work with provenance and injection-risk evidence;
- block context labels as permission grants.

Wasurezu:

- allow recovery/memory provenance and redaction work;
- block memory as execution authorization or secret storage.

## 6. Failure Handling
If R3 is declared Fast:

- move to Governed lane;
- keep draft/reference PR unless implementation authority is explicit;
- request audit.

If R4 is requested:

- stop;
- record explicit approval requirement;
- do not start implementation.

If owner fields are missing:

- do not continue as implementation;
- fill concrete owner/authority fields or record HOLD.

If global stop/no-run is active:

- do not start a new Work Order;
- leave the worktree intact;
- record blocker and wait for stop clearance or move only to unrelated work if
  the stop is local.

## 7. Rollback
This spec slice is docs-only. Rollback is removing this artifact set and roadmap
trace before implementation begins.

For future implementation, rollback must be limited to removing the validator
or template projection. It must not mutate AUN queue state, external systems,
or product data.
