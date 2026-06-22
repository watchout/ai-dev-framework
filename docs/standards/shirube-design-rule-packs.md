# Shirube Design Rule Packs

Status: draft report-only baseline
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/458
Work Order: https://github.com/watchout/ai-dev-framework/issues/474

## Purpose

Design Rule Packs make owner-defined engineering rules executable without asking an LLM to decide gate state.

```text
LLMs may propose, summarize, and explain.
Scripts decide gate state from repository facts.
```

This gate is separate from the Rapid/Lite flow gate:

- Rapid/Lite flow gate decides whether work may proceed through Shirube process stages.
- Design Rule Pack gate decides whether the implementation shape violates configured design or architecture rules.

## Command

```bash
node scripts/shirube/check-design-rules.mjs \
  --rule-pack .shirube/design-rule-packs/shirube-default-design-rules.yaml \
  --changed-files test/fixtures/shirube/design-rules/changed-files.pass.txt \
  --diff-root test/fixtures/shirube/design-rules/pass \
  --handoff test/fixtures/shirube/design-rules/handoff.pass.yaml \
  --format json
```

Supported inputs:

- `--rule-pack <path>`: YAML rule pack. Defaults to `.shirube/design-rule-packs/shirube-default-design-rules.yaml` when present.
- `--changed-files <path>`: newline-separated changed file paths.
- `--diff-root <path>`: local root used to read changed file contents for tests/local mode.
- `--handoff <path>`: optional control handoff or design context.
- `--pr-body <path>`: optional PR body text fixture.
- `--evidence <path>`: optional evidence YAML, JSON, or text.
- `--format json`: required machine format.

The first implementation does not fetch GitHub API state and does not inspect git diff hunks.

## Output

The checker emits deterministic JSON:

```json
{
  "schema": "shirube-design-rule-check/v1",
  "rule_pack_id": "DESIGN-RULE-PACK-SHIRUBE-DEFAULT-001",
  "verdict": "PASS",
  "would_block": false,
  "rule_results": [],
  "blockers": [],
  "warnings": [],
  "evidence": [],
  "required_next_actions": []
}
```

Exit semantics:

- `PASS`: exit 0.
- `PASS_WITH_WARN`: exit 0.
- `BLOCKED`: exit 0 with `would_block=true` in report-only mode.
- `FAILURE`: exit 1.

## Default Rule Pack

The default report-only pack is `.shirube/design-rule-packs/shirube-default-design-rules.yaml`.

Initial rules:

| Rule | Severity | Purpose |
| --- | --- | --- |
| `DR-LLM-001 llm_must_not_be_final_decider` | BLOCK | LLM/model output cannot be the final gate, owner, merge, security, or architecture decision. |
| `DR-DATA-001 hard_delete_without_soft_delete_policy` | BLOCK | Hard delete operations require an adjacent soft-delete policy or approved scoped exception. |
| `DR-ARCH-001 low_generality_new_domain_shape` | WARN | Configurable domain concepts should move toward DB/config ownership. |
| `DR-CODE-001 duplicated_code_block` | WARN/BLOCK | Duplicate code blocks warn at 6 lines and block at 12 lines. |
| `DR-CONFIG-001 source_hardcoded_variable_item` | WARN | Likely configurable values should not live directly in executable source. |
| `DR-SAFE-001 protected_surface_without_explicit_cell` | BLOCK | Protected surfaces require explicit protected_stop or escalation route. |
| `DR-CONFIG-002 hidden_business_constant_in_source` | WARN | Tenant, product, operator, or business constants should be centralized. |
| `DR-RULEPACK-001 missing_rule_pack_or_version` | BLOCK | Rule packs must declare `schema_version` and `rule_pack_id`. |

## Exceptions

The first supported exception shape is intentionally narrow:

```yaml
design_rule_exceptions:
  - rule_id: DR-DATA-001
    reason: test fixture cleanup only
    scope: test/**
    approved_by: owner
    expires_at: 2026-07-31
```

Exceptions must be scoped, reasoned, approved, and unexpired. They do not silently allow production hard delete patterns.

## Non-Scope

This Cell does not:

- wire workflows;
- enable required checks;
- change branch protection or rulesets;
- change runtime behavior;
- change package files or lockfiles;
- activate AUN, Discord, DB, queue, LaunchAgent, production, or deploy behavior;
- change B3 schema;
- change `shirube-audit/v1`;
- implement Standard or Enterprise enforcement;
- fetch GitHub API state;
- mutate external repositories.
