---
id: SPEC-WORKORDER-244
status: Draft
traces:
  impl: [IMPL-WORKORDER-244]
  verify: [VERIFY-WORKORDER-244]
  ops: [OPS-WORKORDER-244]
---

# SPEC: Work Order Contract and Warning Gate

## 0. Meta
- Origin Issue: #244
- Source instruction: AUN notification `3602251b-ce84-46aa-9e9c-f17b83ea3d99`
- Parent: #238 / Enterprise Delivery Graph
- Early dependencies: #227, #240, #242

## 1. Purpose
Define `work-order/v1` as a versioned, verifiable dispatch contract before the
phase/PR runners are fully automated.

A Work Order is not a prompt template. It is the bounded request artifact that
connects:

- Delivery Graph task/issue scope;
- AUN dispatch;
- Codex/Claude structured invocation;
- Shirube gate/report output;
- runtime adapter and injection policy expectations;
- Kodama `context-pack/v1` evidence references.

The first gate is warning-first so current development does not stop during
migration. The same contract shape must be promotable to a hard BLOCK later.

## 2. Source-of-Truth Placement
`work-order/v1` is a request contract below the Delivery Graph and SPEC/IMPL/
VERIFY/OPS artifacts. It may cite context packs, runtime adapters, and required
gates. It cannot replace:

- approved goal or phase authority;
- SPEC/IMPL/VERIFY/OPS;
- context-pack provenance;
- runtime adapter or injection policy definitions;
- audit ledger verdicts;
- merge authority;
- phase closure.

Work Order text is not trusted instruction by itself. Runtime adapters and
injection policies decide how the request is delivered to an agent runtime.

## 3. Minimum Schema
```ts
type WorkOrderV1 = {
  schema_version: "work-order/v1";
  work_order_id: string;
  issue?: number | string;
  task_id?: string;
  work_package_id?: string;
  pr?: string;
  objective: string;
  handoff_target: string;
  dispatch_surfaces: Array<
    | "aun"
    | "codex"
    | "claude"
    | "structured_invocation"
    | "shirube_gate"
    | "shirube_report"
  >;
  inputs: Array<{ type: string; ref: string }>;
  evidence_refs: string[];
  context_pack_refs?: Array<{ pack_id: string; citation?: string }>;
  context_pack_non_applicability?: string;
  context_pack_policy: {
    data_not_instruction: true;
    delivery: "data-only" | "citation-only" | "omit";
  };
  runtime_adapter?: string;
  runtime_adapter_ref?: string;
  structured_invocation?: {
    runtime: "codex" | "claude" | "custom";
    output_mode: "jsonl" | "json";
    output_schema: string;
  };
  expected_output_schema: string;
  write_scope: "none" | "read-only" | "workspace-write" | "repo-write" | "host-specific";
  required_gates: string[];
  report_sink?: string;
  gate_sink?: string;
  evidence_sink?: string;
  authority_boundary: {
    forbidden: string[];
    merge_authority: "not_granted";
    phase_transition_authority: "not_granted";
  };
  non_claims: string[];
  enforcement_mode: "warning" | "block-ready" | "hard-block-ready";
  promotion_criteria: string[];
};
```

## 4. Warning-First Gate
`shirube workflow check --action work_order --profile strict --json` evaluates
the contract but emits WARN for missing or invalid Work Order evidence.

The default `--fail-on block` threshold therefore does not stop current
development. Migration audits can use `--fail-on warn` to fail on the same
findings before the gate is promoted.

| Rule | Gate | Initial decision when invalid |
|------|------|-------------------------------|
| `G21.work_order.record.present` | work_order | WARN |
| `G21.work_order.required_fields` | work_order | WARN |
| `G21.work_order.dispatch_contract` | work_order | WARN |
| `G21.work_order.runtime_contract` | work_order | WARN |
| `G21.work_order.context_pack_boundary` | work_order | WARN |
| `G21.work_order.authority_boundary` | work_order | WARN |
| `G21.work_order.promotion_path` | work_order | WARN |

## 5. Dispatch and Runtime Boundary
Work Orders must declare the dispatch surfaces they are intended to support.
AUN, Codex, Claude, and Shirube reports remain adapters over the same Work
Order contract.

A Work Order must not include generated shell commands or direct argv payloads.
It names runtime adapter or structured invocation requirements; #240 owns the
actual runtime command adapter and injection policy validation.

## 6. Context-Pack Boundary
When a Work Order uses Kodama context, it must cite `context-pack/v1` evidence
by `pack_id` and citation/source metadata. It may also declare explicit
non-applicability.

Kodama `summary`, `quoted_excerpt`, and other item text remain source data.
They must be delivered as `data-only`, `citation-only`, or `omit`; never as
system, developer, task, or runtime instruction solely because the Work Order
cites them.

## 7. Acceptance Criteria and Scenarios
- SPEC defines `work-order/v1` as a verifiable contract, not a prompt template.
- Required fields cover task/issue scope, objective, inputs/evidence refs,
  context pack refs or non-applicability, runtime adapter needs, expected output
  schema, write scope, authority boundary, gates, non-claims, and handoff
  target.
- `workflow check --action work_order` is warning-first and can fail under
  `--fail-on warn`.
- Docs describe AUN dispatch, Codex/Claude structured invocation, Shirube gate/
  report, and Kodama context-pack compatibility.
- The contract can later be promoted from WARN to BLOCK without changing the
  artifact shape.

Acceptance scenario for warning-first migration:

```gherkin
Given a repository has no work-order/v1 artifact yet
When the strict work_order workflow check runs with the default block threshold
Then the check reports WARN decisions
And the scoped check still passes because the migration gate is warning-first
```

Acceptance scenario for structured dispatch:

```gherkin
Given a work-order/v1 artifact cites an AUN handoff target, structured runtime invocation, and context-pack evidence
And it declares no merge or phase-transition authority
When the strict work_order workflow check runs with --fail-on warn
Then all G21 Work Order rules pass
And downstream dispatch can consume the same contract without prompt-template inference
```

## 8. Non-Goals
- Do not implement phase/PR runner automation.
- Do not own AUN queue dispatch internals.
- Do not execute Codex or Claude.
- Do not generate shell commands from Work Order content.
- Do not treat context-pack item text as trusted instruction.
- Do not grant merge, phase transition, public readiness, or enterprise
  positioning authority.

## 9. Review Boundary
L1/L2 review is required before the warning gate is used as required migration
evidence.

L3 is required before the Work Order gate is promoted from WARN to BLOCK or
used as transition, merge, or phase authority.

## 10. 制御機構選定原則
script 選定根拠: Work Order shape must be deterministic, replayable, and
adapter-neutral before AUN, Codex, Claude, or Shirube reports consume it.
TypeScript workflow-state evaluators and `workflow check --action work_order`
are the primary mechanism.

Hook 選定根拠: hooks are not canonical in this slice. They may call the same
G21 check later, but they must not decide Work Order validity independently.

GitHub 選定根拠: GitHub issues and PRs may be cited as source evidence. They do
not replace the Work Order contract.

MCP 選定根拠: MCP may expose Work Orders later as structured output. It must not
be an independent authority surface.

LLM boundary: an LLM may draft or execute work from a Work Order. It cannot
approve its own Work Order, promote context data to instruction, pass gates,
approve merge, close phases, or claim goal progress.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Work Order contract validation | script (`workflow check`) | - | deterministic schema and field validation is the authority |
| Dispatch surface compatibility | script (`workflow check`) | - | AUN/runtime/report adapters must consume the same contract |
| Runtime boundary validation | script (`workflow check`) | - | Work Orders name adapters and schemas but do not generate commands |
| Context-pack data boundary | script (`workflow check`) | - | cited context remains data, not instruction |
| WARN-to-BLOCK promotion path | script (`workflow check`) | - | migration must be auditable before hard enforcement |

= 全 requirement が script 制御。Hook 不採用。

## 11. Testing Layer
Work Order implementation must include:

- integration workflow command fixture for missing Work Order warning-first
  behavior;
- regression fixture proving `--fail-on warn` fails warning-only findings;
- regression fixture for a complete `work-order/v1` artifact;
- regression fixture for prompt-template shape and missing dispatch/runtime
  fields;
- regression fixture for context-pack instruction promotion;
- regression fixture for direct shell command or argv payloads in Work Orders.
