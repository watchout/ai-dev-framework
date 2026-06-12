# Contributing to Shirube

Thanks for contributing. Shirube is built around GitHub-first evidence: issues,
PR comments, CI, reviews, and runtime evidence are the source of truth for
delivery decisions.

## Setup

```bash
npm install
npm run type-check
npm run build:cli
npm test
```

Use `shirube` as the primary CLI command in docs and examples. The `framework`
command is kept only for legacy compatibility.

## Picking Work

- Start from a GitHub Issue when possible.
- Prefer small PRs with one concern each.
- Use `good first issue` for beginner-safe tasks.
- Use `help wanted` for extension points that are ready for external
  contribution.

## Branches And PRs

- Branch from the current integration base named in the issue or maintainer
  handoff.
- Keep PRs as drafts until local validation and evidence are posted.
- Include the issue number, changed files, validation commands, and known risks
  in the PR body or a PR comment.
- Do not treat an ACK, queue ID, or green CI alone as completion evidence.

## Validation

Run the smallest relevant checks while iterating, then run the standard checks
before handoff when the change touches shared behavior:

```bash
npm run type-check
npm run build:cli
npm run lint
npm test
npm audit --audit-level=high
git diff --check
```

Docs-only changes may still run the standard checks when they touch public
workflow, governance, or onboarding material.

## Review Expectations

Routine PRs can be reviewed through GitHub comments, CI, and merge queue.
Protected or high-risk PRs need explicit review evidence from the required
roles before merge. Maintainers should aim to give an initial response to
external contributor PRs within two business days.

High-risk areas include auth, permissions, database migrations, production
deploy, agent routing, queue or memory recovery, audit-log automation, merge
authority policy, and live external-system smoke tests.
