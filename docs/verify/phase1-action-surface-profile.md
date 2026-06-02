---
id: VERIFY-ACTIONPROFILE-254
status: Draft
traces:
  spec: [SPEC-ACTIONPROFILE-254]
  impl: [IMPL-ACTIONPROFILE-254]
  ops: [OPS-ACTIONPROFILE-254]
---

# VERIFY: Governed Action Surface Profile

## 0. Corresponding SPEC
`docs/spec/phase1-action-surface-profile.md` /
SPEC-ACTIONPROFILE-254.

## 1. Required Checks
- `npm test -- src/cli/lib/action-surface-profile-validator.test.ts src/cli/commands/check-governance.test.ts`
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
| complete Stage 1 JSON profile | PASS |
| Stage 0 Markdown inventory row | PASS in `--stage inventory --strict` |
| Stage 1 run on inventory-only row | WARNING in warning mode |
| risky capability without risk | WARNING in warning mode, BLOCK in strict mode |
| critical external-send/action without approval and audit coverage | BLOCK in strict mode |
| invalid `--stage` value | exit 2 |
| JSON output | structured status, mode, stage, surface count, and findings |

## 3. Regression Boundaries
- Missing fields must be findings, not silent success.
- Unknown risk must not be silently safe for risky capabilities.
- Warning mode must remain available for first-phase inventory adoption.
- Strict mode must block incomplete risky profiles.
- The validator must not execute tools, mutate files, or call remote systems.

## 4. Review Evidence
The PR evidence must include:

- local command results;
- GitHub checks;
- merge-tree status;
- exact head;
- explicit non-claims for AUN live enforcement, action dispatch, merge
  authority, phase transition authority, and enterprise readiness.
