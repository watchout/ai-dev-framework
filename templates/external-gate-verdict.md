# External Gate v0 Verdict

```yaml
schema_version: shirube-external-gate-verdict/v0
repo: <owner/repo>
target: <issue_or_pr_url>
reviewer: <actor_id>
reviewer_role: external_gate_reviewer
checked_sources: []
checks:
  canonical_ssot_status: PASS|WARN|BLOCK
  gate_order: PASS|WARN|BLOCK
  required_records: PASS|WARN|BLOCK
  script_controlled_validation: PASS|WARN|BLOCK
  llm_judgment_exclusion: PASS|WARN|BLOCK
  runner_compatibility: PASS|WARN|BLOCK
  risk_role_evidence: PASS|WARN|BLOCK
  exact_head_merge_done_rules: PASS|WARN|BLOCK
overall: PASS|WARN|BLOCK|CONDITIONAL|REWORK
allowed_next_action: revise|external_gate_review|preflight_lite_cell|do_not_implement|do_not_merge
notes: []
created_at: <timestamp>
```

External Gate v0 is bootstrap-only. It must not become a permanent replacement
for script-controlled gates.
