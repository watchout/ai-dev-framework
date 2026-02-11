/**
 * Audit data model - Types, scoring rubrics, and report structure
 * Based on: 13_SSOT_AUDIT.md, 16_PROMPT_AUDIT.md, 17_CODE_AUDIT.md
 *
 * Three audit modes:
 * - SSOT: Document quality (95+ pass, 3 absolute conditions)
 * - Prompt: Prompt quality (100 mandatory)
 * - Code: Implementation quality (100 mandatory)
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

export type AuditMode = "ssot" | "prompt" | "code";
export type AuditSeverity = "critical" | "major" | "minor";
export type AuditVerdict = "pass" | "conditional" | "fail";

export interface AuditFinding {
  id: number;
  severity: AuditSeverity;
  category: string;
  location: string;
  issue: string;
  correction: string;
  deduction: number;
}

export interface CategoryDeduction {
  reason: string;
  amount: number;
}

export interface AuditCategoryScore {
  category: string;
  maxPoints: number;
  earned: number;
  deductions: CategoryDeduction[];
}

export interface AbsoluteCondition {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface AuditReport {
  mode: AuditMode;
  target: {
    id: string;
    name: string;
    path: string;
    auditDate: string;
    iteration: number;
  };
  scorecard: AuditCategoryScore[];
  totalScore: number;
  verdict: AuditVerdict;
  absoluteConditions: AbsoluteCondition[];
  findings: AuditFinding[];
}

// ─────────────────────────────────────────────
// Category Definitions per Mode
// ─────────────────────────────────────────────

export interface CategoryDefinition {
  name: string;
  maxPoints: number;
}

export const SSOT_CATEGORIES: CategoryDefinition[] = [
  { name: "Completeness", maxPoints: 15 },
  { name: "Consistency", maxPoints: 15 },
  { name: "Clarity", maxPoints: 10 },
  { name: "Verifiability", maxPoints: 10 },
  { name: "Traceability", maxPoints: 10 },
  { name: "Feasibility", maxPoints: 10 },
  { name: "RFC 2119 Compliance", maxPoints: 10 },
  { name: "Test Coverage", maxPoints: 10 },
  { name: "Cross-SSOT Consistency", maxPoints: 5 },
  { name: "Document Quality", maxPoints: 5 },
];

export const PROMPT_CATEGORIES: CategoryDefinition[] = [
  { name: "Role Appropriateness", maxPoints: 10 },
  { name: "Context Completeness", maxPoints: 25 },
  { name: "Task Clarity", maxPoints: 20 },
  { name: "Constraint Coverage", maxPoints: 15 },
  { name: "Output Specification", maxPoints: 10 },
  { name: "Acceptance Criteria", maxPoints: 10 },
  { name: "Forbidden Items", maxPoints: 5 },
  { name: "Overall Consistency", maxPoints: 5 },
];

export const CODE_CATEGORIES: CategoryDefinition[] = [
  { name: "SSOT Compliance", maxPoints: 25 },
  { name: "Type Safety", maxPoints: 15 },
  { name: "Error Handling", maxPoints: 15 },
  { name: "Security", maxPoints: 15 },
  { name: "Coding Standards", maxPoints: 10 },
  { name: "Maintainability", maxPoints: 10 },
  { name: "Performance", maxPoints: 5 },
  { name: "Completeness", maxPoints: 5 },
];

// ─────────────────────────────────────────────
// Scoring Operations
// ─────────────────────────────────────────────

export function createScorecard(
  categories: CategoryDefinition[],
): AuditCategoryScore[] {
  return categories.map((cat) => ({
    category: cat.name,
    maxPoints: cat.maxPoints,
    earned: cat.maxPoints,
    deductions: [],
  }));
}

export function applyDeduction(
  scorecard: AuditCategoryScore[],
  categoryName: string,
  reason: string,
  amount: number,
): void {
  const category = scorecard.find((c) => c.category === categoryName);
  if (!category) return;

  const actualDeduction = Math.min(amount, category.earned);
  category.earned -= actualDeduction;
  category.deductions.push({ reason, amount: actualDeduction });
}

export function calculateTotalScore(
  scorecard: AuditCategoryScore[],
): number {
  return scorecard.reduce((sum, cat) => sum + cat.earned, 0);
}

// ─────────────────────────────────────────────
// Verdict Determination
// ─────────────────────────────────────────────

export function determineVerdict(
  mode: AuditMode,
  totalScore: number,
  absoluteConditions: AbsoluteCondition[],
): AuditVerdict {
  const allConditionsPassed = absoluteConditions.every((c) => c.passed);
  if (!allConditionsPassed) return "fail";

  if (mode === "ssot") {
    if (totalScore >= 95) return "pass";
    if (totalScore >= 90) return "conditional";
    return "fail";
  }

  // Prompt and Code: 100 mandatory
  if (totalScore === 100) return "pass";
  if (totalScore >= 90) return "conditional";
  return "fail";
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const AUDIT_DIR = ".framework/audits";

export function saveAuditReport(
  projectDir: string,
  report: AuditReport,
): string {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = `${report.mode}-${report.target.id}-${Date.now()}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadAuditReports(
  projectDir: string,
  mode?: AuditMode,
): AuditReport[] {
  const dir = path.join(projectDir, AUDIT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const reports: AuditReport[] = [];

  for (const file of files) {
    if (mode && !file.startsWith(mode)) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as AuditReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.target.auditDate).getTime() -
      new Date(a.target.auditDate).getTime(),
  );
}

// ─────────────────────────────────────────────
// Markdown Report Generation
// ─────────────────────────────────────────────

export function generateAuditMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  const modeLabel =
    report.mode === "ssot"
      ? "SSOT Quality"
      : report.mode === "prompt"
        ? "Prompt Quality"
        : "Code Quality";

  lines.push(`# ${modeLabel} Audit Report`);
  lines.push("");
  lines.push("## Target");
  lines.push("");
  lines.push(`- **ID**: ${report.target.id}`);
  lines.push(`- **Name**: ${report.target.name}`);
  lines.push(`- **Path**: ${report.target.path}`);
  lines.push(`- **Date**: ${report.target.auditDate}`);
  lines.push(`- **Iteration**: ${report.target.iteration}`);
  lines.push("");

  lines.push("## Score");
  lines.push("");
  lines.push("| Category | Max | Earned | Deduction Reason |");
  lines.push("|----------|-----|--------|-----------------|");
  for (const cat of report.scorecard) {
    const reasons =
      cat.deductions.length > 0
        ? cat.deductions
            .map((d) => `${d.reason} (-${d.amount})`)
            .join("; ")
        : "-";
    lines.push(
      `| ${cat.category} | ${cat.maxPoints} | ${cat.earned} | ${reasons} |`,
    );
  }
  lines.push("");
  lines.push(`**Total: ${report.totalScore}/100**`);
  lines.push("");

  const verdictLabel =
    report.verdict === "pass"
      ? "PASS"
      : report.verdict === "conditional"
        ? "CONDITIONAL PASS"
        : "FAIL";
  lines.push(`## Judgment: ${verdictLabel}`);
  lines.push("");

  if (report.absoluteConditions.length > 0) {
    lines.push("## Absolute Conditions");
    lines.push("");
    for (const cond of report.absoluteConditions) {
      const icon = cond.passed ? "[PASS]" : "[FAIL]";
      const detail = cond.detail ? ` (${cond.detail})` : "";
      lines.push(`- ${icon} ${cond.name}${detail}`);
    }
    lines.push("");
  }

  if (report.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push(
      "| # | Severity | Category | Location | Issue | Correction |",
    );
    lines.push(
      "|---|----------|----------|----------|-------|-----------|",
    );
    for (const f of report.findings) {
      lines.push(
        `| ${f.id} | ${f.severity.toUpperCase()} | ${f.category} | ${f.location} | ${f.issue} | ${f.correction} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
