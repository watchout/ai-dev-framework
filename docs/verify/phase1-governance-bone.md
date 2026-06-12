---
id: VERIFY-GOVBONE-249
status: Draft
traces:
  spec: [SPEC-GOVBONE-249]
  impl: [IMPL-GOVBONE-249]
  ops: [OPS-GOVBONE-249]
---

# VERIFY: Product-Wide Governance Bone

## 0. Corresponding SPEC
`docs/spec/phase1-governance-bone.md` / SPEC-GOVBONE-249.

## 1. Required Checks
- `npm test -- src/cli/lib/governance-bone-validator.test.ts src/cli/commands/check-governance.test.ts src/cli/lib/github-templates.test.ts`
- `npm run type-check`
- `npm run build:cli`
- `npm run lint`
- `npm run shirube -- trace verify`
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`
- `git diff --check origin/main...HEAD`

Full `npm test` is required before marking the PR ready for audit.

## 2. Fixture Matrix
| Fixture | Expected result |
|---------|-----------------|
| complete Governance Bone issue fields | PASS |
| incomplete Work Order in warning mode | WARNING, exit 0 |
| incomplete Work Order in strict mode | BLOCK, non-zero exit |
| `--risk high` without explicit mode | strict BLOCK on missing fields |
| `--mode warning --risk high` | warning-first WARNING, exit 0 |
| hotel profile with guest/reservation text | governance detected |
| PR body using Governance Evidence aliases | PASS |
| complete ownership fields with ARC as architecture owner and repo maintainer as implementation/merge owner | PASS |
| `Implementation owner: TBD` in strict mode | BLOCK |
| ARC as implementation owner or merge authority without explicit delegation | BLOCK |
| reference implementation without Draft or explicit reference/proposal label | BLOCK |
| draft-marked reference implementation with repo implementation and merge owners | PASS |
| LLM owns flow or action-tool authority | BLOCK |
| silent fallback for missing approval/context/audit/evidence | BLOCK |
| template installer for app profile | installs governance workflow, Work Order issue template, and governance PR template |

## 3. Regression Boundaries
- The validator must remain read-only.
- The GitHub workflow template must not mutate issues, PRs, queues, or external
  systems.
- `--mode warning` must remain an explicit first-phase adoption escape hatch.
- `--risk high` and `--risk critical` must derive strict mode when mode is
  omitted.
- Product profile trigger terms must not silently pass unrelated documents.
- Ownership fields must require concrete values and must not accept placeholders
  as assigned actors.
- ARC/design ownership must not imply implementation ownership, adoption
  approval, or merge authority.
- Reference implementation PRs must stay draft or carry explicit reference/
  proposal identification until the repository owner adopts them.

## 4. Review Evidence
The PR evidence must include command results, GitHub checks, merge-tree status,
and explicit non-claims:

- no AUN queue ownership;
- no runtime execution ownership;
- no merge authority;
- no ARC-to-repo implementation ownership transfer;
- no phase transition authority;
- no public, OSS, or enterprise readiness claim.
