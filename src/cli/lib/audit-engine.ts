/**
 * Audit engine - runs SSOT, Prompt, and Code audits
 * Based on: 13_SSOT_AUDIT.md, 16_PROMPT_AUDIT.md, 17_CODE_AUDIT.md
 *
 * Three audit modes with pattern-based static checkers:
 * - SSOT: 10 categories, 100pts, 95+ pass
 * - Prompt: 8 categories, 100pts, 100 mandatory
 * - Code: 8 categories, 100pts, 100 mandatory
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type AuditMode,
  type AuditReport,
  type AuditFinding,
  type AuditCategoryScore,
  type AbsoluteCondition,
  SSOT_CATEGORIES,
  PROMPT_CATEGORIES,
  CODE_CATEGORIES,
  createScorecard,
  applyDeduction,
  calculateTotalScore,
  determineVerdict,
  saveAuditReport,
} from "./audit-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface AuditIO {
  print(message: string): void;
}

export interface AuditOptions {
  projectDir: string;
  io: AuditIO;
  mode: AuditMode;
  targetPath: string;
  targetId?: string;
}

export interface AuditResult {
  report: AuditReport;
  errors: string[];
}

export function createAuditTerminalIO(): AuditIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run an audit on the specified target
 */
export async function runAudit(
  options: AuditOptions,
): Promise<AuditResult> {
  const { projectDir, io, mode, targetPath } = options;
  const errors: string[] = [];

  const fullPath = path.resolve(projectDir, targetPath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Target not found: ${targetPath}`);
    return { report: createEmptyReport(mode, targetPath), errors };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const targetId =
    options.targetId ??
    path.basename(targetPath, path.extname(targetPath));

  io.print(`\n${"━".repeat(38)}`);
  io.print(`  ${mode.toUpperCase()} AUDIT`);
  io.print(`${"━".repeat(38)}`);
  io.print(`  Target: ${targetPath}`);
  io.print("");

  let report: AuditReport;
  switch (mode) {
    case "ssot":
      report = auditSSOT(content, targetId, targetPath);
      break;
    case "prompt":
      report = auditPrompt(content, targetId, targetPath);
      break;
    case "code":
      report = auditCode(content, targetId, targetPath);
      break;
  }

  printAuditSummary(io, report);

  // Agent Teams guidance for code audit (17_CODE_AUDIT.md)
  if (mode === "code" && report.verdict !== "pass") {
    printAgentTeamsGuidance(io, report);
  }

  const filename = saveAuditReport(projectDir, report);
  io.print(`  Report saved: .framework/audits/${filename}`);
  io.print("");

  return { report, errors };
}

// ─────────────────────────────────────────────
// SSOT Audit (13_SSOT_AUDIT.md)
// ─────────────────────────────────────────────

const SSOT_REQUIRED_SECTIONS = [
  "§1", "§2", "§3", "§4", "§5", "§6",
  "§7", "§8", "§9", "§10", "§11", "§12",
];

const AMBIGUOUS_PATTERNS = [
  /\betc\.?\b/gi,
  /\band so on\b/gi,
  /\bas needed\b/gi,
  /\bas appropriate\b/gi,
  /\bvarious\b/gi,
];

export function auditSSOT(
  content: string,
  targetId: string,
  targetPath: string,
): AuditReport {
  const scorecard = createScorecard(SSOT_CATEGORIES);
  const findings: AuditFinding[] = [];
  let findingId = 0;

  // 1. Completeness (15pts)
  const missingSections = SSOT_REQUIRED_SECTIONS.filter(
    (s) => !content.includes(s),
  );
  if (missingSections.length > 0) {
    const deduction = Math.min(15, missingSections.length * 3);
    applyDeduction(
      scorecard, "Completeness",
      `Missing sections: ${missingSections.join(", ")}`, deduction,
    );
    findings.push({
      id: ++findingId,
      severity: missingSections.length > 3 ? "critical" : "major",
      category: "Completeness",
      location: "Document",
      issue: `Missing ${missingSections.length} required sections: ${missingSections.join(", ")}`,
      correction: "Add all missing sections per SSOT template",
      deduction,
    });
  }

  // 2. Consistency (15pts) - TBD items
  const tbdMatches = content.match(/\bTBD\b/g) ?? [];
  const tbdCount = tbdMatches.length;
  if (tbdCount > 0) {
    const deduction = Math.min(15, tbdCount * 5);
    applyDeduction(
      scorecard, "Consistency",
      `${tbdCount} TBD items found`, deduction,
    );
    findings.push({
      id: ++findingId,
      severity: "critical",
      category: "Consistency",
      location: "Document",
      issue: `${tbdCount} TBD items remaining`,
      correction: "Resolve all TBD items with concrete specifications",
      deduction,
    });
  }

  // 3. Clarity (10pts) - Ambiguous phrases
  let ambiguousCount = 0;
  for (const pattern of AMBIGUOUS_PATTERNS) {
    ambiguousCount += (content.match(pattern) ?? []).length;
  }
  if (ambiguousCount > 0) {
    const deduction = Math.min(10, ambiguousCount);
    applyDeduction(
      scorecard, "Clarity",
      `${ambiguousCount} ambiguous phrases`, deduction,
    );
    findings.push({
      id: ++findingId,
      severity: "minor",
      category: "Clarity",
      location: "Document",
      issue: `${ambiguousCount} ambiguous phrases (etc, various, as needed)`,
      correction: "Replace with specific, measurable terms",
      deduction,
    });
  }

  // 4. Verifiability (10pts) - Testable MUST requirements
  const mustLines = content.match(/\bMUST\b.*$/gm) ?? [];
  const untestableMusts = mustLines.filter(
    (line) =>
      !line.match(/\d/) &&
      !line.match(/true|false|error|return|response/i),
  );
  if (untestableMusts.length > 0) {
    const deduction = Math.min(10, untestableMusts.length * 2);
    applyDeduction(
      scorecard, "Verifiability",
      `${untestableMusts.length} untestable MUST requirements`, deduction,
    );
    findings.push({
      id: ++findingId,
      severity: "major",
      category: "Verifiability",
      location: "Document",
      issue: `${untestableMusts.length} MUST requirements may be untestable`,
      correction: "Add measurable criteria to each MUST requirement",
      deduction,
    });
  }

  // 5. Traceability (10pts) - Requirement IDs
  const hasRequirementIds = /[A-Z]+-\d+/.test(content);
  if (!hasRequirementIds) {
    applyDeduction(
      scorecard, "Traceability",
      "No requirement IDs found", 5,
    );
    findings.push({
      id: ++findingId,
      severity: "major",
      category: "Traceability",
      location: "Document",
      issue: "No requirement IDs (e.g., FR-001) found",
      correction: "Add unique IDs to all functional requirements",
      deduction: 5,
    });
  }

  // 6. Feasibility (10pts) - Auto-pass (requires human judgment)

  // 7. RFC 2119 Compliance (10pts)
  const rfc2119Pattern =
    /\b(MUST|MUST NOT|SHALL|SHALL NOT|SHOULD|SHOULD NOT|MAY|REQUIRED|RECOMMENDED|OPTIONAL)\b/g;
  const keywordMatches = content.match(rfc2119Pattern) ?? [];
  if (keywordMatches.length === 0) {
    applyDeduction(
      scorecard, "RFC 2119 Compliance",
      "No RFC 2119 keywords found", 10,
    );
    findings.push({
      id: ++findingId,
      severity: "major",
      category: "RFC 2119 Compliance",
      location: "Document",
      issue: "No RFC 2119 keywords (MUST, SHOULD, MAY) found",
      correction: "Use RFC 2119 keywords to specify requirement levels",
      deduction: 10,
    });
  }

  // 8. Test Coverage (10pts)
  const hasTestSection = /test|テスト/i.test(content);
  if (!hasTestSection) {
    applyDeduction(
      scorecard, "Test Coverage",
      "No test section found", 5,
    );
    findings.push({
      id: ++findingId,
      severity: "major",
      category: "Test Coverage",
      location: "Document",
      issue: "No test section or test references found",
      correction: "Add test cases for normal, abnormal, and boundary conditions",
      deduction: 5,
    });
  }

  // 9. Cross-SSOT Consistency (5pts)
  const hasSsotRefs = /SSOT-[2-5]/.test(content);
  if (!hasSsotRefs) {
    applyDeduction(
      scorecard, "Cross-SSOT Consistency",
      "No cross-SSOT references", 3,
    );
    findings.push({
      id: ++findingId,
      severity: "minor",
      category: "Cross-SSOT Consistency",
      location: "Document",
      issue: "No references to other SSOT documents (SSOT-2 through SSOT-5)",
      correction: "Add cross-references to relevant SSOT documents",
      deduction: 3,
    });
  }

  // 10. Document Quality (5pts)
  const hasHeaders = /^#{1,3}\s/m.test(content);
  const hasTables = /\|.*\|/.test(content);
  if (!hasHeaders) {
    applyDeduction(scorecard, "Document Quality", "No markdown headers", 2);
  }
  if (!hasTables && content.length > 500) {
    applyDeduction(scorecard, "Document Quality", "No structured tables", 2);
  }

  // Absolute conditions
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const absoluteConditions: AbsoluteCondition[] = [
    {
      name: "TBD Count = 0",
      passed: tbdCount === 0,
      detail: tbdCount > 0 ? `${tbdCount} TBDs found` : undefined,
    },
    {
      name: "Critical Findings = 0",
      passed: criticalFindings.length === 0,
      detail:
        criticalFindings.length > 0
          ? `${criticalFindings.length} critical findings`
          : undefined,
    },
    {
      name: "Cross-SSOT Critical/Major = 0",
      passed: !findings.some(
        (f) =>
          f.category === "Cross-SSOT Consistency" &&
          f.severity !== "minor",
      ),
    },
  ];

  const totalScore = calculateTotalScore(scorecard);
  const verdict = determineVerdict("ssot", totalScore, absoluteConditions);

  return {
    mode: "ssot",
    target: {
      id: targetId,
      name: path.basename(targetPath),
      path: targetPath,
      auditDate: new Date().toISOString(),
      iteration: 1,
    },
    scorecard,
    totalScore,
    verdict,
    absoluteConditions,
    findings,
  };
}

// ─────────────────────────────────────────────
// Prompt Audit (16_PROMPT_AUDIT.md)
// ─────────────────────────────────────────────

export function auditPrompt(
  content: string,
  targetId: string,
  targetPath: string,
): AuditReport {
  const scorecard = createScorecard(PROMPT_CATEGORIES);
  const findings: AuditFinding[] = [];
  let findingId = 0;

  // 1. Role Appropriateness (10pts)
  const hasRole = /role|ロール|expert|specialist|engineer/i.test(content);
  if (!hasRole) {
    applyDeduction(scorecard, "Role Appropriateness", "No role definition", 10);
    findings.push({
      id: ++findingId, severity: "critical",
      category: "Role Appropriateness", location: "Document",
      issue: "Role definition missing",
      correction: "Add explicit role definition with expertise area",
      deduction: 10,
    });
  }

  // 2. Context Completeness (25pts)
  const hasSsotRef = /SSOT|仕様書|specification/i.test(content);
  if (!hasSsotRef) {
    applyDeduction(scorecard, "Context Completeness", "No SSOT reference", 8);
    findings.push({
      id: ++findingId, severity: "critical",
      category: "Context Completeness", location: "Document",
      issue: "No SSOT reference in context",
      correction: "Include full SSOT text (not summary) in context section",
      deduction: 8,
    });
  } else if (content.length < 500) {
    applyDeduction(scorecard, "Context Completeness", "SSOT appears to be summary only", 8);
    findings.push({
      id: ++findingId, severity: "major",
      category: "Context Completeness", location: "Document",
      issue: "SSOT reference appears to be summary (not full text)",
      correction: "Include complete SSOT text, not a summary",
      deduction: 8,
    });
  }

  const hasTechStack = /typescript|react|next\.?js|node/i.test(content);
  if (!hasTechStack) {
    applyDeduction(scorecard, "Context Completeness", "Tech stack missing", 5);
    findings.push({
      id: ++findingId, severity: "major",
      category: "Context Completeness", location: "Document",
      issue: "Technology stack information missing",
      correction: "Add technology stack details (framework, language, versions)",
      deduction: 5,
    });
  }

  // 3. Task Clarity (20pts)
  const hasSteps = /step|順序|order|1\.|first/i.test(content);
  if (!hasSteps) {
    applyDeduction(scorecard, "Task Clarity", "No implementation order", 6);
    findings.push({
      id: ++findingId, severity: "major",
      category: "Task Clarity", location: "Document",
      issue: "No implementation order or sequence specified",
      correction: "Add numbered implementation steps",
      deduction: 6,
    });
  }

  const hasFilePaths = /\.(ts|tsx|js|jsx|md)\b|src\/|docs\//i.test(content);
  if (!hasFilePaths) {
    applyDeduction(scorecard, "Task Clarity", "No file paths", 4);
    findings.push({
      id: ++findingId, severity: "major",
      category: "Task Clarity", location: "Document",
      issue: "No file paths specified for implementation",
      correction: "Add specific file paths for each step",
      deduction: 4,
    });
  }

  // 4. Constraint Coverage (15pts)
  const hasStandards = /naming|convention|規約|standard/i.test(content);
  if (!hasStandards) {
    applyDeduction(scorecard, "Constraint Coverage", "Coding standards not referenced", 4);
    findings.push({
      id: ++findingId, severity: "minor",
      category: "Constraint Coverage", location: "Document",
      issue: "Coding standards not referenced",
      correction: "Add reference to coding standards/conventions",
      deduction: 4,
    });
  }

  if (/best practices|ベストプラクティス/i.test(content)) {
    applyDeduction(scorecard, "Constraint Coverage", "Vague constraint", 3);
    findings.push({
      id: ++findingId, severity: "minor",
      category: "Constraint Coverage", location: "Document",
      issue: "Vague constraint: 'best practices' without specifics",
      correction: "Replace with specific, measurable constraints",
      deduction: 3,
    });
  }

  // 5. Output Specification (10pts)
  const hasOutputSpec = /output|format|出力|フォーマット/i.test(content);
  if (!hasOutputSpec) {
    applyDeduction(scorecard, "Output Specification", "No output specification", 4);
    findings.push({
      id: ++findingId, severity: "major",
      category: "Output Specification", location: "Document",
      issue: "Output format not specified",
      correction: "Add clear output specification with format and required elements",
      deduction: 4,
    });
  }

  // 6. Acceptance Criteria (10pts)
  const hasCriteria = /acceptance|criteria|受け入れ|基準|MUST/i.test(content);
  if (!hasCriteria) {
    applyDeduction(scorecard, "Acceptance Criteria", "No acceptance criteria", 10);
    findings.push({
      id: ++findingId, severity: "critical",
      category: "Acceptance Criteria", location: "Document",
      issue: "Acceptance criteria section missing",
      correction: "Add acceptance criteria listing all SSOT MUST requirements",
      deduction: 10,
    });
  }

  // 7. Forbidden Items (5pts)
  const hasForbidden = /forbidden|prohibit|禁止|don't|do not|never/i.test(content);
  if (!hasForbidden) {
    applyDeduction(scorecard, "Forbidden Items", "No forbidden items", 5);
    findings.push({
      id: ++findingId, severity: "minor",
      category: "Forbidden Items", location: "Document",
      issue: "No forbidden items section",
      correction: "Add forbidden items (no assumptions, no placeholders, etc.)",
      deduction: 5,
    });
  }

  // 8. Overall Consistency (5pts) - auto-pass

  const totalScore = calculateTotalScore(scorecard);
  const absoluteConditions: AbsoluteCondition[] = [
    {
      name: "Score = 100",
      passed: totalScore === 100,
      detail: totalScore < 100 ? `Score is ${totalScore}/100` : undefined,
    },
  ];
  const verdict = determineVerdict("prompt", totalScore, absoluteConditions);

  return {
    mode: "prompt",
    target: {
      id: targetId,
      name: path.basename(targetPath),
      path: targetPath,
      auditDate: new Date().toISOString(),
      iteration: 1,
    },
    scorecard,
    totalScore,
    verdict,
    absoluteConditions,
    findings,
  };
}

// ─────────────────────────────────────────────
// Code Audit (17_CODE_AUDIT.md)
// ─────────────────────────────────────────────

export function auditCode(
  content: string,
  targetId: string,
  targetPath: string,
): AuditReport {
  const scorecard = createScorecard(CODE_CATEGORIES);
  const findings: AuditFinding[] = [];
  let findingId = 0;
  const lines = content.split("\n");

  // 1. SSOT Compliance (25pts) - Ellipsis comments
  const ellipsisComments = findPatternLines(lines, /\/\/\s*\.\.\./);
  if (ellipsisComments.length > 0) {
    const deduction = Math.min(25, ellipsisComments.length * 3);
    applyDeduction(scorecard, "SSOT Compliance", `${ellipsisComments.length} ellipsis comment(s)`, deduction);
    for (const match of ellipsisComments) {
      findings.push({
        id: ++findingId, severity: "critical",
        category: "SSOT Compliance", location: `L${match.line}`,
        issue: "Ellipsis comment (// ...) indicating incomplete code",
        correction: "Implement the omitted code fully",
        deduction: 3,
      });
    }
  }

  // 2. Type Safety (15pts)
  const anyUsages = findPatternLines(lines, /:\s*any\b|<any>|as\s+any\b/);
  if (anyUsages.length > 0) {
    const deduction = Math.min(15, anyUsages.length * 3);
    applyDeduction(scorecard, "Type Safety", `${anyUsages.length} 'any' type usage(s)`, deduction);
    for (const match of anyUsages) {
      findings.push({
        id: ++findingId, severity: "major",
        category: "Type Safety", location: `L${match.line}`,
        issue: "'any' type used",
        correction: "Replace with specific type or generic",
        deduction: 3,
      });
    }
  }

  const typeAssertions = findPatternLines(lines, /\bas\s+[A-Z]\w+/);
  const unnecessaryAssertions = typeAssertions.filter(
    (m) => !m.text.includes("as const"),
  );
  if (unnecessaryAssertions.length > 0) {
    const deduction = Math.min(15, unnecessaryAssertions.length * 2);
    applyDeduction(scorecard, "Type Safety", `${unnecessaryAssertions.length} type assertion(s)`, deduction);
    for (const match of unnecessaryAssertions) {
      findings.push({
        id: ++findingId, severity: "major",
        category: "Type Safety", location: `L${match.line}`,
        issue: "Type assertion (as) may be unnecessary",
        correction: "Use proper typing instead of type assertions",
        deduction: 2,
      });
    }
  }

  // 3. Error Handling (15pts) - Empty catch blocks
  const emptyCatches = findEmptyCatchBlocks(lines);
  if (emptyCatches.length > 0) {
    const deduction = Math.min(15, emptyCatches.length * 5);
    applyDeduction(scorecard, "Error Handling", `${emptyCatches.length} empty catch block(s)`, deduction);
    for (const lineNum of emptyCatches) {
      findings.push({
        id: ++findingId, severity: "critical",
        category: "Error Handling", location: `L${lineNum}`,
        issue: "Empty catch block (error swallowed)",
        correction: "Handle the error: log, rethrow, or provide fallback",
        deduction: 5,
      });
    }
  }

  // 4. Security (15pts) - Hardcoded secrets
  const secrets = findPatternLines(
    lines,
    /(password|secret|api_?key|token)\s*[:=]\s*["'][^"']+["']/i,
  );
  if (secrets.length > 0) {
    const deduction = Math.min(15, secrets.length * 3);
    applyDeduction(scorecard, "Security", `${secrets.length} hardcoded secret(s)`, deduction);
    for (const match of secrets) {
      findings.push({
        id: ++findingId, severity: "critical",
        category: "Security", location: `L${match.line}`,
        issue: "Hardcoded secret/credential",
        correction: "Use environment variables for sensitive values",
        deduction: 3,
      });
    }
  }

  // 5. Coding Standards (10pts)
  const longLines = lines.filter((l) => l.length > 120);
  if (longLines.length > 5) {
    applyDeduction(scorecard, "Coding Standards", `${longLines.length} lines >120 chars`, 2);
    findings.push({
      id: ++findingId, severity: "minor",
      category: "Coding Standards", location: "Multiple",
      issue: `${longLines.length} lines exceed 120 characters`,
      correction: "Break long lines for readability",
      deduction: 2,
    });
  }

  if (lines.length > 200) {
    applyDeduction(scorecard, "Coding Standards", `File ${lines.length} lines (>200)`, 2);
    findings.push({
      id: ++findingId, severity: "minor",
      category: "Coding Standards", location: "File",
      issue: `File has ${lines.length} lines, exceeds 200 line guideline`,
      correction: "Consider splitting into smaller modules",
      deduction: 2,
    });
  }

  // 6. Maintainability (10pts) - Long functions
  const longFunctions = findLongFunctions(lines, 50);
  if (longFunctions.length > 0) {
    const deduction = Math.min(10, longFunctions.length * 2);
    applyDeduction(scorecard, "Maintainability", `${longFunctions.length} long function(s)`, deduction);
    for (const func of longFunctions) {
      findings.push({
        id: ++findingId, severity: "minor",
        category: "Maintainability", location: `L${func.line}`,
        issue: `Function is ${func.length} lines (>50)`,
        correction: "Consider extracting sub-functions",
        deduction: 2,
      });
    }
  }

  // 7. Performance (5pts) - auto-pass for basic checks

  // 8. Completeness (5pts) - TODO/FIXME and console.log
  const todoMatches = findPatternLines(lines, /\b(TODO|FIXME|HACK|XXX)\b/);
  if (todoMatches.length > 0) {
    const deduction = Math.min(5, todoMatches.length * 2);
    applyDeduction(scorecard, "Completeness", `${todoMatches.length} TODO/FIXME`, deduction);
    for (const match of todoMatches) {
      findings.push({
        id: ++findingId, severity: "major",
        category: "Completeness", location: `L${match.line}`,
        issue: "TODO/FIXME comment remaining",
        correction: "Complete or remove the TODO/FIXME",
        deduction: 2,
      });
    }
  }

  const isTestFile = targetPath.includes(".test.");
  const consoleLogs = findPatternLines(
    lines,
    /\bconsole\.(log|warn|error|info|debug)\b/,
  );
  if (consoleLogs.length > 0 && !isTestFile) {
    const deduction = Math.min(5, consoleLogs.length);
    applyDeduction(scorecard, "Completeness", `${consoleLogs.length} console.log`, deduction);
    for (const match of consoleLogs) {
      findings.push({
        id: ++findingId, severity: "major",
        category: "Completeness", location: `L${match.line}`,
        issue: "console.log in production code",
        correction: "Remove or replace with proper logger",
        deduction: 1,
      });
    }
  }

  // Absolute conditions
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const totalScore = calculateTotalScore(scorecard);
  const absoluteConditions: AbsoluteCondition[] = [
    {
      name: "Score = 100",
      passed: totalScore === 100,
      detail: totalScore < 100 ? `Score is ${totalScore}/100` : undefined,
    },
    {
      name: "Critical Findings = 0",
      passed: criticalFindings.length === 0,
      detail:
        criticalFindings.length > 0
          ? `${criticalFindings.length} critical findings`
          : undefined,
    },
  ];
  const verdict = determineVerdict("code", totalScore, absoluteConditions);

  return {
    mode: "code",
    target: {
      id: targetId,
      name: path.basename(targetPath),
      path: targetPath,
      auditDate: new Date().toISOString(),
      iteration: 1,
    },
    scorecard,
    totalScore,
    verdict,
    absoluteConditions,
    findings,
  };
}

// ─────────────────────────────────────────────
// Pattern Matching Utilities
// ─────────────────────────────────────────────

interface PatternMatch {
  line: number;
  text: string;
}

function findPatternLines(
  lines: string[],
  pattern: RegExp,
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i] });
    }
  }
  return matches;
}

function findEmptyCatchBlocks(lines: string[]): number[] {
  const results: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lines[i])) {
      results.push(i + 1);
      continue;
    }
    if (/catch\s*\(/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim() === "}") {
        results.push(i + 1);
      }
    }
  }
  return results;
}

interface FunctionInfo {
  line: number;
  length: number;
}

function findLongFunctions(
  lines: string[],
  maxLength: number,
): FunctionInfo[] {
  const longFunctions: FunctionInfo[] = [];
  let braceDepth = 0;
  let functionStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
      /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line)
    ) {
      if (functionStart === -1) {
        functionStart = i;
        braceDepth = 0;
      }
    }

    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0 && functionStart !== -1) {
          const funcLength = i - functionStart + 1;
          if (funcLength > maxLength) {
            longFunctions.push({
              line: functionStart + 1,
              length: funcLength,
            });
          }
          functionStart = -1;
        }
      }
    }
  }

  return longFunctions;
}

function printAuditSummary(io: AuditIO, report: AuditReport): void {
  io.print("  Scorecard:");
  io.print(
    "  ┌──────────────────────────────┬─────┬────────┐",
  );
  io.print(
    "  │ Category                     │ Max │ Earned │",
  );
  io.print(
    "  ├──────────────────────────────┼─────┼────────┤",
  );

  for (const cat of report.scorecard) {
    const name = cat.category.padEnd(28);
    const max = String(cat.maxPoints).padStart(3);
    const earned = String(cat.earned).padStart(6);
    io.print(`  │ ${name} │ ${max} │ ${earned} │`);
  }

  io.print(
    "  └──────────────────────────────┴─────┴────────┘",
  );
  io.print("");
  io.print(`  Total Score: ${report.totalScore}/100`);
  io.print(`  Verdict: ${report.verdict.toUpperCase()}`);
  io.print("");

  if (report.absoluteConditions.length > 0) {
    io.print("  Absolute Conditions:");
    for (const cond of report.absoluteConditions) {
      const icon = cond.passed ? "[PASS]" : "[FAIL]";
      const detail = cond.detail ? ` - ${cond.detail}` : "";
      io.print(`    ${icon} ${cond.name}${detail}`);
    }
    io.print("");
  }

  if (report.findings.length > 0) {
    const critical = report.findings.filter(
      (f) => f.severity === "critical",
    ).length;
    const major = report.findings.filter(
      (f) => f.severity === "major",
    ).length;
    const minor = report.findings.filter(
      (f) => f.severity === "minor",
    ).length;
    io.print(
      `  Findings: ${critical} critical, ${major} major, ${minor} minor`,
    );
    io.print("");
  }
}

function printAgentTeamsGuidance(
  io: AuditIO,
  report: AuditReport,
): void {
  io.print("  ─── Agent Teams Guidance ───");
  io.print("");
  io.print("  Adversarial Review (17_CODE_AUDIT.md) で品質を改善できます:");
  io.print("");
  io.print("  CLI パターン（推奨）:");
  io.print(
    '    "code-reviewer エージェントで ' +
      report.target.path +
      ' をレビューして"',
  );
  io.print("");
  io.print("  Web パターン（非同期）:");
  io.print(
    '    & "17_CODE_AUDIT.md に基づいて ' +
      report.target.path +
      ' をレビューして"',
  );
  io.print("");
  io.print(
    `  現在スコア: ${report.totalScore}/100 → 100点で合格（反復上限: 3回）`,
  );
  io.print("");
}

function createEmptyReport(
  mode: AuditMode,
  targetPath: string,
): AuditReport {
  const categories =
    mode === "ssot"
      ? SSOT_CATEGORIES
      : mode === "prompt"
        ? PROMPT_CATEGORIES
        : CODE_CATEGORIES;

  return {
    mode,
    target: {
      id: "",
      name: "",
      path: targetPath,
      auditDate: new Date().toISOString(),
      iteration: 0,
    },
    scorecard: createScorecard(categories),
    totalScore: 0,
    verdict: "fail",
    absoluteConditions: [],
    findings: [],
  };
}
