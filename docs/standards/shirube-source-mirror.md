# Shirube Source Mirror

Source mirrors are machine-readable snapshots of a GitHub Control source. They support Shirube Rapid/Lite overlay adoption by giving local gates stable YAML to read without making the mirror a second source of truth.

The GitHub issue or comment remains the source authority.

## Command

```bash
node scripts/shirube/mirror-control-source.mjs \
  --source-control owner/control-repo#123 \
  --target-repo owner/target-repo \
  --product ProductName \
  --framework-ref watchout/ai-dev-framework@<PINNED_SHA> \
  --out .tmp/source-mirror/control-issue.yaml \
  --format json
```

This slice is render-only and offline. It does not fetch GitHub, require private repository tokens, mutate external repositories, create target PRs, or change target runtime/package/workflow/protection state.

## YAML Shape

The generated mirror uses `shirube-source-mirror/v1`:

```yaml
schema_version: shirube-source-mirror/v1
source_type: github_issue
source_ref: owner/control-repo#123
source_repo: owner/control-repo
issue_number: 123
source_url: https://github.com/owner/control-repo/issues/123
target_repo: owner/target-repo
product: ProductName
framework_ref: watchout/ai-dev-framework@<PINNED_SHA>
fetched_at: <FETCHED_AT_UTC>
sha256: <digest>
mirror_is_truth: false
generated_by: codex-adf
source_authority:
  type: github_issue_or_comment
  remains_authority: true
  mirror_role: machine_readable_snapshot
extracted_fields:
  target_repo: owner/target-repo
  product: ProductName
  owner_confirmation: pending
  control_source_status: snapshot
```

`mirror_is_truth` must remain `false`. Owner confirmation, exact-head approval, and merge authority remain separate evidence.

## Digest

The digest is deterministic for the declared inputs: source control ref, target repo, product, framework ref, fetched-at marker, generated-by marker, and schema identity. The output path is not included.

## Non-Scope

This source mirror generator does not:

- fetch live GitHub data;
- mutate external repositories;
- create target repo PRs;
- copy ADF scripts;
- change runtime, API, DB, product, package, lockfile, workflow, branch protection, ruleset, required-check, or production state;
- claim Shirube V3 complete.
