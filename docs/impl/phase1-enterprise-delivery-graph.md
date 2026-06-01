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

1. #240 runtime command adapter and injection policy pack;
2. #226 action registry and wrapper semantics;
3. #227 local/script-controlled workflow chain;
4. delivery graph read model and status projection;
5. position registry and workflow template contracts;
6. PR/phase/goal runners;
7. GitHub/MCP projection;
8. AI Change Record and enterprise export/reporting.
