# 01_DISCOVERY.md - Discovery Question Flow (Consolidated)

> Consolidates: `08_DISCOVERY_FLOW.md`
> Transforms a vague idea into structured initial documents via staged interview (~30 questions).

---

## Overview

```
INPUT:  "I want to build something like ..."
PROCESS: 5-stage AI interview (~30 questions)
OUTPUT:  Initial document set auto-generated
         - IDEA_CANVAS.md (80%)
         - USER_PERSONA.md (50% Draft)
         - COMPETITOR_ANALYSIS.md (30% Draft)
         - VALUE_PROPOSITION.md (50% Draft)
         - SSOT-0_PRD.md (30% skeleton)
         - PROJECT_PLAN.md (20% skeleton)
         - LP_SPEC.md (30% Draft) ※ marketing intent only
         - SNS_STRATEGY.md (20% Draft) ※ marketing intent only
```

**Agent Skill**: `framework-discovery` auto-runs this flow with Deliberation Protocol.
Details: `templates/skills/discovery/SKILL.md`

---

## Execution Rules

1. Ask ONE question at a time (never batch multiple questions)
2. Always provide concrete examples (lower the answer barrier)
3. Summarize and confirm at each Stage end (prevent misalignment)
4. Tell user "rough answers are fine" (don't demand perfection)
5. After all Stages, map answers to templates and auto-generate documents

---

## Flow Diagram

```
Stage 0        Stage 1       Stage 2        Stage 3       Stage 4       Stage 5
----------    ----------    ----------    ----------    ----------    ----------
Knowledge     Idea Core     Problem       Solution      Market &      Business &
Pre-check     (5 min)       Deep-dive     Design        Competition   Technology
                            (10 min)      (10 min)      (5 min)       (10 min)
    |              |             |              |             |             |
    v              v             v              v             v             v
 [Adjust       [Confirm 1]  [Confirm 2]   [Confirm 3]  [Confirm 4]  [Confirm 5]
  strategy]
                                                                          |
                                                                          v
                                                              Stage 5.5: Deliberation
                                                                          |
                                                                          v
                                                              Final Summary + Generate
```

---

## Stage 0: Knowledge Pre-check (Before Discovery)

**Purpose**: Load existing knowledge data to improve interview quality.

```
Step 1: Check docs/knowledge/ existence
  Not found -> Skip to Stage 1
  Found -> Step 2

Step 2: Read relevant files (in order)
  1. users/pain-points.md
  2. users/personas.md
  3. market/competitors.md
  4. domain/terminology.md
  5. domain/common-features.md

Step 3: Build internal knowledge summary
  - Known problems, personas, competitors, domain terms

Step 4: Adjust interview approach
  Knowledge exists:
    - Convert known info to confirmation questions
      e.g. "We understand the problem is X -- is that correct?"
    - Focus deep-dive on unknown areas
    - Explicitly confirm any contradictions
  No knowledge:
    - Use standard open-ended questions
```

**Opening message (when knowledge exists)**:
```
"docs/knowledge/ contains existing data. Pre-loaded:
 - Problems: {summary from pain-points.md}
 - Personas: {summary from personas.md}
 - Competitors: {summary from competitors.md}
 Proceeding with confirmation-style questions for known areas."
```

---

## Stage 1: Idea Core (~5 min)

**Purpose**: Grasp the outline of a vague idea.

### Question Bank

| ID | Required | Question | Notes |
|----|----------|----------|-------|
| Q1-1 | Yes | "What do you want to build? Tell me anything, no need to be organized." | Free answer. AI summarizes. |
| Q1-2 | Yes | "What triggered this idea? Your own experience or someone else's?" | Validates problem existence. |
| Q1-3 | Yes | AI presents summary: "Does this capture it? '[summary]' Anything to fix?" | Yes / corrections -> re-confirm |
| Q1-4 | No | "Any similar services or references? 'Something like X' is fine." | Seed for competitor analysis |

### Stage 1 Confirmation Template

```
Idea summary: [1-2 sentence overview]
Trigger:      [own experience / others' pain / market opportunity]
References:   [service list]
-> Does this look right?
```

---

## Stage 2: Problem Deep-dive (~10 min)

**Purpose**: Clarify the problem and target user.

### Question Bank

| ID | Required | Question | Notes |
|----|----------|----------|-------|
| Q2-1 | Yes | "Who needs this most? Be specific. e.g. SMB owners, freelance designers, mothers in their 30s" | Persona foundation |
| Q2-2 | Yes | "What's their biggest problem? Describe a specific scene. e.g. 'Spending 3h/month on expense reports...'" | Problem resolution check |
| Q2-3 | Yes | "How severe? a) Daily pain b) Periodic pain c) Occasional inconvenience d) Nice-to-have" | Severity scoring |
| Q2-4 | Yes | "How do they cope now? a) Other tools b) Spreadsheets c) Manual d) Outsource e) Endure f) Other" | Competitor/alternative identification |
| Q2-5 | Conditional (Q2-4=a) | "What's frustrating about the current tool/service?" | Differentiation discovery |
| Q2-6 | No | "Have you talked to actual target users? a) 5+ people b) 1-4 people c) Own experience only d) Not yet" | Validation necessity |

### Stage 2 Confirmation Template

```
Target user:     [specific profile]
Main problem:    [1-sentence problem statement]
Severity:        [High/Med/Low]
Current coping:  [method]
Validation:      [Done/Not done]

Warning (if severity=Low OR validation=Not done):
  "Risk detected. Strongly recommend Phase -1 validation."

-> Does this look right?
```

---

## Stage 3: Solution Design (~10 min)

**Purpose**: Define solution direction and key features.

### Question Bank

| ID | Required | Question | Notes |
|----|----------|----------|-------|
| Q3-1 | Yes | "How do you want to solve [problem from Stage 2]? Rough is fine. e.g. 'Automate with AI', 'Make a simpler tool', 'Mobile-first'" | Solution direction |
| Q3-2 | Yes | "If you had to pick 3 must-have features, what are they?" | MVP feature identification |
| Q3-3 | Yes | AI lists features: "Which ones are the bare minimum to be usable? (MVP)" | P0 feature confirmation |
| Q3-4 | Yes | "Walk me through: user opens the app -> ... -> thinks 'This is great!' What's that flow?" | User flow foundation |
| Q3-5 | No | "Platform? a) Web app b) Mobile app c) Desktop d) Chrome extension e) LINE/Discord Bot f) API g) Undecided" | Tech stack direction |

### Stage 3 Confirmation Template

```
Solution:    [1-2 sentence approach]
MVP (P0):    1. [feature] 2. [feature] 3. [feature]
Future (P1): - [feature] - [feature]
Platform:    [Web / Mobile / etc.]
User flow:   [step1] -> [step2] -> [step3]
-> Does this look right?
```

---

## Stage 4: Market & Competition (~5 min)

**Purpose**: Understand market environment and differentiation.

### Question Bank

| ID | Required | Question | Notes |
|----|----------|----------|-------|
| Q4-1 | Yes | "Know any competitors solving the same problem? (incl. references from Stage 1) a) Yes -> names b) Probably exist but unknown c) None" | Competitor analysis input |
| Q4-2 | Yes | "Compared to competitors/existing methods, what's your #1 differentiator? What's the one thing you won't lose on?" | USP foundation |
| Q4-3 | No | "Any tailwinds or trends in this space? e.g. AI advances, regulation changes, remote work. Skip if nothing comes to mind." | Timing rationale |

### Stage 4 Confirmation Template

```
Competitors:      - [A]: [characteristic] - [B]: [characteristic]
Differentiator:   [unique value]
Tailwinds:        [trend]
-> Does this look right?
```

---

## Stage 5: Business & Technology (~10 min)

**Purpose**: Confirm revenue model and technical constraints.

### Question Bank

| ID | Required | Question | Notes |
|----|----------|----------|-------|
| Q5-1 | Yes | "Revenue model? a) Subscription b) Usage-based c) Freemium d) One-time purchase e) Ads f) Undecided g) Other" | Business model foundation |
| Q5-2 | Conditional (Q5-1 != f) | "Rough pricing? e.g. ~1,000 yen/month, ~500 yen/use" | Pricing input |
| Q5-3 | Yes | "6-month target? a) 10 users is fine b) ~100 users c) 1,000+ users d) Revenue of X yen/month" | Scale sense |
| Q5-4 | Yes | "Who builds it? a) Solo (incl. AI) b) With partner/team c) Outsource d) Undecided" | Team structure |
| Q5-5 | Yes | "Programming experience? a) Professional engineer b) Hobbyist/learner c) Touched it a bit d) None (want AI/no-code)" | Tech stack recommendation basis |
| Q5-6 | No | "Any tech already decided? e.g. Next.js, Supabase, Vercel. Skip if none." | Tech stack input |
| Q5-7 | Yes | "Target launch? a) Within 1 month (ultra-fast MVP) b) 1-3 months (standard) c) 3-6 months (thorough) d) No deadline" | Schedule basis |
| Q5-8 | Yes | "Interested in lead gen via SNS/LP during development? a) Definitely b) Interested but don't know how c) Want to focus on dev d) Not thinking about it" | Marketing template applicability |

### Stage 5 Confirmation Template

```
Revenue:      [subscription/freemium/etc.]
Pricing:      [X yen/month]
6mo target:   [numeric goal]
Team:         [solo/team/outsource]
Tech level:   [pro/intermediate/beginner/none]
Tech stack:   [decided/needs recommendation]
Timeline:     [1mo/3mo/6mo]
Marketing:    [parallel/later/none]
-> Does this look right?
```

---

## Stage 5.5: Deliberation (Multi-perspective Verification)

**Purpose**: Before generating documents, 3 experts verify the summary from multiple angles.

### Expert Panel

| Expert | Focus Areas |
|--------|-------------|
| Entrepreneur (Business) | Market need validity, business model sustainability, competitive advantage, path to revenue |
| User Researcher (User) | Problem existence & severity, persona resolution, UX naturalness, switching barriers |
| Technical Advisor (Tech) | Technical feasibility, MVP scope validity, scalability, timeline realism |

### Protocol

1. Each expert independently reviews the summary
2. Each raises concerns, risks, blind spots
3. Others rebut or supplement
4. List Critical / Major issues
5. Report to user, confirm resolution approach
6. Proceed to document generation

Details: `templates/skills/_deliberation/DELIBERATION_PROTOCOL.md`

---

## Conditional Logic

### Tech Stack Recommendation (based on Q5-5)

| Level | Recommendation |
|-------|---------------|
| a) Professional | Free choice (respect preferences) |
| b) Hobbyist | Next.js + Supabase + Vercel (good docs, AI-friendly) |
| c) Beginner | Next.js + Supabase + Vercel (AI-assisted dev design) |
| d) None | No-code (Bubble, Glide) or AI-powered development |

### MVP Scope Adjustment (based on Q5-7)

| Timeline | Scope |
|----------|-------|
| a) 1 month | 1-2 P0 features only, minimal design, "just make it work" |
| b) 1-3 months | 3-5 P0 features, standard MVP |
| c) 3-6 months | P0 + P1 features, solid UI/UX |
| d) No deadline | Recommend staged release: MVP at 1mo -> full version at 3mo |

### Marketing Document Generation (based on Q5-8)

| Intent | Generated Documents |
|--------|-------------------|
| a) Definitely | LP_SPEC.md, SNS_STRATEGY.md, EMAIL_SEQUENCE.md + Phase 0.5 design |
| b) Interested | LP_SPEC.md (simplified), SNS_STRATEGY.md + step-by-step guide |
| c) Focus on dev | Skip marketing docs. Explain benefits of early lead gen. |
| d) Not thinking | Skip. Note recommendation to prepare marketing before launch. |

---

## Answer -> Template Mapping

### Stage 1
| Question | Target Document | Target Section |
|----------|----------------|----------------|
| Q1-1 Idea overview | IDEA_CANVAS.md | S1 Elevator Pitch |
| Q1-2 Trigger | IDEA_CANVAS.md | S5.1 Why you |
| Q1-4 References | COMPETITOR_ANALYSIS.md | S1.2 Competitor list |

### Stage 2
| Question | Target Document | Target Section |
|----------|----------------|----------------|
| Q2-1 Target user | USER_PERSONA.md | Persona 1 profile |
| Q2-1 Target user | IDEA_CANVAS.md | S4 Target users |
| Q2-2 Problem | IDEA_CANVAS.md | S2 Problem |
| Q2-2 Problem | VALUE_PROPOSITION.md | S2.2 Pains |
| Q2-3 Severity | IDEA_CANVAS.md | S2.2 Problem deep-dive |
| Q2-4 Coping method | COMPETITOR_ANALYSIS.md | S3 Alternative analysis |
| Q2-5 Frustrations | COMPETITOR_ANALYSIS.md | S6 Differentiation points |
| Q2-6 Validation | IDEA_CANVAS.md | S2.3 Validation status |

### Stage 3
| Question | Target Document | Target Section |
|----------|----------------|----------------|
| Q3-1 Approach | IDEA_CANVAS.md | S3 Solution |
| Q3-1 Approach | VALUE_PROPOSITION.md | S3 Value Map |
| Q3-2 Key features | SSOT-1_FEATURE_CATALOG.md | Feature list |
| Q3-2 Key features | IDEA_CANVAS.md | S3.2 Key features |
| Q3-3 Priorities | SSOT-0_PRD.md | MVP features |
| Q3-4 User experience | SSOT-0_PRD.md | User flow |
| Q3-5 Platform | TECH_STACK.md | Platform |

### Stage 4
| Question | Target Document | Target Section |
|----------|----------------|----------------|
| Q4-1 Competitors | COMPETITOR_ANALYSIS.md | S2 Detailed analysis |
| Q4-2 Differentiation | IDEA_CANVAS.md | S5 Differentiation |
| Q4-2 Differentiation | VALUE_PROPOSITION.md | S7 Competitor comparison |
| Q4-3 Trends | IDEA_CANVAS.md | S7.2 Market trends |

### Stage 5
| Question | Target Document | Target Section |
|----------|----------------|----------------|
| Q5-1 Revenue model | PRICING_STRATEGY.md | S2 Pricing design |
| Q5-1 Revenue model | IDEA_CANVAS.md | S6 Business model |
| Q5-2 Price image | PRICING_STRATEGY.md | S2.2 Plan design |
| Q5-3 Target scale | IDEA_CANVAS.md | S9 Success definition |
| Q5-3 Target scale | METRICS_DEFINITION.md | S2 Goals |
| Q5-4 Dev resources | PROJECT_PLAN.md | S5 Team structure |
| Q5-5 Tech skill | TECH_STACK.md | Recommended stack |
| Q5-6 Chosen tech | TECH_STACK.md | Tech selection |
| Q5-7 Timeline | PROJECT_PLAN.md | S4 Schedule |
| Q5-8 Marketing | SNS_STRATEGY.md / LP_SPEC.md | Overall |

---

## Ambiguous Answer Handling

| Pattern | Example | Response |
|---------|---------|----------|
| Abstract answer | "Make it user-friendly" | "Specifically, like: under 3 steps? Usable one-handed on mobile? What image?" |
| "Everything" | "All features are needed" | "If you could keep only ONE feature, which? That's your most important one." |
| "Don't know" | "Don't know competitors" | "That's fine. We'll research later. Let's move on." (AI fills in later) |
| Contradiction | "Free service, but 1M yen/mo revenue" | "How about freemium: free plan for acquisition, paid plan for revenue?" |

---

## Plan Mode 80/20 (Design 80% / Implementation 20%)

**Principle**: No code until design is complete.

### Implementation Gates

| Gate | Condition |
|------|-----------|
| Gate 1: Discovery | All Stages 1-5 complete + user approved summary |
| Gate 2: Business Design | IDEA_CANVAS >= 80%, USER_PERSONA >= 50%, VALUE_PROPOSITION >= 50% |
| Gate 3: Product Design | SSOT-0_PRD complete, SSOT-1_FEATURE_CATALOG complete (P0 confirmed), all P0 SSOTs scored >= 95 |
| Gate 4: Technical Design | TECH_STACK confirmed, SSOT-3 API complete, SSOT-4 Data Model complete, SSOT-5 Cross-cutting complete, coding standards confirmed |

All gates passed -> implementation allowed.

**Exception**: Prototypes/PoC for technical validation are permitted if user explicitly states the intent.

**Response to premature implementation requests**:
```
"Design is not yet complete. The following gates are not passed:
 [ ] [incomplete gate]
 Rushing to code at 80% design causes rework and takes longer.
 Let's complete [next required document] first."
```

---

## Post-Discovery Completion Message

```
Initial documents generated:

IDEA_CANVAS.md        [========..] 80%
USER_PERSONA.md       [=====.....] 50%
COMPETITOR_ANALYSIS   [===.......] 30%
VALUE_PROPOSITION     [=====.....] 50%
SSOT-0_PRD.md         [===.......] 30%
PROJECT_PLAN.md       [==........] 20%

Next steps:
1. Fill remaining sections in IDEA_CANVAS
2. User interviews (5+ recommended)
3. Detailed competitor research
4. [If marketing selected] Begin LP creation

Where would you like to start?
```

Then proceed to Generation Chain: `10_GENERATION_CHAIN.md`
