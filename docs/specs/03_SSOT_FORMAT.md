# 03_SSOT_FORMAT.md - SSOT Format & Audit

> Consolidates: 12_SSOT_FORMAT.md (format definition) + 13_SSOT_AUDIT.md (quality audit)
> Standards: IEEE 29148:2018, IEEE 830, IEEE 1028:2008, RFC 2119, ISO/IEC 25010:2011, OpenAPI 3.0

---

## RFC 2119 Requirement Levels

```
MUST       Absolute requirement. Non-compliance = incomplete.
SHOULD     Strongly recommended. Omit only with justification (record in ADR).
MAY        Optional. If implemented, follow this spec.
MUST NOT   Absolute prohibition.
SHOULD NOT Avoid unless justified.
```

---

## SSOT 3-Layer Structure

```
+-------------------------------------------------------------------+
|  DETAIL (changes expected)                                        |
|  Validation details, UI labels, error messages, layout tweaks     |
|  -> Freely changeable. Decision Backlog tolerates open items.     |
+-------------------------------------------------------------------+
|  CONTRACT (no breaking changes)                                   |
|  API contracts, screen I/O, events, DB primary tables             |
|  -> Additions OK. Breaking changes require impact analysis + ADR. |
+-------------------------------------------------------------------+
|  CORE (rarely changes)                                            |
|  Purpose, scope, user stories, user flow, business rules, terms   |
|  -> Immutable after Freeze 1. Change needs stakeholder approval.  |
+-------------------------------------------------------------------+
```

### Layer Contents

| Layer | Sections | Change Rule |
|-------|----------|-------------|
| CORE | SS2.1 Purpose, SS2.2 Scope, SS2.3 User Story, SS2.4 User Flow, SS7 Business Rules, Terms, Permissions | Stakeholder approval + ADR |
| CONTRACT | SS5 API, SS6.1 Screens, SS6.4 State Diagram, SS4.1 Data Items, Events | No breaking changes; additions OK. Migration plan for exceptions |
| DETAIL | SS4.2 Validation, SS6.2 Layout, SS6.3 UI States, SS8 NFR, SS9 Error Handling, UI Labels | Freely changeable; log in change history |

### Section-Layer Tags

```
SS2  [CORE]
SS3  [CORE: FR list] [DETAIL: SS3-E/F/G/H]
SS4  [CONTRACT: 4.1] [DETAIL: 4.2, 4.3]
SS5  [CONTRACT]
SS6  [CONTRACT: 6.1, 6.4] [DETAIL: 6.2, 6.3, 6.5]
SS7  [CORE: core rules] [DETAIL: exception rules]
SS8  [DETAIL]
SS9  [DETAIL]
```

---

## Freeze Model

| Freeze | What Stabilizes | Gate |
|--------|-----------------|------|
| Freeze 1: Domain | Terms, scope | Spec outline locked |
| Freeze 2: Contract | API, UI, DB | Implementation may begin |
| Freeze 3: Exception | Errors, permissions | Test/audit possible |
| Freeze 4: Non-functional | Performance, ops | Release-ready |

Implementation starts at Freeze 2. Freezes 3-4 may proceed in parallel.

---

## Decision Backlog

Undecided items are tracked separately from SSOT to avoid blocking development.

```
File: docs/ssot/DECISION_BACKLOG.md
Per-feature (optional): docs/design/features/FEAT-XXX/FEAT-XXX_decisions.md
```

### Entry Format

| Field | Content |
|-------|---------|
| ID | DB-XXX |
| Severity | High (1w) / Med (2w) / Low (no deadline) |
| Impact | DB / API / UI / Ops |
| Options | A) ... B) ... C) ... with side-effects |
| Default | Recommended option + rationale |
| Status | Open / Decided / Deferred |
| Related SSOT | Affected IDs and sections |

**Severity Criteria:**
- **High**: Affects DB schema, API contract, or blocks other features. Decide within 1 week.
- **Med**: Affects UI behavior or business rules. Decide within 2 weeks.
- **Low**: Labels, messages, NFR tweaks. Default is sufficient.

---

## Example-Driven Spec (Mandatory Sections SS3-E/F/G/H)

Every MUST requirement in SS3 requires these four subsections.

### SS3-E: Example Table (I/O Examples)

```markdown
| # | Input | Condition | Expected Output | Notes |
|---|-------|-----------|-----------------|-------|
| 1 | email: "user@example.com", password: "Valid1!" | Normal | 200, {token, user} | Basic success |
| 2 | email: "USER@EXAMPLE.COM", password: "Valid1!" | Uppercase email | 200, {token, user} | Case-insensitive |
| 3 | email: "user@example.com", password: "wrong" | Wrong password | 401, AUTH_001 | |
| 4 | email: "nonexist@example.com", password: "any" | Unknown user | 401, AUTH_001 | Security: don't reveal non-existence |
| 5 | email: "", password: "" | Empty input | 400, VAL_001 | |
```
**Minimum 5 cases: 2+ normal + 3+ abnormal.**

### SS3-F: Boundary Values

```markdown
| Field | Min | Max | Empty | NULL | Invalid Format |
|-------|-----|-----|-------|------|----------------|
| email | "a@b.c" (5 chars) | 254 chars | "" -> VAL_001 | null -> VAL_001 | "abc" -> VAL_002 |
| password | 8 chars | 128 chars | "" -> VAL_001 | null -> VAL_001 | "short" -> VAL_003 |
```
**Define 5 boundary patterns per data field.**

### SS3-G: Exception Response

```markdown
| # | Condition | HTTP | Error Code | User Message | Retry | Recovery |
|---|-----------|------|------------|--------------|-------|----------|
| 1 | Wrong password | 401 | AUTH_001 | "Email or password incorrect" | Yes | Re-enter |
| 2 | Account locked | 423 | AUTH_003 | "Account locked. Retry in 30min" | Yes (30m) | Wait |
| 3 | Email unverified | 403 | AUTH_004 | "Email not verified" | No | Verify email |
| 4 | Rate limited | 429 | RATE_001 | "Too many attempts" | Yes (60s) | Wait |
| 5 | Server error | 500 | SYS_001 | "Temporary error" | Yes | Auto-recovery |
```

### SS3-H: Acceptance Tests (Gherkin)

```gherkin
Feature: FR-001 Login

  Scenario: Successful login
    Given user "user@example.com" is registered
    And password is set to "Valid1!"
    When login with email "user@example.com" and password "Valid1!"
    Then status code 200 is returned
    And response contains token
    And response contains user object

  Scenario: Wrong password
    Given user "user@example.com" is registered
    When login with email "user@example.com" and password "wrong"
    Then status code 401 is returned
    And error code "AUTH_001" is returned

  Scenario: Account lock after 5 consecutive failures
    Given user "user@example.com" is registered
    When login fails 5 times consecutively with wrong password
    Then status code 423 is returned
    And error code "AUTH_003" is returned
    And login is disabled for 30 minutes
```

### Auto-Generation from Gherkin

```
SSOT SS3-H (Gherkin)
  -> framework run --generate-tests FEAT-XXX
     -> E2E tests (Playwright)     : Scenario -> test case
     -> API tests (Vitest)         : Given/When/Then -> request/assertion
     -> Test data (Fixtures)       : Given clause -> seed data
```

---

## SSOT Template (Condensed)

```markdown
# [Feature-ID] [Feature Name] - SSOT

> Version: 1.0 | Status: Draft/Review/Approved | Updated: YYYY-MM-DD

---

## SS1 Document Info
| Field | Value |
|-------|-------|
| Feature ID | FEAT-XXX |
| Priority | P0 / P1 / P2 |
| Size | S / M / L / XL |
| Parent Task | PT-XXX |

### Change History / Related Documents
(tables)

## SS2 Overview [CORE]
- 2.1 Purpose (1-2 sentences)
- 2.2 Scope (included / explicitly excluded)
- 2.3 User Story (persona, action, goal, acceptance criteria)
- 2.4 User Flow (numbered steps)

## SS3 Functional Requirements [CORE: FR] [DETAIL: E/F/G/H]
- RFC 2119 requirement table (ID, Level, Requirement, Verification)
- FR detail blocks (level, description, rationale, conditions, verification)
- SS3-E: Example Table (min 5 cases)
- SS3-F: Boundary Values (per data field)
- SS3-G: Exception Response (all error cases)
- SS3-H: Acceptance Tests (Gherkin, 1 Scenario per MUST)

## SS4 Data Spec [CONTRACT: 4.1] [DETAIL: 4.2, 4.3]
- 4.1 Data items (name, type, required, default, validation)
- 4.2 Validation rules
- 4.3 Data lifecycle (create/update/delete/retention)

## SS5 API Spec [CONTRACT]
- 5.1 Endpoint list (method, path, description, auth)
- 5.2 Endpoint detail (request/response types, error table)

## SS6 UI Spec [CONTRACT: 6.1, 6.4] [DETAIL: 6.2, 6.3, 6.5]
- 6.1 Screen list | 6.2 Layout (wireframe) | 6.3 State list
- 6.4 State diagram (Mermaid) | 6.5 Operation flow

## SS7 Business Rules [CORE]
- Rule table (ID, name, IF condition, THEN action, level)
- Rule detail (condition, logic, exception, rationale)

## SS8 Non-Functional Requirements [DETAIL]
- 8.1 Performance (response time, throughput, data volume)
- 8.2 Security | 8.3 Availability | 8.4 Maintainability

## SS9 Error Handling [DETAIL]
- Error case table + fallback strategy

## SS10 Test Cases
- 10.1 Normal | 10.2 Abnormal | 10.3 Boundary
- Coverage: All MUST -> tests required

## SS11 Dependencies
- 11.1 Depends on | 11.2 Depended by | 11.3 External services

## SS12 Open Items & Constraints
- TBD table (item, layer, Decision Backlog ID)
- CORE/CONTRACT TBD = audit fail. DETAIL TBD = allowed if in Backlog.
- Prerequisites & Constraints

## Audit Info
| Field | Value |
|-------|-------|
| Audit date | |
| Score | /100 |
| Verdict | Pass / Conditional / Fail |
| Issues | Critical: / Major: / Minor: |
```

---

## Pre-Implementation Readiness Check (Gate C)

Quick check before full audit. All items must pass to begin implementation.

| # | Section | Check |
|---|---------|-------|
| 1 | SS3-E Example Table | Exists, 5+ rows, 2+ normal, 3+ abnormal |
| 2 | SS3-F Boundary Values | Exists, row count matches SS4.1 fields, all 5 columns filled |
| 3 | SS3-G Exception Response | Exists, row count matches SS9 errors, HTTP/code/message filled |
| 4 | SS3-H Gherkin | Exists, Feature/Scenario present, Scenario count matches MUST count |
| 5 | Completeness Checklist | Exists at SSOT header, SS3-E/F/G/H rows are checked |

**Verdict:** All pass -> Ready. Any fail -> Not Ready (report gaps, block implementation).

Report format when Not Ready:
```
"[Feature-ID] Pre-Implementation Readiness Check failed.

Missing:
- SS3-F Boundary: SS4.1 has 5 fields but SS3-F has only 2 rows (3 missing)
- SS3-H Gherkin: 4 MUST requirements but only 2 Scenarios (2 missing)

Must be completed before implementation. Shall I fill in the gaps?"
```

---

## Audit Scorecard (10 Categories, 100 Points)

| # | Category | Points | Criteria |
|---|----------|--------|----------|
| 1 | Completeness | 15 | All 12 sections (SS1-SS12) present and filled |
| 2 | Consistency | 15 | No internal contradictions (FR<->Test, Data<->API, UI<->Flow) |
| 3 | Clarity | 10 | No ambiguous terms; quantified where possible; unified terminology |
| 4 | Verifiability | 10 | All MUST requirements testable as yes/no |
| 5 | Traceability | 10 | PRD->FR->Test->UI/API chain documented |
| 6 | Feasibility | 10 | Implementable with current tech stack in 1 sprint |
| 7 | RFC 2119 Compliance | 10 | Levels properly differentiated (not all MUST) |
| 8 | Test Coverage | 10 | Normal + abnormal + boundary cases covered |
| 9 | Cross-SSOT Alignment | 5 | Consistent with SSOT-2/3/4/5 and peer SSOTs |
| 10 | Document Quality | 5 | Template compliance, naming, readability, no typos |

### Deduction Rules (Key Items)

| Violation | Deduction |
|-----------|-----------|
| Section completely missing | Full category points |
| Section incomplete | 50% of category points |
| TBD remaining (CORE/CONTRACT) | SS12 = 0 AND -5 from total |
| Internal contradiction (e.g. MUST without test) | -3 per item |
| Type mismatch (SS4 vs SS5) | -2 per item |
| Ambiguous term ("appropriately", "as needed") | -1 per item (max -5) |
| Untestable MUST requirement | -2 per item |
| MUST without PRD rationale | -2 per item |
| SS3-E under 5 cases | -2 per missing case |
| SS3-F undefined data field | -1 per field |
| SS3-G undefined error case | -2 per case |
| SS3-H missing Scenario for MUST | -3 per requirement |
| All requirements set to MUST (no differentiation) | -5 |
| No MUST NOT defined | -1 |

### Freeze-Aware Audit Thresholds

| Timing | Scope | Pass Line |
|--------|-------|-----------|
| Freeze 2 (start implementation) | CORE + CONTRACT must be 100%. DETAIL TBDs allowed if in Backlog. | 80 pts |
| Freeze 4 (release) | All 3 layers 100%. All TBDs resolved. | 95 pts |

### Verdict

| Score | Verdict | Action |
|-------|---------|--------|
| >= 95 AND TBD=0 AND Critical=0 | Pass | Proceed |
| 90-94 | Conditional Pass | Fix issues, re-audit |
| <= 89 | Fail | Rework sections |

**Absolute fail conditions (regardless of score):**
- Any CORE/CONTRACT TBD remaining
- Any Critical issue unresolved
- Cross-SSOT Critical/Major unresolved

### Issue Severity

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Blocks implementation or contains major contradiction | Must fix. Cannot pass without resolution. |
| Major | Significant quality impact | Fix recommended. 2+ Majors -> Conditional at best. |
| Minor | Quality improvement suggestion | Optional |

---

## Audit Report Template

```markdown
# SSOT Audit Report

## Target
| Field | Value |
|-------|-------|
| Feature ID | FEAT-XXX |
| Feature Name | [name] |
| Audit Date | YYYY-MM-DD |
| Audit Round | 1st / 2nd / ... |

## Score

| # | Category | Max | Score | Deductions |
|---|----------|-----|-------|------------|
| 1 | Completeness | 15 | /15 | |
| 2 | Consistency | 15 | /15 | |
| 3 | Clarity | 10 | /10 | |
| 4 | Verifiability | 10 | /10 | |
| 5 | Traceability | 10 | /10 | |
| 6 | Feasibility | 10 | /10 | |
| 7 | RFC 2119 | 10 | /10 | |
| 8 | Test Coverage | 10 | /10 | |
| 9 | Alignment | 5 | /5 | |
| 10 | Doc Quality | 5 | /5 | |
| **Total** | | **100** | **/100** | |

## Verdict: [Pass / Conditional / Fail]

## Absolute Conditions
| Condition | Result |
|-----------|--------|
| TBD = 0 | Y/N (remaining: X) |
| Critical = 0 | Y/N (remaining: X) |
| Cross-SSOT Critical/Major = 0 | Y/N |

## Issues
| # | Severity | Category | Section | Issue | Fix |
|---|----------|----------|---------|-------|-----|
| 1 | Critical | | SSX | | |
| 2 | Major | | SSX | | |
| 3 | Minor | | SSX | | |
```

---

## Re-Audit Flow

```
Fail or Conditional:
  1. Fix Critical (mandatory), Major (recommended), Minor (optional)
  2. List fixes: "#1: Clarified FR-002 in SS3. #2: Added boundary tests to SS10."
  3. Re-audit entire document (not just fixes -- check for new contradictions)
  4. >= 95 -> Pass. < 95 -> Fix again (max 3 rounds)
```

---

## Ambiguous Term Replacements (Reference)

| Ambiguous | Clear Replacement |
|-----------|-------------------|
| "appropriately handle errors" | Show message in format "Invalid input: [field]" |
| "respond quickly" | Return response within 3 seconds |
| "large amount of data" | 100,000+ records |
| "sufficient security" | TLS 1.3 + AES-256 |
| "log as needed" | Log all events at ERROR level and above |

---

## Change History

| Date | Change |
|------|--------|
| - | Initial: SSOT format definition (from 12_SSOT_FORMAT.md) |
| - | Added: 3-layer structure, Decision Backlog, Example-driven sections |
| - | Added: Audit scorecard and process (from 13_SSOT_AUDIT.md) |
| - | Added: Pre-Implementation Readiness Check |
| - | Consolidated into specs/03_SSOT_FORMAT.md |
