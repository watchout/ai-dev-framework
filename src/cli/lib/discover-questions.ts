/**
 * Discovery flow question definitions
 * Based on: 08_DISCOVERY_FLOW.md
 *
 * 5 stages, ~26 questions total
 */

export interface Question {
  id: string;
  stage: number;
  required: boolean;
  type: "free" | "select" | "confirm";
  text: string;
  hint?: string;
  options?: string[];
  /** If set, this question only appears when the condition is met */
  condition?: {
    questionId: string;
    value: string;
  };
  /** Which template field(s) this answer maps to */
  mappings: TemplateMapping[];
}

export interface TemplateMapping {
  template: string;
  section: string;
}

export interface StageDefinition {
  stage: number;
  title: string;
  purpose: string;
  estimatedMinutes: number;
  questions: Question[];
}

// ─────────────────────────────────────────────
// Stage 1: Idea Core (~5 min)
// ─────────────────────────────────────────────

const STAGE_1: StageDefinition = {
  stage: 1,
  title: "Idea Core",
  purpose: "Grasp the outline of a vague idea",
  estimatedMinutes: 5,
  questions: [
    {
      id: "Q1-1",
      stage: 1,
      required: true,
      type: "free",
      text: "What do you want to build? Tell me whatever comes to mind.\nIt doesn't need to be organized.",
      mappings: [{ template: "IDEA_CANVAS", section: "Elevator Pitch" }],
    },
    {
      id: "Q1-2",
      stage: 1,
      required: true,
      type: "free",
      text: "What prompted this idea?\nIs it from your own experience? Or someone else's problem?",
      mappings: [{ template: "IDEA_CANVAS", section: "Why You" }],
    },
    {
      id: "Q1-3",
      stage: 1,
      required: true,
      type: "confirm",
      text: "", // dynamically generated summary
      mappings: [],
    },
    {
      id: "Q1-4",
      stage: 1,
      required: false,
      type: "free",
      text: "Are there any similar services or references you have in mind?\n\"Something like XX\" is fine.",
      hint: 'Service name, URL, or "nothing in particular"',
      mappings: [
        { template: "COMPETITOR_ANALYSIS", section: "Competitor List" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────
// Stage 2: Problem Deep Dive (~10 min)
// ─────────────────────────────────────────────

const STAGE_2: StageDefinition = {
  stage: 2,
  title: "Problem Deep Dive",
  purpose: "Clarify the problem and target users",
  estimatedMinutes: 10,
  questions: [
    {
      id: "Q2-1",
      stage: 2,
      required: true,
      type: "free",
      text: "Who needs this service the most? Please be specific.\n\nExamples: small business owners, freelance designers,\n30-something parents, etc.",
      mappings: [
        { template: "USER_PERSONA", section: "Basic Profile" },
        { template: "IDEA_CANVAS", section: "Target Users" },
      ],
    },
    {
      id: "Q2-2",
      stage: 2,
      required: true,
      type: "free",
      text: "What is the biggest problem they face?\n\nPlease describe a specific scenario if possible.\nExample: 'Spending 3 hours on monthly expense reports,\nunable to do the work they should be doing'",
      mappings: [
        { template: "IDEA_CANVAS", section: "Problem" },
        { template: "VALUE_PROPOSITION", section: "Pains" },
      ],
    },
    {
      id: "Q2-3",
      stage: 2,
      required: true,
      type: "select",
      text: "How severe is this problem?",
      options: [
        "a) Struggling every day (daily pain)",
        "b) Struggling sometimes (periodic pain)",
        "c) Occasionally inconvenient (minor)",
        "d) Nice to have",
      ],
      mappings: [{ template: "IDEA_CANVAS", section: "Problem Severity" }],
    },
    {
      id: "Q2-4",
      stage: 2,
      required: true,
      type: "select",
      text: "How are they currently dealing with this problem?",
      options: [
        "a) Using another tool/service",
        "b) Managing with Excel/spreadsheets",
        "c) Doing it manually",
        "d) Outsourcing",
        "e) Tolerating it / doing nothing",
        "f) Other",
      ],
      mappings: [
        { template: "COMPETITOR_ANALYSIS", section: "Alternatives" },
      ],
    },
    {
      id: "Q2-5",
      stage: 2,
      required: true,
      type: "free",
      text: "What are the pain points with the current tool/service?",
      condition: { questionId: "Q2-4", value: "a" },
      mappings: [
        {
          template: "COMPETITOR_ANALYSIS",
          section: "Differentiation Points",
        },
      ],
    },
    {
      id: "Q2-6",
      stage: 2,
      required: false,
      type: "select",
      text: "Have you actually talked to target users about this problem?",
      options: [
        "a) Talked to 5+ people",
        "b) Talked to 1-4 people",
        "c) Only my own experience",
        "d) Haven't talked to anyone yet",
      ],
      mappings: [
        { template: "IDEA_CANVAS", section: "Validation Status" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────
// Stage 3: Solution Design (~10 min)
// ─────────────────────────────────────────────

const STAGE_3: StageDefinition = {
  stage: 3,
  title: "Solution Design",
  purpose: "Define the solution direction and key features",
  estimatedMinutes: 10,
  questions: [
    {
      id: "Q3-1",
      stage: 3,
      required: true,
      type: "free",
      text: "How do you want to solve this problem?\n\nA rough idea is fine.\nExamples: 'Automate with AI', 'Make a simpler tool',\n'Make it mobile-only'",
      mappings: [
        { template: "IDEA_CANVAS", section: "Solution" },
        { template: "VALUE_PROPOSITION", section: "Value Map" },
      ],
    },
    {
      id: "Q3-2",
      stage: 3,
      required: true,
      type: "free",
      text: "If you could only have 3 essential features,\nwhat would they be?\n\nMore is OK, but focus on the top 3.",
      mappings: [
        { template: "SSOT-1_FEATURE_CATALOG", section: "Feature List" },
        { template: "IDEA_CANVAS", section: "Key Features" },
      ],
    },
    {
      id: "Q3-3",
      stage: 3,
      required: true,
      type: "confirm",
      text: "", // dynamically generated feature prioritization
      mappings: [{ template: "SSOT-0_PRD", section: "MVP Features" }],
    },
    {
      id: "Q3-4",
      stage: 3,
      required: true,
      type: "free",
      text: "Describe the user journey from opening the service\nto feeling 'This is great!'\n\nExample: Sign up -> Import data -> Auto-analyze\n-> Show report -> 'This is great!'",
      mappings: [{ template: "SSOT-0_PRD", section: "User Flow" }],
    },
    {
      id: "Q3-5",
      stage: 3,
      required: false,
      type: "select",
      text: "What platform do you want to deliver on?",
      options: [
        "a) Web app (browser)",
        "b) Mobile app (iOS/Android)",
        "c) Desktop app",
        "d) Chrome extension",
        "e) LINE Bot / Discord Bot",
        "f) API",
        "g) Not decided yet",
      ],
      mappings: [{ template: "TECH_STACK", section: "Platform" }],
    },
  ],
};

// ─────────────────────────────────────────────
// Stage 4: Market & Competition (~5 min)
// ─────────────────────────────────────────────

const STAGE_4: StageDefinition = {
  stage: 4,
  title: "Market & Competition",
  purpose: "Understand the market and differentiation",
  estimatedMinutes: 5,
  questions: [
    {
      id: "Q4-1",
      stage: 4,
      required: true,
      type: "free",
      text: "Do you know of competitors solving the same problem?\n\nIncluding any references from Stage 1.\n\na) I know some -> please list them\nb) I think they exist but don't know specifics\nc) I don't think there are any",
      mappings: [
        { template: "COMPETITOR_ANALYSIS", section: "Detailed Analysis" },
      ],
    },
    {
      id: "Q4-2",
      stage: 4,
      required: true,
      type: "free",
      text: "Compared to competitors or existing methods,\nwhat is your service's #1 differentiator?\n\nWhat's the one thing you absolutely won't lose on?",
      mappings: [
        { template: "IDEA_CANVAS", section: "Differentiation" },
        { template: "VALUE_PROPOSITION", section: "Competitive Comparison" },
      ],
    },
    {
      id: "Q4-3",
      stage: 4,
      required: false,
      type: "free",
      text: "Are there any trends or tailwinds in this space?\n\nExamples: AI advances, regulation changes, remote work trends\n\nSkip if nothing comes to mind.",
      mappings: [
        { template: "IDEA_CANVAS", section: "Market Trends" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────
// Stage 5: Business & Technical (~10 min)
// ─────────────────────────────────────────────

const STAGE_5: StageDefinition = {
  stage: 5,
  title: "Business & Technical",
  purpose: "Confirm revenue model and technical constraints",
  estimatedMinutes: 10,
  questions: [
    {
      id: "Q5-1",
      stage: 5,
      required: true,
      type: "select",
      text: "How do you want to make money?",
      options: [
        "a) Monthly subscription",
        "b) Usage-based pricing",
        "c) Freemium (free + paid plans)",
        "d) One-time purchase",
        "e) Ad revenue",
        "f) Not decided yet",
        "g) Other",
      ],
      mappings: [
        { template: "PRICING_STRATEGY", section: "Price Design" },
        { template: "IDEA_CANVAS", section: "Business Model" },
      ],
    },
    {
      id: "Q5-2",
      stage: 5,
      required: true,
      type: "free",
      text: "What price range are you thinking?\nA rough estimate is fine.\n\nExample: about $10/month, about $5 per use",
      condition: { questionId: "Q5-1", value: "f" },
      mappings: [
        { template: "PRICING_STRATEGY", section: "Plan Design" },
      ],
    },
    {
      id: "Q5-3",
      stage: 5,
      required: true,
      type: "select",
      text: "What's your 6-month goal?",
      options: [
        "a) 10 users would be great",
        "b) About 100 users",
        "c) 1,000+ users",
        "d) Revenue target -> specify amount",
      ],
      mappings: [
        { template: "IDEA_CANVAS", section: "Success Definition" },
        { template: "METRICS_DEFINITION", section: "Goals" },
      ],
    },
    {
      id: "Q5-4",
      stage: 5,
      required: true,
      type: "select",
      text: "Who will do the development?",
      options: [
        "a) Myself (including AI tools)",
        "b) Myself + partner/team",
        "c) Outsourcing",
        "d) Not decided yet",
      ],
      mappings: [{ template: "PROJECT_PLAN", section: "Team Structure" }],
    },
    {
      id: "Q5-5",
      stage: 5,
      required: true,
      type: "select",
      text: "What's your programming experience?",
      options: [
        "a) Professional engineer",
        "b) Can code somewhat (hobby/learning level)",
        "c) Touched it a little",
        "d) None at all (want to use AI/no-code)",
      ],
      mappings: [
        { template: "TECH_STACK", section: "Recommended Stack" },
      ],
    },
    {
      id: "Q5-6",
      stage: 5,
      required: false,
      type: "free",
      text: "Are there any specific technologies you want to use?\n\nExample: Next.js, Supabase, Vercel, etc.\n\nSkip if none.",
      mappings: [
        { template: "TECH_STACK", section: "Tech Selection" },
      ],
    },
    {
      id: "Q5-7",
      stage: 5,
      required: true,
      type: "select",
      text: "When do you want to launch?",
      options: [
        "a) Within 1 month (ultra-fast MVP)",
        "b) 1-3 months (standard MVP)",
        "c) 3-6 months (solid build)",
        "d) No specific deadline",
      ],
      mappings: [{ template: "PROJECT_PLAN", section: "Schedule" }],
    },
    {
      id: "Q5-8",
      stage: 5,
      required: true,
      type: "select",
      text: "Are you interested in lead acquisition\n(SNS, landing page) during development?",
      options: [
        "a) Definitely want to -> design SNS/LP strategy simultaneously",
        "b) Interested but don't know how -> guided approach",
        "c) Want to focus on development -> add later",
        "d) Not thinking about it",
      ],
      mappings: [{ template: "SNS_STRATEGY", section: "Overall" }],
    },
  ],
};

export const STAGES: StageDefinition[] = [
  STAGE_1,
  STAGE_2,
  STAGE_3,
  STAGE_4,
  STAGE_5,
];

export function getStage(stageNumber: number): StageDefinition | undefined {
  return STAGES.find((s) => s.stage === stageNumber);
}

export function getQuestion(questionId: string): Question | undefined {
  for (const stage of STAGES) {
    const q = stage.questions.find((q) => q.id === questionId);
    if (q) return q;
  }
  return undefined;
}

/**
 * Check if a conditional question should be shown
 * based on previous answers.
 */
export function shouldShowQuestion(
  question: Question,
  answers: Record<string, string>,
): boolean {
  if (!question.condition) return true;
  const answer = answers[question.condition.questionId] ?? "";
  return answer.toLowerCase().startsWith(question.condition.value);
}
