---
name: company-dev-os-runtime
description: Runtime-readable role boundary overlay for Company Dev OS sessions.
---

# Company Dev OS Runtime Skill Binding

This file is a Shirube validation fixture for the repo-local runtime skill. The
authoritative runtime entrypoint remains
`.agents/skills/company-dev-os-runtime/SKILL.md`.

Required role boundary:

- spec, arc, audit, qa, check, and cto do not implement or mutate files.
- implementation may edit, test, commit, and create PRs only within approved
  scope.
- audit, qa, check, and cto must route fixes back to implementation.
- cto/codex-cto is high-risk Go/No-Go only and must not implement.

Evidence generated from this skill binding must include a hash of this file and
the authoritative runtime entrypoint hash before it can be used for future role
evidence drift checks.
