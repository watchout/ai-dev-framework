# Shirube V3 Rapid/Lite Gate Contract Matrix

Status: draft design baseline  
Parent SSOT: https://github.com/watchout/ai-dev-framework/issues/458  
Matrix: `.shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml`

## 1. Purpose

Rapid/Lite is the first lightweight execution mode for Shirube V3.

It exists so Codex, Claude Code, or another goal-mode runner can implement quickly while Shirube still prevents the common failure modes that cause drift:

- no durable handoff;
- no repo-local issue;
- no CELL-ID;
- no exact PR head;
- no diff boundary;
- no validation evidence;
- placeholder evidence;
- missing owner decision;
- unauthorized continuation;
- old or external material treated as truth.

Rapid/Lite is not a bypass mode. It is an artifact-collapsed mode.

```text
Standard:
  Goal -> SPEC -> CELL -> IMPL -> PR -> Evidence -> Audit -> Merge

Rapid/Lite:
  Control Handoff collapses Goal + minimal Spec + Cell + Impl,
  but exact head, diff scope, evidence, owner decision, and CELL-ID remain mandatory.
```

## 2. Core rule

```text
Collapse artifacts, not control.
```

Rapid/Lite may use one control handoff instead of separate Goal, SPEC, CELL, and IMPL files. It must still preserve:

- repo-local issue or PR anchor;
- `CELL-ID`;
- risk class;
- allowed paths;
- forbidden paths;
- stop conditions;
- validation commands and results;
- exact PR head SHA;
- changed file list;
- owner decision;
- next role;
- post-merge evidence when done is claimed.

## 3. Hard BLOCK baseline

The first Rapid/Lite Hard BLOCK baseline is intentionally small and structural. These are hard from day one because they can be checked without semantic interpretation.

| Area | Hard BLOCK examples |
| --- | --- |
| Goal / Issue | missing control handoff, missing repo-local issue, missing owner/next role, legacy-as-truth |
| Cell | missing CELL-ID, missing risk class, missing allowed_paths, missing forbidden_paths, missing stop_conditions, unauthorized next cell |
| PR / Diff | missing PR head SHA, changed files outside allowed_paths, forbidden_paths touched, head mismatch, scope drift |
| Evidence | missing validation evidence, placeholder evidence, stale evidence, failed required validation without owner decision |
| Trace | cell not linked to handoff, unauthorized next cell, legacy-as-truth |
| Audit / B3 | missing required item, duplicate item, extra item, FAIL without durable evidence, UNVERIFIED, maker/checker violation, audit head mismatch |
| Merge | owner decision missing, merge head mismatch, unresolved Hard BLOCK |
| Post-merge | missing merge commit, missing merged_at, missing smoke or N/A evidence, unresolved follow-up blocker |

## 4. WARN baseline

Rapid/Lite uses WARN for quality and maturity issues that should be visible but should not stop fast implementation by default.

| Area | WARN examples |
| --- | --- |
| Spec | AC/TEST granularity low, semantic edge cases need review, recommended fields missing |
| Cell | cell size large, cell type inferred |
| Impl | implementation detail low, rollback/revert plan light |
| PR | PR size large, generated/bulk diff needs sampling |
| Evidence | weak test coverage, manual evidence only |
| Trace | trace matrix granularity low |
| Audit | semantic edge case review needed, coverage quality low |
| Merge | WARN findings unacknowledged |
| Post-merge | next step weak |

The intended operating model is:

```text
Rapid/Lite = structural Hard BLOCK + semantic WARN
Standard   = structural Hard BLOCK + stronger REQ/AC/TEST trace + required audit
Enterprise = Standard + protected authority + rollout + strict evidence
```

## 5. Cell types

Rapid/Lite defines these initial cell types:

| Cell type | Rapid/Lite status | Use |
| --- | --- | --- |
| `docs_only` | allowed | Documentation, design, issue text, non-behavioral markdown. |
| `scaffold` | allowed | Templates, schemas, fixtures, or repo-local governance scaffold without runtime activation. |
| `code_lite` | allowed | Small non-protected code/config change with no external write and no public contract break. |
| `integration_lite` | warning lane | Narrow integration touch with no protected surface and no external mutation. |
| `protected_stop` | blocked | Protected, production, secret, enforcement, branch-protection, live-operation, or irreversible work. |

Any protected-stop condition escalates out of Rapid/Lite to Standard or Enterprise.

## 6. hotel-lite profile

The first target profile is `hotel-lite`.

`hotel-lite` inherits Rapid/Lite and allows:

- `docs_only`;
- `scaffold`;
- `code_lite`.

It warns on `integration_lite` and blocks:

- auth or permission change;
- DB migration or destructive data change;
- production or deploy change;
- branch protection or ruleset change;
- required check activation;
- secret read or write;
- external repository mutation;
- live AUN / Discord / queue / DB / LaunchAgent dispatch;
- irreversible customer-impacting operation.

## 7. Audit item ID rule

Rapid/Lite audit item IDs use the `RL-*` namespace.

Examples:

```text
RL-GOAL-001  missing_control_handoff
RL-CELL-002  missing_allowed_paths
RL-PR-002    changed_files_outside_allowed_paths
RL-EVID-002  placeholder_evidence
RL-B3-005    unverified_item
RL-MERGE-002 merge_head_mismatch
```

These IDs are contract item IDs. They do not replace `shirube-audit/v1`.

A later implementation Cell may generate or maintain `shirube-audit/v1` item sets from this matrix. B3 remains the admissibility gate for audit records.

## 8. Goal-mode handoff shape

A Rapid/Lite runner should receive one compact handoff containing:

```text
mode
profile
repo
repo-local issue
control_handoff_id
CELL-ID
cell_type
risk_class
goal
non_scope
allowed_paths
forbidden_paths
stop_conditions
validation_commands
required_evidence
owner
next_role
forbidden_operations
```

The template is `templates/shirube-control-handoff.rapid-lite.yaml`.

## 9. Graduation path

Rapid/Lite can later become executable in three steps:

1. Keep this matrix as the design SSOT.
2. Add a `check-gate-contract` script that reads the matrix and control handoff.
3. After pilot evidence, graduate only the structural Hard BLOCK subset to required checks.

Do not graduate WARN items to required checks until Standard or Enterprise baselines are explicitly approved.

## 10. Non-scope

This design does not:

- activate workflows;
- create required checks;
- change branch protection or rulesets;
- change runtime behavior;
- change `shirube-audit/v1`;
- replace B3;
- finalize Standard or Enterprise mode.
