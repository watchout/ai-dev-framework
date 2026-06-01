---
id: OPS-DELIVERYGRAPH-238
status: Draft
traces:
  spec: [SPEC-DELIVERYGRAPH-238]
  impl: [IMPL-DELIVERYGRAPH-238]
  verify: [VERIFY-DELIVERYGRAPH-238]
---

# OPS: Enterprise Delivery Graph for Script-Controlled Agentic SDLC

## 0. Corresponding SPEC
`docs/spec/phase1-enterprise-delivery-graph.md` /
SPEC-DELIVERYGRAPH-238.

## 1. Operator Flow
1. Treat #238 as the parent product/spec epic for Gate Engine, strict workflow,
   and script-controlled chain convergence.
2. Keep #226 as the action registry and wrapper semantics slice under #238.
3. Keep #227 as the Phase 1 local/script-controlled workflow chain slice under
   #238.
4. Treat #240 as the runtime adapter and injection policy child slice that
   guards executable Delivery Graph steps before #226/#227 wire runtime
   execution semantics.
5. Treat #244 as the Work Order contract child slice that freezes verifiable
   request format before full #227 runner automation and before runtime/
   context-pack consumers infer structure from prompts.
6. Treat #242 as the Kodama context-pack evidence child slice that guards
   bounded context-pack references, MCP structured-output contracts, and
   public/enterprise context-pack claims under the Work Order and runtime
   adapter boundaries.
7. For every implementation PR under #238, name the goal condition, phase exit
   criterion, work package/task, required gates, audit evidence, merge
   authority, and post-merge evidence it advances.
8. Do not claim Phase 1, public, OSS, or enterprise readiness from #238 docs
   alone.

## 2. Applying the Source-of-Truth Hierarchy
When evidence conflicts, use this order:

1. approved Goal Contract;
2. reviewed Phase Plan;
3. `delivery-graph/v1`;
4. task DAG / issue trace;
5. SPEC/IMPL/VERIFY/OPS;
6. Context Pack;
7. AI Change Record;
8. audit ledger;
9. phase closure;
10. goal progress record.

GitHub comments, AUN messages, Wasurezu memory, and local notes may point to
these artifacts. They do not replace the artifacts unless a deterministic
record stores the required fields.

## 3. PR Planning Rules
Use the following sequence unless review approves a different split:

| Step | Scope |
|------|-------|
| PR A | #238 parent spec, authority map, delivery graph, SoT hierarchy. |
| PR B | #244 Work Order contract and warning gate. |
| PR C | #240 runtime command adapter and injection policy pack. |
| PR D | #242 Kodama context-pack evidence and MCP structured-output contract. |
| PR E | delivery graph read model and status projection. |
| PR F | position registry and workflow template contracts. |
| PR G | phase and PR runners. |
| PR H | GitHub projection and AI Change Record. |
| PR I | Shirube self-dogfood closure evidence. |
| PR J | enterprise export and metrics. |

#226 and #227 remain Phase 1 tasks. They may be implemented before later PR E-J
only when their scope stays local/script-controlled and cites this parent
contract.

## 4. Incident Handling
| Incident | Response |
|----------|----------|
| A PR cites #238 but has no goal/phase/task trace | Return to author or block review readiness. |
| A PR treats GitHub issue text as Goal Contract approval | Block strict/public readiness claim. |
| A PR treats merged PRs as phase closure | Require phase-closure evidence or L3 disposition. |
| A PR treats LLM summary as authority | Replace with deterministic evidence or approved human/governance record. |
| Projection leaks private context | Remove projection, add redaction test, and record audit finding. |

## 5. Rollback
Because PR A is documentation-only, rollback is a normal docs revert. Reverting
this parent spec also pauses #226/#227 claims that depend on it until L3
re-dispositions the hierarchy.
