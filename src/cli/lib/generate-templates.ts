/**
 * Document generation templates
 * Based on: 10_GENERATION_CHAIN.md
 *
 * Each template function takes discover answers and produces
 * a markdown document with sections populated from the answers.
 * Sections without data are marked as TBD.
 */

/** Answers from the discover session */
export type DiscoverAnswers = Record<string, string>;

function ans(answers: DiscoverAnswers, key: string, fallback = "TBD"): string {
  return answers[key] || fallback;
}

function mapOption(answer: string, mappings: Record<string, string>): string {
  const key = answer.toLowerCase().charAt(0);
  return mappings[key] || answer || "TBD";
}

// ─────────────────────────────────────────────
// Step 1: Business Design Documents
// ─────────────────────────────────────────────

export function generateIdeaCanvas(answers: DiscoverAnswers): string {
  const severity = mapOption(ans(answers, "Q2-3"), {
    a: "High (daily pain)",
    b: "Medium (periodic pain)",
    c: "Low (minor inconvenience)",
    d: "Low (nice to have)",
  });

  const validation = mapOption(ans(answers, "Q2-6"), {
    a: "Validated (5+ interviews)",
    b: "Partial (1-4 interviews)",
    c: "Own experience only",
    d: "Not validated",
  });

  const revenue = mapOption(ans(answers, "Q5-1"), {
    a: "Monthly subscription",
    b: "Usage-based pricing",
    c: "Freemium",
    d: "One-time purchase",
    e: "Ad revenue",
    f: "Not decided",
    g: "Other",
  });

  const goal = mapOption(ans(answers, "Q5-3"), {
    a: "10 users",
    b: "100 users",
    c: "1,000+ users",
    d: "Revenue target",
  });

  return `# IDEA CANVAS

> Generated from Discovery Session
> Completeness: ~80%

---

## 1. Elevator Pitch

${ans(answers, "Q1-1")}

---

## 2. Origin / Why You

${ans(answers, "Q1-2")}

---

## 3. Problem

### 3.1 Target Users
${ans(answers, "Q2-1")}

### 3.2 Core Problem
${ans(answers, "Q2-2")}

### 3.3 Severity
${severity}

### 3.4 Current Workaround
${ans(answers, "Q2-4")}

### 3.5 Validation Status
${validation}

---

## 4. Solution

### 4.1 Approach
${ans(answers, "Q3-1")}

### 4.2 Key Features
${ans(answers, "Q3-2")}

### 4.3 User Journey
${ans(answers, "Q3-4")}

---

## 5. Differentiation

### 5.1 Competitors
${ans(answers, "Q4-1")}

### 5.2 Key Differentiator
${ans(answers, "Q4-2")}

### 5.3 Market Trends
${ans(answers, "Q4-3", "TBD - Research needed")}

---

## 6. Business Model

### 6.1 Revenue Model
${revenue}

### 6.2 Pricing
${ans(answers, "Q5-2", "TBD - Pricing research needed")}

---

## 7. Success Definition

### 7.1 6-Month Goal
${goal}

---

## 8. Risks & Assumptions

> TBD - To be filled during elaboration

- [ ] Market risk: Is the problem big enough?
- [ ] Technical risk: Can we build it?
- [ ] Competition risk: Can we differentiate?
- [ ] Business risk: Will people pay?

---

## 9. References

${ans(answers, "Q1-4", "None specified")}
`;
}

export function generateUserPersona(answers: DiscoverAnswers): string {
  return `# USER PERSONA

> Generated from Discovery Session
> Completeness: ~50%

---

## 1. Primary Persona

### 1.1 Basic Profile
- **Who:** ${ans(answers, "Q2-1")}
- **Age/Demographics:** TBD
- **Occupation:** TBD
- **Tech Literacy:** TBD

### 1.2 Goals
- Primary: Solve "${ans(answers, "Q2-2")}"
- Secondary: TBD

### 1.3 Pain Points
1. ${ans(answers, "Q2-2")}
2. ${ans(answers, "Q2-5", "TBD")}
3. TBD
4. TBD
5. TBD

### 1.4 Current Behavior
- Current solution: ${ans(answers, "Q2-4")}
- Pain with current: ${ans(answers, "Q2-5", "TBD")}

### 1.5 Scenario
> TBD - Detailed day-in-the-life scenario

---

## 2. Secondary Persona

> TBD - To be defined

---

## 3. Anti-Persona (Who this is NOT for)

> TBD - To be defined

---

## 4. Marketing Insights

### 4.1 Where to Reach Them
> TBD

### 4.2 What Messages Resonate
> TBD

### 4.3 Decision Triggers
> TBD
`;
}

export function generateCompetitorAnalysis(answers: DiscoverAnswers): string {
  return `# COMPETITOR ANALYSIS

> Generated from Discovery Session
> Completeness: ~30%

---

## 1. Competitor Overview

### 1.1 Known Competitors
${ans(answers, "Q4-1")}

### 1.2 Reference Services (from Discovery)
${ans(answers, "Q1-4", "None specified")}

---

## 2. Direct Competitors

> TBD - Detailed analysis needed for each

| # | Service | Strengths | Weaknesses | Pricing | Users |
|---|---------|-----------|------------|---------|-------|
| 1 | TBD | TBD | TBD | TBD | TBD |
| 2 | TBD | TBD | TBD | TBD | TBD |
| 3 | TBD | TBD | TBD | TBD | TBD |

---

## 3. Indirect Competitors / Substitutes

### Current Workarounds
${ans(answers, "Q2-4")}

### Pain Points with Current Solutions
${ans(answers, "Q2-5", "TBD")}

---

## 4. Feature Comparison Matrix

> TBD - Fill after detailed competitor research

| Feature | Our Service | Competitor A | Competitor B |
|---------|-------------|-------------|-------------|
| TBD | TBD | TBD | TBD |

---

## 5. Differentiation

### 5.1 Key Differentiator
${ans(answers, "Q4-2")}

### 5.2 Market Trends
${ans(answers, "Q4-3", "TBD")}

---

## 6. Positioning Map

> TBD - Create after competitor research
`;
}

export function generateValueProposition(answers: DiscoverAnswers): string {
  return `# VALUE PROPOSITION CANVAS

> Generated from Discovery Session
> Completeness: ~50%

---

## 1. Customer Profile

### 1.1 Customer Jobs
- ${ans(answers, "Q2-1")} needs to solve: ${ans(answers, "Q2-2")}

### 1.2 Pains
1. ${ans(answers, "Q2-2")}
2. ${ans(answers, "Q2-5", "TBD")}
3. TBD

### 1.3 Gains (What they want)
1. TBD - Expected outcome from solution
2. TBD
3. TBD

---

## 2. Value Map

### 2.1 Products & Services
${ans(answers, "Q3-1")}

Key features:
${ans(answers, "Q3-2")}

### 2.2 Pain Relievers
| Pain | How We Solve It |
|------|----------------|
| ${ans(answers, "Q2-2")} | ${ans(answers, "Q3-1")} |
| TBD | TBD |

### 2.3 Gain Creators
| Gain | How We Enable It |
|------|-----------------|
| TBD | TBD |

---

## 3. Fit Analysis

### 3.1 Problem-Solution Fit
> TBD - Verify each pain has a corresponding pain reliever

### 3.2 Product-Market Fit Indicators
> TBD

---

## 4. Value Statement

> One-sentence value proposition:
> TBD - "[Target users] can [achieve goal] by using [product], unlike [alternatives] which [limitation]"

---

## 5. Competitive Comparison

### vs. ${ans(answers, "Q4-1", "Competitors")}
- Our advantage: ${ans(answers, "Q4-2")}
`;
}

// ─────────────────────────────────────────────
// Step 2: Product Design Documents
// ─────────────────────────────────────────────

export function generatePRD(answers: DiscoverAnswers): string {
  const platform = mapOption(ans(answers, "Q3-5"), {
    a: "Web app (browser)",
    b: "Mobile app (iOS/Android)",
    c: "Desktop app",
    d: "Chrome extension",
    e: "Bot (LINE/Discord)",
    f: "API",
    g: "Not decided",
  });

  const timeline = mapOption(ans(answers, "Q5-7"), {
    a: "1 month (ultra-fast MVP)",
    b: "1-3 months (standard MVP)",
    c: "3-6 months (solid build)",
    d: "No specific deadline",
  });

  const team = mapOption(ans(answers, "Q5-4"), {
    a: "Solo (with AI tools)",
    b: "With partner/team",
    c: "Outsourcing",
    d: "Not decided",
  });

  return `# SSOT-0: Product Requirements Document (PRD)

> Generated from Discovery Session
> Completeness: ~30%
> Status: Skeleton - Needs elaboration

---

## 1. Product Vision

${ans(answers, "Q1-1")}

---

## 2. Problem Statement

### 2.1 Target Users
${ans(answers, "Q2-1")}

### 2.2 Core Problem
${ans(answers, "Q2-2")}

### 2.3 Current Workarounds
${ans(answers, "Q2-4")}

---

## 3. Solution Overview

${ans(answers, "Q3-1")}

---

## 4. MVP Features (P0)

${ans(answers, "Q3-2")}

> **[要記入]** 各機能にIDを割り当て、受け入れ基準を追加してください

---

## 5. Future Features (P1+)

> TBD - Identify after MVP features are finalized

---

## 6. Success Metrics (KPIs)

| Metric | Target | Timeline |
|--------|--------|----------|
| Users | ${mapOption(ans(answers, "Q5-3"), { a: "10", b: "100", c: "1,000+", d: "TBD" })} | 6 months |
| TBD | TBD | TBD |

---

## 7. Out of Scope (Explicit)

> TBD - Define what is NOT in MVP

---

## 8. Constraints

- **Platform:** ${platform}
- **Timeline:** ${timeline}
- **Team:** ${team}
- **Tech Level:** ${ans(answers, "Q5-5")}
- **Preferred Tech:** ${ans(answers, "Q5-6", "Not specified")}

---

## 9. Assumptions

> TBD - List key assumptions that must hold true

---

## 10. User Flow

${ans(answers, "Q3-4")}
`;
}

export function generateFeatureCatalog(answers: DiscoverAnswers): string {
  return `# SSOT-1: Feature Catalog

> Generated from Discovery Session
> Completeness: ~30%
> Status: Skeleton - Needs feature decomposition

---

## 1. Feature Overview

### Source
- MVP features from discovery: ${ans(answers, "Q3-2")}
- Platform: ${ans(answers, "Q3-5", "Not specified")}

---

## 2. Feature List

> **[要記入]** 上記の機能を個別の機能エントリに分解してください

| ID | Feature Name | Priority | Type | Size | Dependencies |
|----|-------------|----------|------|------|-------------|
| FEAT-001 | TBD | P0 | TBD | TBD | None |
| FEAT-002 | TBD | P0 | TBD | TBD | TBD |
| FEAT-003 | TBD | P0 | TBD | TBD | TBD |

### Priority Legend
- **P0:** Must-have for MVP
- **P1:** Important but post-MVP
- **P2:** Nice to have

### Type Legend
- **Common:** Reusable across projects (auth, CRUD, etc.)
- **Proprietary:** Business-specific logic

---

## 3. Classification Criteria

For each feature, evaluate:
1. Reusable in other projects? (Y/N)
2. Industry standard pattern exists? (Y/N)
3. Minimal proprietary business logic? (Y/N)
4. External library can implement mostly? (Y/N)

**3+ Yes = Common, else = Proprietary**

---

## 4. Dependency Graph

> TBD - Map after features are identified

\`\`\`
FEAT-001 (Auth) ──→ FEAT-002 ──→ FEAT-003
                └──→ FEAT-004
\`\`\`

---

## 5. Implementation Order

> TBD - Determined by dependency graph + priority
`;
}

/** Map of document paths to their generator functions */
export const TEMPLATE_GENERATORS: Record<
  string,
  (answers: DiscoverAnswers) => string
> = {
  "docs/idea/IDEA_CANVAS.md": generateIdeaCanvas,
  "docs/idea/USER_PERSONA.md": generateUserPersona,
  "docs/idea/COMPETITOR_ANALYSIS.md": generateCompetitorAnalysis,
  "docs/idea/VALUE_PROPOSITION.md": generateValueProposition,
  "docs/requirements/SSOT-0_PRD.md": generatePRD,
  "docs/requirements/SSOT-1_FEATURE_CATALOG.md": generateFeatureCatalog,
};

/** Expected completeness per document (from spec) */
export const EXPECTED_COMPLETENESS: Record<string, number> = {
  "docs/idea/IDEA_CANVAS.md": 80,
  "docs/idea/USER_PERSONA.md": 50,
  "docs/idea/COMPETITOR_ANALYSIS.md": 30,
  "docs/idea/VALUE_PROPOSITION.md": 50,
  "docs/requirements/SSOT-0_PRD.md": 30,
  "docs/requirements/SSOT-1_FEATURE_CATALOG.md": 30,
};
