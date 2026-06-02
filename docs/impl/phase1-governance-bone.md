---
id: IMPL-GOVBONE-249
status: Draft
traces:
  spec: [SPEC-GOVBONE-249]
  verify: [VERIFY-GOVBONE-249]
  ops: [OPS-GOVBONE-249]
---

# IMPL: Product-Wide Governance Bone

## 0. Corresponding SPEC
`docs/spec/phase1-governance-bone.md` / SPEC-GOVBONE-249.

## 1. Implementation Slices

### Slice A: Deterministic Validator
Add `src/cli/lib/governance-bone-validator.ts`.

The validator accepts Markdown-like documents and returns:

- status: `PASS`, `WARNING`, or `BLOCK`;
- mode: `warning` or `strict`;
- profile: `default`, `infrastructure`, or `hotel`;
- risk: `low`, `medium`, `high`, or `critical`;
- field and authority findings.

### Slice B: Field Alias Model
Represent required governance fields with aliases so issue and PR templates can
use natural wording while satisfying one contract. For example:

- `PR slice` may be represented by `PR / Change Slice`;
- `Action tools` may be represented by `Tool Execution` or
  `Tool execution policy`;
- `Approval policy` may be represented by `Human approval`;
- `Audit evidence` may be represented by `Audit refs` or
  `Evidence / Audit Record`.

### Slice B2: Ownership Separation Model
Add concrete ownership fields to the same governance skeleton:

- `architecture_owner`;
- `implementation_owner`;
- `review_owner`;
- `merge_authority`;
- `audit_owner`.

The validator treats these fields as concrete required values. Placeholder
values such as `TBD`, `n/a`, `not applicable`, `none`, and `null` are missing
ownership evidence.

The validator also blocks ARC/design-role implementation ownership or merge
authority unless the document contains explicit repository-owner delegation.
Reference implementation text must be identified as draft or by an explicit
reference/proposal label.

### Slice C: Profile and Risk Resolution
Add profile-specific trigger terms for infrastructure and hotel products.

If `mode` is omitted, resolve mode from risk:

- `low` / `medium` -> warning;
- `high` / `critical` -> strict.

An explicit `--mode warning` keeps first-phase warning-only adoption available.

### Slice D: CLI Command
Extend `shirube check governance <files...>` with:

- `--mode warning|strict`;
- `--strict` as an alias for strict mode;
- `--profile default|infrastructure|hotel`;
- `--risk low|medium|high|critical`;
- `--require`;
- `--json`.

### Slice E: Template Distribution
Update GitHub template installation to include:

- `.github/workflows/governance.yml`;
- `.github/ISSUE_TEMPLATE/governance-work-order.md`;
- `.github/PULL_REQUEST_TEMPLATE/governance.md`.

The governance workflow reads the PR body and runs the CLI with environment-
controlled profile/risk/mode settings.

## 2. File-Level Impact
- `src/cli/lib/governance-bone-validator.ts`
- `src/cli/lib/governance-bone-validator.test.ts`
- `src/cli/commands/check.ts`
- `src/cli/commands/check-governance.test.ts`
- `src/cli/lib/github-templates.ts`
- `src/cli/lib/github-templates.test.ts`
- `templates/ci/governance.yml`
- `templates/github/ISSUE_TEMPLATE/governance-work-order.md`
- `templates/github/governance-PULL_REQUEST_TEMPLATE.md`
- `docs/specs/10_GOVERNANCE_BONE.md`
- `docs/spec/phase1-governance-bone.md`
- `docs/impl/phase1-governance-bone.md`
- `docs/verify/phase1-governance-bone.md`
- `docs/ops/phase1-governance-bone.md`
- `docs/specs/roadmap.md`

## 3. Compatibility Rules
- Existing `shirube check tests` behavior must not change.
- Existing workflow-state checks are not expanded by this slice.
- Warning mode exits 0 for missing field warnings.
- Non-negotiable authority and silent-fallback blocks remain BLOCK even in
  warning mode.
- Template installation keeps existing profile-specific CI and PR template
  behavior, while adding governance templates as additional files.

## 4. Future Integration
#248 should extend Work Order authority fields and approval mapping.

The Work Order authority contract should consume the same ownership fields
rather than inventing a separate owner model. #248 can promote missing
`implementation_owner`, `merge_authority`, or `audit_owner` from warning-first
governance findings to hard Work Order dispatch blockers when the adoption plan
is reviewed.

#227 Delivery Graph runner work can later consume the same governance evidence
as part of scripted step execution.

Future product profiles can add stricter trigger terms and template defaults
without changing the core hierarchy.
