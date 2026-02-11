/**
 * Project directory structure definition
 * Based on: 09_TOOLCHAIN.md Section 2
 */

/** Directories to create during init */
export const PROJECT_DIRECTORIES = [
  // docs
  "docs/idea",
  "docs/requirements",
  "docs/design/core",
  "docs/design/features/common",
  "docs/design/features/project",
  "docs/design/adr",
  "docs/standards",
  "docs/operations",
  "docs/marketing",
  "docs/growth",
  "docs/management",

  // src (Next.js default)
  "src/app",
  "src/components/ui",
  "src/components/features",
  "src/lib",
  "src/hooks",
  "src/types",
  "src/services",
  "src/__tests__",

  // other
  "public",

  // Agent Teams (CLI pattern)
  ".claude/agents",

  // framework state
  ".framework/audits/ssot",
  ".framework/audits/prompt",
  ".framework/audits/code",
  ".framework/audits/test",
  ".framework/logs",
] as const;

/** Document placeholders to create */
export interface DocPlaceholder {
  path: string;
  description: string;
}

export const DOC_PLACEHOLDERS: DocPlaceholder[] = [
  // idea
  { path: "docs/idea/IDEA_CANVAS.md", description: "Idea Canvas" },
  { path: "docs/idea/USER_PERSONA.md", description: "User Persona" },
  {
    path: "docs/idea/COMPETITOR_ANALYSIS.md",
    description: "Competitor Analysis",
  },
  {
    path: "docs/idea/VALUE_PROPOSITION.md",
    description: "Value Proposition",
  },

  // requirements
  { path: "docs/requirements/SSOT-0_PRD.md", description: "PRD" },
  {
    path: "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
    description: "Feature Catalog",
  },

  // design/core
  {
    path: "docs/design/core/SSOT-2_UI_STATE.md",
    description: "UI/State Transitions",
  },
  {
    path: "docs/design/core/SSOT-3_API_CONTRACT.md",
    description: "API Contract",
  },
  {
    path: "docs/design/core/SSOT-4_DATA_MODEL.md",
    description: "Data Model",
  },
  {
    path: "docs/design/core/SSOT-5_CROSS_CUTTING.md",
    description: "Cross-Cutting Concerns",
  },

  // design/adr
  {
    path: "docs/design/adr/000_TEMPLATE.md",
    description: "ADR Template",
  },

  // standards
  { path: "docs/standards/TECH_STACK.md", description: "Tech Stack" },
  {
    path: "docs/standards/CODING_STANDARDS.md",
    description: "Coding Standards",
  },
  { path: "docs/standards/GIT_WORKFLOW.md", description: "Git Workflow" },
  {
    path: "docs/standards/TESTING_STANDARDS.md",
    description: "Testing Standards",
  },
  {
    path: "docs/standards/DEV_ENVIRONMENT.md",
    description: "Dev Environment",
  },

  // operations
  {
    path: "docs/operations/ENVIRONMENTS.md",
    description: "Environment Config",
  },
  { path: "docs/operations/DEPLOYMENT.md", description: "Deployment" },
  { path: "docs/operations/MONITORING.md", description: "Monitoring" },
  {
    path: "docs/operations/INCIDENT_RESPONSE.md",
    description: "Incident Response",
  },

  // marketing
  { path: "docs/marketing/LP_SPEC.md", description: "Landing Page Spec" },
  {
    path: "docs/marketing/SNS_STRATEGY.md",
    description: "SNS Strategy",
  },
  {
    path: "docs/marketing/EMAIL_SEQUENCE.md",
    description: "Email Sequence",
  },
  { path: "docs/marketing/LAUNCH_PLAN.md", description: "Launch Plan" },
  {
    path: "docs/marketing/PRICING_STRATEGY.md",
    description: "Pricing Strategy",
  },

  // growth
  {
    path: "docs/growth/GROWTH_STRATEGY.md",
    description: "Growth Strategy",
  },
  {
    path: "docs/growth/METRICS_DEFINITION.md",
    description: "Metrics Definition",
  },

  // management
  {
    path: "docs/management/PROJECT_PLAN.md",
    description: "Project Plan",
  },
  { path: "docs/management/RISKS.md", description: "Risk Management" },
  {
    path: "docs/management/CHANGES.md",
    description: "Change Management",
  },
];
