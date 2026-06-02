---
id: OPS-ACTIONPROFILE-254
status: Draft
traces:
  spec: [SPEC-ACTIONPROFILE-254]
  impl: [IMPL-ACTIONPROFILE-254]
  verify: [VERIFY-ACTIONPROFILE-254]
---

# OPS: Governed Action Surface Profile

## 0. Corresponding SPEC
`docs/spec/phase1-action-surface-profile.md` /
SPEC-ACTIONPROFILE-254.

## 1. Stage 0 Inventory
Use Stage 0 when a product is first listing surfaces:

```bash
shirube check action-profile --stage inventory profiles/action-surfaces.md
```

For a migration audit that should fail on missing inventory fields:

```bash
shirube check action-profile --stage inventory --strict profiles/action-surfaces.md
```

## 2. Stage 1 Profile
Use Stage 1 for full profile entries:

```bash
shirube check action-profile profiles/action-surfaces.json
```

For high/critical surfaces where the product owner has enabled strict review:

```bash
shirube check action-profile --strict profiles/action-surfaces.json
```

## 3. Manual Report Format
Manual audit reports should include:

- profile file path;
- command and mode/stage;
- surface count;
- findings summary;
- high/critical surface list;
- approval/audit/rollback gaps;
- whether AUN live enforcement was used.

For this phase, AUN live enforcement should be reported as not used unless a
separate reviewed AUN stability gate has passed.

## 4. Rollout Guidance
First phase:

- create Stage 0 inventories for Kodama and Wasurezu MCP tools;
- use Stage 1 warning mode for product profile drafting;
- keep strict mode for focused migration audits or high/critical surfaces with
  product-owner coverage;
- store reports as PR/issue evidence.

Later phase:

- make missing high/critical profile fields blocking in product CI;
- connect profile findings to Delivery Graph evidence;
- feed Aun Gate policy evaluation after AUN live enforcement is stable.

## 5. Failure Handling
If warning mode reports gaps:

- add missing fields to the product profile;
- record risk classification explicitly;
- do not claim Aun Gate readiness for unprofiled risky surfaces.

If strict mode blocks:

- keep the change draft;
- add approval, audit, rollback, or execution policy evidence;
- rerun the same command with the same stage and mode.

## 6. Rollback
Rollback for this slice is removing the action profile check from product CI or
returning product adoption to warning mode. The validator itself is read-only
and does not mutate action surfaces or external systems.
