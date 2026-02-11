/**
 * Acceptance data model - Types, scoring, and report structure
 * Based on: 22_FEATURE_ACCEPTANCE.md
 *
 * Five-axis scorecard for feature acceptance:
 * - MUST Requirements (30pts)
 * - User Flow E2E (25pts)
 * - Error Flows (20pts)
 * - Non-Functional (15pts)
 * - Integration (10pts)
 *
 * Acceptance requires 100/100 score.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

export interface AcceptanceCheck {
  category: string;
  name: string;
  passed: boolean;
  detail: string;
  points: number;
  maxPoints: number;
}

export interface AcceptanceScorecard {
  mustRequirements: number;
  userFlowE2E: number;
  errorFlows: number;
  nonFunctional: number;
  integration: number;
  total: number;
}

export interface AcceptanceReport {
  featureId: string;
  featureName: string;
  timestamp: string;
  checks: AcceptanceCheck[];
  scorecard: AcceptanceScorecard;
  verdict: "accepted" | "rejected";
  rejectionReasons: string[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_MUST_REQUIREMENTS = 30;
const MAX_USER_FLOW_E2E = 25;
const MAX_ERROR_FLOWS = 20;
const MAX_NON_FUNCTIONAL = 15;
const MAX_INTEGRATION = 10;

const CATEGORY_KEYS: Record<string, keyof Omit<AcceptanceScorecard, "total">> = {
  "must-requirements": "mustRequirements",
  "user-flow-e2e": "userFlowE2E",
  "error-flows": "errorFlows",
  "non-functional": "nonFunctional",
  "integration": "integration",
};

const CATEGORY_MAXES: Record<string, number> = {
  "must-requirements": MAX_MUST_REQUIREMENTS,
  "user-flow-e2e": MAX_USER_FLOW_E2E,
  "error-flows": MAX_ERROR_FLOWS,
  "non-functional": MAX_NON_FUNCTIONAL,
  "integration": MAX_INTEGRATION,
};

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────

/**
 * Calculate acceptance scorecard from individual checks
 */
export function calculateAcceptanceScore(
  checks: AcceptanceCheck[],
): AcceptanceScorecard {
  const categoryEarned = new Map<string, number>();

  for (const check of checks) {
    const current = categoryEarned.get(check.category) ?? 0;
    categoryEarned.set(check.category, current + check.points);
  }

  const mustRequirements = Math.min(
    MAX_MUST_REQUIREMENTS,
    categoryEarned.get("must-requirements") ?? 0,
  );
  const userFlowE2E = Math.min(
    MAX_USER_FLOW_E2E,
    categoryEarned.get("user-flow-e2e") ?? 0,
  );
  const errorFlows = Math.min(
    MAX_ERROR_FLOWS,
    categoryEarned.get("error-flows") ?? 0,
  );
  const nonFunctional = Math.min(
    MAX_NON_FUNCTIONAL,
    categoryEarned.get("non-functional") ?? 0,
  );
  const integration = Math.min(
    MAX_INTEGRATION,
    categoryEarned.get("integration") ?? 0,
  );

  const total = mustRequirements + userFlowE2E + errorFlows +
    nonFunctional + integration;

  return {
    mustRequirements,
    userFlowE2E,
    errorFlows,
    nonFunctional,
    integration,
    total,
  };
}

/**
 * Determine acceptance verdict - must be 100 to accept
 */
export function determineAcceptanceVerdict(
  scorecard: AcceptanceScorecard,
): "accepted" | "rejected" {
  return scorecard.total === 100 ? "accepted" : "rejected";
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const AUDIT_DIR = ".framework/audits";

export function saveAcceptanceReport(
  projectDir: string,
  report: AcceptanceReport,
): string {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const timestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `accept-${report.featureId}-${timestamp}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadAcceptanceReports(
  projectDir: string,
): AcceptanceReport[] {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith("accept-") && f.endsWith(".json"),
  );
  const reports: AcceptanceReport[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as AcceptanceReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ─────────────────────────────────────────────
// Feature Completeness Analysis
// ─────────────────────────────────────────────

/**
 * Analyze feature completeness by checking for implementation artifacts
 */
export function analyzeFeatureCompleteness(
  projectDir: string,
  featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];
  const featureIdLower = featureId.toLowerCase();

  // 1. MUST Requirements checks (30pts)
  checks.push(...checkMustRequirements(projectDir, featureIdLower));

  // 2. User Flow E2E checks (25pts)
  checks.push(...checkUserFlowE2E(projectDir, featureIdLower));

  // 3. Error Flows checks (20pts)
  checks.push(...checkErrorFlows(projectDir, featureIdLower));

  // 4. Non-Functional checks (15pts)
  checks.push(...checkNonFunctional(projectDir, featureIdLower));

  // 5. Integration checks (10pts)
  checks.push(...checkIntegration(projectDir, featureIdLower));

  return checks;
}

function checkMustRequirements(
  projectDir: string,
  featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];
  const pointsPerCheck = 10;

  // Check for source implementation files
  const srcDir = path.join(projectDir, "src");
  const hasSourceFiles = findFilesContaining(srcDir, featureId);

  checks.push({
    category: "must-requirements",
    name: "Source implementation exists",
    passed: hasSourceFiles,
    detail: hasSourceFiles
      ? "Implementation files found"
      : "No implementation files found for feature",
    points: hasSourceFiles ? pointsPerCheck : 0,
    maxPoints: pointsPerCheck,
  });

  // Check for test files
  const hasTestFiles = findTestFilesFor(srcDir, featureId);
  checks.push({
    category: "must-requirements",
    name: "Test files exist",
    passed: hasTestFiles,
    detail: hasTestFiles
      ? "Test files found"
      : "No test files found for feature",
    points: hasTestFiles ? pointsPerCheck : 0,
    maxPoints: pointsPerCheck,
  });

  // Check plan state for feature completion
  const planPath = path.join(projectDir, ".framework/plan.json");
  let featureInPlan = false;
  if (fs.existsSync(planPath)) {
    const raw = fs.readFileSync(planPath, "utf-8");
    const content = raw.toLowerCase();
    featureInPlan = content.includes(featureId);
  }
  checks.push({
    category: "must-requirements",
    name: "Feature tracked in plan",
    passed: featureInPlan,
    detail: featureInPlan
      ? "Feature found in implementation plan"
      : "Feature not found in plan",
    points: featureInPlan ? pointsPerCheck : 0,
    maxPoints: pointsPerCheck,
  });

  return checks;
}

function checkUserFlowE2E(
  projectDir: string,
  featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];

  // Check for e2e test directory and feature-related tests
  const e2eDir = path.join(projectDir, "e2e");
  const hasE2eTests = fs.existsSync(e2eDir) &&
    findFilesContaining(e2eDir, featureId);

  checks.push({
    category: "user-flow-e2e",
    name: "E2E tests exist",
    passed: hasE2eTests,
    detail: hasE2eTests
      ? "E2E test files found for feature"
      : "No E2E tests found",
    points: hasE2eTests ? 15 : 0,
    maxPoints: 15,
  });

  // Check for integration tests
  const srcDir = path.join(projectDir, "src");
  const hasIntTests = findIntegrationTestsFor(srcDir, featureId);
  checks.push({
    category: "user-flow-e2e",
    name: "Integration tests exist",
    passed: hasIntTests,
    detail: hasIntTests
      ? "Integration tests found"
      : "No integration tests found",
    points: hasIntTests ? 10 : 0,
    maxPoints: 10,
  });

  return checks;
}

function checkErrorFlows(
  projectDir: string,
  featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];
  const srcDir = path.join(projectDir, "src");

  // Check if error handling patterns exist in feature code
  const hasErrorHandling = findPatternsInFeature(
    srcDir, featureId,
    /try\s*\{|catch\s*\(|throw\s+new|\.catch\(/,
  );

  checks.push({
    category: "error-flows",
    name: "Error handling implemented",
    passed: hasErrorHandling,
    detail: hasErrorHandling
      ? "Error handling patterns found"
      : "No error handling patterns found",
    points: hasErrorHandling ? 10 : 0,
    maxPoints: 10,
  });

  // Check for error test cases
  const hasErrorTests = findPatternsInFeature(
    srcDir, featureId,
    /error|throw|reject|fail/i,
  );

  checks.push({
    category: "error-flows",
    name: "Error test cases exist",
    passed: hasErrorTests,
    detail: hasErrorTests
      ? "Error-related test cases found"
      : "No error test cases found",
    points: hasErrorTests ? 10 : 0,
    maxPoints: 10,
  });

  return checks;
}

function checkNonFunctional(
  projectDir: string,
  _featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];

  // Check TypeScript strict mode
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  let hasStrict = false;
  if (fs.existsSync(tsconfigPath)) {
    const raw = fs.readFileSync(tsconfigPath, "utf-8");
    hasStrict = raw.includes('"strict"') || raw.includes("'strict'");
  }

  checks.push({
    category: "non-functional",
    name: "TypeScript strict mode",
    passed: hasStrict,
    detail: hasStrict
      ? "Strict mode enabled"
      : "Strict mode not detected in tsconfig",
    points: hasStrict ? 8 : 0,
    maxPoints: 8,
  });

  // Check for lint configuration
  const hasLint = fs.existsSync(path.join(projectDir, "eslint.config.js")) ||
    fs.existsSync(path.join(projectDir, ".eslintrc.json")) ||
    fs.existsSync(path.join(projectDir, ".eslintrc.js"));

  checks.push({
    category: "non-functional",
    name: "Linting configured",
    passed: hasLint,
    detail: hasLint
      ? "ESLint configuration found"
      : "No ESLint configuration found",
    points: hasLint ? 7 : 0,
    maxPoints: 7,
  });

  return checks;
}

function checkIntegration(
  projectDir: string,
  featureId: string,
): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];

  // Check for imports/references to feature from other modules
  const srcDir = path.join(projectDir, "src");
  const hasReferences = findCrossReferences(srcDir, featureId);

  checks.push({
    category: "integration",
    name: "Cross-module integration",
    passed: hasReferences,
    detail: hasReferences
      ? "Feature is referenced from other modules"
      : "No cross-module references found",
    points: hasReferences ? 10 : 0,
    maxPoints: 10,
  });

  return checks;
}

// ─────────────────────────────────────────────
// File Search Helpers
// ─────────────────────────────────────────────

function findFilesContaining(dir: string, keyword: string): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findFilesContaining(fullPath, keyword)) return true;
    } else if (entry.name.toLowerCase().includes(keyword)) {
      return true;
    }
  }
  return false;
}

function findTestFilesFor(dir: string, keyword: string): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findTestFilesFor(fullPath, keyword)) return true;
    } else if (
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      entry.name.toLowerCase().includes(keyword)
    ) {
      return true;
    }
  }
  return false;
}

function findIntegrationTestsFor(
  dir: string,
  keyword: string,
): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findIntegrationTestsFor(fullPath, keyword)) return true;
    } else if (
      /\.(integration|int)\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      entry.name.toLowerCase().includes(keyword)
    ) {
      return true;
    }
  }
  return false;
}

function findPatternsInFeature(
  dir: string,
  featureId: string,
  pattern: RegExp,
): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findPatternsInFeature(fullPath, featureId, pattern)) return true;
    } else if (
      entry.name.toLowerCase().includes(featureId) &&
      /\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (pattern.test(content)) return true;
    }
  }
  return false;
}

function findCrossReferences(
  dir: string,
  featureId: string,
): boolean {
  if (!fs.existsSync(dir)) return false;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findCrossReferences(fullPath, featureId)) return true;
    } else if (
      !entry.name.toLowerCase().includes(featureId) &&
      /\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.toLowerCase().includes(featureId)) return true;
    }
  }
  return false;
}
