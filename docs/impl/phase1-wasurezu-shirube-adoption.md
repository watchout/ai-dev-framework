---
id: IMPL-WASUREZU-SHIRUBE-246
status: Draft
traces:
  spec: [SPEC-WASUREZU-SHIRUBE-246]
  verify: [VERIFY-WASUREZU-SHIRUBE-246]
  ops: [OPS-WASUREZU-SHIRUBE-246]
---

# IMPL: Wasurezu Lightweight Shirube Adoption Profile

## 0. Corresponding SPEC
`docs/spec/phase1-wasurezu-shirube-adoption.md` /
SPEC-WASUREZU-SHIRUBE-246.

## 1. Implementation Slices

### Slice A: Child Issue Under #238
Track Wasurezu adoption as #246 under the #238 Delivery Graph parent. This
keeps Wasurezu-specific audit and operation rules separate from #244, which
owns the generic `work-order/v1` contract.

### Slice B: Adoption Profile Contract
Document `wasurezu-lightweight-adoption` as a named profile that maps to
existing Shirube CLI concepts:

- `--quality-mode single-agent`;
- `--audit-level minimal`;
- `--audit-level standard`.

No new `--mode lightweight` CLI option is introduced.

### Slice C: Scope Classifier
Define a Wasurezu-specific classifier that selects minimal audit for docs,
non-behavioral refactors, small tests, and adoption scaffolding, and standard
audit for recovery, memory, MCP contracts, host invocation, redaction,
provenance, token handling, migrations, and data-model changes.

### Slice D: Work Order Template
Provide a Wasurezu Work Order example that extends the #244 Work Order contract
with Wasurezu-specific fields for affected MCP tools, schemas, recovery impact,
host-runtime impact, redaction/provenance impact, tests, rollback, and report
format.

### Slice E: Manual Report Format
Define an early report structure with separate producer, gate, and review
sections. The same single agent may write multiple sections, but the evidence
must remain separated.

### Slice F: Future Enforcement Path
Reserve hard blocking for a later reviewed slice after dogfood evidence exists.
The first adoption PR is documentation and template scaffolding only.

## 2. File-Level Impact
This slice is documentation-only:

- `docs/spec/phase1-wasurezu-shirube-adoption.md`;
- `docs/impl/phase1-wasurezu-shirube-adoption.md`;
- `docs/verify/phase1-wasurezu-shirube-adoption.md`;
- `docs/ops/phase1-wasurezu-shirube-adoption.md`;
- `docs/ops/wasurezu-work-order-template.example.json`.

## 3. Compatibility Rules
- Do not change TypeScript runtime behavior.
- Do not add a new CLI mode.
- Do not change #244 `work-order/v1` generic schema requirements in this PR.
- Do not enforce merge authority, phase transition authority, or runner
  automation.
- Do not require AUN, `state_daemon`, or multi-agent operation for the first
  Wasurezu adoption step.
- Do not claim that Wasurezu recovery or memory behavior is correct merely
  because an adoption Work Order exists.

## 4. First Wasurezu-Side Issue
The recommended first Wasurezu-side issue is:

```text
WASUREZU-SHIRUBE-001
```

Its initial scope should be adoption scaffolding:

- add a Wasurezu Work Order;
- add SPEC/IMPL/VERIFY/OPS placeholders for behavior-changing work;
- document risk classification;
- run test/typecheck/build evidence;
- produce the manual report format.

It should use minimal audit unless it changes recovery behavior, memory
semantics, MCP contracts, host invocation, redaction, provenance, token
handling, migrations, or data models.

## 5. Future Integration
Later slices may:

- map `wasurezu-lightweight-adoption` into a checked workflow template;
- promote missing Wasurezu Work Order fields from WARN to BLOCK;
- connect Wasurezu Work Orders to Delivery Graph evidence;
- add MCP contract fixtures for `structuredContent`, `outputSchema`, and
  `isError`;
- add recovery-pack regression fixtures;
- require independent multi-agent review after AUN/Shirube runner stability.
