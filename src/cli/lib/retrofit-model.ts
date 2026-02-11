/**
 * Retrofit model - Types and utilities for retrofitting existing projects
 *
 * Enables existing repositories to be analyzed and migrated
 * under framework management with proper SSOT structure.
 */
import * as fs from "node:fs";
import * as path from "node:path";

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
  // Frameworks
  { name: "Next.js", category: "framework", packageNames: ["next"] },
  { name: "React", category: "framework", packageNames: ["react"] },
  { name: "Vue", category: "framework", packageNames: ["vue"] },
  { name: "Express", category: "framework", packageNames: ["express"] },
  { name: "Fastify", category: "framework", packageNames: ["fastify"] },
  { name: "Hono", category: "framework", packageNames: ["hono"] },
  // Languages
  { name: "TypeScript", category: "language", packageNames: ["typescript"], filePatterns: ["tsconfig.json"] },
  // Database
  { name: "Supabase", category: "database", packageNames: ["@supabase/supabase-js"] },
  { name: "Prisma", category: "database", packageNames: ["prisma", "@prisma/client"] },
  { name: "Drizzle", category: "database", packageNames: ["drizzle-orm"] },
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
// Utility functions
// ─────────────────────────────────────────────

/**
 * Detect tech stack from package.json dependencies
 */
export function detectTechFromPackageJson(
  packageJson: Record<string, unknown>,
): DetectedTech[] {
  const detected: DetectedTech[] = [];
  const deps = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined),
  };

  for (const pattern of TECH_PATTERNS) {
    for (const pkgName of pattern.packageNames) {
      if (deps[pkgName]) {
        detected.push({
          name: pattern.name,
          category: pattern.category,
          version: deps[pkgName],
          source: `package.json (${pkgName})`,
        });
        break;
      }
    }
  }

  return detected;
}

/**
 * Detect tech from file existence
 */
export function detectTechFromFiles(
  existingFiles: string[],
): DetectedTech[] {
  const detected: DetectedTech[] = [];

  for (const pattern of TECH_PATTERNS) {
    if (!pattern.filePatterns) continue;
    for (const filePattern of pattern.filePatterns) {
      if (existingFiles.some((f) => f.endsWith(filePattern))) {
        const alreadyDetected = detected.some(
          (d) => d.name === pattern.name,
        );
        if (!alreadyDetected) {
          detected.push({
            name: pattern.name,
            category: pattern.category,
            source: `file: ${filePattern}`,
          });
        }
      }
    }
  }

  return detected;
}

/**
 * Analyze directory structure
 */
export function analyzeDirectory(
  projectDir: string,
): DirectoryAnalysis {
  const entries = fs.existsSync(projectDir)
    ? fs.readdirSync(projectDir, { withFileTypes: true })
    : [];

  const topLevelDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
    .map((e) => e.name);

  const srcPath = path.join(projectDir, "src");
  const srcSubdirs = fs.existsSync(srcPath)
    ? fs.readdirSync(srcPath, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];

  return {
    hasSrc: topLevelDirs.includes("src"),
    hasDocs: topLevelDirs.includes("docs"),
    hasTests: topLevelDirs.includes("tests") || topLevelDirs.includes("__tests__"),
    hasPublic: topLevelDirs.includes("public"),
    hasFramework: fs.existsSync(path.join(projectDir, ".framework")),
    hasClaudeMd: fs.existsSync(path.join(projectDir, "CLAUDE.md")),
    hasPackageJson: fs.existsSync(path.join(projectDir, "package.json")),
    topLevelDirs,
    srcSubdirs,
  };
}

/**
 * Count files and lines by extension
 */
export function countFiles(
  projectDir: string,
  extensions: string[],
): FileStats {
  const byExtension: Record<string, number> = {};
  let totalFiles = 0;
  let totalLines = 0;

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name);
        if (extensions.length === 0 || extensions.includes(ext)) {
          totalFiles++;
          byExtension[ext] = (byExtension[ext] ?? 0) + 1;
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            totalLines += content.split("\n").length;
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  walk(projectDir);
  return { totalFiles, totalLines, byExtension };
}

/**
 * Find existing documentation files
 */
export function findExistingDocs(
  projectDir: string,
): ExistingDoc[] {
  const docs: ExistingDoc[] = [];

  function walk(dir: string, category: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, entry.name);
      } else if (entry.name.endsWith(".md")) {
        const stat = fs.statSync(fullPath);
        docs.push({
          path: path.relative(projectDir, fullPath),
          name: entry.name,
          sizeBytes: stat.size,
          category,
        });
      }
    }
  }

  // Check docs/ directory
  walk(path.join(projectDir, "docs"), "docs");

  // Check root-level markdown files
  const rootEntries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const fullPath = path.join(projectDir, entry.name);
      const stat = fs.statSync(fullPath);
      docs.push({
        path: entry.name,
        name: entry.name,
        sizeBytes: stat.size,
        category: "root",
      });
    }
  }

  return docs;
}

/**
 * Identify SSOT gaps by comparing expected docs vs existing
 */
export function identifyGaps(
  projectDir: string,
  existingDocs: ExistingDoc[],
): SSOTGap[] {
  const gaps: SSOTGap[] = [];
  const existingPaths = new Set(existingDocs.map((d) => d.path));

  for (const expected of EXPECTED_SSOT_DOCS) {
    const fullPath = path.join(projectDir, expected.path);
    const exists = fs.existsSync(fullPath);

    if (!exists) {
      gaps.push({
        ssoId: expected.ssoId,
        name: expected.name,
        path: expected.path,
        status: "missing",
        recommendation: expected.required
          ? `Required: Generate ${expected.name} from codebase analysis`
          : `Optional: Generate ${expected.name} when ready`,
      });
    } else {
      // Check if it's a stub (very small file)
      const stat = fs.statSync(fullPath);
      if (stat.size < 100) {
        gaps.push({
          ssoId: expected.ssoId,
          name: expected.name,
          path: expected.path,
          status: "partial",
          recommendation: `Stub only: Flesh out ${expected.name} with actual content`,
        });
      } else {
        gaps.push({
          ssoId: expected.ssoId,
          name: expected.name,
          path: expected.path,
          status: "exists",
          recommendation: "Audit with 'framework audit ssot' to verify quality",
        });
      }
    }
  }

  return gaps;
}

/**
 * Calculate retrofit readiness score
 */
export function calculateReadiness(
  directory: DirectoryAnalysis,
  techStack: DetectedTech[],
  gaps: SSOTGap[],
): RetrofitReadiness {
  const checks: ReadinessCheck[] = [];

  // 1. Has package.json (10pts)
  checks.push({
    name: "package.json exists",
    passed: directory.hasPackageJson,
    points: 10,
    detail: directory.hasPackageJson ? undefined : "No package.json found",
  });

  // 2. Has src/ directory (10pts)
  checks.push({
    name: "src/ directory exists",
    passed: directory.hasSrc,
    points: 10,
    detail: directory.hasSrc ? undefined : "No src/ directory",
  });

  // 3. Framework detected (10pts)
  const hasFramework = techStack.some((t) => t.category === "framework");
  checks.push({
    name: "Framework detected",
    passed: hasFramework,
    points: 10,
    detail: hasFramework
      ? techStack.filter((t) => t.category === "framework").map((t) => t.name).join(", ")
      : "No framework detected",
  });

  // 4. TypeScript (10pts)
  const hasTs = techStack.some((t) => t.name === "TypeScript");
  checks.push({
    name: "TypeScript configured",
    passed: hasTs,
    points: 10,
    detail: hasTs ? undefined : "TypeScript not detected",
  });

  // 5. Testing framework (10pts)
  const hasTesting = techStack.some((t) => t.category === "testing");
  checks.push({
    name: "Testing framework configured",
    passed: hasTesting,
    points: 10,
    detail: hasTesting
      ? techStack.filter((t) => t.category === "testing").map((t) => t.name).join(", ")
      : "No testing framework detected",
  });

  // 6. Has docs/ (10pts)
  checks.push({
    name: "docs/ directory exists",
    passed: directory.hasDocs,
    points: 10,
    detail: directory.hasDocs ? undefined : "No docs/ directory - will be created",
  });

  // 7. Required SSOTs exist (20pts)
  const requiredGaps = gaps.filter(
    (g) => EXPECTED_SSOT_DOCS.find((e) => e.ssoId === g.ssoId)?.required,
  );
  const requiredExisting = requiredGaps.filter((g) => g.status === "exists");
  const requiredScore = requiredGaps.length > 0
    ? Math.round((requiredExisting.length / requiredGaps.length) * 20)
    : 0;
  checks.push({
    name: "Required SSOT documents",
    passed: requiredScore === 20,
    points: requiredScore,
    detail: `${requiredExisting.length}/${requiredGaps.length} required SSOTs exist`,
  });

  // 8. Not already under framework management (10pts)
  checks.push({
    name: "Not already managed",
    passed: !directory.hasFramework,
    points: 10,
    detail: directory.hasFramework
      ? "Already has .framework/ directory"
      : undefined,
  });

  // 9. Has CLAUDE.md (10pts)
  checks.push({
    name: "CLAUDE.md exists",
    passed: directory.hasClaudeMd,
    points: 10,
    detail: directory.hasClaudeMd ? undefined : "Will be generated",
  });

  const score = checks.reduce((sum, c) => sum + (c.passed ? c.points : 0), 0);
  const maxScore = checks.reduce((sum, c) => sum + c.points, 0);

  return { score, maxScore, details: checks };
}

/**
 * Save retrofit report to .framework/
 */
export function saveRetrofitReport(
  projectDir: string,
  report: RetrofitReport,
): string {
  const frameworkDir = path.join(projectDir, ".framework");
  if (!fs.existsSync(frameworkDir)) {
    fs.mkdirSync(frameworkDir, { recursive: true });
  }

  const filename = "retrofit-report.json";
  const filePath = path.join(frameworkDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

/**
 * Load retrofit report
 */
export function loadRetrofitReport(
  projectDir: string,
): RetrofitReport | null {
  const filePath = path.join(projectDir, ".framework", "retrofit-report.json");
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as RetrofitReport;
}

/**
 * Generate SSOT stub content for a missing document
 */
export function generateSSOTStub(
  expected: ExpectedDoc,
  techStack: DetectedTech[],
  projectName: string,
): string {
  const date = new Date().toISOString().split("T")[0];
  const techList = techStack.map((t) => t.name).join(", ");

  switch (expected.ssoId) {
    case "SSOT-0":
      return generatePRDStub(projectName, techList, date);
    case "SSOT-1":
      return generateFeatureCatalogStub(projectName, date);
    case "SSOT-2":
      return generateUIStateStub(projectName, date);
    case "SSOT-3":
      return generateAPIContractStub(projectName, date);
    case "SSOT-4":
      return generateDataModelStub(projectName, date);
    case "SSOT-5":
      return generateCrossCuttingStub(projectName, date);
    case "STD-TECH":
      return generateTechStackDoc(techStack, projectName, date);
    default:
      return `# ${expected.name}\n\n> Generated by framework retrofit on ${date}\n> Project: ${projectName}\n\n---\n\n> **[要記入]** 既存の実装に基づいてこのドキュメントを記入してください。\n`;
  }
}

// ─────────────────────────────────────────────
// SSOT stub generators
// ─────────────────────────────────────────────

function generatePRDStub(
  projectName: string,
  techList: string,
  date: string,
): string {
  return `# SSOT-0: PRD - ${projectName}

> Generated by framework retrofit on ${date}
> Status: Draft - Review and complete all sections

---

## §1 Product Overview

| Item | Value |
|------|-------|
| Product Name | ${projectName} |
| Tech Stack | ${techList} |
| Status | Retrofitted from existing codebase |

## §2 Problem Statement

> **[要記入]** このプロダクトが解決する課題を記述してください。
> 例: 「中小企業の経費精算が紙ベースで月10時間かかっている」
> ヒント: 既存コードの README や LP があれば参照

## §3 Target Users

> **[要記入]** ターゲットユーザーを定義してください。
> 例: 「従業員50名以下の中小企業の経理担当者」

## §4 Solution Overview

> **[要記入]** 課題をどう解決するか記述してください。
> ヒント: 既存コードの主要機能から逆算

## §5 Functional Requirements

> **[要記入]** 既存コードから機能要件を抽出してください。
> Claude Code で自動抽出: "src/ のルート・コンポーネント・APIから機能要件を抽出して FR-001 形式でリストして"

## §6 Non-Functional Requirements

> **[要記入]** 性能・セキュリティ・スケーラビリティ要件を定義してください。
> 既存の設定ファイル（rate limit, cache, timeout 等）から抽出可能

## §7 Success Metrics

> **[要記入]** 測定可能な成功基準を定義してください。

## §8 Scope

> **[要記入]** スコープの内外を定義してください。

## §9 Milestones

> **[要記入]** プロジェクトのマイルストーンを定義してください。

## §10 Risks

> **[要記入]** プロジェクトリスクを特定してください。

## §11 Dependencies

> **[要記入]** 外部依存関係をリストしてください。
> ヒント: package.json / requirements.txt から自動抽出可能

## §12 Glossary

> **[要記入]** ドメイン固有の用語を定義してください。
`;
}

function generateFeatureCatalogStub(
  projectName: string,
  date: string,
): string {
  return `# SSOT-1: Feature Catalog - ${projectName}

> Generated by framework retrofit on ${date}
> Status: Draft - Extract features from existing codebase

---

## Feature List

| ID | Feature | Priority | Status | SSOT |
|----|---------|----------|--------|------|
| FEAT-001 | [要記入] | P0 | Existing | - |

> **[要記入]** 既存のルート・コンポーネント・APIエンドポイントを分析して機能カタログを構築してください。
> Claude Code で自動抽出: "src/ を分析して機能カタログを FEAT-XXX 形式で生成して"
`;
}

function generateUIStateStub(
  projectName: string,
  date: string,
): string {
  return `# SSOT-2: UI/State Transitions - ${projectName}

> Generated by framework retrofit on ${date}

---

## Screens

> **[要記入]** 既存の画面/ページをコードベースから抽出してください。
> Claude Code で自動抽出: "src/app/ のルートを分析して画面一覧を生成して"

## State Transitions

> **[要記入]** 既存のUI状態遷移ロジックをマッピングしてください。
`;
}

function generateAPIContractStub(
  projectName: string,
  date: string,
): string {
  return `# SSOT-3: API Contract - ${projectName}

> Generated by framework retrofit on ${date}

---

## API Endpoints

> **[要記入]** 既存のルートハンドラからAPIエンドポイントを抽出してください。
> Claude Code で自動抽出: "src/app/api/ を分析してAPIエンドポイント一覧を生成して"

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/... | [要記入] | [要記入] |
`;
}

function generateDataModelStub(
  projectName: string,
  date: string,
): string {
  return `# SSOT-4: Data Model - ${projectName}

> Generated by framework retrofit on ${date}

---

## Tables / Collections

> **[要記入]** 既存のスキーマ/マイグレーションからデータモデルを抽出してください。
> Claude Code で自動抽出: "prisma/schema.prisma（または同等）を分析してテーブル一覧を生成して"

## Relationships

> **[要記入]** エンティティ間のリレーションシップを記述してください。
`;
}

function generateCrossCuttingStub(
  projectName: string,
  date: string,
): string {
  return `# SSOT-5: Cross-Cutting Concerns - ${projectName}

> Generated by framework retrofit on ${date}

---

## Authentication

> **[要記入]** 既存の認証実装を記述してください。
> ヒント: middleware, session, JWT, OAuth 等の実装を確認

## Error Handling

> **[要記入]** エラーハンドリングパターンを記述してください。
> ヒント: try-catch, error boundary, API error response の実装を確認

## Logging

> **[要記入]** ログ戦略を記述してください。
`;
}

function generateTechStackDoc(
  techStack: DetectedTech[],
  projectName: string,
  date: string,
): string {
  const grouped: Record<string, DetectedTech[]> = {};
  for (const tech of techStack) {
    const cat = tech.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tech);
  }

  let content = `# Tech Stack - ${projectName}

> Auto-detected by framework retrofit on ${date}

---

## Detected Technologies

| Category | Technology | Version | Source |
|----------|-----------|---------|--------|
`;

  for (const tech of techStack) {
    content += `| ${tech.category} | ${tech.name} | ${tech.version ?? "-"} | ${tech.source} |\n`;
  }

  content += `
---

## Notes

> This document was auto-generated from package.json analysis.
> Review and add any technologies not detected automatically.
`;

  return content;
}

/**
 * Generate retrofit markdown report
 */
export function generateRetrofitMarkdown(
  report: RetrofitReport,
): string {
  const missingCount = report.gaps.filter((g) => g.status === "missing").length;
  const partialCount = report.gaps.filter((g) => g.status === "partial").length;
  const existsCount = report.gaps.filter((g) => g.status === "exists").length;

  let md = `# Retrofit Report - ${report.projectName}

> Scanned: ${report.scannedAt}

---

## Readiness Score

**${report.readiness.score}/${report.readiness.maxScore}**

| Check | Status | Points |
|-------|--------|--------|
`;

  for (const check of report.readiness.details) {
    const status = check.passed ? "PASS" : "FAIL";
    const detail = check.detail ? ` (${check.detail})` : "";
    md += `| ${check.name}${detail} | ${status} | ${check.passed ? check.points : 0}/${check.points} |\n`;
  }

  md += `
---

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
`;

  for (const tech of report.techStack) {
    md += `| ${tech.category} | ${tech.name} | ${tech.version ?? "-"} |\n`;
  }

  md += `
---

## File Statistics

| Metric | Value |
|--------|-------|
| Total Files | ${report.fileStats.totalFiles} |
| Total Lines | ${report.fileStats.totalLines} |
`;

  for (const [ext, count] of Object.entries(report.fileStats.byExtension)) {
    md += `| ${ext} files | ${count} |\n`;
  }

  md += `
---

## SSOT Gap Analysis

**${existsCount} exists / ${partialCount} partial / ${missingCount} missing**

| SSOT | Name | Status | Recommendation |
|------|------|--------|----------------|
`;

  for (const gap of report.gaps) {
    const statusIcon = gap.status === "exists" ? "EXISTS" : gap.status === "partial" ? "PARTIAL" : "MISSING";
    md += `| ${gap.ssoId} | ${gap.name} | ${statusIcon} | ${gap.recommendation} |\n`;
  }

  md += `
---

## Next Steps

1. Review and complete generated SSOT stubs
2. Run \`framework audit ssot <path>\` on each document
3. Use \`framework status\` to track progress
`;

  return md;
}
