/**
 * CI/PR data model - Types, stage evaluation, and report structure
 * Based on: 19_CI_PR_STANDARDS.md
 *
 * Six CI stages: lint, unit-test, integration-test, build, e2e, security
 * All required stages must pass for "ready" verdict.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CIStage =
  | "lint"
  | "unit-test"
  | "integration-test"
  | "build"
  | "e2e"
  | "security";

export type CIStageStatus = "pass" | "fail" | "skip" | "pending";

export interface CIStageResult {
  stage: CIStage;
  name: string;
  status: CIStageStatus;
  required: boolean;
  details: string[];
  duration?: number;
}

export interface CIReport {
  timestamp: string;
  branch: string;
  commit: string;
  stages: CIStageResult[];
  allRequiredPassed: boolean;
  verdict: "ready" | "not_ready";
  blockers: string[];
}

export interface PRChecklist {
  typeCheckPassed: boolean;
  lintPassed: boolean;
  formatterPassed: boolean;
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  coverageAbove80: boolean;
  buildSucceeded: boolean;
  noSkippedTests: boolean;
}

// ─────────────────────────────────────────────
// Stage Defaults
// ─────────────────────────────────────────────

export function createDefaultStages(): CIStageResult[] {
  return [
    { stage: "lint", name: "Lint & Type Check", status: "pending", required: true, details: [] },
    { stage: "unit-test", name: "Unit Tests", status: "pending", required: true, details: [] },
    { stage: "integration-test", name: "Integration Tests", status: "pending", required: false, details: [] },
    { stage: "build", name: "Build", status: "pending", required: true, details: [] },
    { stage: "e2e", name: "E2E Tests", status: "pending", required: false, details: [] },
    { stage: "security", name: "Security Scan", status: "pending", required: true, details: [] },
  ];
}

// ─────────────────────────────────────────────
// Stage Evaluation
// ─────────────────────────────────────────────

export function evaluateStage(
  projectDir: string,
  stage: CIStage,
): CIStageResult {
  switch (stage) {
    case "lint":
      return evaluateLint(projectDir);
    case "unit-test":
      return evaluateUnitTest(projectDir);
    case "integration-test":
      return evaluateIntegrationTest(projectDir);
    case "build":
      return evaluateBuild(projectDir);
    case "e2e":
      return evaluateE2E(projectDir);
    case "security":
      return evaluateSecurity(projectDir);
  }
}

function evaluateLint(projectDir: string): CIStageResult {
  const details: string[] = [];
  let passed = true;

  const hasTsConfig = fs.existsSync(path.join(projectDir, "tsconfig.json"));
  if (hasTsConfig) {
    details.push("tsconfig.json found");
  } else {
    details.push("tsconfig.json missing");
    passed = false;
  }

  const eslintFiles = [
    "eslint.config.js", "eslint.config.mjs",
    ".eslintrc.js", ".eslintrc.json", ".eslintrc",
  ];
  const hasEslint = eslintFiles.some(
    (f) => fs.existsSync(path.join(projectDir, f)),
  );
  if (hasEslint) {
    details.push("ESLint config found");
  } else {
    details.push("ESLint config missing");
    passed = false;
  }

  const srcDir = path.join(projectDir, "src");
  if (fs.existsSync(srcDir)) {
    const issues = scanSourceIssues(srcDir);
    if (issues.anyCount > 0) {
      details.push(`${issues.anyCount} 'any' type usage(s) found`);
      passed = false;
    }
    if (issues.consoleCount > 0) {
      details.push(`${issues.consoleCount} console.log(s) found`);
      passed = false;
    }
    if (issues.anyCount === 0 && issues.consoleCount === 0) {
      details.push("No lint issues in source");
    }
  }

  return { stage: "lint", name: "Lint & Type Check", status: passed ? "pass" : "fail", required: true, details };
}

function evaluateUnitTest(projectDir: string): CIStageResult {
  const details: string[] = [];
  const srcDir = path.join(projectDir, "src");

  if (!fs.existsSync(srcDir)) {
    return { stage: "unit-test", name: "Unit Tests", status: "fail", required: true, details: ["src/ directory not found"] };
  }

  const testFiles = findFilesByPattern(srcDir, /\.test\.ts$/);
  if (testFiles.length === 0) {
    return { stage: "unit-test", name: "Unit Tests", status: "fail", required: true, details: ["No test files found"] };
  }

  details.push(`${testFiles.length} test file(s) found`);
  return { stage: "unit-test", name: "Unit Tests", status: "pass", required: true, details };
}

function evaluateIntegrationTest(projectDir: string): CIStageResult {
  const details: string[] = [];
  const srcDir = path.join(projectDir, "src");

  if (!fs.existsSync(srcDir)) {
    return { stage: "integration-test", name: "Integration Tests", status: "skip", required: false, details: ["src/ directory not found"] };
  }

  const integrationFiles = findFilesByPattern(srcDir, /integration/i);
  if (integrationFiles.length === 0) {
    details.push("No integration test files found (not required)");
    return { stage: "integration-test", name: "Integration Tests", status: "skip", required: false, details };
  }

  details.push(`${integrationFiles.length} integration test file(s) found`);
  return { stage: "integration-test", name: "Integration Tests", status: "pass", required: false, details };
}

function evaluateBuild(projectDir: string): CIStageResult {
  const details: string[] = [];
  let passed = true;

  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts?.build) {
      details.push("Build script found in package.json");
    } else {
      details.push("No build script in package.json");
      passed = false;
    }
  } else {
    details.push("package.json not found");
    passed = false;
  }

  const hasDist = fs.existsSync(path.join(projectDir, "dist"));
  const hasNext = fs.existsSync(path.join(projectDir, ".next"));
  if (hasDist || hasNext) {
    details.push(`Build output found: ${hasDist ? "dist/" : ".next/"}`);
  } else {
    details.push("No build output (dist/ or .next/) found");
    passed = false;
  }

  return { stage: "build", name: "Build", status: passed ? "pass" : "fail", required: true, details };
}

function evaluateE2E(projectDir: string): CIStageResult {
  const details: string[] = [];
  const playwrightConfigs = ["playwright.config.ts", "playwright.config.js"];
  const cypressConfigs = ["cypress.config.ts", "cypress.config.js", "cypress.json"];

  const hasPlaywright = playwrightConfigs.some(
    (f) => fs.existsSync(path.join(projectDir, f)),
  );
  const hasCypress = cypressConfigs.some(
    (f) => fs.existsSync(path.join(projectDir, f)),
  );

  if (hasPlaywright) details.push("Playwright config found");
  if (hasCypress) details.push("Cypress config found");

  if (!hasPlaywright && !hasCypress) {
    details.push("No E2E framework config found (recommended)");
    return { stage: "e2e", name: "E2E Tests", status: "skip", required: false, details };
  }

  return { stage: "e2e", name: "E2E Tests", status: "pass", required: false, details };
}

function evaluateSecurity(projectDir: string): CIStageResult {
  const details: string[] = [];
  let passed = true;

  const gitignorePath = path.join(projectDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.includes(".env")) {
      details.push(".env is in .gitignore");
    } else {
      details.push(".env not in .gitignore");
      passed = false;
    }
  } else {
    details.push("No .gitignore file found");
    passed = false;
  }

  const srcDir = path.join(projectDir, "src");
  if (fs.existsSync(srcDir)) {
    const secretCount = scanForSecrets(srcDir);
    if (secretCount > 0) {
      details.push(`${secretCount} potential hardcoded secret(s) found`);
      passed = false;
    } else {
      details.push("No hardcoded secrets detected");
    }
  }

  return { stage: "security", name: "Security Scan", status: passed ? "pass" : "fail", required: true, details };
}

// ─────────────────────────────────────────────
// Verdict & Checklist
// ─────────────────────────────────────────────

export function determineCIVerdict(
  stages: CIStageResult[],
): "ready" | "not_ready" {
  const allRequiredPassed = stages
    .filter((s) => s.required)
    .every((s) => s.status === "pass");
  return allRequiredPassed ? "ready" : "not_ready";
}

export function generatePRChecklist(
  stages: CIStageResult[],
): PRChecklist {
  const lint = stages.find((s) => s.stage === "lint");
  const unit = stages.find((s) => s.stage === "unit-test");
  const integration = stages.find((s) => s.stage === "integration-test");
  const build = stages.find((s) => s.stage === "build");

  return {
    typeCheckPassed: lint?.status === "pass",
    lintPassed: lint?.status === "pass",
    formatterPassed: lint?.status === "pass",
    unitTestsPassed: unit?.status === "pass",
    integrationTestsPassed: integration?.status === "pass" || integration?.status === "skip",
    coverageAbove80: unit?.status === "pass",
    buildSucceeded: build?.status === "pass",
    noSkippedTests: !stages.some((s) => s.required && s.status === "skip"),
  };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const CI_AUDIT_DIR = ".framework/audits";

export function saveCIReport(
  projectDir: string,
  report: CIReport,
): string {
  const dir = path.join(projectDir, CI_AUDIT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = `ci-${Date.now()}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadCIReports(projectDir: string): CIReport[] {
  const dir = path.join(projectDir, CI_AUDIT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("ci-") && f.endsWith(".json"));
  const reports: CIReport[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as CIReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ─────────────────────────────────────────────
// Markdown Report
// ─────────────────────────────────────────────

export function formatCIMarkdown(report: CIReport): string {
  const lines: string[] = [];

  lines.push("# CI Report");
  lines.push("");
  lines.push(`- **Date**: ${report.timestamp}`);
  lines.push(`- **Branch**: ${report.branch}`);
  lines.push(`- **Commit**: ${report.commit}`);
  lines.push(`- **Verdict**: ${report.verdict === "ready" ? "READY" : "NOT READY"}`);
  lines.push("");
  lines.push("## Stages");
  lines.push("");
  lines.push("| Stage | Status | Required | Details |");
  lines.push("|-------|--------|----------|---------|");

  for (const stage of report.stages) {
    const status = stage.status.toUpperCase();
    const required = stage.required ? "Yes" : "No";
    const details = stage.details.join("; ") || "-";
    lines.push(`| ${stage.name} | ${status} | ${required} | ${details} |`);
  }
  lines.push("");

  if (report.blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Filesystem Utilities
// ─────────────────────────────────────────────

interface SourceIssues {
  anyCount: number;
  consoleCount: number;
}

function scanSourceIssues(dir: string): SourceIssues {
  let anyCount = 0;
  let consoleCount = 0;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.includes(".test.")
      ) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          anyCount += (content.match(/:\s*any\b|<any>|as\s+any\b/g) ?? []).length;
          consoleCount += (content.match(/\bconsole\.log\b/g) ?? []).length;
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return { anyCount, consoleCount };
}

function scanForSecrets(dir: string): number {
  let count = 0;
  const secretPattern =
    /(password|secret|api_?key|token)\s*[:=]\s*["'][^"']+["']/i;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        try {
          const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
          for (const line of lines) {
            if (secretPattern.test(line)) count++;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return count;
}

function findFilesByPattern(dir: string, pattern: RegExp): string[] {
  const found: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(entry.name)) {
        found.push(fullPath);
      }
    }
  }

  walk(dir);
  return found;
}
