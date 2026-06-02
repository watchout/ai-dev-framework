---
id: IMPL-ACTIONPROFILE-254
status: Draft
traces:
  spec: [SPEC-ACTIONPROFILE-254]
  verify: [VERIFY-ACTIONPROFILE-254]
  ops: [OPS-ACTIONPROFILE-254]
---

# IMPL: Governed Action Surface Profile

## 0. Corresponding SPEC
`docs/spec/phase1-action-surface-profile.md` /
SPEC-ACTIONPROFILE-254.

## 1. Implementation Slices

### Slice A: Validator
Add `src/cli/lib/action-surface-profile-validator.ts`.

The validator returns:

- status: `PASS`, `WARNING`, or `BLOCK`;
- mode: `warning` or `strict`;
- stage: `inventory` or `profile`;
- profile detection flag;
- number of surfaces checked;
- structured findings with severity, type, field, path, and optional
  `surfaceId`.

### Slice B: Input Extraction
Support profile extraction from:

- JSON arrays;
- JSON single-surface objects;
- JSON manifest objects containing `surfaces`, `action_surfaces`, `profiles`,
  or `items`;
- Markdown field blocks;
- Markdown inventory tables.

The parser is dependency-free and intentionally conservative.

### Slice C: Validation Rules
Stage 0 validates the minimal inventory fields. Stage 1 validates the full
profile skeleton.

Additional policy checks cover:

- unknown risk on risky capabilities;
- approval policy or allowlist for high/critical and approval-by-default
  capabilities;
- audit coverage for mutation, egress, and reveal surfaces;
- rollback/replay or explicit non-reversibility;
- execution controls for `execute_code`.

### Slice D: CLI Command
Extend `src/cli/commands/check.ts` with:

```bash
shirube check action-profile <files...>
```

The command shares warning/strict option semantics with `check governance` but
does not depend on AUN or product APIs.

### Slice E: Template
Add `templates/governance/action-surface-profile.json` as a product-neutral
example that MCP and SaaS repositories can copy into their local profile
inventory.

## 2. File-Level Impact
- `src/cli/lib/action-surface-profile-validator.ts`
- `src/cli/lib/action-surface-profile-validator.test.ts`
- `src/cli/commands/check.ts`
- `src/cli/commands/check-governance.test.ts`
- `templates/governance/action-surface-profile.json`
- `docs/spec/phase1-action-surface-profile.md`
- `docs/impl/phase1-action-surface-profile.md`
- `docs/verify/phase1-action-surface-profile.md`
- `docs/ops/phase1-action-surface-profile.md`
- `docs/specs/roadmap.md`

## 3. Compatibility
- Existing `shirube check tests` behavior is unchanged.
- Existing `shirube check governance` behavior is unchanged.
- Warning mode exits 0 for warnings and still emits machine-readable findings.
- Strict mode exits non-zero on BLOCK findings.
- The validator is read-only.

## 4. Future Integration
Future slices may:

- add YAML input;
- discover default product profile files by convention;
- connect findings to Delivery Graph evidence;
- feed Aun Gate policy evaluation after AUN internal stability is restored;
- add product-specific profile defaults for Kodama, Wasurezu, Totonoe, hotel
  SaaS, PMS, and CRM.
