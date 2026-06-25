# Shirube Comment-Backed Audit Evidence

This standard defines how Shirube Rapid/Lite can consume a structured audit posted as a GitHub PR comment without committing the audit artifact into the target branch.

The purpose is exact-head preservation. If an audit is committed after review, the commit changes the PR head and invalidates the original audit binding. A comment-backed audit can remain external evidence for the reviewed head while the workflow materializes it only into the report artifact directory.

## Supported Refs

The first supported ref formats are:

- `https://github.com/<owner>/<repo>/pull/<pr>#issuecomment-<comment-id>`
- `https://github.com/<owner>/<repo>/issues/<issue>#issuecomment-<comment-id>`
- `github-comment://<owner>/<repo>/pull/<pr>#issuecomment-<comment-id>`
- `github-comment://<owner>/<repo>/issues/comments/<comment-id>`

For the MVP, comment-backed audit refs are same-PR only:

- comment repo must match the current workflow repository;
- comment issue or PR number must match the current PR number;
- audit `target_repo` must match the current workflow repository;
- audit `target_pr` must match the current PR number;
- audit `exact_head_sha` or `pr_head_sha` must match the current PR head.

## Accepted Comment Shape

The comment must contain a fenced YAML block:

````markdown
```yaml
schema_version: shirube-structured-audit/v1
target_repo: owner/repo
target_pr: 123
exact_head_sha: <sha>
pr_head_sha: <sha>
reviewer_actor: codex-audit
implementation_actor: codex-adf
items:
  - item_id: AUDIT-001
    result: PASS
    evidence_refs:
      - validation_results
    confidence: high
    notes: Structured item response.
```
````

Freeform prose is not audit evidence. Markdown summaries are ignored unless they include the structured fenced YAML block.

## Materialization

`scripts/shirube/resolve-structured-audit-ref.mjs` fetches the comment and writes:

- `.shirube-rapid-lite/structured-audit.yaml`
- `.shirube-rapid-lite/structured-audit-source.json`

The source metadata records:

- source comment URL and comment id;
- comment author;
- fetched timestamp;
- target repo and PR;
- exact head;
- materialized path;
- `trusted_base_workflow: true`;
- `target_branch_mutated: false`;
- `owner_approval_synthesized: false`.

The materialized file is a workflow artifact only. It is not committed to the target branch.

## Security Rules

The resolver must:

- fetch comments using the trusted workflow token;
- never execute comment content;
- accept only fenced `yaml` or `yml` containing `schema_version: shirube-structured-audit/v1`;
- reject missing or mismatched exact-head evidence;
- reject target repo or target PR mismatches;
- reject multiple conflicting structured audit blocks;
- reject reviewer/implementation actor equality when both are present;
- reject audit comments that include owner final approval;
- keep audit evidence and owner decision evidence separate.

The resolver must not:

- mutate the target branch;
- synthesize owner approval;
- activate required checks;
- change branch protection or rulesets;
- use DB runtime;
- implement MCP behavior.

## Owner Workflow

Recommended flow:

1. Reviewer posts structured audit YAML as a PR comment.
2. Workflow receives `structured_audit_comment_ref`.
3. Resolver verifies repo, PR, and exact head.
4. Resolver materializes `structured-audit.yaml` in the result directory.
5. `check-audit-checklist` consumes the materialized file.
6. Owner final decision remains a separate exact-head decision.

If comment-backed audit resolution is not available, use one of these paths:

- owner explicitly accepts the PR comment audit as exact-head evidence; or
- commit the audit artifact and re-audit at the new exact head.
