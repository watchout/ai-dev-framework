# Shirube Adoption Intake

Status: draft local/report-only baseline
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/458
Work Order: https://github.com/watchout/ai-dev-framework/issues/477

## Purpose

Shirube adoption starts with one intake lane, not separate greenfield and retrofit operating flows.

The intake gate distinguishes the repository disposition:

- `greenfield_initialize`: existing-state scan is empty; missing Shirube artifacts are expected initialization work, not recovery.
- `retrofit_accelerate`: existing repository state is materially healthy; only Shirube artifacts need gap-fill.
- `retrofit_recover`: material drift, legacy-as-truth, LLM-as-truth, unsafe change, or missing owner-confirmed direction requires recovery before normal execution.

## Single Flow

The canonical adoption intake flow is:

1. `ADOPTION_INTAKE`
2. `EXISTING_STATE_SCAN`
3. `CLASSIFICATION`
4. `RPS_DRAFT_FROM_CURRENT_REALITY`
5. `RPS_OWNER_CONFIRMATION`
6. `GAP_FILL_OR_RECONCILIATION_PLAN`
7. `NEXT_SAFE_CELL / CONTROL_HANDOFF`
8. `ADOPTION_READY`

Greenfield and retrofit are classifications inside this lane. They are not separate command flows.

## Command

```bash
node scripts/shirube/check-adoption.mjs \
  --adoption-plan templates/shirube-adoption-intake.yaml \
  --existing-state templates/shirube-existing-state-scan.yaml \
  --repo-spec .shirube/repo-spec.yaml \
  --spec-reconciliation templates/shirube-spec-reconciliation-plan.yaml \
  --handoff .shirube/control-handoffs/CH-example.yaml \
  --format json
```

Supported inputs:

- `--adoption-plan <path>`: adoption intake plan.
- `--existing-state <path>`: explicit existing-state scan.
- `--repo-spec <path>`: optional RPS / Repository Premise Spec.
- `--legacy-inventory <path>`: compatibility alias for existing-state scan input.
- `--spec-reconciliation <path>`: optional gap-fill or reconciliation plan.
- `--handoff <path>`: optional current control handoff.
- `--changed-files <path>`: optional newline-separated changed files used to detect unsafe adoption attempts.
- `--format json`: required machine format.

## Output

The checker emits deterministic report-only JSON:

```json
{
  "schema": "shirube-adoption-check/v1",
  "lane": "adoption_intake",
  "disposition": "retrofit_accelerate",
  "current_phase": "ADOPTION_READY",
  "verdict": "PASS",
  "would_block": false,
  "allowed_next_phases": [],
  "forbidden_next_phases": [],
  "blockers": [],
  "warnings": [],
  "evidence": [],
  "required_next_actions": []
}
```

Exit semantics:

- `PASS`: exit 0.
- `PASS_WITH_WARN`: exit 0.
- `BLOCKED`: exit 0 with `would_block=true`.
- `FAILURE`: exit 1.

## Blocking Rules

The first implementation blocks:

- missing or invalid adoption intake plan;
- lane other than `adoption_intake`;
- missing owner role or actor;
- missing existing-state scan;
- material drift;
- legacy material treated as truth;
- LLM reconciliation treated as truth;
- unsafe or protected changes before recovery;
- retrofit without owner-confirmed direction;
- missing RPS before adoption ready;
- missing RPS owner confirmation;
- missing gap-fill or reconciliation plan for non-empty existing state;
- missing next safe Cell or control handoff.

## Warning Rules

The first implementation warns:

- stale existing-state scan;
- absent or partial tests;
- partial specs captured as input-only;
- high unknown count;
- greenfield initialization artifacts still pending;
- healthy retrofit requiring only Shirube gap-fill.

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
