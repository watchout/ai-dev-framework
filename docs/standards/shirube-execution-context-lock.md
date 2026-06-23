# Shirube Execution Context Lock

The execution context lock is Gate 0 for Shirube Rapid/Lite. It verifies the active repo, work order, PR, role, and support/control repo boundaries before RPS, handoff, lifecycle, gate-contract, design-rule, or enforcement evidence is trusted.

## Artifact

Use `templates/shirube-execution-context.yaml` as the starting point for `.shirube/execution-context.yaml` or for an explicit `execution_context_ref` / `context_ref` in a PR body.

The role vocabulary is intentionally lightweight:

- `active_role: lead`
- `active_role: dev`

Repo access is modeled through `repo_relations`, not through a heavy bot role matrix:

- `primary`
- `framework_support`
- `control_source`
- `support`

## Required Header

Before implementation or merge-readiness judgment, the operator should state:

```text
Context: <primary_repo> / <product> / <work_order> / <PR> / <active_role> / <support relation>
```

This header is only a human-readable reminder. It does not replace the machine-readable execution context artifact.

## Command

```bash
node scripts/shirube/check-execution-context.mjs \
  --context .shirube/execution-context.yaml \
  --pr-body .shirube/tmp/pr-body.md \
  --changed-files .shirube/tmp/changed-files.txt \
  --actual-repo owner/repo \
  --actual-branch branch \
  --actual-head sha \
  --format json
```

`BLOCKED` exits `0` in report-only mode. Malformed input emits `FAILURE` and exits nonzero.

## Gate 0 Rules

The check blocks when:

- execution context is missing;
- actual repo, branch, or head is uncertain;
- actual repo, work order repo, or PR repo does not match the primary repo;
- support, control, or framework repos are treated as implementation targets;
- a lead role attempts product implementation;
- a dev role claims audit, owner, merge, release, or protected authority;
- merge-ready language appears without structured owner exact-head evidence.

If Gate 0 blocks, later Rapid/Lite gates may still run for visibility, but their results are not trusted as merge permission.

## Runner Integration

`run-rapid-lite-report` discovers `execution_context_ref` / `context_ref` from PR body, then falls back to `.shirube/execution-context.yaml` when present. It runs `check-execution-context` before adoption, lifecycle, gate-contract, and design-rule checks.

The aggregate report includes the execution-context gate. A blocked execution context sets:

- `would_block: true`
- `owner_must_not_merge: true`

This does not enable required checks, branch protection, rulesets, or CI hard-blocking.
