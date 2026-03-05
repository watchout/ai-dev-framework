/**
 * Retrofit core - Utility functions for scanning and analyzing existing projects
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  DetectedTech,
  DirectoryAnalysis,
  ExistingDoc,
  FileStats,
  ReadinessCheck,
  RetrofitReadiness,
  RetrofitReport,
  SSOTGap,
} from "./retrofit-model.js";
import { EXPECTED_SSOT_DOCS, TECH_PATTERNS } from "./retrofit-model.js";

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
