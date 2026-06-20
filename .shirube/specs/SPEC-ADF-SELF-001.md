# Self-Apply Shirube Governance To ai-dev-framework

SPEC-ID: SPEC-ADF-SELF-001
Risk Tier: R2

## Background

`watchout/ai-dev-framework` now owns the Shirube governance standard,
templates, schemas, rubrics, conveyor checks, and rollout instructions. This
slice dogfoods those controls by adding the repository-level `.shirube/`
governance scaffold for the repo itself.

## Purpose

Create the first Shirube-on-Shirube repository premise, agent policy, Cell,
Impl, audit, and evidence records for `ai-dev-framework` without activating
runtime enforcement.

## Non-goals

- This spec does not authorize runtime code changes.
- This spec does not authorize CLI implementation changes.
- This spec does not activate required checks.
- This spec does not modify active GitHub workflows.
- This spec does not modify branch protection or rulesets.
- This spec does not activate AUN, Discord, DB, queue, LaunchAgent, production, or multi-agent automation.
- This spec does not mutate external repositories.
- This spec does not start target repository scaffold work.
- This spec does not claim full Shirube rollout completion.

## Target Users

- Shirube command reviewers
- ai-dev-framework maintainers
- Goal-mode implementation agents operating inside explicit Cells

## Target Scope

- `.shirube/repo-spec.yaml`
- `.shirube/agent-policy.yaml`
- `.shirube/specs/SPEC-ADF-SELF-001.md`
- `.shirube/cells/*.yaml`
- `.shirube/impls/IMPL-ADF-SELF-001.md`
- `.shirube/audits/*.yaml`
- `.shirube/evidence/EVIDENCE-ADF-SELF-001.yaml`
- `.shirube/contracts/.gitkeep`
- `.shirube/waivers/.gitkeep`

## Changed Areas

- Repository governance scaffold only.
- No runtime, workflow, package, script, deploy, protection, or external automation area changes.

## Requirements

| ID | Statement |
| --- | --- |
| REQ-ADF-SELF-001 | Add repo-spec for ai-dev-framework. |
| REQ-ADF-SELF-002 | Add agent-policy for ai-dev-framework. |
| REQ-ADF-SELF-003 | Add initial Cell candidates for future Shirube development. |
| REQ-ADF-SELF-004 | Add audit and evidence records for this scaffold slice. |
| SEC-ADF-SELF-001 | No runtime, workflow activation, protected-settings change, external repo mutation, or agent dispatch. |
| NFR-ADF-SELF-001 | Records must use structured Shirube IDs and machine-readable PASS / FAIL / N/A values where applicable. |
| AI-ADF-SELF-001 | Goal-directed bounded execution may operate only inside declared Cell boundaries. |
| DATA-ADF-SELF-001 | No customer data, secrets, or target repository data are read or mutated by this scaffold. |

## Acceptance Criteria

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-ADF-SELF-001 | REQ-ADF-SELF-001 | `.shirube/repo-spec.yaml` defines purpose, scope, non-goals, roles, boundaries, gates, standards, AI classification, agent policy ref, and evidence ledger ref. |
| AC-ADF-SELF-002 | REQ-ADF-SELF-002 | `.shirube/agent-policy.yaml` defines allowed/forbidden paths and commands, agent-neutral profiles, execution contract, evidence requirements, and risk tier limits. |
| AC-ADF-SELF-003 | REQ-ADF-SELF-003 | Five Cell candidate records exist and only `CELL-ADF-SELF-001` is marked implemented in this PR. |
| AC-ADF-SELF-004 | REQ-ADF-SELF-004 | Spec audit, Impl audit, and evidence records exist with structured IDs. |
| AC-ADF-SELF-005 | SEC-ADF-SELF-001 | Changed files are limited to `.shirube/**`. |
| AC-ADF-SELF-006 | SEC-ADF-SELF-001 | Conveyor check against the created PR is PASS or PASS_WITH_WARN before Shirube command review. |

## Negative Cases

| ID | Linked Requirements | Statement |
| --- | --- | --- |
| AC-NEG-ADF-SELF-001 | SEC-ADF-SELF-001 | The PR must not modify `src/**`, `lib/**`, `bin/**`, `scripts/**`, `.github/workflows/**`, package files, deploy files, `.env`, or private config. |
| AC-NEG-ADF-SELF-002 | SEC-ADF-SELF-001 | The PR must not enable required checks, branch protection, rulesets, external dispatch, or production activation. |
| AC-NEG-ADF-SELF-003 | REQ-ADF-SELF-003 | Draft future Cells must not be treated as implementation authorization. |

## Impact

- Security impact: Governance scaffold only; no enforcement or secret access.
- Privacy impact: N/A; no personal or customer data processing.
- AI usage impact: Agent policy documents bounded agent execution but does not activate agents.
- Data impact: N/A; no data stores or target repositories are mutated.
- API changes: N/A.
- DB changes: N/A.
- Audit log requirements: This PR carries structured audit and evidence records.

## Migration Plan

N/A. This is an additive scaffold.

## Rollback Plan

Single PR revert removes the `.shirube/` self-application records added by this slice.

## Test Plan

| TEST-ID | Linked Requirements | Description |
| --- | --- | --- |
| TEST-MAP-ADF-SELF-001 | REQ-ADF-SELF-001, REQ-ADF-SELF-002, REQ-ADF-SELF-003, REQ-ADF-SELF-004, SEC-ADF-SELF-001 | Run `git diff --check`, `npm run lint`, `npm run type-check`, `npm run build:cli`, and `npx tsx src/cli/index.ts conveyor check <PR_URL> --format json`. |

## Trace Matrix

| Requirement | Cell | Impl | Evidence |
| --- | --- | --- | --- |
| REQ-ADF-SELF-001 | CELL-ADF-SELF-001 | IMPL-ADF-SELF-001 | EVIDENCE-ADF-SELF-001 |
| REQ-ADF-SELF-002 | CELL-ADF-SELF-001 | IMPL-ADF-SELF-001 | EVIDENCE-ADF-SELF-001 |
| REQ-ADF-SELF-003 | CELL-ADF-SELF-001 | IMPL-ADF-SELF-001 | EVIDENCE-ADF-SELF-001 |
| REQ-ADF-SELF-004 | CELL-ADF-SELF-001 | IMPL-ADF-SELF-001 | EVIDENCE-ADF-SELF-001 |
| SEC-ADF-SELF-001 | CELL-ADF-SELF-001 | IMPL-ADF-SELF-001 | EVIDENCE-ADF-SELF-001 |

## Unresolved Questions

- Which future Cell will activate required checks remains pending command review and a separate authorized work order.
