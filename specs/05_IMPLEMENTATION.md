# 05_IMPLEMENTATION.md - Implementation Order, Task Decomposition & Workflow

> Consolidated from: `14_IMPLEMENTATION_ORDER.md`
>
> Covers: dependency-based implementation ordering, SSOT-to-task decomposition,
> GitHub Projects/Issues management, branch strategy, and end-to-end dev workflow.

---

## Principle

```
SSOT = single source of truth per feature.
Task = a work unit that implements a specific SSOT section.

Tasks REFERENCE the SSOT. No task-specific SSOTs are created.

  SSOT (e.g. Login)
  |- S4 Data Spec     <- Task 1 (DB)
  |- S5 API Spec      <- Task 2 (API)
  |- S6 UI Spec       <- Task 3 (UI)
  |- S7 Business Rules <- Task 2, 3
  |- S10 Test Cases   <- Task 5 (Test)
```

---

## Part 1: Determining Implementation Order

### 1.1 Priority Definitions (P0 / P1 / P2)

| Priority | Criteria | Examples |
|----------|----------|---------|
| **P0** (Must) | Product cannot function without it. MVP-required. No alternative. | Login, core search, primary analysis |
| **P1** (Should) | Significantly improves UX or directly supports business goals. | Favorites, history, push notifications |
| **P2** (Nice) | Everything else. Product works without it. | Theme customization, export, advanced analytics |

```
Decision flow:
  Product viable without it? -- No  --> P0
                              -- Yes --> Major UX impact? -- Yes --> P1
                                                          -- No  --> P2
```

### 1.2 Size Estimates (S / M / L / XL)

| Size | Duration | Requirements | Screens | Endpoints |
|------|----------|-------------|---------|-----------|
| S | 1-2 days | <=5 | 1 | 1-2 |
| M | 3-5 days | 6-12 | 1-2 | 3-5 |
| L | 6-10 days | 13-20 | 3-5 | 6-10 (+ external APIs) |
| XL | 11+ days | 21+ | 6+ | 11+ (consider splitting) |

### 1.3 Phase 1: Common Features (Foundation)

```
Layer 0: Infrastructure
  - Repo + branch strategy
  - CI/CD pipeline
  - DB migration tooling
  - Deploy infrastructure (staging/prod)
  - Dev environment setup script
      |
Layer 1: Auth
  - AUTH-001 Login, ACCT-001 Signup, AUTH-005 Logout, Email verification
  - Almost all features depend on auth -> highest priority
      |
Layer 2: Shared UI
  - Layout shell (header, sidebar, footer)
  - Shared component library
  - Error / loading / empty states
      |
Layer 3: Other shared features (as needed)
  - Notification, file upload, payment infrastructure
  - Order by: count of dependent features (most depended-on first)
  - Tie-break: prioritize what Wave 1 features need
```

### 1.4 Phase 2: Feature Implementation (Dependency-Based)

```
Step 1: Build dependency graph
  All SSOTs S11 (dependencies) -> directed graph
  Node = feature ID, Edge = A->B means "A depends on B"

Step 2: Detect & resolve circular dependencies
  - Identify the weakest dependency in the cycle
  - Break it: implement with stub, add integration task later
  - If unresolvable -> escalate as T7 (21_AI_ESCALATION.md)

Step 3: Topological sort -> Wave classification
  Wave 1: Zero dependencies (only depends on common features)
  Wave 2: Depends on Wave 1 features
  Wave 3: Depends on Wave 2 features
  ...

Step 4: Tie-break within same Wave (in order):
  1. Priority: P0 > P1 > P2
  2. Dependents count (direct only): more dependents first
  3. Size: S > M > L > XL (smaller first to unblock sooner)
  4. Feature ID ascending (mechanical tie-break)

Step 5: Identify parallel opportunities
  Same-Wave features can be built in parallel,
  UNLESS they modify the same DB table (then sequence them).
```

### 1.5 Output Format

```
Phase 1: Common Features
  Layer 0: [infra tasks]
  Layer 1: [auth features]
  Layer 2: [shared UI]
  Layer 3: [other shared (by dependent count)]

Phase 2: Project Features
  Wave 1: [features with rank]
  Wave 2: [features with rank]
  Wave 3: [features with rank]

Dependency Graph (Mermaid): [graph]
Circular Dependencies (if any): [details + resolution]
```

---

## Part 1.5: Vertical Slices

### Concept

```
Instead of horizontal layers (all DB -> all API -> all UI),
slice vertically by user value:

  1 slice = 1 user value delivered end-to-end (DB -> API -> UI -> Test)
  1 slice = 2-5 days, demo-ready, feedback-ready, independently releasable
```

### Good vs Bad Slices

| Good | Bad |
|------|-----|
| "User can find a shop and book" | "Implement all DB layer" (horizontal) |
| Demoable, independently releasable | "Auth feature" (too large) |
| Clear user value statement | "API validation" (no standalone value) |

### Slice Decision Process

```
1. Map user journey: discover -> signup -> core action -> confirm -> repeat -> refer
2. Segment by "User can now ___" boundaries
3. Minimize features per slice (MVP set only)
4. Map slices to Waves (Slice 1 -> Wave 1, etc.)
```

### Slice Execution Cycle

```
Per slice:
  1. Freeze 1-2 (CORE/CONTRACT specs confirmed)
  2. Implement (DB -> API -> UI -> integration); Freeze 3-4 in parallel
  3. Audit (code + test; SSOT audit after Freeze 4)
  4. Verify (demoable? user feedback?)
  5. Next slice
```

---

## Part 2: SSOT to Task Decomposition

### Standard Decomposition (1 SSOT -> 5-8 Tasks)

```
SSOT [FEAT-XXX]
  |
  +-- Task 1: DB (Data Layer)
  |   Ref: S4 Data Spec
  |   Work: migrations, seeds, indexes
  |
  +-- Task 2: API (Server Layer)
  |   Ref: S5 API Spec + S7 Business Rules + S9 Errors
  |   Work: endpoints, validation, error handling
  |
  +-- Task 3: UI (Presentation Layer)
  |   Ref: S6 UI Spec
  |   Work: screens, state management, interaction flows
  |
  +-- Task 4: Integration (API + UI)
  |   Ref: S5 + S6
  |   Work: frontend-backend connection, E2E flow verification
  |
  +-- Task 5: Test
  |   Ref: S10 Test Cases
  |   Work: unit, integration, E2E tests
  |
  +-- Task 6: Review + Doc Update
      Ref: entire SSOT
      Work: code review, SSOT-implementation gap check
```

### Granularity

```
1 task = 1-3 days of work for one person

Too large -> split into sub-tasks:
  Task 2-a: CRUD endpoints
  Task 2-b: Business rules
  Task 2-c: Error handling

Too small -> merge into adjacent task:
  If Task 1 is just one CREATE TABLE -> merge into Task 2
```

### Task Definition Format

```markdown
## [Task ID] [Task Name]

### Summary
[1-2 sentences: what this task implements]

### SSOT Reference
- Feature: [FEAT-XXX]
- Sections: SX, SY

### Definition of Done
- [ ] [Specific condition 1]
- [ ] [Specific condition 2]
- [ ] Code review passed
- [ ] All relevant tests pass

### Dependencies
- Blocked by: [predecessor task ID]
- Blocks: [successor task ID]

### Estimate
- Size: S / M / L
- Duration: X days
```

---

## Part 3: GitHub Projects & Issues

### Board Structure

```
GitHub Project Board
  |
  +-- View: Board (Kanban)
  |   Columns: Backlog -> Todo -> In Progress -> In Review -> Done
  |
  +-- View: Table
  |   Fields: Phase, Wave, Priority, Size, Feature ID
  |
  +-- Iterations:
      - Layer 0: Infrastructure
      - Layer 1: Auth
      - Wave 1: [features]
      - Wave 2: [features]
      - Wave 3: [features]
```

### Issue Hierarchy

```
Per feature:
  Parent Issue: [FEAT-XXX] Feature Name
    +-- Tasklist: [FEAT-XXX-DB]     DB implementation
    +-- Tasklist: [FEAT-XXX-API]    API implementation
    +-- Tasklist: [FEAT-XXX-UI]     UI implementation
    +-- Tasklist: [FEAT-XXX-INT]    Integration
    +-- Tasklist: [FEAT-XXX-TEST]   Test
    +-- Tasklist: [FEAT-XXX-REVIEW] Review
```

### Issue Template (Example: DB Task)

```markdown
## [FEAT-XXX-DB] [Feature Name] - DB Implementation

### SSOT Reference
  docs/design/features/[common|project]/FEAT-XXX_[name].md
  Section: S4 Data Spec

### Summary
[Summary of S4]

### Definition of Done
- [ ] Migration file created
- [ ] Table definition matches SSOT S4 exactly
- [ ] Indexes configured
- [ ] Seed data (if needed)
- [ ] Migration tested in dev
- [ ] Code review passed

### Branch
`feature/FEAT-XXX-db`

### Dependencies
- Blocked by: (none or predecessor)
- Blocks: FEAT-XXX-API

### Labels
`feature` `database` `FEAT-XXX` `wave-1`
```

### Status Flow

```
Backlog -> Todo -> In Progress -> In Review -> Done
                       |              |
                       |              +-- PR created -> auto-update Project
                       |
                       +-- Claude Code Web: async execution -> auto PR -> In Review
```

---

## Part 4: Branch Strategy & Git Workflow

### Branch Naming (GitHub Flow)

```
main                              <- always deployable, no direct commits
  |
  +-- feature/FEAT-XXX-db         <- DB layer     -> PR to main
  +-- feature/FEAT-XXX-api        <- API layer    -> PR to main
  +-- feature/FEAT-XXX-ui         <- UI layer     -> PR to main
  +-- feature/FEAT-XXX-integration <- Integration -> PR to main
  +-- fix/FEAT-XXX-[description]  <- Bug fix      -> PR to main
  +-- hotfix/[description]        <- Urgent fix   -> PR to main

Naming convention:
  feature/[feature-id]-[layer]     e.g. feature/FEAT-001-api
  fix/[feature-id]-[description]   e.g. fix/FEAT-001-validation-error
  hotfix/[description]             e.g. hotfix/auth-session-expire
```

### Commit Messages (Conventional Commits)

```
feat(FEAT-XXX): [description]      <- new feature
fix(FEAT-XXX): [description]       <- bug fix
refactor(FEAT-XXX): [description]  <- refactoring
test(FEAT-XXX): [description]      <- test addition
docs(FEAT-XXX): [description]      <- documentation
chore: [description]               <- build/config
```

### PR Template

```markdown
## Summary
<!-- What was implemented/fixed -->

## SSOT Reference
- Feature: FEAT-XXX
- Sections: SX
- Path: docs/design/features/xxx/FEAT-XXX_name.md

## Changes
- [ ] Change 1
- [ ] Change 2

## SSOT Compliance
- [ ] All MUST requirements from S3 satisfied
- [ ] S4 data spec matches implementation
- [ ] S5 API spec matches implementation
- [ ] S7 business rules correctly implemented
- [ ] S10 test cases all implemented

## Testing
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] All existing tests pass

## Related Issue
Closes #XXX
```

### CI/CD Pipeline

```
On PR:
  1. Lint (ESLint / Prettier)
  2. Type check (TypeScript)
  3. Unit tests
  4. Integration tests
  5. Build verification
  6. (Optional) Staging deploy + E2E

On merge to main:
  1. Auto-deploy to staging
  2. E2E tests
  3. (Manual approval) Production deploy
```

---

## Part 5: End-to-End Feature Flow

```
SSOT complete (audit >= 95)
    |
    v
(1) Task decomposition [Claude Code]
    Generate DB/API/UI/Integration/Test/Review tasks + Issue bodies
    |
(2) Create Issues [GitHub Projects]
    Parent Issue with Tasklist items, labels, iteration assignment
    |
(3) DB implementation
    Branch: feature/FEAT-XXX-db
    Ref: S4 -> migrate, seed, index
    PR -> CI -> review -> merge -> mark Done
    |
(4) API implementation
    Branch: feature/FEAT-XXX-api
    Ref: S5 + S7 -> endpoints, validation, error handling
    PR -> CI -> review -> merge -> mark Done
    |
(5) UI implementation
    Branch: feature/FEAT-XXX-ui
    Ref: S6 -> screens, state, flows
    PR -> CI -> review -> merge -> mark Done
    |
(6) Integration
    Branch: feature/FEAT-XXX-integration
    Connect frontend <-> backend, verify E2E flow
    PR -> CI -> review -> merge -> mark Done
    |
(7) Test
    Branch: feature/FEAT-XXX-test
    Ref: S10 -> unit, integration, E2E
    PR -> CI -> review -> merge -> mark Done
    |
(8) Final review
    Verify all MUST requirements from S3
    Parent Issue -> Done

    -> Next feature
```

---

## Part 6: Parallel Development (Teams)

### Parallel Development Map

```
           Wk 1        Wk 2          Wk 3           Wk 4
Dev A:   AUTH-001  -> FEAT-001-DB -> FEAT-001-API -> FEAT-001-UI
Dev B:   ACCT-001  -> FEAT-002-DB -> FEAT-002-API -> FEAT-002-UI
Dev C:   Shared UI -> FEAT-001-TEST-> FEAT-002-TEST-> Integration

Rules:
- Same feature: DB -> API -> UI order is mandatory
- Different features: same layer can be parallel
- Integration task: only after all DB/API/UI of that feature are done
```

### CODEOWNERS

```
# Common features
/src/features/auth/        @auth-owner
/src/features/account/     @auth-owner

# Project features
/src/features/xxx/         @feature-owner-a

# SSOT (spec changes require lead review)
/docs/design/core/         @tech-lead
/docs/standards/           @tech-lead
```

---

## Repo Structure Reference

```
my-project/
+-- .github/
|   +-- workflows/
|   |   +-- ci.yml
|   |   +-- cd-staging.yml
|   |   +-- cd-production.yml
|   +-- ISSUE_TEMPLATE/
|   |   +-- feature-db.md
|   |   +-- feature-api.md
|   |   +-- feature-ui.md
|   |   +-- feature-test.md
|   |   +-- bug.md
|   +-- PULL_REQUEST_TEMPLATE.md
|
+-- CLAUDE.md
+-- docs/   (SSOT)
+-- src/
```
