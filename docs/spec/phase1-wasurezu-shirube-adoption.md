---
id: SPEC-WASUREZU-SHIRUBE-246
status: Draft
traces:
  impl: [IMPL-WASUREZU-SHIRUBE-246]
  verify: [VERIFY-WASUREZU-SHIRUBE-246]
  ops: [OPS-WASUREZU-SHIRUBE-246]
---

# SPEC: Wasurezu Lightweight Shirube Adoption Profile

## 0. Meta
- Origin Issue: #246
- Parent: #238 / Enterprise Delivery Graph
- Depends on: #244 Work Order contract, #240 runtime adapter and injection
  policy, #242 context-pack and MCP structured-output evidence
- Recommended Wasurezu issue: `WASUREZU-SHIRUBE-001`

## 1. Purpose
Define a Wasurezu-specific Shirube adoption profile that brings Shirube
discipline to Wasurezu development before full Shirube runner maturity.

Wasurezu development is high-risk because recovery, memory promotion, MCP tool
contracts, host invocation, delivery mode, and agent behavior are tightly
coupled. The first adoption step must add structure without pretending that
full multi-agent governance or merge-authority automation is ready.

## 2. Adoption Profile
Profile name:

```text
wasurezu-lightweight-adoption
```

Default command for ordinary controlled Wasurezu work:

```bash
shirube start . --feature WASUREZU-SHIRUBE-001 --quality-mode single-agent --audit-level minimal
```

Escalation command for risky Wasurezu changes:

```bash
shirube start . --feature <id> --quality-mode single-agent --audit-level standard
```

This is not a new `--mode lightweight` CLI mode. The profile uses existing
Shirube concepts:

- `--quality-mode single-agent`;
- `--audit-level minimal`;
- `--audit-level standard`.

`--audit-level strict` must not be used with `--quality-mode single-agent`.
Strict review and role-bound multi-agent operation are deferred until Shirube
and AUN are stable enough, unless a cross-repo or release-critical change gets
explicit escalation.

## 3. Logical Phase Separation
Single-agent operation is allowed only as an execution convenience. It does not
collapse producer, gate, and review responsibilities.

Every Wasurezu task must still record separate evidence sections for:

- producer work: what changed and why;
- gate evaluation: which gates ran, with PASS/WARN/BLOCK/OBSERVE results;
- review/audit notes: residual risks, missing evidence, and non-claims.

The same human or agent may fill more than one section during early adoption,
but the report must preserve the separation. A Work Order, memory summary, MCP
tool result, or LLM statement cannot approve its own gate, merge readiness,
phase transition, or goal progress.

## 4. Scope Classification
Minimal audit is allowed for:

| Scope | Examples |
|-------|----------|
| docs-only changes | profile docs, runbook updates, non-authority notes |
| non-behavioral refactors | naming or layout changes with no runtime change |
| small test additions | isolated regression tests that do not change product behavior |
| Shirube adoption scaffolding | Work Order examples, report templates, local doc setup |

Standard audit is required for:

| Scope | Examples |
|-------|----------|
| recovery pack behavior | startup recovery packs, restart packs, continuity ranking |
| memory read/write semantics | memory lookup, save, update, archival, dedupe behavior |
| promotion boundaries | candidate, approved, feedback, and promotion transitions |
| MCP tool contracts | request schema, result schema, tool names, error behavior |
| structured MCP output | `structuredContent`, `outputSchema`, `isError` behavior |
| host invocation and delivery | restart, CLI invocation, queue, host mode, dispatch mode |
| safety handling | redaction, provenance, token handling, source attribution |
| persistence changes | migrations, data-model changes, schema changes |

Strict or multi-agent review is deferred by default. It may be used only when a
cross-repo dependency, release-critical change, security-sensitive migration,
or explicit reviewer instruction requires escalation.

## 5. Required Wasurezu Work Order Fields
Every Wasurezu task should create or cite a `work-order/v1` artifact with these
Wasurezu-specific fields in addition to the generic #244 Work Order contract:

- repo;
- issue;
- feature id;
- objective;
- scope;
- non-goals;
- affected MCP tools;
- affected schemas;
- data/migration impact;
- recovery behavior impact;
- host-runtime impact;
- redaction/provenance impact;
- tests required;
- rollback plan;
- evidence/report format.

The first Wasurezu adoption phase warns on missing fields. The later promotion
phase may block dispatch if these fields are missing.

## 6. Required 4-Layer Docs
Behavior-changing Wasurezu work requires four reviewed docs:

- SPEC;
- IMPL;
- VERIFY;
- OPS.

The docs must explicitly cover:

- recovery continuity;
- memory correctness;
- source and provenance handling;
- structured MCP output;
- compatibility with AUN, Kodama, and Shirube where relevant.

Docs-only adoption scaffolding may use minimal audit. Behavior-affecting
changes to recovery, memory semantics, MCP contracts, host runtime, redaction,
provenance, or migration behavior require standard audit.

## 7. Gate Behavior
First phase:

- warn on missing Wasurezu Work Order fields;
- require test, typecheck, and build evidence;
- require explicit risk classification;
- require a manual report format that separates producer, gate, and review
  sections.

Later phase:

- block dispatch if required Wasurezu Work Order fields are missing;
- enforce schema and gate validation;
- connect Wasurezu Work Orders and reports to Delivery Graph evidence.

The first phase must not claim full runner automation, merge-authority
enforcement, state daemon enforcement, or AUN auto-runner readiness.

Acceptance scenario for first-phase gate behavior:

```gherkin
Given a Wasurezu task has incomplete Wasurezu-specific Work Order fields
When the first-phase adoption gate evaluates the task
Then the task records WARN findings for the missing fields
And the report still records producer, gate, and review sections separately
And the gate is not considered skipped
```

## 8. Acceptance Criteria
- #246 is tracked as a child issue under #238, not folded into the generic #244
  Work Order schema issue.
- The Wasurezu adoption profile uses `--quality-mode single-agent` and
  `--audit-level minimal|standard`, not a new `--mode lightweight`.
- The profile forbids `--audit-level strict` with `single-agent`.
- Minimal and standard audit scope boundaries are explicit.
- Wasurezu Work Order required fields are listed and represented by an example.
- Behavior-changing Wasurezu work requires SPEC/IMPL/VERIFY/OPS docs.
- First-phase gates warn on missing Work Order fields but do not skip gates.
- Later-phase promotion to blocking dispatch is reserved for a reviewed slice.
- Non-goals exclude full multi-agent operation, `state_daemon` automation, AUN
  auto-runner, first-PR merge-authority enforcement, and unofficial CLI modes.

Acceptance scenario for ordinary Wasurezu scaffolding:

```gherkin
Given a Wasurezu task only adds Shirube adoption scaffolding
When it starts with --quality-mode single-agent --audit-level minimal
Then producer, gate, and review sections are still reported separately
And missing Wasurezu Work Order fields warn rather than skip gates
```

Acceptance scenario for recovery behavior:

```gherkin
Given a Wasurezu task changes recovery pack behavior
When the task is classified
Then the task requires --audit-level standard
And the Work Order names recovery behavior impact, tests, rollback, and report format
```

## 9. Non-Goals
- Do not require full multi-agent Shirube operation yet.
- Do not require `state_daemon` automation.
- Do not require AUN auto-runner.
- Do not enforce merge authority in the first adoption PR.
- Do not introduce a new unofficial `lightweight` CLI mode.
- Do not treat Wasurezu memory as Shirube transition authority.
- Do not make recovery packs approve their own correctness.

## 10. 制御機構選定原則
script 選定根拠: the adoption profile must be deterministic enough for
repeatable CLI invocation and review. Shirube commands, Work Order checks, and
manual report templates are the initial authority surface.

Hook 選定根拠: hooks are not canonical in the first Wasurezu adoption step.
They may call the same checks later, but they must not decide adoption
validity independently.

GitHub 選定根拠: GitHub issues and PRs hold adoption tracking and review
evidence. They do not replace Work Orders or 4-layer docs.

MCP 選定根拠: Wasurezu MCP tools are in scope for standard audit when contracts
or structured output behavior changes. MCP outputs remain evidence, not
transition authority.

LLM boundary: an LLM may draft Work Orders, docs, tests, or reports. It cannot
skip gates, approve its own work, grant merge authority, or claim recovery
correctness without deterministic evidence.

| Requirement | Mechanism | Hook-only unavoidable case | Rationale |
|-------------|-----------|----------------------------|-----------|
| Wasurezu task classification | Work Order + manual report | - | classification must be inspectable before work starts |
| Missing Work Order fields | `workflow check` warning and report | - | early adoption must surface gaps without blocking all work |
| Behavior-changing Wasurezu docs | SPEC/IMPL/VERIFY/OPS | - | recovery and memory changes need stable design evidence |
| MCP structured output changes | standard audit evidence | - | schema/result changes affect downstream agents and hosts |
| Future dispatch blocking | reviewed runner/gate slice | - | hard blocking needs dogfood evidence before enforcement |

## 11. Testing Layer
Testing layer declaration:

- unit: validate any future classifier or Work Order field evaluator with
  focused unit tests before enabling enforcement.
- integration: validate Wasurezu Work Order examples against Shirube workflow
  checks once Wasurezu-side artifacts exist.
- regression: preserve the rule that `single-agent` cannot pair with strict
  audit and that missing Work Order fields warn during the first phase.
- smoke: run trace verification, spec audit, typecheck, build, lint, and
  diff-check for Shirube docs-only adoption PRs.

The first #246 Shirube PR is documentation-only, so runtime unit tests are not
required unless code is changed. Later Wasurezu behavior changes must add
focused tests for the affected recovery, memory, MCP, host-runtime, redaction,
provenance, token, migration, or data-model surface.
