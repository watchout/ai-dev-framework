# Shirube Audit Checklist P0

Shirube audits must be itemized, evidence-bound, and partially machine-verifiable before they can support full operational audit acceptance.

This P0 layer is intentionally lightweight. It does not implement multi-model judging, calibrated abstention thresholds, mandatory refutation/debate, or an audit ground-truth corpus.

## Commands

Generate a checklist from a control handoff:

```bash
node scripts/shirube/generate-audit-checklist.mjs \
  --handoff .shirube/control-handoffs/CH-001.yaml \
  --out .shirube/audit-checklists/AUDIT-CHECKLIST-001.yaml \
  --format json
```

Check a structured audit response:

```bash
node scripts/shirube/check-audit-checklist.mjs \
  --checklist .shirube/audit-checklists/AUDIT-CHECKLIST-001.yaml \
  --audit .shirube/audits/AUDIT-001.yaml \
  --machine-evidence .shirube/evidence/validation.yaml \
  --expected-head <exact-head-sha> \
  --format json
```

`BLOCKED` is report-only for this slice: it exits 0 and records `would_block=true`. `FAILURE` exits nonzero for malformed inputs or script errors.

## Checklist Shape

```yaml
schema_version: shirube-audit-checklist/v1
audit_checklist_id: AUDIT-CHECKLIST-...
source:
  handoff_ref: <path>
  cell_id: <CELL-ID>
  pr: <owner/repo#pr>
items:
  - item_id: AUDIT-001
    source: acceptance_criteria
    verification_method: executable
    required: true
    prompt: "<what must be checked>"
    expected_evidence:
      - <evidence key/ref>
```

## Handoff Mapping

The generator maps:

- `acceptance_criteria` to semantic audit items.
- `stop_conditions` to negative semantic audit items.
- `allowed_paths` and `forbidden_paths` to executable diff-scope items.
- `protected_surfaces` to protected governance audit items.
- `validation.required_commands` to executable command-result items.
- `validation.required_evidence` to executable evidence-reference items.
- role boundaries to maker/checker authority items.
- owner exact-head policy to owner-decision items.
- post-merge policy to post-merge evidence items when relevant.

## Structured Audit Response

```yaml
schema_version: shirube-structured-audit/v1
audit_checklist_ref: .shirube/audit-checklists/AUDIT-CHECKLIST-001.yaml
pr_head_sha: <sha>
reviewer_actor: codex-audit
reviewer_model: gpt-5-audit
items:
  - item_id: AUDIT-001
    result: PASS
    evidence_refs: []
    confidence: high
    notes: ""
```

Each required checklist item must be answered exactly once. `PASS`, `FAIL`, `N/A`, and `UNVERIFIED` are the only valid item results.

## Evidence Rules

Executable items are not satisfied by LLM prose. A `PASS` on an executable item requires concrete machine evidence, such as:

- command result;
- gate report;
- diff/path check;
- CI conclusion snapshot;
- exact-head validation evidence.

Semantic items may use reviewer judgment, but required items still need evidence references or explicit rationale.

## Hard Blocks

- `AUDIT-LIST-001 missing_audit_checklist`
- `AUDIT-LIST-002 required_item_missing`
- `AUDIT-LIST-003 duplicate_item_result`
- `AUDIT-LIST-004 required_item_unanswered`
- `AUDIT-LIST-005 executable_item_pass_without_machine_evidence`
- `AUDIT-LIST-006 fail_without_evidence_or_action`
- `AUDIT-LIST-007 unverifiable_item_without_escalation`
- `AUDIT-LIST-008 audit_head_mismatch`
- `AUDIT-LIST-009 maker_checker_violation`
- `AUDIT-LIST-010 scope_only_audit_request_in_full_operational_mode`

## Non-Scope

This P0 layer does not activate required checks, mutate branch protection or rulesets, change runtime/API/DB/product code, change package or lockfiles, mutate external repositories, orchestrate multiple judge models, define calibrated abstention thresholds, require refutation/debate, or introduce a ground-truth audit corpus.
