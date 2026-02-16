/**
 * Project type profiles - defines project-type-specific configurations
 * Based on: templates/profiles/*.json from ai-dev-framework
 *
 * 5 project types:
 * - app: Full-stack application
 * - lp: Landing page
 * - hp: Homepage / Corporate site
 * - api: API / Backend service
 * - cli: CLI tool
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ProfileType = "app" | "lp" | "hp" | "api" | "cli";

export const PROFILE_TYPES: ProfileType[] = ["app", "lp", "hp", "api", "cli"];

export interface TechStackConfig {
  frontend: string | null;
  backend: string | null;
  database: string | null;
  auth: string | null;
  hosting: string | null;
  testing: string | null;
  cli_framework?: string;
}

export interface ProjectProfile {
  id: ProfileType;
  name: string;
  description: string;
  enabledSsot: string[];
  enabledAudit: string[];
  discoveryStages: number[];
  freezeRequired: number[];
  marketing: "required" | "optional" | "none";
  requiredTemplates: string[];
  skipTemplates: string[];
  directories: string[];
  defaultTechStack: TechStackConfig;
}

// ─────────────────────────────────────────────
// Embedded Profiles (from ai-dev-framework)
// ─────────────────────────────────────────────

const PROFILES: Record<ProfileType, ProjectProfile> = {
  app: {
    id: "app",
    name: "Full-stack Application",
    description: "フルスタックWebアプリケーション",
    enabledSsot: [
      "SSOT-0_PRD",
      "SSOT-1_FEATURE_CATALOG",
      "SSOT-2_UI_STATE",
      "SSOT-3_API_CONTRACT",
      "SSOT-4_DATA_MODEL",
      "SSOT-5_CROSS_CUTTING",
    ],
    enabledAudit: ["ssot", "prompt", "code", "test", "visual", "acceptance"],
    discoveryStages: [1, 2, 3, 4, 5],
    freezeRequired: [1, 2, 3, 4],
    marketing: "optional",
    requiredTemplates: [
      "docs/idea/IDEA_CANVAS.md",
      "docs/idea/USER_PERSONA.md",
      "docs/idea/COMPETITOR_ANALYSIS.md",
      "docs/idea/VALUE_PROPOSITION.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
      "docs/design/core/SSOT-2_UI_STATE.md",
      "docs/design/core/SSOT-3_API_CONTRACT.md",
      "docs/design/core/SSOT-4_DATA_MODEL.md",
      "docs/design/core/SSOT-5_CROSS_CUTTING.md",
      "docs/design/features/common/",
      "docs/design/features/project/",
      "docs/standards/TECH_STACK.md",
      "docs/standards/CODING_STANDARDS.md",
      "docs/standards/GIT_WORKFLOW.md",
      "docs/standards/TESTING_STANDARDS.md",
      "docs/management/PROJECT_PLAN.md",
      "docs/ssot/DECISION_BACKLOG.md",
    ],
    skipTemplates: [],
    directories: [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/design/features/common",
      "docs/design/features/project",
      "docs/design/adr",
      "docs/standards",
      "docs/notes",
      "docs/operations",
      "docs/marketing",
      "docs/growth",
      "docs/management",
      "docs/checklists",
      "docs/traceability",
      "docs/ssot",
      "src",
      "tests",
      "public",
    ],
    defaultTechStack: {
      frontend: "Next.js + Tailwind CSS",
      backend: "Next.js API Routes or Express",
      database: "Supabase (PostgreSQL)",
      auth: "Supabase Auth",
      hosting: "Vercel",
      testing: "Vitest + Playwright",
    },
  },
  lp: {
    id: "lp",
    name: "Landing Page",
    description: "ランディングページ",
    enabledSsot: ["SSOT-0_PRD", "SSOT-2_UI_STATE"],
    enabledAudit: ["code", "visual"],
    discoveryStages: [1, 2, 3],
    freezeRequired: [1, 2],
    marketing: "required",
    requiredTemplates: [
      "docs/idea/IDEA_CANVAS.md",
      "docs/idea/USER_PERSONA.md",
      "docs/idea/VALUE_PROPOSITION.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/design/core/SSOT-2_UI_STATE.md",
      "docs/marketing/LP_SPEC.md",
      "docs/marketing/SNS_STRATEGY.md",
      "docs/standards/TECH_STACK.md",
    ],
    skipTemplates: [
      "SSOT-1_FEATURE_CATALOG",
      "SSOT-3_API_CONTRACT",
      "SSOT-4_DATA_MODEL",
      "SSOT-5_CROSS_CUTTING",
      "docs/design/features/",
      "docs/operations/",
      "docs/growth/",
    ],
    directories: [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/standards",
      "docs/marketing",
      "docs/notes",
      "src",
      "public",
    ],
    defaultTechStack: {
      frontend: "Next.js + Tailwind CSS",
      backend: null,
      database: null,
      auth: null,
      hosting: "Vercel",
      testing: "Playwright (visual only)",
    },
  },
  hp: {
    id: "hp",
    name: "Homepage / Corporate Site",
    description: "ホームページ・コーポレートサイト",
    enabledSsot: ["SSOT-0_PRD", "SSOT-2_UI_STATE"],
    enabledAudit: ["code", "visual"],
    discoveryStages: [1, 2],
    freezeRequired: [1, 2],
    marketing: "optional",
    requiredTemplates: [
      "docs/idea/IDEA_CANVAS.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/design/core/SSOT-2_UI_STATE.md",
      "docs/standards/TECH_STACK.md",
    ],
    skipTemplates: [
      "SSOT-1_FEATURE_CATALOG",
      "SSOT-3_API_CONTRACT",
      "SSOT-4_DATA_MODEL",
      "SSOT-5_CROSS_CUTTING",
      "docs/design/features/",
      "docs/operations/",
      "docs/growth/",
      "USER_PERSONA",
      "COMPETITOR_ANALYSIS",
      "VALUE_PROPOSITION",
    ],
    directories: [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/standards",
      "docs/notes",
      "src",
      "public",
    ],
    defaultTechStack: {
      frontend: "Next.js + Tailwind CSS (or Astro)",
      backend: null,
      database: null,
      auth: null,
      hosting: "Vercel",
      testing: "Playwright (visual only)",
    },
  },
  api: {
    id: "api",
    name: "API / Backend Service",
    description: "API・バックエンド専用サービス",
    enabledSsot: ["SSOT-0_PRD", "SSOT-3_API_CONTRACT", "SSOT-4_DATA_MODEL"],
    enabledAudit: ["code", "test"],
    discoveryStages: [1, 2, 3],
    freezeRequired: [1, 2, 3],
    marketing: "none",
    requiredTemplates: [
      "docs/idea/IDEA_CANVAS.md",
      "docs/idea/USER_PERSONA.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
      "docs/design/core/SSOT-3_API_CONTRACT.md",
      "docs/design/core/SSOT-4_DATA_MODEL.md",
      "docs/design/core/SSOT-5_CROSS_CUTTING.md",
      "docs/standards/TECH_STACK.md",
      "docs/standards/CODING_STANDARDS.md",
      "docs/standards/TESTING_STANDARDS.md",
      "docs/ssot/DECISION_BACKLOG.md",
    ],
    skipTemplates: [
      "SSOT-2_UI_STATE",
      "docs/design/features/common/",
      "docs/marketing/",
      "docs/growth/",
      "public/",
    ],
    directories: [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/design/features/project",
      "docs/design/adr",
      "docs/standards",
      "docs/notes",
      "docs/operations",
      "docs/management",
      "docs/ssot",
      "src",
      "tests",
    ],
    defaultTechStack: {
      frontend: null,
      backend: "Express or Hono",
      database: "PostgreSQL (Supabase or raw)",
      auth: "JWT",
      hosting: "Fly.io or Railway",
      testing: "Vitest",
    },
  },
  cli: {
    id: "cli",
    name: "CLI Tool",
    description: "コマンドラインツール",
    enabledSsot: ["SSOT-0_PRD", "SSOT-3_API_CONTRACT"],
    enabledAudit: ["code", "test"],
    discoveryStages: [1, 2, 3],
    freezeRequired: [1, 2, 3],
    marketing: "none",
    requiredTemplates: [
      "docs/idea/IDEA_CANVAS.md",
      "docs/idea/USER_PERSONA.md",
      "docs/requirements/SSOT-0_PRD.md",
      "docs/design/core/SSOT-3_API_CONTRACT.md",
      "docs/standards/TECH_STACK.md",
      "docs/standards/CODING_STANDARDS.md",
      "docs/standards/TESTING_STANDARDS.md",
      "docs/ssot/DECISION_BACKLOG.md",
    ],
    skipTemplates: [
      "SSOT-1_FEATURE_CATALOG",
      "SSOT-2_UI_STATE",
      "SSOT-4_DATA_MODEL",
      "docs/design/features/common/",
      "docs/marketing/",
      "docs/growth/",
      "docs/operations/",
      "public/",
    ],
    directories: [
      "docs/idea",
      "docs/requirements",
      "docs/design/core",
      "docs/design/features/project",
      "docs/design/adr",
      "docs/standards",
      "docs/notes",
      "docs/management",
      "docs/ssot",
      "src",
      "tests",
    ],
    defaultTechStack: {
      frontend: null,
      backend: "Node.js (TypeScript)",
      database: null,
      auth: null,
      hosting: "npm registry",
      testing: "Vitest",
      cli_framework: "Commander.js or oclif",
    },
  },
};

// ─────────────────────────────────────────────
// Profile Access
// ─────────────────────────────────────────────

export function getProfile(type: ProfileType): ProjectProfile {
  return PROFILES[type];
}

export function isValidProfileType(type: string): type is ProfileType {
  return PROFILE_TYPES.includes(type as ProfileType);
}

// ─────────────────────────────────────────────
// Profile-based Filtering
// ─────────────────────────────────────────────

/**
 * Check if a template path should be created for this profile.
 * Returns false if matched by skipTemplates, true if in requiredTemplates.
 */
export function isTemplateEnabled(
  profile: ProjectProfile,
  templatePath: string,
): boolean {
  // Check explicit skip patterns
  for (const skip of profile.skipTemplates) {
    if (skip.endsWith("/")) {
      // Directory pattern
      if (templatePath.startsWith(skip)) {
        return false;
      }
    } else {
      // Filename or partial match
      if (templatePath.includes(skip)) {
        return false;
      }
    }
  }

  // If requiredTemplates is specified, only include those
  if (profile.requiredTemplates.length > 0) {
    return profile.requiredTemplates.some((req) => {
      if (req.endsWith("/")) {
        return templatePath.startsWith(req);
      }
      return templatePath === req;
    });
  }

  return true;
}

/**
 * Check if an audit mode is enabled for this profile
 */
export function isAuditEnabled(
  profile: ProjectProfile,
  mode: string,
): boolean {
  return profile.enabledAudit.includes(mode);
}

/**
 * Get discovery stages for this profile
 */
export function getDiscoveryStages(profile: ProjectProfile): number[] {
  return profile.discoveryStages;
}

// ─────────────────────────────────────────────
// Auto-detection
// ─────────────────────────────────────────────

const INFERENCE_RULES: { keywords: string[]; type: ProfileType }[] = [
  {
    keywords: [
      "cli",
      "command line",
      "command-line",
      "コマンドライン",
      "terminal",
    ],
    type: "cli",
  },
  {
    keywords: ["api", "backend", "バックエンド", "サーバー", "server", "rest"],
    type: "api",
  },
  {
    keywords: [
      "landing",
      "lp",
      "ランディング",
      "ティザー",
      "teaser",
      "プレローンチ",
    ],
    type: "lp",
  },
  {
    keywords: [
      "homepage",
      "corporate",
      "ホームページ",
      "コーポレート",
      "会社",
      "company",
    ],
    type: "hp",
  },
];

/**
 * Infer project type from description keywords.
 * Returns "app" as default when no keywords match.
 */
export function inferProfileType(description: string): ProfileType {
  const lower = description.toLowerCase();

  for (const rule of INFERENCE_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.type;
    }
  }

  return "app";
}

// ─────────────────────────────────────────────
// State Persistence
// ─────────────────────────────────────────────

/**
 * Load profile type from project state
 */
export function loadProfileType(projectDir: string): ProfileType | null {
  const configPath = path.join(projectDir, ".framework/project.json");
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const state = JSON.parse(raw) as Record<string, unknown>;

    // v4 format: "profileType"
    const profileType = state.profileType;
    if (
      typeof profileType === "string" &&
      isValidProfileType(profileType)
    ) {
      return profileType;
    }

    // v3 format fallback: "type"
    const legacyType = state.type;
    if (
      typeof legacyType === "string" &&
      isValidProfileType(legacyType)
    ) {
      return legacyType;
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Load the full profile for the current project (from saved state)
 */
export function loadProjectProfile(
  projectDir: string,
): ProjectProfile | null {
  const type = loadProfileType(projectDir);
  if (!type) return null;
  return getProfile(type);
}
