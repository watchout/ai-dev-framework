---
id: IMPL-DELIVERYGRAPH-238
status: Draft
traces:
  spec: [SPEC-DELIVERYGRAPH-238]
  verify: [VERIFY-DELIVERYGRAPH-238]
  ops: [OPS-DELIVERYGRAPH-238]
---

# IMPL: Enterprise Delivery Graph for Script-Controlled Agentic SDLC

## 0. Corresponding SPEC
`docs/spec/phase1-enterprise-delivery-graph.md` /
SPEC-DELIVERYGRAPH-238.

## 1. Implementation Slices

### Slice A: Parent Spec and Authority Map
Add the parent SPEC/IMPL/VERIFY/OPS artifact set for #238.

This slice defines:

- Shirube's control-plane product boundary;
- source-of-truth hierarchy;
- `delivery-graph/v1` read-model contract;
- position authority map;
- runner and adapter layer boundaries.

No runtime behavior changes are allowed in this slice.

### Slice B: Roadmap Alignment
Update `docs/specs/roadmap.md` so Phase 1 and later phases reference #238 as
the parent enterprise delivery-graph contract. The roadmap must make clear that
the existing Phase 1 task issues continue as implementation slices rather than
being replaced.

### Slice C: #226 Placement
Document that #226 Workflow Action Registry and Wrapper Semantics is the next
near-term slice under #238. #226 must define action registry and diagnostic vs
enforcement vs injection wrapper semantics in terms of the delivery graph and
position authority hierarchy.

### Slice D: #227 Placement
Document that #227 CHAINCTRL-001 is the Phase 1 local/script-controlled chain
implementation under #238, not the full enterprise target.

### Slice E: Self-Dogfood Evidence
Record that Shirube's own PRs under this epic must identify:

- goal condition advanced;
- phase exit criterion advanced;
- task/work-package trace;
- Context Pack or explicit Phase 1 non-applicability;
- AI Change Record or explicit Phase 1 non-applicability;
- audit evidence;
- merge authority;
- post-merge verification;
- goal progress update when applicable.

### Slice F: #240 Runtime Adapter and Injection Policy Placement
Document that #240 is a child/follow-up slice under #238. #240 defines
`runtime-command-adapter/v1` and `injection-policy-pack/v1` so executable
Delivery Graph steps can validate runtime invocation, permission scope,
untrusted context handling, and schema-validated output before state or gate
updates.

### Slice G: #244 Work Order Contract Placement
Document that #244 is an early dependency under #238 before full #227 phase/PR
runner automation. #244 defines `work-order/v1` so AUN dispatch, Codex/Claude
structured invocation, Shirube gate/report output, runtime adapter selection,
and Kodama context-pack refs share a verifiable request contract instead of a
prompt template.

### Slice H: #242 Kodama Context-Pack Evidence Placement
Document that #242 is a child/follow-up slice under #238, #244, and #240. #242
defines G9 context-pack evidence and MCP structured-output contract validation
so Kodama context packs can be referenced by bounded metadata without becoming
trusted instruction, runtime authority, or public/enterprise readiness proof by
themselves.

## 2. File-Level Impact
This PR A slice is documentation-only:

- `docs/spec/phase1-enterprise-delivery-graph.md`;
- `docs/impl/phase1-enterprise-delivery-graph.md`;
- `docs/verify/phase1-enterprise-delivery-graph.md`;
- `docs/ops/phase1-enterprise-delivery-graph.md`;
- `docs/specs/roadmap.md`.

## 3. Compatibility Rules
- Do not change TypeScript runtime behavior.
- Do not wire new workflow checks, GitHub Checks, MCP tools, hooks, or CI gates.
- Do not claim Phase 1 readiness, MVP readiness, OSS quality, or enterprise
  readiness.
- Do not reclassify AUN, Wasurezu, or Kodama as Shirube core dependencies.
- Preserve #226 and #227 as implementation slices rather than superseding them.

## 4. Future Integration
Later slices should implement the parent contract in this order unless review
changes it:

1. #244 Work Order contract and warning gate;
2. #240 runtime command adapter and injection policy pack;
3. #242 Kodama context-pack evidence and MCP structured-output contract;
4. #226 action registry and wrapper semantics;
5. #227 local/script-controlled workflow chain;
6. delivery graph read model and status projection;
7. position registry and workflow template contracts;
8. PR/phase/goal runners;
9. GitHub/MCP projection;
10. AI Change Record and enterprise export/reporting.
