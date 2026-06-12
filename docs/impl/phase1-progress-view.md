---
id: IMPL-PROGRESSVIEW-234
status: Draft
traces:
  spec: [SPEC-PROGRESSVIEW-234]
  verify: [VERIFY-PROGRESSVIEW-234]
  ops: [OPS-PROGRESSVIEW-234]
---

# IMPL: Report-Time Progress Visualization

## 0. Corresponding SPEC
`docs/spec/phase1-progress-view.md` / SPEC-PROGRESSVIEW-234.

## 1. Implementation Slices

### Slice A: Snapshot Model
Add `src/cli/lib/progress-view.ts` with `ProgressSnapshot`,
`ProgressStream`, `ProgressPhase`, `ProgressTask`, gate status types, and
derived stream helpers.

### Slice B: Renderers
Implement:

- `renderProgressSnapshotMarkdown`;
- `renderProgressSnapshotCompactText`;
- `renderProgressSnapshotJapaneseAdmin`;
- `renderProgressSnapshotJson`.

### Slice C: Transitional Adapter
Implement `buildProgressSnapshotFromStatusResult` so existing `status-engine`
output can produce a single-stream progress snapshot without changing existing
status aggregation semantics.

### Slice D: CLI Projection
Add `shirube status --progress-view` with selectable progress formats. Keep
normal `status` and `status --json` behavior unchanged.

### Slice E: Tests
Add unit tests for progress calculation, multi-stream Markdown output, compact
text, Japanese admin compact/long views, JSON serialization, and the
`StatusResult` adapter.

## 2. File-Level Impact
- `src/cli/lib/progress-view.ts`;
- `src/cli/lib/progress-view.test.ts`;
- `src/cli/commands/status.ts`;
- `docs/spec/phase1-progress-view.md`;
- `docs/impl/phase1-progress-view.md`;
- `docs/verify/phase1-progress-view.md`;
- `docs/ops/phase1-progress-view.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Existing `status` output is unchanged unless `--progress-view` is specified.
- Existing `status --json` output remains `StatusResult` unless
  `--progress-view --progress-format json` is explicitly requested.
- Snapshot renderers are pure functions and do not mutate workflow state.
- The adapter reads `StatusResult`; it does not promote local state to
  authority.

## 4. Future Integration
Later reviewed slices can:

- source snapshots from the Phase 1 delivery graph or audit ledger;
- embed snapshots into admin notification adapters from #229;
- expose snapshots through MCP or GitHub Checks;
- add dashboard rendering after internal report behavior is stable.
