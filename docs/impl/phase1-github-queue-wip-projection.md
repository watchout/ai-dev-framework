---
id: IMPL-GITHUBQUEUEWIP-268
status: Draft
traces:
  spec: [SPEC-GITHUBQUEUEWIP-268]
  verify: [VERIFY-GITHUBQUEUEWIP-268]
  ops: [OPS-GITHUBQUEUEWIP-268]
---

# IMPL: GitHub Queue Labels and WIP Projection

## 1. Purpose
Implement SPEC-GITHUBQUEUEWIP-268 as a deterministic JSON queue projection
validator and GitHub label template.

## 2. Components
- `src/cli/lib/github-queue-projection.ts`
- `shirube check github-queue <files...>`
- `templates/github/pr-conveyor-labels.json`
- `templates/github/pr-conveyor-queue-projection.example.json`
- unit and CLI tests

## 3. Validator Behavior
The validator parses projection JSON documents with:

```json
{
  "projection_version": "github-queue-projection/v1",
  "repository": "watchout/ai-dev-framework",
  "labels": ["audit-pending"],
  "wip_policy": {
    "fast_lane_prs_per_repo": 3,
    "governed_draft_prs_per_repo": 2,
    "rework_prs_per_repo": 2,
    "stop_lane_prs_without_approval": 0
  },
  "items": []
}
```

It checks required labels, label-to-state mapping, WIP limits, and Stop Lane
approval boundaries.

## 4. Exit Behavior
- PASS exits 0.
- WARNING exits 0.
- BLOCK exits non-zero.

## 5. Boundary
This slice reads projection files only. It does not call GitHub APIs, mutate
labels, dispatch runners, approve execution, or merge.
