---
id: IMPL-4MCPFASTTRACK-264
status: Draft
traces:
  spec: [SPEC-4MCPFASTTRACK-264]
  verify: [VERIFY-4MCPFASTTRACK-264]
  ops: [OPS-4MCPFASTTRACK-264]
---

# IMPL: 4MCP Fast Track Minimum Safety Profile

## 0. Corresponding SPEC
`docs/spec/phase1-4mcp-fast-track-safety-profile.md` /
SPEC-4MCPFASTTRACK-264.

## 1. Implementation Intent
This PR defines the contract only. Runtime implementation starts only after L1
spec review records PASS.

The first implementation must be small enough to help current 4MCP work without
claiming full autonomous delivery mode.

## 2. Planned Slices
### Slice A: Profile Contract
Define stable enum-like values:

- lane: `Fast`, `Governed`, `Stop`;
- risk: `R0`, `R1`, `R2`, `R3`, `R4`;
- owner fields from #249;
- action envelope fields;
- PR evidence fields;
- hard stop fields.

### Slice B: Template Projection
Update Work Order and PR evidence templates so 4MCP work can declare:

- Work Order / issue reference;
- product/repo;
- lane/risk;
- scope/non-goals;
- allowed files/modules;
- allowed/forbidden actions;
- stop conditions;
- verification commands/results;
- residual risk;
- review/audit owner.

### Slice C: Deterministic Validator
After L1 PASS, add a deterministic validator that can be used by a command such
as:

```bash
shirube check 4mcp-safety <files...>
```

Planned options:

- `--mode warning|strict`;
- `--strict`;
- `--json`;
- optional `--require` for migration audits.

The validator should compose with #249 Governance Bone instead of duplicating
owner/authority semantics.

### Slice D: Stop/No-Run Sentinel
Define a read-only sentinel check first. The implementation must not start by
adding autonomous runner scheduling or live AUN dispatch.

Potential inputs:

- a repository-local sentinel file;
- Work Order metadata;
- explicit CLI flag or environment input for tests.

The first implementation may warn for missing sentinel configuration, but must
BLOCK when the sentinel is explicitly active.

### Slice E: 4MCP Adoption Guidance
Provide operations examples for AUN, Shirube, Kodama, and Wasurezu so active
work can use the same profile before the full safety-control stack exists.

## 3. File-Level Plan
Spec-only PR files:

- `docs/spec/phase1-4mcp-fast-track-safety-profile.md`;
- `docs/impl/phase1-4mcp-fast-track-safety-profile.md`;
- `docs/verify/phase1-4mcp-fast-track-safety-profile.md`;
- `docs/ops/phase1-4mcp-fast-track-safety-profile.md`;
- `docs/specs/roadmap.md`.

Future implementation files may include:

- `src/cli/lib/fast-track-safety-validator.ts`;
- `src/cli/lib/fast-track-safety-validator.test.ts`;
- `src/cli/commands/check.ts`;
- `src/cli/commands/check-fast-track-safety.test.ts`;
- `templates/github/...` updates.

## 4. Compatibility Rules
- Do not change AUN queue/runtime behavior.
- Do not add live dispatch.
- Do not add automatic merge.
- Do not mutate DB/schema.
- Do not introduce production deploy, secret, or external-send behavior.
- Keep #249 as the authority source for owner separation.
- Treat #260-style ARC implementation PRs as reference/draft work until repo
  owner adoption is recorded.

## 5. Implementation Exit Condition
Implementation may start only after:

- L1 spec review passes;
- #253 ownership boundary dependency is reviewed or the stack dependency is
  explicitly held;
- the implementation PR declares whether it is warning-first template work,
  deterministic validator work, or stop-sentinel work.
