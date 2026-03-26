/**
 * Retrofit model - Types, interfaces, and constants for retrofitting existing projects
 *
 * Enables existing repositories to be analyzed and migrated
 * under framework management with proper SSOT structure.
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RetrofitPhase =
  | "scan"
  | "analyze"
  | "gap"
  | "generate"
  | "migrate";

export type TechCategory =
  | "framework"
  | "language"
  | "database"
  | "hosting"
  | "testing"
  | "styling"
  | "auth"
  | "other";

export interface DetectedTech {
  name: string;
  category: TechCategory;
  version?: string;
  source: string;
}

export interface FileStats {
  totalFiles: number;
  totalLines: number;
  byExtension: Record<string, number>;
}

export interface DirectoryAnalysis {
  hasSrc: boolean;
  hasDocs: boolean;
  hasTests: boolean;
  hasPublic: boolean;
  hasFramework: boolean;
  hasClaudeMd: boolean;
  hasPackageJson: boolean;
  topLevelDirs: string[];
  srcSubdirs: string[];
}

export interface ExistingDoc {
  path: string;
  name: string;
  sizeBytes: number;
  category: string;
}

export interface SSOTGap {
  ssoId: string;
  name: string;
  path: string;
  status: "missing" | "exists" | "partial";
  recommendation: string;
}

export interface RetrofitReport {
  projectDir: string;
  projectName: string;
  scannedAt: string;
  directory: DirectoryAnalysis;
  techStack: DetectedTech[];
  fileStats: FileStats;
  existingDocs: ExistingDoc[];
  gaps: SSOTGap[];
  readiness: RetrofitReadiness;
}

export interface RetrofitReadiness {
  score: number;
  maxScore: number;
  details: ReadinessCheck[];
}

export interface ReadinessCheck {
  name: string;
  passed: boolean;
  points: number;
  detail?: string;
}

// ─────────────────────────────────────────────
// Expected SSOT documents
// ─────────────────────────────────────────────

export interface ExpectedDoc {
  ssoId: string;
  name: string;
  path: string;
  required: boolean;
}

export const EXPECTED_SSOT_DOCS: ExpectedDoc[] = [
  // Requirements
  { ssoId: "SSOT-0", name: "PRD", path: "docs/requirements/SSOT-0_PRD.md", required: true },
  { ssoId: "SSOT-1", name: "Feature Catalog", path: "docs/requirements/SSOT-1_FEATURE_CATALOG.md", required: true },
  // Core design
  { ssoId: "SSOT-2", name: "UI/State", path: "docs/design/core/SSOT-2_UI_STATE.md", required: true },
  { ssoId: "SSOT-3", name: "API Contract", path: "docs/design/core/SSOT-3_API_CONTRACT.md", required: true },
  { ssoId: "SSOT-4", name: "Data Model", path: "docs/design/core/SSOT-4_DATA_MODEL.md", required: true },
  { ssoId: "SSOT-5", name: "Cross-Cutting", path: "docs/design/core/SSOT-5_CROSS_CUTTING.md", required: true },
  // Standards
  { ssoId: "STD-TECH", name: "Tech Stack", path: "docs/standards/TECH_STACK.md", required: true },
  { ssoId: "STD-CODE", name: "Coding Standards", path: "docs/standards/CODING_STANDARDS.md", required: false },
  { ssoId: "STD-GIT", name: "Git Workflow", path: "docs/standards/GIT_WORKFLOW.md", required: false },
  { ssoId: "STD-TEST", name: "Testing Standards", path: "docs/standards/TESTING_STANDARDS.md", required: false },
  // Idea (optional for retrofit)
  { ssoId: "IDEA", name: "Idea Canvas", path: "docs/idea/IDEA_CANVAS.md", required: false },
  // Operations
  { ssoId: "OPS-ENV", name: "Environments", path: "docs/operations/ENVIRONMENTS.md", required: false },
  { ssoId: "OPS-DEPLOY", name: "Deployment", path: "docs/operations/DEPLOYMENT.md", required: false },
];

// ─────────────────────────────────────────────
// Tech detection patterns
// ─────────────────────────────────────────────

export interface TechPattern {
  name: string;
  category: TechCategory;
  packageNames: string[];
  filePatterns?: string[];
}

export const TECH_PATTERNS: TechPattern[] = [
  // Frameworks (Nuxt3 must come before Next.js/Vue for priority detection)
  { name: "Nuxt3", category: "framework", packageNames: ["nuxt"], filePatterns: ["nuxt.config.ts", "nuxt.config.js"] },
  { name: "Next.js", category: "framework", packageNames: ["next"] },
  { name: "React", category: "framework", packageNames: ["react"] },
  { name: "Vue3", category: "framework", packageNames: ["vue"], filePatterns: [".vue"] },
  { name: "Express", category: "framework", packageNames: ["express"] },
  { name: "Fastify", category: "framework", packageNames: ["fastify"] },
  { name: "Hono", category: "framework", packageNames: ["hono"] },
  // Languages
  { name: "TypeScript", category: "language", packageNames: ["typescript"], filePatterns: ["tsconfig.json"] },
  // Database
  { name: "Supabase", category: "database", packageNames: ["@supabase/supabase-js"] },
  { name: "Prisma", category: "database", packageNames: ["prisma", "@prisma/client"] },
  { name: "Drizzle", category: "database", packageNames: ["drizzle-orm"], filePatterns: ["drizzle.config.ts"] },
  // Testing
  { name: "Vitest", category: "testing", packageNames: ["vitest"] },
  { name: "Jest", category: "testing", packageNames: ["jest"] },
  { name: "Playwright", category: "testing", packageNames: ["@playwright/test"] },
  // Styling
  { name: "Tailwind CSS", category: "styling", packageNames: ["tailwindcss"] },
  { name: "shadcn/ui", category: "styling", packageNames: ["@radix-ui/react-slot"], filePatterns: ["components.json"] },
  // Auth
  { name: "NextAuth", category: "auth", packageNames: ["next-auth"] },
  { name: "Clerk", category: "auth", packageNames: ["@clerk/nextjs"] },
  // Hosting
  { name: "Vercel", category: "hosting", packageNames: ["vercel"], filePatterns: ["vercel.json"] },
];

// ─────────────────────────────────────────────
// Re-exports for backward compatibility
// ─────────────────────────────────────────────

export {
  detectTechFromPackageJson,
  detectTechFromFiles,
  analyzeDirectory,
  countFiles,
  findExistingDocs,
  identifyGaps,
  calculateReadiness,
  saveRetrofitReport,
  loadRetrofitReport,
} from "./retrofit-core.js";

export {
  generateSSOTStub,
  generateRetrofitMarkdown,
} from "./retrofit-templates.js";
