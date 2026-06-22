# Shirube Lifecycle Flow Guard

The lifecycle flow guard is a local/report-only Rapid/Lite gate. It decides whether a work item may move to the next lifecycle phase from adoption through post-merge completion.

The guard does not classify adoption. `check-adoption` owns adoption intake and produces the adoption report. `check-lifecycle` consumes that report with `--adoption-report` and uses it as a prerequisite for phase movement.

## Command

```bash
node scripts/shirube/check-lifecycle.mjs \
  --state .shirube/lifecycle-state.yaml \
  --adoption-report .shirube/reports/adoption.json \
  --repo-spec .shirube/repo-spec.yaml \
  --handoff .shirube/control-handoffs/CH-example.yaml \
  --gate-contract-report .shirube/reports/gate-contract.json \
  --design-rule-report .shirube/reports/design-rules.json \
  --owner-decision .shirube/evidence/owner-decision.yaml \
  --post-merge .shirube/evidence/post-merge.yaml \
  --format json
```

Supported inputs:

- `--state`: lifecycle state YAML/JSON.
- `--adoption-report`: JSON output from `check-adoption`; required before normal handoff, execution, PR, merge, or completion phases.
- `--repo-spec`: RPS / Repository Premise Spec.
- `--framework-lock`: optional framework lock.
- `--handoff`: Rapid/Lite control handoff / minimal spec.
- `--gate-contract-report`: JSON output from `check-gate-contract`.
- `--design-rule-report`: JSON output from `check-design-rules`; optional until configured as required.
- `--owner-decision`: owner exact-head decision evidence.
- `--post-merge`: merge / post-merge evidence.
- `--changed-files`: optional changed-file list, recorded as evidence.
- `--format json`: required machine output.

## Output

The command emits deterministic JSON:

```json
{
  "schema": "shirube-lifecycle-check/v1",
  "mode": "rapid-lite",
  "profile": "hotel-lite",
  "current_phase": "EXECUTION_READY",
  "verdict": "PASS",
  "would_block": false,
  "adoption": {
    "report_ref": ".shirube/reports/adoption.json",
    "lane": "adoption_intake",
    "disposition": "greenfield_initialize",
    "current_phase": "ADOPTION_READY",
    "verdict": "PASS"
  },
  "allowed_next_phases": [],
  "forbidden_next_phases": [],
  "blockers": [],
  "warnings": [],
  "evidence": [],
  "required_next_actions": []
}
```

Exit semantics are report-only:

- `PASS`: exit `0`
- `PASS_WITH_WARN`: exit `0`
- `BLOCKED`: exit `0` with `would_block: true`
- `FAILURE`: exit `1`

## Phases

The first Rapid/Lite lifecycle model includes:

- `ADOPTION_REQUIRED`
- `RPS_REQUIRED`
- `RPS_READY`
- `HANDOFF_REQUIRED`
- `HANDOFF_READY`
- `EXECUTION_READY`
- `IMPLEMENTED`
- `PR_READY`
- `GATE_REVIEW_REQUIRED`
- `OWNER_DECISION_REQUIRED`
- `MERGE_READY`
- `MERGED`
- `POST_MERGE_REQUIRED`
- `COMPLETE`
- `BLOCKED`

## Responsibility Boundary

`check-adoption` decides:

- `greenfield_initialize`
- `retrofit_accelerate`
- `retrofit_recover`

`check-lifecycle` decides whether the current work item may move to the next lifecycle phase, given adoption state and structured gate evidence.

The lifecycle guard must not infer greenfield, retrofit, or recovery disposition from repository files. It only consumes the adoption report.

## Blocking Rules

The lifecycle guard blocks when required structured evidence is missing or invalid:

- Missing or invalid lifecycle state: `LC-BOOT-001`
- Missing framework reference: `LC-BOOT-002`
- Missing or blocked adoption report: `LC-ADOPT-*`
- Missing or unconfirmed RPS: `LC-RPS-*`
- Missing or not-ready handoff: `LC-HANDOFF-*`
- Missing or blocked gate-contract report: `LC-EXEC-001` / `LC-EXEC-002`
- Missing required design-rule report or blocked design-rule report: `LC-EXEC-003` / `LC-EXEC-004`
- LLM/AI/model approval claimed as phase authority: `LC-EXEC-005`
- Missing owner exact-head decision or head mismatch: `LC-MERGE-*`
- Missing post-merge evidence or unresolved follow-up blockers at `COMPLETE`: `LC-POST-*`

LLM output may be used as summary or audit input only when later checked by structured gate evidence. Freeform model approval is not phase authority.

## Design Rule Reports

Design-rule reports are supported but not globally mandatory in this slice. If lifecycle state or handoff sets `design_rule_required: true`, then missing design-rule evidence blocks. If it is absent before enforcement and not required, the lifecycle guard reports `LC-WARN-002`.

## Non-Scope

This guard is local/report-only. It does not wire workflows, enable required checks, mutate branch protection or rulesets, change runtime behavior, change package or lockfiles, activate AUN, alter production/deploy behavior, change B3 schema, or change `shirube-audit/v1`.
