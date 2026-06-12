---
id: SPEC-DELIVERYGRAPH-238
status: Draft
traces:
  impl: [IMPL-DELIVERYGRAPH-238]
  verify: [VERIFY-DELIVERYGRAPH-238]
  ops: [OPS-DELIVERYGRAPH-238]
---

# SPEC: Enterprise Delivery Graph for Script-Controlled Agentic SDLC

## 0. Meta
- Origin Issue: #238
- Phase: Phase 1 parent spec / enterprise control-plane convergence
- Parent direction: #197, #211
- Related implementation slices: #222, #223, #224, #225, #226, #227, #229,
  #232, #240, #244
- Related Gate Engine rollout: #201, #202, #203

## 1. Purpose
Define Shirube as an Agentic SDLC Control Plane that can govern work from
strategic goal to merged and verified PR through deterministic state,
versioned evidence, typed authority roles, and adapter-neutral projection.

This is a parent product/spec contract. It does not replace the current Phase 1
tasks. It defines the hierarchy that #226 action registry semantics and #227
script-controlled workflow chain must implement under.

Target operating model:

```text
Goal / Initiative
  -> Phase
    -> Work Package / Task DAG
      -> PR
        -> Step / Gate
```

LLMs may draft, implement, summarize, or review inside a stage. Shirube-owned
scripts decide whether stage transitions, phase completion, merge readiness,
exception approval, and goal completion are valid.

## 2. Product Boundary
Shirube owns software delivery workflow authority:

- source-of-truth hierarchy between goal, phase, task, PR, gate, and evidence;
- deterministic runner decisions for PASS/WARN/BLOCK/OBSERVE;
- role and position authority contracts;
- evidence requirements for strict/public workflows;
- projection of gate and evidence state to CLI, JSON, GitHub, MCP, or reports.

Shirube may integrate with:

| System | Boundary |
|--------|----------|
| AUN | Communication, handoff, runtime queue orchestration when installed. |
| Wasurezu | Memory, recovery, and continuity packs. |
| Kodama | Organization and source-context registry. |
| GitHub | Issue, PR, check, comment, and review projection surface. |

Those systems are integrations, not the source of transition truth. Strict
workflow validity must remain understandable and useful without internal
Discord, AUN, or Wasurezu assumptions.

## 3. Source-of-Truth Hierarchy
The first strict hierarchy is:

| Rank | Artifact | Owns | Cannot be replaced by |
|------|----------|------|-----------------------|
| 1 | `goal-contract/v1` | goal owner, sufficient conditions, non-goals, completion evidence | issue text, PR text, LLM summary |
| 2 | `phase-plan/v1` | phase entry/exit criteria, required work packages, carryover policy | merged PR list |
| 3 | `delivery-graph/v1` | graph links between goal, phases, work packages, PRs, gates, evidence | manual tracker prose |
| 4 | `task-dag/v1` | task dependency order and issue/work-package mapping | agent memory |
| 5 | SPEC/IMPL/VERIFY/OPS | implementation contract for a slice | implementation code alone |
| 6 | `context-pack/v1` | reproducible task input context for strict AI work | generic prompt text |
| 7 | `ai-change-record/v1` | AI-assisted change summary, risks, tests, non-claims | PR title/body only |
| 8 | `audit-ledger/v1` | L0/L1/L2/L3/L4 verdict evidence | ad hoc comments alone |
| 9 | `phase-closure/v1` | bounded phase closure claim and carryover disposition | all PRs being merged |
| 10 | `goal-progress/v1` | verified progress against goal sufficient conditions | phase closure alone |

Lower artifacts may cite higher artifacts. A lower artifact cannot approve,
complete, or silently substitute for a higher artifact.

## 4. Delivery Graph v1
`delivery-graph/v1` is the versioned read model that links delivery state
across hierarchy levels.

Minimum shape:

```json
{
  "schema_version": "delivery-graph/v1",
  "goal": {
    "id": "goal_enterprise_delivery_graph",
    "status": "draft|approved|active|blocked|complete|verified",
    "owner": "role-or-actor",
    "sufficient_conditions": [],
    "non_goals": [],
    "evidence_refs": []
  },
  "phases": [
    {
      "id": "phase_001",
      "status": "planned|ready|active|blocked|complete|verified",
      "entry_criteria": [],
      "exit_criteria": [],
      "required_work_packages": [],
      "carryover_refs": [],
      "closure_evidence_refs": []
    }
  ],
  "work_packages": [
    {
      "id": "wp_001",
      "phase_id": "phase_001",
      "status": "planned|ready|in_progress|blocked|complete|verified",
      "task_refs": [],
      "pr_refs": [],
      "context_pack_refs": [],
      "change_record_refs": [],
      "evidence_refs": []
    }
  ],
  "prs": [
    {
      "id": "owner/repo#123",
      "work_package_id": "wp_001",
      "status": "draft|ready_for_review|audit_pending|merge_ready|merged|post_merge_verified|blocked",
      "required_gates": [],
      "ai_change_record_ref": "acr_...",
      "post_merge_evidence_refs": []
    }
  ],
  "policy_pack_ref": "policy_enterprise_default",
  "workflow_template_ref": "template_strict_standard_delivery",
  "updated_at": "ISO-8601"
}
```

The exact field set may evolve, but every strict/public PR must be traceable to
goal sufficient conditions, phase exit criteria, work package/task intent,
audit records, merge authority, post-merge verification, and goal progress.

## 5. Position Authority Map
Positions are typed authority contracts, not prompt personas.

| Position | Owns | Forbidden |
|----------|------|-----------|
| Product Owner / Goal Authority | goal contract, sufficient conditions, non-goals | implementing or self-approving PR code |
| Phase Owner | phase entry/exit criteria, carryover assignment, closure evidence | bypassing required gates |
| Spec Owner | SPEC/IMPL/VERIFY/OPS completeness and traceability | final approval of own implementation |
| Implementer | code/docs changes, local validation, implementation evidence | merge authority or final audit authority |
| L1 Reviewer | close review for code/spec fit and actionable findings | modifying implementation under review |
| L2 Auditor | independent audit of evidence, tests, policy, trace | acting as implementer on the same PR |
| L3 / Merge Authority | final merge/hold decision based on evidence | bypassing failed required checks |
| Post-Merge Verifier | main-branch validation and goal progress update | claiming goal completion without evidence |

Each position contract must define:

- required input artifacts;
- allowed actions;
- forbidden actions;
- required output artifacts;
- authority scope;
- independence and separation constraints;
- escalation path;
- compatible adapters and agent bindings.

Initial implementation may map these positions to existing role readiness and
merge-authority configuration. The position contract itself must remain
versioned and inspectable.

## 6. Runner and Adapter Layers
The control plane has two layers.

Declarative artifacts:

- `goal-contract/v1`;
- `phase-plan/v1`;
- `delivery-graph/v1`;
- `task-dag/v1`;
- `position-registry/v1`;
- `workflow-template/v1`;
- `work-order/v1`;
- `policy-pack/v1`;
- `runtime-command-adapter/v1`;
- `injection-policy-pack/v1`;
- `context-pack/v1`;
- `ai-change-record/v1`;
- `audit-ledger/v1`;
- `phase-closure/v1`;
- `goal-progress/v1`.

Deterministic runners:

- Goal runner validates goal approval, sufficient conditions, non-goals, and
  completion evidence.
- Phase runner validates phase entry, exit criteria, carryover ledger,
  required work packages, and phase closure evidence.
- PR runner validates context pack, implementation evidence, audit, merge
  authority, and post-merge verification.
- Gate runner emits typed PASS/WARN/BLOCK/OBSERVE decisions with evidence refs.
- Projection runner writes CLI, JSON, GitHub, MCP, webhook, or report output
  without changing the authority model.

GitHub, MCP, hooks, AUN, Discord, and local reports are adapters over this
state/rule model. They must not become independent control planes.

Each executable strict Delivery Graph step must also bind a reviewed
`runtime-command-adapter/v1`, `injection-policy-pack/v1`, expected result
schema, write scope, evidence sink, and timeout/non-zero/malformed-output
fallback behavior before runtime output can update graph state or gate state.

Before full phase/PR runner automation, agent handoffs must converge on
`work-order/v1` as the verifiable request contract. A Work Order may connect
AUN dispatch, Codex/Claude structured invocation, Shirube gate/report output,
runtime adapter expectations, and Kodama context-pack evidence, but it cannot
approve gates, merge readiness, phase transitions, or goal progress.

## 7. Acceptance Criteria
- `delivery-graph/v1` and the Goal -> Phase -> Work Package -> PR -> Gate
  hierarchy are defined.
- LLMs are explicitly limited to work inside stages; deterministic runners own
  transition validity.
- #227 is scoped as the local/Phase 1 script-controlled chain implementation
  under this parent spec, not the entire enterprise target.
- #226 action registry and wrapper semantics are scoped as the canonical action
  and wrapper contract under `delivery-graph/v1`.
- #244 Work Order contract freezes the verifiable request format before #227
  script-controlled chain automation and before runtime/context-pack consumers
  depend on prompt-template inference.
- Strict mode cannot claim phase completion merely because PRs merged; phase
  exit criteria and carryover must be evaluated.
- Strict mode cannot claim goal completion merely because phases closed; goal
  sufficient conditions must be verified.
- Strict/public PRs can be traced to goal condition, phase exit criterion,
  context pack, AI Change Record, audits, merge authority, and post-merge
  verification.
- Position separation prevents implementers from approving their own work as
  final audit or merge authority.
- Projection can show gate and evidence state without leaking secrets or
  private reasoning traces.
- Shirube must dogfood this hierarchy on its own development before broad
  public, OSS, enterprise, Kodama, or Totonoe rollout claims.

Acceptance scenario for strict phase completion:

```gherkin
Given a delivery graph contains merged PRs for a phase
And the phase exit criteria or carryover disposition is missing
When the strict phase runner evaluates phase closure
Then the phase remains blocked or incomplete
And the result cites the missing phase criteria or carryover evidence
```

Acceptance scenario for strict goal completion:

```gherkin
Given every phase in a delivery graph is closed
And the goal sufficient conditions have not been verified
When the strict goal runner evaluates goal completion
Then the goal is not complete
And the result cites the missing goal-progress evidence
```

## 8. Evidence Projection and Privacy
Projection surfaces may include:

- CLI and JSON output;
- GitHub Checks, issue comments, PR comments, and PR bodies;
- MCP tool responses;
- local reports;
- webhooks or custom adapters.

Projection must include stable artifact ids and evidence refs. It must exclude:

- private reasoning traces;
- secret-bearing local context;
- provider credentials or raw tool payloads;
- internal Discord/AUN-only assumptions when presenting public/enterprise
  readiness.

## 9. Manual Review Boundary
This parent spec requires L1 design review, L2 audit, and L3 technical
governance before it is used to justify enforcement wiring or public
positioning.

CEO/product-owner approval is required before final enterprise positioning
language is used as a release or marketing claim.

Passing this spec PR alone does not claim enterprise readiness. It only fixes
the parent contract that later implementation slices must follow.

## 10. 制御機構選定原則
script 選定根拠: deterministic runners and TypeScript evaluators are required
because transition validity, gate decisions, authority separation, and evidence
requirements must be replayable without LLM judgment.

GitHub 選定根拠: GitHub is a first-class standard/strict projection surface
for issues, PRs, checks, reviews, and merge authority, but it is not mandatory
for minimal local workflows.

MCP 選定根拠: MCP wrappers may expose the same runner state later. They must
not implement separate transition logic.

Hook 選定根拠: hooks are fallback interception only. A hook may call the same
script-controlled checks but cannot become canonical state, approval authority,
or merge authority.

LLM boundary: LLM output may draft artifacts or summarize evidence. It cannot
approve phase completion, gate pass/fail, exception approval, release
readiness, merge authority, or goal completion.

## 11. Testing Layer
Future runtime implementation under this spec must include:

- unit tests for delivery graph state validation;
- integration tests for phase, PR, and goal runner transitions;
- regression tests proving merged PRs cannot close phases without closure
  evidence and goal conditions cannot be completed by phase closure alone;
- smoke tests for CLI, JSON, GitHub, MCP, and report adapter projection shape;
- runtime adapter and injection policy fixtures proving untrusted context,
  unsafe shell interpolation, schema mismatch, text fallback, timeout,
  non-zero exit, and malformed output cannot advance a gate;
- e2e dogfood tests that trace at least one Shirube PR from goal condition to
  post-merge verification and goal progress.

Minimum future cases:

- missing Goal Contract blocks strict phase planning;
- missing phase exit criteria blocks phase closure;
- merged PR without post-merge evidence does not close a phase;
- missing AI Change Record blocks strict merge readiness;
- missing Context Pack blocks strict implementation start;
- implementer self-approval is rejected for final audit and merge authority;
- exception or carryover records are required for unresolved findings;
- `delivery-graph/v1` JSON remains stable enough for CLI, MCP, GitHub, and
  report adapters.

This PR A spec slice is documentation-only. Its verification is trace
completeness, spec-audit, diff hygiene, and review evidence.
