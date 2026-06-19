---
schema_version: shirube-repo-spec/v1
canonical_core: watchout/iyasaka-arc/company-dev-os@main
owner: watchout
default_risk: R2
current_phase: shirube-governance
protected_surfaces:
  - CI workflows
  - gate / preflight logic
  - branch protection
domain_or_contracts: Shirube dev-governance (gates / cells / evidence)
repo_non_goals:
  - runtime activation from docs
  - production deployment
roles:
  spec: claude
  arc: claude
  design_reviewer: codex
  impl_runner: codex
  impl_reviewer: codex
  release_owner: watchout
---

# ai-dev-framework — repo SPEC (top-level)

Starting values; adjust per repo reality. Shared definitions / design form / audit items / dev flow live in `canonical_core` (iyasaka-arc/company-dev-os). This file declares only this repo's deltas + role assignments.

G1 check: `scripts/check-repo-spec.mjs` (fails the PR if any required field is missing/invalid).
