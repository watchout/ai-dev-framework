# 04_FEATURE_SPEC.md - Feature Spec Creation Flow

> Consolidates: `11_FEATURE_SPEC_FLOW.md`
>
> Individual feature genre classification, parent/sub-task decomposition,
> AI-driven hearing, IEEE/ISO-compliant SSOT generation, and quality audit.
>
> Agent Skill: `framework-feature-spec` (Deliberation Protocol built-in)

---

## Overall Flow

```
  1. PRD + Feature Catalog complete
  2. Classify features: common vs project-specific
  3. Genre-group project-specific features
  4. Create parent tasks per genre
  5. Decompose into sub-tasks
  6. AI grasps parent task context (4 fixed questions)
  7. Exhaustive hearing (12-category checklist, recommendations required)
  7.5. Deliberation (Security x QA x Engineer review)
  8. Map to SSOT format (12 sections, IEEE/ISO)
  8.5. Example-driven mandatory sections (Gate: section 3-E/F/G/H)
  9. Cross-document consistency check
  10. SSOT audit (score >= 95/100)
  11. Parent task SSOT complete -> next parent task
```

---

## 2. Common vs Project-Specific Classification

| Criterion | Common | Project-Specific |
|-----------|--------|------------------|
| Reusable across projects | Yes | No |
| Industry-standard pattern exists | Yes | No |
| Custom business logic | Low | High |
| Achievable via external library | Yes | No |

**Rule: 3+ Yes = Common feature**

AI outputs: `| Feature ID | Name | Classification | Reason |`

---

## 3. Genre Grouping

Group project-specific features by:

1. **Shared data** -- features operating on the same entities
2. **User flow** -- features in the same interaction sequence
3. **External service** -- features depending on the same API/service
4. **Standalone** -- self-contained features become their own genre

Output per genre:
```
Genre A: [Name]
  Reason: [Why grouped]
  Features: FEAT-001, FEAT-002, ...
  Shared data: [Entities]
```

---

## 4. Parent Task Definition

```
Parent Task = 1 genre's SSOT completion

PT-XXX:
  Genre: [Name]
  Features: FEAT-001, FEAT-002, ...
  Shared data model: [Entities]
  External dependencies: [Services]
  Estimated hearing time: 60-90 min
  Deliverables: Feature specs x N, SSOT-2/3/4 additions
```

---

## 5. Sub-Task Decomposition

```
PT-001: [Genre Name]
  ST-001: [Feature] -- input/output/depends: none
  ST-002: [Feature] -- input/output/depends: ST-001
  ST-003: [Feature] -- input/output/depends: ST-002
```

Hearing order follows dependency graph (independent tasks first).

---

## 6. AI Context Grasp (4 Fixed Questions)

Before hearing, AI asks these 4 questions (one at a time):

```
PT-1: "Describe [genre] overall. What is the user's ultimate goal?"

PT-2: "Walk through the user's operation steps for this genre."

PT-3: "Which feature is most important? Which can be deferred?"

PT-4: "Any reference services? ('Like X's Y feature')"
```

After answers, AI presents a summary for confirmation:
- Genre purpose (1-2 sentences)
- User operation flow
- Sub-task dependency graph
- Priority ranking

---

## 7. Exhaustive Hearing (12-Category Checklist)

AI dynamically generates questions from relevant categories below:

### Data (D1-D5)
- D1: Data items, types, constraints
- D2: Data source (input / API / DB / computed)
- D3: Validation rules
- D4: Data volume & growth rate
- D5: Retention period & archiving

### Processing (P1-P7)
- P1: Step-by-step logic
- P2: Branch conditions
- P3: External service/API usage
- P4: Acceptable processing time
- P5: Sync vs async
- P6: Batch vs realtime
- P7: Retry & idempotency

### UI/UX (U1-U6)
- U1: Screen layout & composition
- U2: Operation flow (clicks, transitions)
- U3: Responsive support
- U4: Loading & progress indicators
- U5: Error UI treatment
- U6: Empty state display

### Auth & Security (S1-S4)
- S1: Access control (who can access)
- S2: Plan-based restrictions
- S3: Rate limiting
- S4: PII handling

### State Management (M1-M4)
- M1: State types (draft / processing / complete)
- M2: State transition rules
- M3: Suspend & resume
- M4: Concurrent operations

### Errors & Exceptions (E1-E4)
- E1: Invalid input behavior
- E2: External service failure behavior
- E3: Timeout behavior
- E4: Data inconsistency behavior

### Generation Rules
- Select only relevant categories (do not ask all)
- Every question MUST include a recommended pattern (marked with a star)
- Prefer multiple-choice format
- Always include an "leave it to you" option
- Max 15 questions per hearing round

### Recommendation Pattern (Required)

Every question must provide:

1. **Recommended pattern** -- with reasoning ("this is the common approach because...")
2. **Model case** -- real-world service implementation example
3. **Level-appropriate options** -- adjusted to user's technical level

Example:
```
"Cache AI analysis results?

 a) No cache (call API every time)
 b) Cache for identical images  [Recommended]
    Reason: Reduces API cost + faster response
    Model: Google Lens caches identical image results
 c) Persist all results permanently
 d) Leave it to you"
```

### Handling "Can't Answer"

| Response | Action |
|----------|--------|
| "I don't know" | Explain recommendation, ask "OK with recommended?" |
| "I don't understand the question" | Rephrase without jargon, use concrete example |
| "Can't decide yet" | Use recommended + mark as TBD in SSOT |

---

## 7.5. Deliberation (Multi-Perspective Review)

Three experts review hearing results before SSOT generation:

| Expert | Focus Areas |
|--------|-------------|
| Security Engineer | Auth/authz gaps, data leakage, input dangers, OWASP Top 10 |
| QA Engineer | Test coverage, boundary gaps, state transition inconsistencies, error case omissions |
| Frontend/Backend Engineer | Feasibility, performance concerns, API design, data normalization |

### Protocol

1. **Draft Review** -- 3 experts review hearing summary
2. **Challenge Round** -- each raises issues from their perspective; others rebut/supplement
3. **Integration** -- agreed issues listed with severity (Critical / Major / Minor)
4. **User Report** -- Critical/Major issues reported to user; confirm resolution before proceeding

---

## 8. SSOT Format (12 Sections)

Compliance: IEEE/ISO/IEC 29148:2018, IEEE 830, RFC 2119, ISO 25010

```
Section 1:  Document Info (ID, version, status, last updated)
Section 2:  Feature Overview (purpose, scope, user stories)
Section 3:  Functional Requirements (RFC 2119: MUST/SHOULD/MAY)
Section 4:  Data Specification (items, types, constraints, validation)
Section 5:  API Specification (endpoints, request/response types)
Section 6:  UI Specification (screen composition, state transitions, operation flow)
Section 7:  Business Rules (conditions, formulas, constraints)
Section 8:  Non-Functional Requirements (performance, security, availability)
Section 9:  Error Handling (error cases, recovery procedures)
Section 10: Test Cases (normal, abnormal, boundary values)
Section 11: Dependencies & Impact (other features, external services)
Section 12: Open Items & Constraints (TBD items, assumptions)
```

---

## 8.5. Example-Driven Mandatory Sections (Gate)

### Purpose

Structural enforcement to ensure section 3-E/F/G/H are always populated.
Without an explicit generation step, LLMs skip these sections.

### Generation Procedure

**Step 1: section 3-G Exception Response** (generate first)
- Extract all exception conditions from section 5 (API error responses) and section 9 (error handling)
- Organize into table format
- Check: 1:1 correspondence with section 9 error cases

**Step 2: section 3-F Boundary Values**
- For every input item in section 4 data spec, define 5 patterns:
  min / max / empty / NULL / invalid format
- Check: all items from section 4.1 data item list are covered

**Step 3: section 3-E I/O Examples**
- For each MUST requirement in section 3, create concrete I/O examples
- Minimum 5 cases (2 normal + 3 abnormal)
- Incorporate results from Steps 1 and 2 for abnormal/boundary cases
- Check: >= 5 cases with both normal and abnormal coverage

**Step 4: section 3-H Gherkin Tests**
- Write Gherkin Scenarios for every MUST requirement in section 3
- Convert Step 3 I/O examples into scenarios
- Check: every MUST requirement has a corresponding Scenario

### Gate Conditions (Required to Proceed to Step 9)

```
ALL must be satisfied:
  [ ] section 3-E: >= 5 I/O examples (>= 2 normal + >= 3 abnormal)
  [ ] section 3-F: Boundary values defined for ALL data items in section 4.1
  [ ] section 3-G: Exception responses defined for ALL error cases in section 9
  [ ] section 3-H: Gherkin Scenario exists for ALL MUST requirements in section 3

  Any unchecked -> do NOT proceed; fill gaps first.
```

### Report Format

```
  Example-Driven Section Completeness Check

  section 3-E I/O Examples:     [pass/fail] N cases (normal X + abnormal Y)
  section 3-F Boundary Values:  [pass/fail] N items x 5 patterns = M definitions
  section 3-G Exception Response:[pass/fail] N conditions -> N response definitions
  section 3-H Gherkin:          [pass/fail] N MUST requirements -> M Scenarios

  Verdict: [PASS -> proceed to step 9] / [FAIL -> fill gaps]
```

---

## 9. Cross-Document Consistency Check

Compare new SSOT against all existing documents:

| # | Target | Check |
|---|--------|-------|
| 1 | SSOT-0 PRD | Scope matches PRD definition; no conflict with success metrics |
| 2 | SSOT-1 Feature Catalog | ID/name match; priority match; dependency correctness |
| 3 | SSOT-2 UI/State | Screen definitions consistent; no conflicting state transitions |
| 4 | SSOT-3 API Contract | Naming convention compliance; no endpoint collision |
| 5 | SSOT-4 Data Model | Table/column naming consistent; no redundant definitions |
| 6 | SSOT-5 Cross-Cutting | Auth/authz rules followed; error handling unified; log format consistent |
| 7 | Same-genre SSOTs | Shared data model matches; sub-task I/O aligned |
| 8 | Other-genre SSOTs | No duplicate feature definitions; no shared resource conflicts |

Output: `| # | Type | Document | Location | Issue | Severity | Fix |`

Types: Contradiction / Duplication / Inconsistency / Omission
Severity: Critical / Major / Minor

**All Critical/Major must be resolved before proceeding to step 10.**

---

## 10. SSOT Audit

> Detail: `13_SSOT_AUDIT.md`

### Scoring (100 points)

| Category | Points | Criteria |
|----------|--------|----------|
| 1. Completeness | 15 | All sections populated |
| 2. Consistency | 15 | No internal contradictions |
| 3. Clarity | 10 | No ambiguous expressions |
| 4. Verifiability | 10 | Testable descriptions |
| 5. Traceability | 10 | PRD -> Feature -> Test traceable |
| 6. Feasibility | 10 | Technically implementable |
| 7. RFC 2119 Compliance | 10 | MUST/SHOULD/MAY used correctly |
| 8. Test Coverage | 10 | Normal/abnormal/boundary covered |
| 9. Cross-SSOT Consistency | 5 | Aligned with other SSOTs |
| 10. Document Quality | 5 | Format & readability |

### Pass Criteria

| Score | Result | Action |
|-------|--------|--------|
| >= 95 | Pass | SSOT complete |
| 90-94 | Conditional pass | Fix issues, re-audit |
| <= 89 | Fail | Rewrite affected sections |

**Absolute conditions** (regardless of score):
- Zero TBD items
- Zero Critical findings
- Zero Critical/Major from step 9 consistency check

---

## Timeline (Per Parent Task)

| Step | Duration | Content |
|------|----------|---------|
| 6. Context grasp | 10-15 min | Understand parent task |
| 7. Hearing | 30-60 min | Checklist + answers (all sub-tasks) |
| 8. SSOT creation | AI-generated | Map to format |
| 8.5. section 3-E/F/G/H | AI-generated | Example-driven sections (Gate) |
| 9. Consistency check | AI-executed | Cross-document verification |
| 10. Audit | AI-executed | Scoring + fixes |
| **Total** | **1-2 hours** | |
