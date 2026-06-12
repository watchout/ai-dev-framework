# Role Identity Evidence

This document defines how Shirube records operational role identity for
strict and public MCP-quality workflows.

It does not change the validator rules or grant merge authority. It clarifies
what evidence each PR should leave behind so reviewers can verify that
producer, reviewer, auditor, and approver identities did not collapse into one
effective actor.

## Scope

Role identity evidence is required when a workflow claims any of the following:

- `auditLevel: "standard"` or `auditLevel: "strict"`
- public MCP-quality operation
- protected governance, release, or merge authority
- L1 / L2 / L3 review separation

For lightweight dogfooding or migration work, the same fields may be recorded
as best effort. If the workflow intentionally runs in single-agent mode, the PR
must say so explicitly and must not claim strict separation.

## Role, Actor, And Session

Shirube separates three concepts:

| Concept | Meaning | Example |
|---------|---------|---------|
| Role | Workflow authority or responsibility | `producer`, `adf-lead`, `auditor`, `l3_governance_owner` |
| Actor | Effective identity bound to a role | `human:watchout`, `local_agent:codex-adf`, `external:claude-audit` |
| Session / process | Concrete execution context for one PR or review | Codex session, Claude session, GitHub review, CI run |

A role name alone is not evidence of separation. For strict or public work, the
PR must show that the producer and the reviewer ran as different effective
actors or, at minimum, different process/session authorities accepted by the
workflow profile.

## `adf-lead` Operational Identity

`adf-lead` is an implementation-side lead identity for this repository. It may
be operated by one of these concrete actors:

- a Codex session
- a Claude bot/session
- a human reviewer
- an external automation actor

The PR evidence must name the actual actor and session/process used for that
PR. `adf-lead` cannot be used as a generic label to both produce the change and
self-approve L1.

Producer authority ends at implementation evidence, test output, and self-check
reporting. L1 may review scope and PR quality, but L1 is still not merge
authority. L2, L3, and CEO/product approval remain separate when the route
requires them.

## Per-PR Evidence Checklist

Each standard or strict PR should leave a PR comment, review comment, or linked
runtime evidence block with:

- producer role, actor, and session/process
- L1 reviewer role, actor, and session/process
- PR head SHA reviewed
- validation commands and their results
- issue or PR evidence URL
- statement that producer and L1 reviewer are distinct effective actors
- explicit exception if the PR is intentionally lightweight or single-agent

Recommended evidence block:

```markdown
## Role Identity Evidence
- Producer: implementation_bot / local_agent:codex-adf / Codex session <id>
- L1 reviewer: adf-lead / human:watchout / GitHub review <url>
- Reviewed head SHA:
- Evidence URL:
- Separation: producer and L1 reviewer are distinct effective actors
- Exception: none
```

If a reviewer cannot verify the actor/session boundary, they should request
rework or additional evidence instead of accepting a nominal role split.

## Actor Label Collision

Shirube treats actor labels conservatively. Different binding types do not make
two actors distinct when their normalized actor label is the same.

Example:

| Binding | Normalized actor label |
|---------|------------------------|
| `local_agent:codex-adf` | `codex-adf` |
| `external:codex-adf` | `codex-adf` |

For `standard` and `strict`, this collision blocks producer-to-authority
separation and is reported as an `actor:<label>` violation, for example:

```text
producer and lead_reviewer share actor:codex-adf
```

This is intentional. Public workflows should fail closed when two labels could
represent the same effective actor.

## `release_owner` And `human_approver`

Internal dogfooding may temporarily bind both `release_owner` and
`human_approver` to the same human actor when the profile and route allow it.
That is an accepted transitional setup, not a public-release default.

For public releases, customer-impacting launches, or protected governance
changes, prefer separate actors:

| Role | Recommended actor |
|------|-------------------|
| `release_owner` | release manager or repo owner responsible for shipping |
| `human_approver` | CEO, product owner, or delegated business approver |

If the same person must hold both roles, the PR should document the exception
and route it through the required approval level.

## Review Boundaries

Role identity evidence supports review routing, but it does not replace review.

| Layer | May decide | Must not claim |
|-------|------------|----------------|
| Producer | implementation complete, tests run, known risks | PASS, approved, ready to merge |
| L1 | scope fit, basic quality, evidence adequacy | L2/L3/CEO approval |
| L2 | independent audit result | merge authority unless explicitly assigned |
| L3 / CTO | governance, production, merge-risk decision | implementation work |
| CEO / product | strategic approval | technical audit coverage |

GitHub comments, reviews, CI, and runtime evidence are authoritative records.
AUN ACKs or queue IDs are routing signals only and do not satisfy completion
evidence.

## Non-Claims

This document does not:

- loosen role separation validation
- approve any protected PR
- grant merge authority to `adf-lead`
- make AUN evidence authoritative
- require public projects to reuse this repository's internal dogfooding roles
