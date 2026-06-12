---
id: OPS-PROGRESSVIEW-234
status: Draft
traces:
  spec: [SPEC-PROGRESSVIEW-234]
  impl: [IMPL-PROGRESSVIEW-234]
  verify: [VERIFY-PROGRESSVIEW-234]
---

# OPS: Report-Time Progress Visualization

## 0. Corresponding SPEC
`docs/spec/phase1-progress-view.md` / SPEC-PROGRESSVIEW-234.

## 1. Operator Flow
Render the default Japanese admin progress view:

```bash
shirube status --progress-view
```

Render specific formats:

```bash
shirube status --progress-view --progress-format ja-long
shirube status --progress-view --progress-format compact
shirube status --progress-view --progress-format markdown
shirube status --progress-view --progress-format json
```

## 2. Report Handling
Use the compact Japanese view for routine internal management reports. Use the
long Japanese view when explaining structure or onboarding a reader. Use
Markdown tables only on surfaces known to render tables reliably, such as
GitHub issue or PR comments.

## 3. Authority Boundary
A progress snapshot is report evidence only. It cannot:

- approve L1/L2/L3;
- pass CI;
- grant merge authority;
- close an issue;
- complete a phase;
- complete a goal.

Completion still requires PR comments, CI, review, merge/post-merge evidence,
or explicit approved runtime evidence as applicable.

## 4. Failure Modes
| Symptom | Handling |
|---|---|
| No structured state exists | Omit the snapshot or render an empty transitional view; do not invent progress. |
| Snapshot disagrees with GitHub | Treat GitHub issue/PR/CI/review evidence as source of truth and regenerate. |
| Chat output wraps poorly | Use `ja-compact` with a lower line length or split by stream. |
| AUN/Discord unavailable | Continue with GitHub comments and CLI output. |

## 5. Rollback
If progress rendering breaks status workflows, remove the `--progress-view`
projection and revert the progress-view library PR. Existing `status` behavior
does not depend on the projection path.
