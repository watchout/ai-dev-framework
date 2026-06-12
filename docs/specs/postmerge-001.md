# POSTMERGE-001: Post-Merge Verification Gate

> Status: Phase 0 addendum draft for L1/L2/L3 review
> Updated: 2026-05-26
> Tracking: #220
> Related: #212, #216, #217, AUDITLEDGER-001, Phase Closure Audit, G16 post_merge_verify

## 1. Purpose

`POSTMERGE-001` formalizes the post-merge verification record that Shirube must require when a PR contributes to a phase exit condition.

Merge readiness and post-merge reality are separate states. A PR can be approved for merge while the actual `origin/main` result still needs verification after the merge commit exists. This artifact defines the minimum record, policy, verification, and operational handling needed before Phase 1 implementation expansion.

## 2. Non-Goals

- Do not wire new automatic CI, GitHub Check, hook, MCP, or runtime enforcement behavior in this Phase 0 addendum.
- Do not approve PR #91, PR #123, hook fallback, or runtime enforcement wiring.
- Do not reopen or invalidate the completed Phase 0 closure record.
- Do not claim MVP, public, OSS, or enterprise readiness.
- Do not create a second editable identity source if an existing agent/human identity source can be referenced.

## 3. SPEC

### 3.1 Required Record

A post-merge verification record must include:

```json
{
  "schema_version": "postmerge-record/v1",
  "record_id": "postmerge_...",
  "pr": {
    "number": 219,
    "url": "https://github.com/owner/repo/pull/219",
    "title": "docs: repair DOC4L ops trace mappings"
  },
  "merge": {
    "commit": "c7d0d382b617334e0b785745ac6ed8285241abd1",
    "merged_at": "2026-05-26T06:23:59Z"
  },
  "verified_ref": {
    "branch": "origin/main",
    "commit": "c7d0d382b617334e0b785745ac6ed8285241abd1"
  },
  "verified_at": "2026-05-26T06:26:00Z",
  "verifier": {
    "type": "human|agent|github_user|system",
    "id": "adf-lead",
    "role": "executor|auditor|cto|system",
    "source": "aun|github|local|ci"
  },
  "verdict": "PASS|WARN|BLOCK",
  "checks": [
    {
      "name": "trace verify",
      "command": "node dist/cli/index.js trace verify",
      "result": "PASS",
      "summary": "40 total nodes / 40 pass"
    }
  ],
  "artifact_assertions": [
    {
      "kind": "file_present|command_output|github_state|trace_state",
      "summary": "origin/main contains the merged trace mapping"
    }
  ],
  "pre_merge_audit_refs": [
    "https://github.com/owner/repo/pull/219#issuecomment-..."
  ],
  "phase_task_goal_refs": [
    "#212",
    "#216",
    "#220"
  ],
  "residual_risks": [],
  "non_claims": [
    "Does not approve runtime enforcement wiring"
  ],
  "evidence_refs": [
    {
      "type": "github_comment|aun_message|ci_run|local_log",
      "uri": "https://github.com/owner/repo/issues/216#issuecomment-..."
    }
  ]
}
```

### 3.2 Required Cases

Post-merge verification is required when:

- a PR contributes to a phase exit condition;
- a PR changes runtime, enforcement, security, public surfaces, release authority, audit records, or governance semantics;
- a PR fixes a blocker that would otherwise prevent phase completion;
- a PR merges an artifact used by Phase Closure Audit.

### 3.3 Audit Escalation

| PR type | Minimum post-merge audit |
|---|---|
| Docs-only, no governance authority change | L0 post-merge verification plus inclusion in Phase Closure L3 |
| Docs changing governance, phase, audit, release, or authority semantics | L0 + L1 + L2; L3 when phase boundary or authority changes |
| Runtime or CLI observability used for phase exit | L0 + L1 + L2 + L3 when on phase critical path |
| Runtime enforcement, security, release, public, or strict profile behavior | L0 + L1 + L2 + L3 |
| Public launch, license, enterprise positioning, external commitment, or irreversible governance change | L0 + L1 + L2 + L3 + L4 |

### 3.4 Relationship To Audit Ledger And Phase Closure

`POSTMERGE-001` records are inputs to:

- `AUDITLEDGER-001`, which stores audit and approval records canonically;
- Phase Closure Audit, which assembles phase-level readiness evidence;
- G16 `post_merge_verify`, which later becomes enforceable for merge/release profiles;
- G17 `goal_progress`, which uses post-merge evidence to update goal progress.

GitHub issue/PR comments may be projection surfaces, but they are not the only intended canonical record.

## 4. IMPL

Phase 0 addendum implementation is documentation and deterministic schema only:

- define this record schema;
- update roadmap/action-map/Gate Engine docs so Phase Closure Audit can require post-merge evidence;
- keep runtime behavior observe-only;
- keep automatic CI/GitHub Check enforcement for later reviewed phases.

Later implementation split:

| Phase | Implementation level |
|---|---|
| Phase 1 | CLI/JSON post-merge record generation and Audit Ledger projection |
| Phase 2 | GitHub Check / CI required post-merge record gate for standard/strict profiles |
| Phase 3/4 | immutable retention/export, organization integration, and enterprise reporting |

## 5. VERIFY

Phase 0 addendum verification:

- `git diff --check`;
- docs review confirms the schema includes required identity, merge commit, verified ref, checks, artifact assertions, audit refs, task/phase links, residual risks, non-claims, and verdict;
- no runtime file changes unless separately reviewed;
- trace verification only when 4-layer frontmatter is changed.

Future verification:

- fixtures for missing merge commit, missing verified ref, missing verifier, missing pre-merge audit refs, failed post-merge command, and unresolved residual risk;
- phase closure fixture proving a phase cannot close when a required post-merge record is absent.

## 6. OPS

Operational rules:

- The verifier records the merge commit actually present on the verified branch.
- Corrections append or amend a record; they do not silently rewrite prior approval history.
- A WARN or BLOCK post-merge record must link remediation and the owner expected to resolve it.
- A failed post-merge check on a phase-critical PR blocks phase closure until fixed or explicitly re-dispositioned by L3.
- A phase closure record must cite the post-merge records for all PRs that contributed to the phase exit claim.

## 7. Exit Status

This artifact does not close #220 by itself. #220 closes only after L1/L2/L3 accept the addendum and the artifact/schema is merged or L3 explicitly re-dispositions it.
