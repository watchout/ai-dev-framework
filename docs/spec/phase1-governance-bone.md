---
id: SPEC-GOVBONE-249
status: Draft
traces:
  impl: [IMPL-GOVBONE-249]
  verify: [VERIFY-GOVBONE-249]
  ops: [OPS-GOVBONE-249]
---

# SPEC: Product-Wide Governance Bone

## 0. Meta
- Origin Issue: #249
- Related Work Order authority issue: #248
- Cross-repo parent: watchout/agent-comms-mcp#655

## 1. Purpose
Define the reusable Shirube governance bone for product work:

```text
Goal -> Phase -> Work Order -> PR / Change Slice -> Scripted Step -> Tool Execution -> Evidence / Audit Record
```

The governance bone is not a prompt template. It is a deterministic issue, PR,
and CI skeleton that product repositories can adopt before full runner
automation exists.

## 2. Required Fields
Substantial issues and PRs must make these fields visible, either directly or
through approved aliases:

- Goal;
- Phase;
- Work Order;
- Risk classification;
- PR slice;
- Script/gate owner;
- Action tools;
- Context evidence;
- Memory/recovery evidence;
- Approval policy;
- Audit evidence;
- Rollback/replay;
- Architecture owner;
- Implementation owner;
- Review owner;
- Merge authority;
- Audit owner.

Product teams may mark a field `not applicable`, but missing fields must be
visible as warning or block findings.

Ownership fields are stricter than ordinary descriptive fields. They must name
concrete actors or teams; `TBD`, `n/a`, `not applicable`, `none`, and similar
placeholder values do not satisfy them.

## 2.1 Architecture / Implementation Ownership Boundary
ARC and architecture/design roles may create or update specs, issues,
acceptance criteria, roadmap entries, gate requirements, and review checklists.
Repository owners retain implementation ownership, dependency/CI change
ownership, adoption decisions, and merge authority.

Governance evidence must separate:

- `architecture_owner`;
- `implementation_owner`;
- `review_owner`;
- `merge_authority`;
- `audit_owner`.

ARC-created implementation PRs are reference implementations by default unless
the repository owner explicitly delegates implementation for the exact
repository, issue or Work Order, file/module scope, verification requirements,
and whether dependency or CI changes are allowed.

Reference implementation PRs must be draft or carry an explicit
reference/proposal label. They are not evidence that implementation is complete
or merge-approved. The repository owner may adopt, revise, reimplement, or close
them.

## 3. Profiles and Risk
The first profiles are:

- `default`;
- `infrastructure`;
- `hotel`.

`infrastructure` additionally treats AUN, Shirube, Kodama, Wasurezu, MCP,
runtime, queue, context-pack, recovery-pack, memory, and tool-contract language
as governance-triggering.

`hotel` additionally treats hotel, guest, reservation, booking, PMS, CRM,
tenant, customer data, payment, and room-assignment language as governance-
triggering.

Risk values are `low`, `medium`, `high`, and `critical`. If no explicit mode is
given, `high` and `critical` derive strict mode; `low` and `medium` derive
warning mode. `--mode warning` remains available for first-phase warning-only
dogfood.

## 4. Gate Behavior
Warning mode:

- reports missing fields as warnings;
- exits 0 unless a non-negotiable block is detected;
- is the default for early product adoption.

Strict mode:

- blocks missing governance fields;
- is required for risky action-tool, customer-data, runtime/queue, memory/
  context-boundary, external-mutation, approval-policy, and enterprise-claim
  changes after the adoption profile enables strict enforcement.

Both modes must block:

- LLM-owned Goal, Phase, Work Order, gate, approval, or state-transition
  authority;
- LLM-owned action-tool approval or external/customer-data mutation authority;
- ARC/design-role implementation or merge authority unless explicit
  repository-owner delegation is present;
- reference implementation PRs that are not identifiable as draft or explicit
  reference/proposal work;
- silent fallback when approval, context, audit, or evidence is missing.

## 5. CI and Template Distribution
Shirube must distribute:

- `.github/workflows/governance.yml`;
- `.github/ISSUE_TEMPLATE/governance-work-order.md`;
- `.github/PULL_REQUEST_TEMPLATE/governance.md`.

The GitHub workflow validates PR body governance evidence. It must support
`SHIRUBE_GOVERNANCE_PROFILE`, `SHIRUBE_GOVERNANCE_RISK`,
`SHIRUBE_GOVERNANCE_MODE`, and `SHIRUBE_GOVERNANCE_REQUIRE` so product repos can
start in warning mode and later configure strict blocking for risky work.

## 6. Transition Boundary
This slice only introduces warning-first/strict-capable governance evidence
checks and distribution templates. It does not claim that every product has
already enabled strict blocking.

Strict blocking for product repositories requires product-profile configuration
and follow-up adoption evidence. Missing governance evidence must be visible
before it can become a hard dispatch or merge blocker.

## 7. Acceptance Criteria and Scenarios
Acceptance criteria:

- governance fields are checked through a deterministic script;
- ownership fields separate architecture, implementation, review, merge, and
  audit owners;
- unset implementation owners are warning/block findings according to mode;
- ARC-created reference implementation PRs are identifiable as draft or by an
  explicit reference/proposal label;
- product profiles influence trigger detection;
- risk can derive strict mode;
- warning mode remains explicit for first-phase adoption;
- templates and CI workflow are installed through the existing GitHub template
  installer;
- LLM authority and silent fallback are blocked even in warning mode.

Warning-first adoption:

```gherkin
Given a product repository has a PR body with an incomplete Work Order
And SHIRUBE_GOVERNANCE_MODE is warning
When the governance workflow runs
Then missing Goal, Phase, Work Order, risk, approval, audit, and rollback fields are warnings
And the workflow exits successfully unless a non-negotiable block is present
```

Strict risky work:

```gherkin
Given a product repository marks governance risk as high
And no explicit mode override is provided
When shirube check governance runs
Then the derived mode is strict
And missing required governance fields block the check
```

Profile trigger:

```gherkin
Given the governance profile is hotel
And a PR body mentions guest reservation behavior
When shirube check governance runs
Then governance is detected even if generic Work Order terms are absent
```

LLM authority boundary:

```gherkin
Given a PR body says the LLM owns action-tool approval
When the governance check runs in warning mode
Then the check blocks because LLM output cannot own approval or execution authority
```

ARC ownership boundary:

```gherkin
Given a PR body names ARC as implementation owner or merge authority
And there is no explicit repository-owner delegation
When the governance check runs in warning mode
Then the check blocks because architecture ownership cannot transfer repo implementation ownership
```

Reference implementation boundary:

```gherkin
Given a PR body describes an ARC-created reference implementation
And it is not marked Draft or with an explicit reference/proposal label
When the governance check runs
Then the check blocks because reference code cannot become mergeable evidence by itself
```

## 8. Non-Goals
- Do not own AUN queue state or runtime execution.
- Do not enforce merge authority in this first slice.
- Do not transfer implementation ownership from repository maintainers to ARC.
- Do not make LLM output an approval surface.
- Do not require full multi-agent governance before warning-mode adoption.
- Do not claim public, OSS, or enterprise readiness from this validator alone.

## 9. Review Boundary
L1/L2 review is required before this validator is treated as a reviewed Shirube
governance gate.

L3 review is required before this governance check is promoted from warning-
first adoption to strict merge, phase-transition, or action-tool dispatch
authority.

## 10. 制御機構選定原則
script 選定根拠: the validator and CLI are deterministic, replayable, and
suitable for local CI and GitHub Actions.

Hook 選定根拠: Hook 不採用 in this slice. Hooks may invoke the same script later
for unavoidable local interception, but they must not decide governance
validity independently.

GitHub 選定根拠: templates and workflows project the same check into product
repositories without making GitHub issue or PR text authoritative by itself.

LLM boundary: an LLM may draft a Work Order or PR body, but it cannot approve
the Work Order, pass the gate, own action tools, approve merge, or complete a
phase.

| Requirement | Mechanism | 不可避 case 該当 (Hook のみ) | 根拠 |
|-------------|-----------|-----------------------------|------|
| Governance field validation | script (`check governance`) | - | deterministic field and alias validation |
| CI projection | GitHub Actions calling script | - | repository-visible warning/strict status |
| Product profile selection | script option/env var | - | profiles must not be inferred by LLM text |
| ARC/repo ownership separation | script (`check governance`) | - | validates owner fields and blocks ARC implementation or merge authority without delegation |
| Reference implementation identification | script (`check governance`) + PR Draft/label evidence | - | reference code must be visibly non-authoritative before repo adoption |
| Action authority | not granted in this slice | - | #248/#227 own later authority mapping |

## 11. Testing Layer
Unit tests cover validator field detection, profile triggers, risk-derived mode,
warning-first override, non-negotiable blocks, and template installation.

CLI regression tests cover warning exit behavior, strict failures, high-risk
strict derivation, explicit warning override, JSON output, and invalid option
handling.

Integration-style smoke coverage is provided through GitHub template installer
tests that assert the governance workflow and templates are installed for
product profiles.
