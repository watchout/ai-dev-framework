/**
 * Checkpoint engine - Scans project and creates quality checkpoints
 * Reference: 25_VERIFICATION_LOOPS.md
 *
 * Auto-grades 5 axes via heuristic file analysis:
 * SSOT alignment, code quality, test coverage, type safety, lint
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CheckpointData,
  type CheckpointScores,
  type CheckpointIssue,
  type CheckpointComparison,
  calculateTotalScore,
  scoreLevel,
  generateCheckpointId,
  compareCheckpoints,
  saveCheckpoint,
  loadCheckpoint,
  loadCheckpointIndex,
} from "./verification-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface CheckpointIO {
  print(message: string): void;
}

export function createCheckpointTerminalIO(): CheckpointIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

export function runCheckpoint(
  projectDir: string,
  options: { name?: string; compare?: string },
  io: CheckpointIO,
): CheckpointData {
  io.print(`\n${"━".repeat(38)}`);
  io.print("  CHECKPOINT");
  io.print(`${"━".repeat(38)}`);

  io.print("\n  [1/4] Scanning project files...");
  const srcFiles = collectSourceFiles(projectDir, "src");
  const testFiles = srcFiles.filter((f) => f.includes(".test."));
  const nonTestFiles = srcFiles.filter((f) => !f.includes(".test."));
  io.print(
    `  Found ${srcFiles.length} source files (${testFiles.length} tests)`,
  );

  io.print("  [2/4] Running auto-grader...");
  const issues: CheckpointIssue[] = [];
  const ssotAlignment = scoreSSOTAlignment(projectDir, issues);
  const codeQuality = scoreCodeQuality(projectDir, nonTestFiles, issues);
  const testCoverage = scoreTestCoverage(nonTestFiles, testFiles, issues);
  const typeSafety = scoreTypeSafety(projectDir, nonTestFiles, issues);
  const lint = scoreLint(projectDir, nonTestFiles, issues);

  const rawScores = {
    ssotAlignment, codeQuality, testCoverage, typeSafety, lint,
  };
  const total = calculateTotalScore(rawScores);
  const scores: CheckpointScores = { ...rawScores, total };

  io.print("  [3/4] Generating recommendations...");
  const recommendations = generateRecommendations(scores);

  io.print("  [4/4] Saving checkpoint...");
  const index = loadCheckpointIndex(projectDir);
  const cpId = generateCheckpointId(index);
  const cpName = options.name ?? `checkpoint-${cpId.toLowerCase()}`;

  const data: CheckpointData = {
    id: cpId,
    name: cpName,
    timestamp: new Date().toISOString(),
    filesChanged: srcFiles.map((f) => path.relative(projectDir, f)),
    scores,
    issues,
    recommendations,
  };

  saveCheckpoint(projectDir, data);
  printScorecard(io, data);

  if (options.compare) {
    const prev = loadCheckpoint(projectDir, options.compare);
    if (prev) {
      printComparison(io, compareCheckpoints(prev, data));
    } else {
      io.print(
        `  Checkpoint ${options.compare} not found for comparison.`,
      );
    }
  }

  return data;
}

// ─────────────────────────────────────────────
// File collection
// ─────────────────────────────────────────────

export function collectSourceFiles(
  projectDir: string,
  subdir: string,
): string[] {
  const dir = path.join(projectDir, subdir);
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      results.push(
        ...collectSourceFiles(
          projectDir,
          path.join(subdir, entry.name),
        ),
      );
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─────────────────────────────────────────────
// Scoring Functions (0-100 each)
// ─────────────────────────────────────────────

export function scoreSSOTAlignment(
  projectDir: string,
  issues: CheckpointIssue[],
): number {
  let score = 100;

  const docsDir = path.join(projectDir, "docs", "standards");
  if (!fs.existsSync(docsDir)) {
    score -= 30;
    issues.push({
      category: "ssot", file: "docs/standards/",
      message: "docs/standards/ directory not found",
      severity: "warning",
    });
  } else {
    const files = fs.readdirSync(docsDir).filter(
      (f) => f.endsWith(".md"),
    );
    if (files.length === 0) {
      score -= 25;
      issues.push({
        category: "ssot", file: "docs/standards/",
        message: "No markdown files in docs/standards/",
        severity: "warning",
      });
    }
  }

  if (!fs.existsSync(path.join(projectDir, ".framework"))) {
    score -= 15;
    issues.push({
      category: "ssot", file: ".framework/",
      message: ".framework/ directory not found",
      severity: "warning",
    });
  }

  if (!fs.existsSync(path.join(projectDir, "CLAUDE.md"))) {
    score -= 10;
    issues.push({
      category: "ssot", file: "CLAUDE.md",
      message: "CLAUDE.md not found",
      severity: "warning",
    });
  }

  return Math.max(0, score);
}

export function scoreCodeQuality(
  projectDir: string,
  files: string[],
  issues: CheckpointIssue[],
): number {
  if (files.length === 0) return 100;

  let totalDeductions = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const rel = path.relative(projectDir, file);

    if (lines.length > 200) {
      totalDeductions += 3;
      issues.push({
        category: "code", file: rel,
        message: `File has ${lines.length} lines (exceeds 200)`,
        severity: "warning",
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const indent = lines[i].match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent >= 16) {
        totalDeductions += 2;
        issues.push({
          category: "code", file: rel, line: i + 1,
          message: "Deeply nested code (4+ levels)",
          severity: "warning",
        });
        break;
      }
    }
  }

  const penalty = Math.min(
    100,
    (totalDeductions / files.length) * 20,
  );
  return Math.max(0, Math.round(100 - penalty));
}

export function scoreTestCoverage(
  sourceFiles: string[],
  testFiles: string[],
  issues: CheckpointIssue[],
): number {
  if (sourceFiles.length === 0) return 100;

  const testBasenames = new Set(
    testFiles.map((f) =>
      path.basename(f).replace(/\.test\.(ts|tsx|js|jsx)$/, ""),
    ),
  );

  let covered = 0;
  for (const src of sourceFiles) {
    const base = path.basename(src).replace(/\.(ts|tsx|js|jsx)$/, "");
    if (testBasenames.has(base)) covered++;
  }

  const ratio = covered / sourceFiles.length;
  const score = Math.round(ratio * 100);

  if (score < 60) {
    issues.push({
      category: "tests", file: "src/",
      message: `${sourceFiles.length - covered} source files have no test`,
      severity: "error",
    });
  }

  return score;
}

export function scoreTypeSafety(
  projectDir: string,
  files: string[],
  issues: CheckpointIssue[],
): number {
  if (files.length === 0) return 100;

  let anyCount = 0;
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const rel = path.relative(projectDir, file);

    for (let i = 0; i < lines.length; i++) {
      if (/:\s*any\b|<any>|as\s+any\b/.test(lines[i])) {
        anyCount++;
        issues.push({
          category: "types", file: rel, line: i + 1,
          message: "'any' type usage", severity: "error",
        });
      }
    }
  }

  return Math.max(0, 100 - Math.min(100, anyCount * 10));
}

export function scoreLint(
  projectDir: string,
  files: string[],
  issues: CheckpointIssue[],
): number {
  if (files.length === 0) return 100;

  let lintIssues = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const rel = path.relative(projectDir, file);

    for (let i = 0; i < lines.length; i++) {
      if (/\bconsole\.(log|warn|error|info|debug)\b/.test(lines[i])) {
        lintIssues++;
        issues.push({
          category: "lint", file: rel, line: i + 1,
          message: "console.log in production code",
          severity: "warning",
        });
      }
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(lines[i])) {
        lintIssues++;
        issues.push({
          category: "lint", file: rel, line: i + 1,
          message: "TODO/FIXME comment", severity: "warning",
        });
      }
    }
  }

  return Math.max(0, 100 - Math.min(100, lintIssues * 5));
}

// ─────────────────────────────────────────────
// Recommendations
// ─────────────────────────────────────────────

function generateRecommendations(
  scores: CheckpointScores,
): string[] {
  const recs: string[] = [];
  if (scores.ssotAlignment < 70) {
    recs.push(
      "Run 'framework init' to set up docs/standards/ and .framework/",
    );
  }
  if (scores.codeQuality < 80) {
    recs.push("Refactor long files and reduce nesting depth");
  }
  if (scores.testCoverage < 60) {
    recs.push("Add test files for untested source modules");
  }
  if (scores.typeSafety < 90) {
    recs.push("Replace all 'any' types with specific types");
  }
  if (scores.lint < 80) {
    recs.push("Remove console.log and resolve TODO/FIXME comments");
  }
  if (recs.length === 0) {
    recs.push("All scores are healthy. Continue maintaining quality.");
  }
  return recs;
}

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

function printScorecard(
  io: CheckpointIO,
  data: CheckpointData,
): void {
  io.print("");
  io.print("  ┌──────────────────┬───────┐");
  io.print("  │ Axis             │ Score │");
  io.print("  ├──────────────────┼───────┤");

  const axes: Array<[string, number]> = [
    ["SSOT Alignment", data.scores.ssotAlignment],
    ["Code Quality", data.scores.codeQuality],
    ["Test Coverage", data.scores.testCoverage],
    ["Type Safety", data.scores.typeSafety],
    ["Lint", data.scores.lint],
  ];

  for (const [name, score] of axes) {
    const label = name.padEnd(16);
    const scoreStr = String(score).padStart(3);
    const level = scoreLevel(score);
    const ind =
      level === "pass" ? "  " : level === "warning" ? " !" : " X";
    io.print(`  │ ${label} │ ${scoreStr}${ind} │`);
  }

  io.print("  ├──────────────────┼───────┤");
  const totalStr = String(data.scores.total).padStart(3);
  io.print(`  │ ${"TOTAL".padEnd(16)} │ ${totalStr}   │`);
  io.print("  └──────────────────┴───────┘");
  io.print("");

  const verdict = scoreLevel(data.scores.total);
  io.print(`  Verdict: ${verdict.toUpperCase()}`);
  io.print(`  Checkpoint: ${data.id} (${data.name})`);
  io.print("");

  if (data.issues.length > 0) {
    const errs = data.issues.filter((i) => i.severity === "error");
    const warns = data.issues.filter((i) => i.severity === "warning");
    io.print(
      `  Issues: ${errs.length} errors, ${warns.length} warnings`,
    );
  }

  if (data.recommendations.length > 0) {
    io.print("  Recommendations:");
    for (const rec of data.recommendations) {
      io.print(`    - ${rec}`);
    }
  }
  io.print("");
}

function printComparison(
  io: CheckpointIO,
  comparison: CheckpointComparison,
): void {
  io.print("  Comparison:");
  io.print(`  ${comparison.from.id} -> ${comparison.to.id}`);
  io.print("");

  for (const [key, delta] of Object.entries(comparison.scoreDiffs)) {
    if (key === "total") continue;
    const sign = delta > 0 ? "+" : "";
    io.print(`    ${key}: ${sign}${delta}`);
  }

  const totalDelta = comparison.scoreDiffs["total"] ?? 0;
  const totalSign = totalDelta > 0 ? "+" : "";
  io.print(`    total: ${totalSign}${totalDelta}`);
  io.print("");
  io.print(`  Resolved issues: ${comparison.resolvedIssues}`);
  io.print(`  New issues: ${comparison.newIssues}`);
  io.print("");
}
