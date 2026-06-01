---
id: VERIFY-WASUREZU-SHIRUBE-246
status: Draft
traces:
  spec: [SPEC-WASUREZU-SHIRUBE-246]
  impl: [IMPL-WASUREZU-SHIRUBE-246]
  ops: [OPS-WASUREZU-SHIRUBE-246]
---

# VERIFY: Wasurezu Lightweight Shirube Adoption Profile

## 0. Corresponding SPEC
`docs/spec/phase1-wasurezu-shirube-adoption.md` /
SPEC-WASUREZU-SHIRUBE-246.

## 1. Required Checks
For the Shirube docs-only adoption PR:

- `npm run shirube -- trace verify`;
- `npx tsx src/cli/index.ts gate validate spec --base-ref=origin/main --link-probe=fake`;
- `git diff --check`;
- `npm run type-check`;
- `npm run build:cli`;
- `npm run lint`;
- focused docs review for #246 acceptance criteria.

Full `npm test` is recommended before ready state when the PR also touches
runtime code or shared test fixtures.

## 2. Adoption Review Matrix
| Change type | Required audit level | Required evidence |
|-------------|----------------------|-------------------|
| docs-only adoption notes | minimal | trace, spec audit, diff-check |
| non-behavioral refactor | minimal | focused tests or explicit non-applicability |
| small test additions | minimal | focused test output |
| adoption scaffolding | minimal | Work Order and manual report |
| recovery pack behavior | standard | recovery regression tests, typecheck, rollback |
| memory read/write semantics | standard | persistence tests and boundary evidence |
| promotion boundaries | standard | candidate/approved boundary tests |
| MCP tool contracts | standard | schema and structured-output fixtures |
| host invocation or restart mode | standard | host/runtime compatibility evidence |
| redaction/provenance/token handling | standard | safety tests and source evidence |
| migration or data-model change | standard | migration tests and rollback plan |

## 3. Regression Boundaries
- `wasurezu-lightweight-adoption` must not introduce `--mode lightweight`.
- `--audit-level strict` must not be paired with `--quality-mode single-agent`.
- Minimal audit must not mean gate skipping.
- Producer, gate, and review sections must remain distinct in reports.
- Work Order warnings must remain visible until a later reviewed slice promotes
  them to blocking dispatch.
- Wasurezu memory or recovery output must not become Shirube transition
  authority.

## 4. Work Order Template Review
The Wasurezu Work Order example must include:

- repo, issue, feature id, objective, scope, and non-goals;
- affected MCP tools and affected schemas;
- data/migration, recovery behavior, host-runtime, redaction/provenance impact;
- tests required and rollback plan;
- evidence/report format;
- `single-agent` quality mode and `minimal` or `standard` audit level;
- `not_granted` merge and phase-transition authority values.

## 5. L1/L2/L3 Expectations
For the first docs-only Shirube PR:

- L1 should verify profile correctness and scope classification.
- L2 should verify that no gate skipping, strict single-agent pairing, or new
  unofficial CLI mode is introduced.
- L3 is not required to merge docs-only scaffolding unless governance routing
  labels or reviewer instruction require it.

For later blocking enforcement:

- L1/L2/L3 review is required before WARN becomes BLOCK for Wasurezu dispatch.
