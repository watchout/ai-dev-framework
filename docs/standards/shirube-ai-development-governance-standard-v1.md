# Shirube AI Development Governance Standard v1

Status: proposed canonical standard  
Owner: Shirube / ai-dev-framework  
Created: 2026-06-19  
Primary repository: `watchout/ai-dev-framework`

This document is the canonical design for Shirube's AI-native development operating model. It converts the design conversation into a durable GitHub-controlled standard that can be applied to `ai-dev-framework`, `agent-comms-mcp`, `agent-memory`, `kodama`, and `misell`.

## 1. Core Principle

Shirube's AI development model is not designed merely to make AI implementation faster. It is designed to let AI implement quickly without losing design intent, implementation scope, review quality, runtime safety, or audit evidence.

The central flow is:

```text
Spec -> Cell -> Impl -> Code -> Test -> Evidence
```

Pull requests are transport and review containers. The development unit is the Cell.

## 2. Terms

```text
Spec
  The design blueprint. It defines purpose, scope, requirements, non-goals,
  risks, acceptance criteria, tests, rollback, and applicable controls.

Cell
  The smallest goal-mode implementation range. A Cell has one clear goal,
  one primary responsibility, one implementation boundary, and one verification
  boundary.

Impl
  The construction drawing for a Cell. It describes how the Cell will be
  implemented before code is changed.

Audit
  A rubric-based comparison between adjacent artifacts. LLMs may assist, but
  the output must be structured and evidence-bound.

Evidence
  Durable proof that the Cell passed its required checks, tests, audits,
  post-merge verification, and release/rollback decision.
```

## 3. Reference Standards

### 3.1 Primary Standard: SOC 2

SOC 2 is the primary governance standard for Shirube's development and operational controls.

Shirube v1 treats these Trust Services Categories as follows:

```text
Required:
  Security
  Confidentiality
  Processing Integrity

Conditionally required:
  Privacy, when personal data or user-specific data is involved.

Phased adoption:
  Availability, when SLA, production continuity, or enterprise deployment
  requirements are defined.
```

SOC 2 is used as the backbone for change management, review controls, access controls, testing evidence, audit trails, release decisions, and operational integrity.

### 3.2 Secondary Standard: ISO/IEC 42001

ISO/IEC 42001 is the secondary governance standard for AI management. It is applied as an additional control layer for AI-related Cells.

Apply ISO/IEC 42001 controls when a Cell involves:

```text
- LLM usage
- AI agent behavior
- model selection or model routing
- prompt design or prompt execution
- RAG or external knowledge retrieval
- AI-generated recommendations or decisions
- AI tool invocation
- memory read/write behavior
- third-party AI provider integration
```

### 3.3 Engineering Reference Standards

SOC 2 and ISO/IEC 42001 define the governance layer. Engineering checks are made concrete using:

```text
NIST SP 800-218 SSDF
  Secure software development process reference.

OWASP Top 10 for LLM Applications
  LLM, agent, prompt injection, tool, output handling, and excessive agency
  risk reference.

SLSA
  Build provenance, attestation, and supply-chain evidence reference.
```

## 4. Final Development Flow

The standard Shirube development flow has 12 stages.

```text
1. Repository Premise Spec
2. Feature Spec
3. Spec Audit
4. Spec-to-Cell Trace Audit
5. Cell-level Impl creation
6. Impl Audit
7. Goal-mode Implementation by Cell
8. Current CI
9. Impl-to-Code Audit
10. Merge
11. Post-merge Mechanical Verification
12. Release / Rollback Decision
```

### 4.1 Stage 1: Repository Premise Spec

Every repository must have a repository-level premise spec before AI-driven design or implementation begins.

Required content:

```text
- repository purpose
- target scope
- non-goals
- design principles
- development flow
- required gates
- roles and CODEOWNERS
- audit responsibilities
- shared terminology
- security assumptions
- privacy assumptions
- data boundaries
- dependency boundaries
- forbidden actions
- AI usage classification
- SOC 2 applicable categories
- ISO/IEC 42001 applicability
```

Recommended path:

```text
.shirube/repo-spec.yaml
```

### 4.2 Stage 2: Feature Spec

Each feature or behavior-affecting change must have a Feature Spec.

Required fields:

```text
- SPEC-ID
- background
- purpose
- non-goals
- target users
- target scope
- changed areas
- requirements
- acceptance criteria
- negative cases
- non-functional requirements
- security impact
- privacy impact
- AI usage impact
- data impact
- API changes
- DB changes
- audit log requirements
- migration plan
- rollback plan
- test plan
- unresolved questions
```

Requirements must be individually addressable:

```text
REQ-*
SEC-*
NFR-*
AI-*
DATA-*
TEST-*
```

### 4.3 Stage 3: Spec Audit

Spec Audit validates the design blueprint itself.

Minimum checks:

```text
- purpose is clear
- non-goals are explicit
- acceptance criteria are testable
- ambiguous terms are removed or defined
- security and privacy impact are addressed
- AI usage is declared when applicable
- migration and rollback are declared when needed
- requirements are ID-addressable
- Cell decomposition is possible
- SOC 2 / ISO 42001 applicability is declared
```

Result format:

```text
PASS / FAIL / N/A
```

Each FAIL must include evidence.

### 4.4 Stage 4: Spec-to-Cell Trace Audit

This audit checks whether the Spec has been decomposed into valid Cells.

Minimum checks:

```text
- every required REQ-ID is covered by at least one CELL-ID
- every CELL-ID maps to at least one valid REQ-ID
- Cells have clear boundaries
- Cells have allowed_paths and forbidden_paths
- Cell dependencies are declared
- Cell risk tier is declared
- acceptance tests are mapped to Cells
- high-risk Cells trigger stricter gates
```

This stage prevents AI from expanding scope before implementation begins.

### 4.5 Stage 5: Cell-level Impl Creation

Impl is created per Cell before code changes.

Required fields:

```text
- IMPL-ID
- target CELL-ID
- covered REQ-ID list
- planned file changes
- planned functions / types / modules
- API changes
- DB changes
- auth and permission handling
- error handling
- logging and audit logging
- tests to add or update
- implementation order
- risks
- rollback method
```

### 4.6 Stage 6: Impl Audit

Impl Audit validates the construction drawing before implementation.

Minimum checks:

```text
- Impl stays inside Cell scope
- Impl satisfies mapped requirements
- Impl does not violate non-goals
- Impl does not touch forbidden paths
- test plan maps to acceptance criteria
- auth, permission, logging, and error handling are addressed
- security and AI risks are handled
- new dependencies are justified
```

### 4.7 Stage 7: Goal-mode Implementation by Cell

Goal-mode implementation means the agent may proceed quickly only inside an audited Cell and audited Impl.

Mandatory constraints:

```text
- do not modify files outside allowed_paths
- do not modify forbidden_paths
- do not add dependencies without explicit approval
- do not add DB migrations without explicit Impl coverage
- do not weaken auth or permission checks
- do not delete tests to make CI pass
- do not skip tests to make CI pass
- do not introduce Spec-external refactors
- do not change public APIs unless Spec and Impl cover it
```

After implementation, the agent must produce a self-check report:

```text
- implemented REQ-IDs
- unimplemented REQ-IDs
- changed files
- added or changed tests
- executed commands
- failed commands
- Cell scope deviations
- Spec deviations
- Impl deviations
```

### 4.8 Stage 8: Current CI

Existing CI remains required. At minimum, repositories should run the checks appropriate to their stack:

```text
- lint
- format check
- typecheck
- unit tests
- integration tests
- build
- dependency scan
- secret scan
- contract tests when applicable
```

### 4.9 Stage 9: Impl-to-Code Audit

Impl-to-Code Audit validates the produced code against the audited Impl and Cell.

Minimum checks:

```text
- code implements the audited Impl
- code remains within allowed_paths
- forbidden_paths were not touched
- tests correspond to acceptance criteria
- no tests were deleted or skipped improperly
- auth and permission checks match Impl
- logging and audit logging match Impl
- error handling matches Impl
- no Spec-external refactor is included
```

### 4.10 Stage 10: Merge

Merge must be GitHub-controlled.

Recommended controls:

```text
- no direct push to main
- pull request required
- required status checks
- CODEOWNERS review
- conversation resolution
- stale approval dismissal
- merge queue
- restricted admin bypass
```

### 4.11 Stage 11: Post-merge Mechanical Verification

Post-merge verification must not be a formal checkbox. It must mechanically reproduce important user, API, data, and logging behavior.

Required where applicable:

```text
Browser E2E
  user flows, form input, navigation, rendering, error states

API smoke / contract tests
  response shape, status codes, negative cases

DB state assertion
  expected persistence or non-persistence

Log assertion
  app logs and audit logs

Console / network check
  unexpected console errors, failed network requests, unexpected 4xx/5xx

Permission tests
  unauthenticated, unauthorized, cross-user, cross-tenant, admin-only cases

Evidence artifacts
  screenshots, trace, video, reports, logs
```

Every post-merge test must map back to a Cell and requirement:

```text
CELL-ID -> REQ-ID -> TEST-ID -> result -> evidence
```

### 4.12 Stage 12: Release / Rollback Decision

Post-merge verification must lead to an explicit decision.

```text
If verification passes:
  - release continues
  - Cell becomes POST_MERGE_VERIFIED or RELEASED
  - evidence ledger is updated

If verification fails:
  - release stops
  - revert, hotfix Cell, or rollback is chosen
  - owner is notified
  - audit evidence is retained
```

## 5. Risk Tier

Cells must declare a Risk Tier.

```text
R0
  docs, comments, non-behavioral metadata only

R1
  low-risk UI or small internal logic changes

R2
  API, DB, permission, external integration, user-data-impacting changes

R3
  authentication, authorization, payment, personal data, agent-memory,
  MCP tool execution, AI autonomous behavior, production deployment,
  governance control, branch protection, or release authority
```

Gate expectations:

```text
R0:
  lightweight Spec/Cell optional unless governance docs are touched

R1:
  Spec and Cell required; simplified Impl allowed

R2:
  Spec, Cell, Impl, LLM audit, owner review, CI, and post-merge verification required

R3:
  full gates required; CODEOWNER and owner/security review required; waiver requires expiry and compensating controls
```

## 6. Waiver / Exception Policy

Waivers are allowed only as controlled exceptions.

Required fields:

```text
- WAIVER-ID
- target Cell
- target check
- reason
- risk accepted
- compensating controls
- approver
- expiry date
- follow-up issue
```

Expired waivers must fail CI.

## 7. Evidence Ledger

Each Cell should produce durable evidence.

Required evidence fields:

```text
- EVIDENCE-ID
- SPEC-ID
- CELL-ID
- IMPL-ID
- PR-ID
- commit SHA
- audit results
- CI run IDs
- artifact locations
- post-merge verification result
- waiver references
- release / rollback decision
```

Recommended path:

```text
.shirube/evidence/
```

## 8. Agent and Tool Permission Boundary

Agent permissions must be explicit.

Repositories that allow AI agents, MCP tools, or memory behavior must define:

```text
- allowed commands
- forbidden commands
- allowed paths
- forbidden paths
- allowed MCP tools
- approval-required MCP tools
- forbidden MCP tools
- secret access policy
- memory read policy
- memory write policy
- external send policy
```

Recommended path:

```text
.shirube/agent-policy.yaml
```

## 9. Cross-repo Contract Policy

Because Shirube applies across multiple repositories, cross-repo contracts must be explicit.

Contract types:

```text
- API contract
- MCP tool contract
- memory schema contract
- event schema contract
- prompt input / output schema
- version compatibility matrix
```

Breaking changes require:

```text
- new Spec
- affected Cell list
- migration plan
- rollback plan
- consumer repo verification
```

## 10. LLM Audit Policy

LLMs are allowed to assist audits, but they must not perform free-form subjective review as the authoritative gate.

Rules:

```text
- use rubric-based PASS / FAIL / N/A
- each FAIL requires evidence
- evidence must reference SPEC-ID, CELL-ID, IMPL-ID, file path, diff, test, log, or artifact
- unsupported claims are marked UNVERIFIED, not FAIL
- audit is Cell-based, not PR-vibe-based
```

LLM audit quality must be calibrated using golden cases.

Recommended path:

```text
.golden-cases/
```

## 11. Repository Application Plan

### 11.1 ai-dev-framework

Role:

```text
Central control plane for standards, schemas, templates, rubrics, CLI, reusable workflows, and golden cases.
```

Initial targets:

```text
- standards/
- schemas/
- templates/
- rubrics/
- workflows/
- cli/
- golden-cases/
```

### 11.2 agent-memory

Primary risks:

```text
- memory privacy
- cross-user or cross-tenant leakage
- retention and deletion
- sensitive information exposure
- stored prompt injection
```

Initial Cell candidates:

```text
- memory data classification
- memory read/write policy
- user/session/tenant boundary
- retention / TTL / deletion
- memory audit log
- stored prompt injection treated as data, not instruction
```

### 11.3 agent-comms-mcp

Primary risks:

```text
- MCP tool overpermission
- unsafe tool invocation
- tool descriptor poisoning
- prompt injection through tool metadata or output
- schema-less tool output
- missing audit log
```

Initial Cell candidates:

```text
- tool registry schema
- tool allowlist / denylist
- tool invocation approval
- tool output schema validation
- resource access boundary
- tool call audit log
- malicious tool descriptor test
```

### 11.4 kodama

Primary risks:

```text
- agent lifecycle failure
- orchestration state drift
- unsafe retries
- timeout handling
- tool/memory boundary integration
```

Initial Cell candidates:

```text
- agent execution state machine
- task cancellation
- retry / timeout
- tool permission integration
- memory policy integration
- audit event emission
```

### 11.5 misell

Primary risks:

```text
- product behavior regression
- browser flow breakage
- auth / permission failure
- missing post-merge evidence
- release without mechanical verification
```

Initial Cell candidates:

```text
- critical user flow inventory
- Playwright setup
- auth flow E2E
- core business flow E2E
- error flow E2E
- post-merge evidence collection
```

## 12. Environment Bootstrap

Each applied repository should receive this structure:

```text
.shirube/
  repo-spec.yaml
  agent-policy.yaml
  contracts/
  specs/
  cells/
  impls/
  audits/
  evidence/
  waivers/

.github/
  workflows/
    shirube-pr-gate.yml
    shirube-post-merge-verification.yml
  PULL_REQUEST_TEMPLATE.md
  CODEOWNERS
```

`ai-dev-framework` should provide reusable assets:

```text
standards/
schemas/
templates/
rubrics/
workflows/
cli/
golden-cases/
```

## 13. Rollout Phases

```text
Phase 1:
  Implement standard, schemas, templates, rubrics, reusable workflows, and CLI
  in ai-dev-framework.

Phase 2:
  Apply minimal .shirube/ scaffold to target repositories in warn-only mode.

Phase 3:
  Complete repo-spec.yaml for each target repository.

Phase 4:
  Run one pilot Cell per repository from Spec through Release/Rollback Decision.

Phase 5:
  Promote stable checks from warn-only to required checks.
```

## 14. Codex Command Model

Codex should receive work only through GitHub issues or PR comments.

Each instruction to Codex must include:

```text
- target repository
- target Cell
- target Spec
- target Impl or request to create Impl
- allowed paths
- forbidden paths
- risk tier
- required tests
- required evidence
- explicit non-goals
```

Codex must not treat chat-only instructions as completion evidence. GitHub issue, PR, commit, CI, artifact, and evidence-ledger records are the source of truth.

## 15. Initial Decision

The approved operating model is:

```text
- Development unit: Cell, not PR
- Canonical chain: Spec -> Cell -> Impl -> Code -> Test -> Evidence
- Primary standard: SOC 2
- Secondary standard: ISO/IEC 42001
- Engineering references: NIST SSDF, OWASP LLM Top 10, SLSA
- LLM audit style: rubric-based, evidence-bound PASS / FAIL / N/A
- Implementation mode: audited Cell + audited Impl + constrained goal-mode
- Verification: CI plus post-merge mechanical verification
- Governance store: GitHub
- Implementation executor: Codex through GitHub issues and PRs
- Coordination role: architectural command and review through GitHub
```
