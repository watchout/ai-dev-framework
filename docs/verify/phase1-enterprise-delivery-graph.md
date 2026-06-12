---
id: VERIFY-DELIVERYGRAPH-238
status: Draft
traces:
  spec: [SPEC-DELIVERYGRAPH-238]
  impl: [IMPL-DELIVERYGRAPH-238]
  ops: [OPS-DELIVERYGRAPH-238]
---

# VERIFY: Enterprise Delivery Graph for Script-Controlled Agentic SDLC

## 0. Corresponding SPEC
`docs/spec/phase1-enterprise-delivery-graph.md` /
SPEC-DELIVERYGRAPH-238.

## 1. Required Checks
Because PR A is documentation-only, required L0 checks are:

- `git diff --check`;
- `npm run shirube -- trace verify`;
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`.

`npm run type-check`, `npm run build:cli`, and focused workflow tests are not
expected to exercise new behavior in this slice, but may be run before PR ready
state for baseline hygiene.

## 2. Review Matrix
| Review item | Expected result |
|-------------|-----------------|
| parent scope | #238 is a parent product/spec epic, not a runtime enforcement PR. |
| source-of-truth hierarchy | Goal, phase, delivery graph, task, PR, audit, closure, and goal progress artifacts have explicit precedence. |
| #226 placement | action registry and wrapper semantics remain the next near-term slice under the parent contract. |
| #227 placement | script-controlled workflow chain remains Phase 1 local implementation, not the whole enterprise target. |
| adapter boundary | AUN, Wasurezu, Kodama, GitHub, MCP, hooks, and reports are projection/integration surfaces unless a later reviewed slice wires them. |
| non-claims | No Phase 1, public, OSS, enterprise, Kodama, or Totonoe readiness claim is made. |

## 3. Regression Boundaries
- The roadmap must not imply that docs alone produce enterprise readiness.
- The spec must not let GitHub issue text replace Goal Contract approval.
- The spec must not let merged PRs replace phase closure evidence.
- The spec must not let phase closure replace goal sufficient-condition
  verification.
- The spec must not let LLM output decide transition validity.

## 4. Review Evidence
The PR must include:

- links to #238 and related issues considered;
- L0 command summaries;
- L1/L2 review links;
- L3 link before using this parent spec to justify enforcement wiring or public
  positioning;
- explicit non-claims for runtime behavior change and enterprise readiness.
