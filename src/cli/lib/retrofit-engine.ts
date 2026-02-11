/**
 * Retrofit engine - Scans, analyzes, and migrates existing projects
 *
 * Phases:
 * 1. Scan: Read project structure and detect tech stack
 * 2. Analyze: Assess architecture and existing documentation
 * 3. Gap: Identify missing SSOT documents
 * 4. Generate: Create SSOT stubs from analysis
 * 5. Migrate: Set up .framework/ and CLAUDE.md
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type RetrofitReport,
  type RetrofitPhase,
  type SSOTGap,
  EXPECTED_SSOT_DOCS,
  analyzeDirectory,
  countFiles,
  detectTechFromPackageJson,
  detectTechFromFiles,
  findExistingDocs,
  identifyGaps,
  calculateReadiness,
  saveRetrofitReport,
  generateSSOTStub,
  generateRetrofitMarkdown,
} from "./retrofit-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface RetrofitIO {
  print(message: string): void;
}

export interface RetrofitOptions {
  projectDir: string;
  io: RetrofitIO;
  dryRun: boolean;
  generateStubs: boolean;
}

export interface RetrofitResult {
  report: RetrofitReport;
  generatedFiles: string[];
  errors: string[];
}

export function createRetrofitTerminalIO(): RetrofitIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run the full retrofit process
 */
export async function runRetrofit(
  options: RetrofitOptions,
): Promise<RetrofitResult> {
  const { projectDir, io, dryRun, generateStubs } = options;
  const errors: string[] = [];
  const generatedFiles: string[] = [];

  if (!fs.existsSync(projectDir)) {
    errors.push(`Project directory not found: ${projectDir}`);
    return { report: createEmptyReport(projectDir), generatedFiles, errors };
  }

  const totalSteps = generateStubs ? 5 : 3;
  let step = 0;

  // ── Phase 1: Scan ──
  step++;
  printPhase(io, step, totalSteps, "scan", "Scanning project structure...");

  const directory = analyzeDirectory(projectDir);
  const topLevelFiles = fs.readdirSync(projectDir).filter(
    (f) => !fs.statSync(path.join(projectDir, f)).isDirectory(),
  );

  // Detect tech stack
  let packageJson: Record<string, unknown> = {};
  const packageJsonPath = path.join(projectDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    packageJson = JSON.parse(raw) as Record<string, unknown>;
  }

  const techFromPkg = detectTechFromPackageJson(packageJson);
  const techFromFiles = detectTechFromFiles(topLevelFiles);

  // Merge tech detections (avoid duplicates)
  const techNames = new Set(techFromPkg.map((t) => t.name));
  const techStack = [
    ...techFromPkg,
    ...techFromFiles.filter((t) => !techNames.has(t.name)),
  ];

  io.print(`  Found ${directory.topLevelDirs.length} directories`);
  io.print(`  Detected ${techStack.length} technologies`);

  // ── Phase 2: Analyze ──
  step++;
  printPhase(io, step, totalSteps, "analyze", "Analyzing codebase...");

  const fileStats = countFiles(projectDir, [".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".css"]);
  const existingDocs = findExistingDocs(projectDir);

  io.print(`  ${fileStats.totalFiles} files, ${fileStats.totalLines} lines`);
  io.print(`  ${existingDocs.length} markdown documents found`);

  // ── Phase 3: Gap Analysis ──
  step++;
  printPhase(io, step, totalSteps, "gap", "Identifying SSOT gaps...");

  const gaps = identifyGaps(projectDir, existingDocs);
  const missingCount = gaps.filter((g) => g.status === "missing").length;
  const partialCount = gaps.filter((g) => g.status === "partial").length;
  const existsCount = gaps.filter((g) => g.status === "exists").length;

  io.print(`  ${existsCount} exists, ${partialCount} partial, ${missingCount} missing`);

  // Calculate readiness
  const readiness = calculateReadiness(directory, techStack, gaps);
  const projectName = (packageJson.name as string | undefined) ?? path.basename(projectDir);

  // Build report
  const report: RetrofitReport = {
    projectDir,
    projectName,
    scannedAt: new Date().toISOString(),
    directory,
    techStack,
    fileStats,
    existingDocs,
    gaps,
    readiness,
  };

  // ── Phase 4: Generate SSOT stubs (if requested) ──
  if (generateStubs) {
    step++;
    printPhase(io, step, totalSteps, "generate", "Generating SSOT stubs...");

    const missingGaps = gaps.filter((g) => g.status === "missing");
    for (const gap of missingGaps) {
      const expected = EXPECTED_SSOT_DOCS.find((e) => e.ssoId === gap.ssoId);
      if (!expected) continue;

      const stubContent = generateSSOTStub(expected, techStack, projectName);
      const filePath = path.join(projectDir, expected.path);

      if (dryRun) {
        io.print(`  [DRY RUN] Would create: ${expected.path}`);
      } else {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, stubContent, "utf-8");
        io.print(`  Created: ${expected.path}`);
      }
      generatedFiles.push(expected.path);
    }

    // ── Phase 5: Migrate ──
    step++;
    printPhase(io, step, totalSteps, "migrate", "Setting up framework management...");

    if (dryRun) {
      io.print("  [DRY RUN] Would create .framework/ directory");
      io.print("  [DRY RUN] Would save retrofit report");
    } else {
      const reportFilename = saveRetrofitReport(projectDir, report);
      io.print(`  Saved: .framework/${reportFilename}`);
      generatedFiles.push(`.framework/${reportFilename}`);
    }
  } else {
    // Save report even in scan-only mode
    if (!dryRun) {
      const reportFilename = saveRetrofitReport(projectDir, report);
      generatedFiles.push(`.framework/${reportFilename}`);
    }
  }

  // Print summary
  printSummary(io, report, generatedFiles, dryRun);

  return { report, generatedFiles, errors };
}

// ─────────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────────

function printPhase(
  io: RetrofitIO,
  step: number,
  total: number,
  _phase: RetrofitPhase,
  message: string,
): void {
  io.print(`\n  [${step}/${total}] ${message}`);
}

function printSummary(
  io: RetrofitIO,
  report: RetrofitReport,
  generatedFiles: string[],
  dryRun: boolean,
): void {
  io.print("");
  io.print("━".repeat(38));
  io.print("  RETROFIT SUMMARY");
  io.print("━".repeat(38));
  io.print("");
  io.print(`  Project: ${report.projectName}`);
  io.print(`  Readiness: ${report.readiness.score}/${report.readiness.maxScore}`);
  io.print("");

  // Tech stack
  io.print("  Tech Stack:");
  for (const tech of report.techStack) {
    const ver = tech.version ? ` (${tech.version})` : "";
    io.print(`    - ${tech.name}${ver}`);
  }
  io.print("");

  // Readiness checks
  io.print("  Readiness Checks:");
  for (const check of report.readiness.details) {
    const icon = check.passed ? "[PASS]" : "[FAIL]";
    io.print(`    ${icon} ${check.name}`);
  }
  io.print("");

  // Gap summary
  const missing = report.gaps.filter((g) => g.status === "missing");
  const partial = report.gaps.filter((g) => g.status === "partial");

  if (missing.length > 0) {
    io.print("  Missing SSOTs:");
    for (const gap of missing) {
      io.print(`    - ${gap.ssoId}: ${gap.name}`);
    }
    io.print("");
  }

  if (partial.length > 0) {
    io.print("  Partial SSOTs (stubs only):");
    for (const gap of partial) {
      io.print(`    - ${gap.ssoId}: ${gap.name}`);
    }
    io.print("");
  }

  if (generatedFiles.length > 0) {
    const prefix = dryRun ? "Would generate" : "Generated";
    io.print(`  ${prefix} ${generatedFiles.length} files`);
    io.print("");
  }

  // Next steps
  io.print("  Next Steps:");
  if (missing.length > 0 && generatedFiles.length === 0) {
    io.print("    1. Run 'framework retrofit --generate' to create SSOT stubs");
    io.print("    2. Review and complete generated documents");
    io.print("    3. Run 'framework audit ssot <path>' on each document");
  } else if (generatedFiles.length > 0) {
    io.print("    1. Review and complete generated SSOT documents");
    io.print("    2. Run 'framework audit ssot <path>' on each document");
    io.print("    3. Use 'framework status' to track progress");
  } else {
    io.print("    1. Run 'framework audit ssot <path>' to verify quality");
    io.print("    2. Use 'framework status' to track progress");
  }
  io.print("");
}

function createEmptyReport(projectDir: string): RetrofitReport {
  return {
    projectDir,
    projectName: path.basename(projectDir),
    scannedAt: new Date().toISOString(),
    directory: {
      hasSrc: false,
      hasDocs: false,
      hasTests: false,
      hasPublic: false,
      hasFramework: false,
      hasClaudeMd: false,
      hasPackageJson: false,
      topLevelDirs: [],
      srcSubdirs: [],
    },
    techStack: [],
    fileStats: { totalFiles: 0, totalLines: 0, byExtension: {} },
    existingDocs: [],
    gaps: [],
    readiness: { score: 0, maxScore: 100, details: [] },
  };
}

export { generateRetrofitMarkdown };
