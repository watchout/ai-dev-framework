# 02_GENERATION_CHAIN.md - Consolidated Spec

> **Source**: Consolidates `10_GENERATION_CHAIN.md`
> **Purpose**: Step-by-step document generation chain from Discovery to Development
> **Principle**: Generate documents one at a time, in order, each using the previous as input. User confirms before proceeding.

---

## Overview

```
Step 0        Step 1         Step 2           Step 3          Step 3.5       Step 4
Discovery     Business       Product          Technical       Planning       Dev Start
(dialogue)    (who/what/why) (what/how)       (how to build)  (task decomp)  (coding)

[Claude.ai]   [Claude.ai]    [Claude.ai       [Claude Code]   [Claude Code]  [Claude Code]
                              + Claude Code]
```

### Documents Generated Per Step

| Step 0 | Step 1 | Step 2 | Step 3 | Step 3.5 | Step 4 |
|--------|--------|--------|--------|----------|--------|
| (dialogue record) | IDEA_CANVAS | PRD (SSOT-0) | API_CONTRACT (SSOT-3) | Wave classification | feature branches |
| | USER_PERSONA | FEATURE_CATALOG (SSOT-1) | DATA_MODEL (SSOT-4) | GitHub Issues | implementation |
| | COMPETITOR_ANALYSIS | UI_STATE (SSOT-2) | CROSS_CUTTING (SSOT-5) | Board setup | |
| | VALUE_PROPOSITION | Feature SSOTs | TECH_STACK + Standards | | |

### Agent Skills (recommended)

| Step | Skill | Notes |
|------|-------|-------|
| 0 | `framework-discovery` | Deliberation built-in |
| 1 | `framework-business` | |
| 2 | `framework-product` + `framework-feature-spec` | Feature Spec has Deliberation |
| 3 | `framework-technical` | Deliberation built-in |
| 4 | `framework-implement` + `framework-code-audit` | |
| Any | `framework-review-council` | Multi-perspective review at phase end |

---

## Gate Conditions (Step Completion Requirements)

### Gate 0 -> 1: Discovery Complete

- All applicable Stages (1-5) completed
- Responses recorded as text
- User approved "Discovery complete"
- (Alt: existing materials loaded, gaps filled, user approved)

### Gate 1 -> 2: Business Complete

- `docs/idea/IDEA_CANVAS.md` exists, zero `[TBD]`
- `docs/idea/USER_PERSONA.md` exists, zero `[TBD]`
- `docs/idea/COMPETITOR_ANALYSIS.md` exists, zero `[TBD]`
- `docs/idea/VALUE_PROPOSITION.md` exists, zero `[TBD]`
- All documents user-approved
- Rule: generate 1 doc at a time; batch generation prohibited

### Gate 2 -> 3: Product Complete

- `docs/requirements/SSOT-0_PRD.md` exists, user-approved
- `docs/requirements/SSOT-1_FEATURE_CATALOG.md` exists, P0 list approved
- All P0 feature SSOTs exist in `docs/design/features/`
- Each SSOT frozen to Freeze 2 (CONTRACT layer)
- Each SSOT user-approved
- Each SSOT: sections 3-E/F/G/H fully populated (zero empty sections)
- Each SSOT: completeness checklist all checked
- Rule: each feature SSOT requires per-feature hearing via `11_FEATURE_SPEC_FLOW.md`; batch generation prohibited

### Gate 3 -> 4: Technical Complete

- `docs/standards/TECH_STACK.md` exists, user-approved
- `docs/design/core/SSOT-3_API_CONTRACT.md` exists, user-approved
- `docs/design/core/SSOT-4_DATA_MODEL.md` exists, user-approved
- `docs/design/core/SSOT-5_CROSS_CUTTING.md` exists, user-approved
- `CLAUDE.md` has all `{{}}` replaced with actual values

---

## Freeze Progression

```
Freeze 1: Domain/Scope    -> feature outline confirmed
Freeze 2: UI/API/Event    -> contracts confirmed, implementation can start
Freeze 3: Error/Perm/Log  -> testing and audit possible
Freeze 4: Non-functional  -> release-ready
```

### Freeze 1: Domain/Scope (CORE layer)

**Sections**: 2.1 Purpose, 2.2 Scope, 2.3 User Stories, 2.4 Main User Flow, Terms, Permissions

**Criteria**: Function describable in 1 sentence; scope boundaries explicit; user stories concrete; user confirmed

### Freeze 2: UI/API/Event (CONTRACT layer)

**Sections**: 4.1 Data Items, 5 API Spec, 6.1 Screen List, 6.4 State Transitions, 3 Functional Reqs (MUST), 3-H Acceptance Tests (Gherkin)

**Criteria**: API contracts typed; screen transitions defined; all MUST requirements have test cases; Gherkin scenarios exist

**GATE**: 3-H empty = Freeze 2 incomplete = implementation blocked

### Freeze 3: Error/Permission/Log (DETAIL layer)

**Sections**: 7 Business Rules (exceptions), 9 Error Handling, 3-E I/O Examples (5+), 3-F Boundary Values, 3-G Exception Responses, 4.2 Validation Rules

**Criteria**: All exceptions enumerated with error codes; boundary values for all items; validation rules concrete

**GATE**: 3-E/F/G any empty = Freeze 3 incomplete = testing/audit blocked

### Freeze 4: Non-functional (DETAIL layer)

**Sections**: 8 Non-functional Reqs, 11 Dependencies, 4.3 Data Lifecycle, Final UI copy

**Criteria**: Performance targets numeric; security requirements specific; dependencies explicit; SSOT audit >= 95 points

### Freeze-to-Chain Mapping

```
Step 0: Discovery
Step 1: Business
Step 2: Product  -> Freeze 1 (outline) -> Freeze 2 (contracts, impl starts)
Step 3: Technical -> Freeze 3 (test/audit) -> Freeze 4 (release-ready)
Step 4: Dev Start
```

Implementation may start at Freeze 2. Freeze 3-4 can proceed in parallel with implementation.

### Freeze Status Display (SSOT header)

```
> Freeze: [F1] Domain OK | [F2] Contract OK | [F3] Exception -- | [F4] NFR --
> Implementation: Yes (Freeze 2 complete)
```

---

## Step 0: Discovery

> Ref: `08_DISCOVERY_FLOW.md` | Skill: `framework-discovery`

| Item | Detail |
|------|--------|
| Tool | Claude.ai (Skill recommended) |
| Time | 30-60 min |
| Input | User's idea + `docs/knowledge/` (if exists) |
| Output | Stage 1-5 responses + overall summary |
| Done when | User confirms summary with "OK" |
| Passes to next | Overall summary text + knowledge data summary |

Pre-check: load `docs/knowledge/` before starting hearing if it exists.

---

## Step 1: Business (Who/What/Why)

> Skill: `framework-business` | Review: `framework-review-council`

### Dependency Chain

```
1-A. IDEA_CANVAS      <-- Discovery answers + knowledge/
  |-> 1-B. USER_PERSONA     <-- Q2-1, Q2-2 + knowledge/users/
  |-> 1-C. COMPETITOR_ANALYSIS <-- Q1-4, Q4-1 + knowledge/market/
  |-> 1-D. VALUE_PROPOSITION  <-- 1-A + 1-B + 1-C + knowledge/domain/
```

### 1-A. IDEA_CANVAS

| Item | Detail |
|------|--------|
| Template | `templates/idea/IDEA_CANVAS.md` |
| Input | Step 0 summary |
| Target | 90% complete |

**Populate**: Elevator Pitch, Problems (from Q2), Solution (from Q3), Target Users (from Q2-1), Differentiation (from Q4-2), Business Model (from Q5), Market Size, Success Criteria (from Q5-3). AI proposes Risks (3-5 items).

**Done**: Elevator Pitch clear in 1-2 sentences; problems described with concrete scenes; MVP features 3-5; business model present; user confirmed.

### 1-B. USER_PERSONA

| Item | Detail |
|------|--------|
| Template | `templates/idea/USER_PERSONA.md` |
| Input | 1-A + Discovery Q2 |
| Target | 70% complete |

**Create**: 1 primary persona (detailed), 1 secondary persona (overview), 1 anti-persona. Primary needs 5+ pains, purchase behavior, marketing implications.

**Done**: Primary persona feels real; pains align with IDEA_CANVAS; marketing implications present; user confirmed.

### 1-C. COMPETITOR_ANALYSIS

| Item | Detail |
|------|--------|
| Template | `templates/idea/COMPETITOR_ANALYSIS.md` |
| Input | 1-A + Discovery Q1-4, Q4-1, Q4-2 |
| Target | 60% complete |

**Create**: 2-3 direct competitors (detailed), 2-3 indirect/alternatives, feature comparison matrix, differentiation summary, positioning map.

**Done**: 2+ direct competitors analyzed; feature matrix exists; differentiation clear; user checked for missing competitors.

### 1-D. VALUE_PROPOSITION

| Item | Detail |
|------|--------|
| Template | `templates/idea/VALUE_PROPOSITION.md` |
| Input | 1-A + 1-B + 1-C |
| Target | 80% complete |

**Create**: Customer Profile, Value Map (1:1 pain-to-relief mapping), Fit Analysis, Value Proposition Statement (1 sentence). Differentiate from competitors.

**Done**: Statement clear in 1 sentence; Pains and Pain Relievers 1:1; Fit score calculated; user convinced.

### Step 1 Completion

All 4 documents confirmed. Go/No-Go: Problem real? Solution valid? Differentiable? Business viable? All Yes -> Step 2.

---

## Step 2: Product (What/How)

> Skill: `framework-product` -> `framework-feature-spec` | Review: `framework-review-council`

### Dependency Chain

```
2-A. PRD (SSOT-0)       <-- Step 1 all
  |-> 2-B. FEATURE_CATALOG (SSOT-1)
  |     |-> 2-C. UI_STATE (SSOT-2)
  |     |-> 2-D. Feature SSOTs (per-feature hearing)
  |-> 2-E. Marketing docs (LP_SPEC etc., if applicable)
```

### 2-A. PRD (SSOT-0)

| Item | Detail |
|------|--------|
| Template | `ssot/SSOT-0_PRD.md` |
| Input | Step 1 all documents |
| Target | 90% complete |

**Decide**: Product Vision (1 sentence), Problems (from VALUE_PROP), Target Users (from PERSONA), MVP Feature List (P0/P1/P2, 3-5 P0 features), Success Metrics (quantitative KPIs), Out of Scope, Assumptions/Constraints.

**Done**: MVP 3-5 features; each justified for MVP; metrics quantitative; scope-out explicit; user confirmed all.

### 2-B. FEATURE_CATALOG (SSOT-1)

| Item | Detail |
|------|--------|
| Template | `ssot/SSOT-1_FEATURE_CATALOG.md` |
| Input | 2-A |
| Target | 90% complete |

**Per feature**: Feature ID (e.g., AUTH-001), Name, Summary, Priority (P0/P1/P2), Type (common/project-specific), Dependencies, Estimated Size (S/M/L).

**Common feature criteria** (3+ Yes = common): reusable? industry-standard pattern? low custom logic? achievable with library?

**Done**: All MVP features have IDs; common/specific classified; dependencies organized; implementation order determined.

### 2-C. UI_STATE (SSOT-2)

| Item | Detail |
|------|--------|
| Template | `core/SSOT-2_UI_STATE.md` |
| Input | 2-A + 2-B + Discovery Q3-4 |
| Target | 80% complete |

**Create**: Screen list, Screen transition diagram (Mermaid), Main elements/states per screen, Global state management. Minimize path to value experience.

**Done**: All screens listed; Mermaid transition diagram; main elements per screen defined; flow feels natural.

### 2-D. Feature SSOTs (per-feature hearing)

| Item | Detail |
|------|--------|
| Template | `common-features/` or `project-features/_TEMPLATE.md` |
| Input | 2-A + 2-B + 2-C + user dialogue |
| Ref | `11_FEATURE_SPEC_FLOW.md` |
| Target | 90% complete (user-confirmed, not AI-guessed) |

**Process per P0 feature**:
```
Phase 1: Common questions (purpose, use cases, MVP scope)
Phase 2: Type-specific questions (auth/CRUD/display/...)
Phase 3: UI confirmation (wireframe -> confirm)
Phase 4: Spec finalization (full summary -> user final confirm)
Phase 5: SSOT generation
  - Feature spec (new)
  - SSOT-2 UI definition (append)
  - SSOT-3 API definition (append)
  - SSOT-4 DB definition (append)
  - Test cases
-> Next feature
```

**Batch generation of feature SSOTs without per-feature hearing is strictly prohibited.**

**Done per feature**: User story clear; all business rules listed; UI confirmed; data items and permissions set; test cases exist; user confirmed summary.

### 2-E. Marketing Docs (if applicable)

| Item | Detail |
|------|--------|
| Template | `templates/marketing/` |
| Input | Step 1 all + 2-A |
| Target | 60% complete |

Only when marketing intent exists. Follow `07_MARKETING_FRAMEWORK.md` principles (PASONA structure, emotional triggers, USP headline, risk reversal, concrete CTA).

### Step 2 Completion

PRD 90%; FEATURE_CATALOG all IDs assigned; UI_STATE with screen list and transitions; all MVP feature SSOTs generated. "What to build" is unambiguous.

---

## Step 3: Technical (How to Build)

> Skill: `framework-technical` | Review: `framework-review-council`

### Dependency Chain

```
3-A. TECH_STACK        <-- Q5-5, Q5-6 + PRD
  |-> 3-B. API_CONTRACT (SSOT-3)  <-- feature SSOTs
  |-> 3-C. DATA_MODEL (SSOT-4)    <-- feature SSOTs + 3-B
  |-> 3-D. CROSS_CUTTING (SSOT-5) <-- 3-A + 3-B
  |-> 3-E. Standards (CODING, GIT, TESTING, DEV_ENV) <-- 3-A

3-F. Project Scaffold   <-- 3-A through 3-E
```

### 3-A. TECH_STACK

| Item | Detail |
|------|--------|
| Tool | Claude.ai |
| Template | `templates/TECH_STACK.md` |
| Input | Discovery Q5-5/Q5-6 + PRD |
| Target | 95% complete |

**Selection criteria**: skill-level fit, MVP speed, AI coding compatibility, scalability, cost efficiency.

**Skill-level defaults**: Pro -> respect preferences; Mid -> Next.js + Supabase + Vercel; Beginner -> same + AI-heavy; None -> no-code or full AI.

**Done**: Framework, language, DB, auth, hosting, CSS, testing all decided with rationale; user agreed.

### 3-B. API_CONTRACT (SSOT-3)

| Tool | Claude Code | Template | `core/SSOT-3_API_CONTRACT.md` | Target | 85% |

**Include**: All endpoints, request/response types, auth requirements, error response format, pagination conventions, rate limiting policy. Promote "tentative API" from feature SSOTs to formal design.

### 3-C. DATA_MODEL (SSOT-4)

| Tool | Claude Code | Template | `core/SSOT-4_DATA_MODEL.md` | Target | 85% |

**Include**: All table definitions (columns, types, constraints), ER diagram (Mermaid), index design, migration strategy.

### 3-D. CROSS_CUTTING (SSOT-5)

| Tool | Claude Code | Template | `core/SSOT-5_CROSS_CUTTING.md` | Target | 85% |

**Include**: Auth/authz (session, JWT/Cookie), error handling (front/back unified), logging (level, format, destination), validation conventions, security (CORS, CSP, sanitization). Tech-stack-specific.

### 3-E. Standards

| Tool | Claude Code | Templates | `templates/` | Target | 90% |

Generate 4 docs adapted to tech stack:
1. `CODING_STANDARDS.md`
2. `GIT_WORKFLOW.md`
3. `TESTING_STANDARDS.md`
4. `DEV_ENVIRONMENT.md`

### 3-F. Project Scaffold

| Tool | Claude Code |

1. Initialize project per TECH_STACK
2. Copy `templates/project/CLAUDE.md` -> project root, replace `{{}}`
3. Set up dev environment per DEV_ENVIRONMENT
4. Generate DB migration files per DATA_MODEL
5. Create directory structure

### Step 3 Completion

TECH_STACK decided with rationale; API_CONTRACT all endpoints defined; DATA_MODEL all tables + ER diagram; CROSS_CUTTING auth/error/logging defined; 4 standards adapted; CLAUDE.md fully populated; `npm run dev` works.

---

## Step 3.5: Task Decomposition and Planning

> **Mandatory before Step 4. Skipping this step to start implementation is prohibited.**
> Ref: `14_IMPLEMENTATION_ORDER.md`

### 3.5-A: Dev Environment Verification (Layer 0)

```
[ ] docker-compose.yml exists, DB/Redis containers start
[ ] .env.example exists with required env vars
[ ] pnpm install -> pnpm db:migrate -> pnpm dev succeeds
[ ] .github/workflows/ci.yml placed
[ ] CI green (lint + type-check + test pass)
```

If incomplete -> build Layer 0 infrastructure first.

### 3.5-B: Implementation Order

1. Analyze all SSOTs: section 1 (priority/size) and section 11 (dependencies)
2. Build dependency graph (detect/resolve cycles)
3. Topological sort into Waves:
   - Wave 1: no dependencies (common features only)
   - Wave 2: depends on Wave 1
   - Wave 3: depends on Wave 2
4. Tiebreak within Wave: Priority -> dependency count -> Size -> ID
5. Vertical Slice release plan

### 3.5-C: Task Decomposition (SSOT -> GitHub Issues)

**Standard task pattern per feature**:
```
Task 1: DB  (migration, seed, index)         <- section 4
Task 2: API (endpoints, validation, errors)  <- section 5, 7, 9
Task 3: UI  (screens, state, flow)           <- section 6
Task 4: Integration (API+UI, E2E)            <- section 5+6
Task 5: Tests                                <- section 10
Task 6: Review + doc update
```

**GitHub Projects board**: Backlog -> Todo -> In Progress -> In Review -> Done

**Parent Issue format**:
```
[Feature/FEATURE-ID] Feature Name
  - [ ] DB: migration + seed
  - [ ] API: endpoint implementation
  - [ ] UI: screen implementation
  - [ ] Integration: E2E connection
  - [ ] Tests: unit + integration
  - [ ] Review: code review + SSOT consistency check
```

### 3.5-D: Branch Strategy

```
main                         -> always deployable (no direct commits)
feature/[ID]-[layer]         -> feature work (e.g., feature/AUTH-001-api)
fix/[ID]-[description]       -> bug fixes
hotfix/[description]         -> emergency fixes
```

Commit convention: Conventional Commits (`feat(AUTH-001): ...`, `fix(AUTH-001): ...`)

### Step 3.5 Completion (GATE)

```
[ ] Dev environment running, CI green (Gate A)
[ ] Wave classification complete (all features have Wave number)
[ ] GitHub Projects board exists
[ ] All P0 feature parent Issues created
[ ] Branch strategy confirmed with user
```

All checked -> Step 4. Any unchecked -> blocked.

---

## Step 4: Development Start

> Skill: `framework-implement` + `framework-code-audit` + `framework-ssot-audit`
> **Prerequisite: Step 3.5 all conditions checked.**

### 4.1 Implementation Order

**Phase 1: Common Features (by Layer)**
- Layer 1: Auth (AUTH) -- nearly all features depend on this
- Layer 2: Common UI (layout, components)
- Layer 3: Other common features

**Phase 2: Project-specific Features (by Wave)**
- Wave 1 -> Wave 2 -> Wave 3 -> ...

Move GitHub Issue to "In Progress" before starting each feature.

### 4.2 Development Cycle (per feature)

```
0. Create feature/[ID]-[layer] branch
1. DB implementation   -> commit -> PR
2. API implementation  -> commit -> PR
3. UI implementation   -> commit -> PR
4. Integration         -> commit -> PR
5. Test generation
6. Adversarial Review (Agent Teams, ref: 17_CODE_AUDIT.md)
   -> iterate until pass
7. PR review -> merge to main
8. Move GitHub Issue to "Done"
```

**Prohibited**: direct commits to main; merge without PR; merge without tests.

---

## Step R: Retrofit (Existing Project Onboarding)

### Purpose

Migrate an existing project (code exists, no SSOTs) under framework management.

```
Input:  existing repo (src/, package.json, maybe README)
Output: docs/ with full SSOT suite + CLAUDE.md
```

### Retrofit Flow

| Step | Action | Output |
|------|--------|--------|
| R-1 | Code scan (structure, tech, entities, APIs, auth, tests) | Scan report |
| R-2 | Read existing docs (README, Wiki, comments, types) | Extracted info |
| R-3 | Gap analysis (framework requirements vs current state) | Gap report -> user |
| R-4 | Reverse-generate SSOTs from code, confirm with user | SSOT drafts |
| R-5 | Generate CLAUDE.md from template | CLAUDE.md |
| R-6 | Place SSOTs in docs/, set up CI/PR templates | Migration complete |

**R-4 caution**: Code implementation is not necessarily the "correct" spec. Confirm with user: "Is this behavior intentional?"

### Retrofit vs New Project

| | New (Step 0-3) | Retrofit (Step R) |
|---|---|---|
| Direction | Spec -> Code | Code -> Spec |
| Result | Same: full SSOT suite |
| After | Same: Step 4 development flow |

---

## Timeline Estimate

| Step | Duration | Activity |
|------|----------|----------|
| Step 0 | 30-60 min | Discovery dialogue |
| Step 1 | 2-4 hours | Business docs (4 documents) |
| Step 2 | 3-6 hours | Product design docs |
| Step 3 | 2-4 hours | Technical design + scaffold |
| **Total** | **1-2 days** | **Idea to dev start** |

Add 1-2 weeks if user validation (interviews, etc.) is included.

---

## Template Mappings

### Step 1 Templates

| Document | Template Path |
|----------|--------------|
| IDEA_CANVAS | `templates/idea/IDEA_CANVAS.md` |
| USER_PERSONA | `templates/idea/USER_PERSONA.md` |
| COMPETITOR_ANALYSIS | `templates/idea/COMPETITOR_ANALYSIS.md` |
| VALUE_PROPOSITION | `templates/idea/VALUE_PROPOSITION.md` |

### Step 2 Templates

| Document | Template Path |
|----------|--------------|
| PRD (SSOT-0) | `ssot/SSOT-0_PRD.md` |
| FEATURE_CATALOG (SSOT-1) | `ssot/SSOT-1_FEATURE_CATALOG.md` |
| UI_STATE (SSOT-2) | `core/SSOT-2_UI_STATE.md` |
| Feature SSOTs (common) | `common-features/` |
| Feature SSOTs (project) | `project-features/_TEMPLATE.md` |
| LP_SPEC | `templates/marketing/` |

### Step 3 Templates

| Document | Template Path |
|----------|--------------|
| TECH_STACK | `templates/TECH_STACK.md` |
| API_CONTRACT (SSOT-3) | `core/SSOT-3_API_CONTRACT.md` |
| DATA_MODEL (SSOT-4) | `core/SSOT-4_DATA_MODEL.md` |
| CROSS_CUTTING (SSOT-5) | `core/SSOT-5_CROSS_CUTTING.md` |
| CODING_STANDARDS | `templates/CODING_STANDARDS.md` |
| GIT_WORKFLOW | `templates/GIT_WORKFLOW.md` |
| TESTING_STANDARDS | `templates/TESTING_STANDARDS.md` |
| DEV_ENVIRONMENT | `templates/DEV_ENVIRONMENT.md` |
| CLAUDE.md | `templates/project/CLAUDE.md` |

### Output Locations

| Document | Output Path |
|----------|------------|
| IDEA_CANVAS | `docs/idea/IDEA_CANVAS.md` |
| USER_PERSONA | `docs/idea/USER_PERSONA.md` |
| COMPETITOR_ANALYSIS | `docs/idea/COMPETITOR_ANALYSIS.md` |
| VALUE_PROPOSITION | `docs/idea/VALUE_PROPOSITION.md` |
| PRD (SSOT-0) | `docs/requirements/SSOT-0_PRD.md` |
| FEATURE_CATALOG (SSOT-1) | `docs/requirements/SSOT-1_FEATURE_CATALOG.md` |
| UI_STATE (SSOT-2) | `docs/design/core/SSOT-2_UI_STATE.md` |
| Feature SSOTs | `docs/design/features/` |
| TECH_STACK | `docs/standards/TECH_STACK.md` |
| API_CONTRACT (SSOT-3) | `docs/design/core/SSOT-3_API_CONTRACT.md` |
| DATA_MODEL (SSOT-4) | `docs/design/core/SSOT-4_DATA_MODEL.md` |
| CROSS_CUTTING (SSOT-5) | `docs/design/core/SSOT-5_CROSS_CUTTING.md` |
| Standards (4 docs) | `docs/standards/` |
| CLAUDE.md | project root |
