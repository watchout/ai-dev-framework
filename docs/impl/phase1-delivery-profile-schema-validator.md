---
id: IMPL-DELIVERYPROFILE-269
status: Draft
traces:
  spec: [SPEC-DELIVERYPROFILE-269]
  verify: [VERIFY-DELIVERYPROFILE-269]
  ops: [OPS-DELIVERYPROFILE-269]
---

# IMPL: Delivery Profile Schema and Validator

## 1. Purpose
Implement SPEC-DELIVERYPROFILE-269 as a deterministic JSON profile validator
and CLI check.

## 2. Added Components
- `src/cli/lib/delivery-profile-validator.ts` validates profile JSON.
- `shirube check delivery-profile <paths...>` loads JSON files or directories.
- `templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json`
  provides the first internal profile artifact.
- Unit and CLI tests cover pass, warning, block, and JSON output behavior.

## 3. Validator Behavior
The validator checks:

- required root fields;
- supported profile version `0.1.0`;
- known delivery strategies;
- `strategy_by_risk` entries for R0-R4;
- R3 not using after-PR audit timing;
- R4 not using PR Conveyor or after-PR audit timing;
- R4 defaulting to `serial_gate`, `before_execution`, and
  `blocked_until_approved`;
- required queue states;
- WIP policy and Stop Lane WIP of `0`;
- Work Order required fields;
- runner-agnostic contract and non-Codex-only allowed runners;
- required result states and evidence;
- merge policy forbidding automatic merge and implementation-runner merge;
- stop policy requiring no-run sentinel, hard-stop blocking, and protected
  operation approvals.

## 4. CLI Contract
Usage:

```bash
shirube check delivery-profile <paths...>
shirube check delivery-profile --strict <paths...>
shirube check delivery-profile --json <paths...>
```

Directory inputs recursively load `.json` files.

Exit behavior:

- `PASS` exits `0`;
- `WARNING` exits `0`;
- `BLOCK` exits non-zero.

## 5. Boundary
This slice only validates profile artifacts. It does not resolve Work Order
defaults, mutate GitHub labels, dispatch runners, enable AUN live execution, or
merge PRs.

## 6. Follow-Up Slices
- #270 resolves Work Order strategy defaults from validated profiles.
- #267 adds PR evidence and audit timing checks.
- #268 adds GitHub-native queue labels and WIP projection.
- #271 adds runner instruction packs.
- #273 adds rollout guide and first Work Order batch.
- #272 adds AUN bridge only after safety stack acceptance.
