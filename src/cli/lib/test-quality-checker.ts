/**
 * Deterministic test-quality checker.
 *
 * Regex-based detection of "fake tests" — tests that don't actually
 * exercise the implementation. Based on §3.3/§3.4 of
 * docs/specs/06_CODE_QUALITY.md.
 *
 * Scoring is aligned with §3.5 テスト品質スコアカード (100-pt scale).
 *
 * Detection patterns:
 *   - Tests that don't import from src/    → not verifying implementation
 *   - Only expect(mockFn).toHaveBeenCalled  → violates §3.4 "モック最小限"
 *   - Empty `it('...', () => {})`           → empty tests
 *   - `.skip` / `.only`                     → forbidden in main branch
 *
 * This is a lightweight pre-check to feed into Gate 2 (test-coverage-auditor).
 * Not a replacement for AST-based analysis (v1.1).
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TestFileReport {
  file: string;
  expectCount: number;
  importsSrc: boolean;
  hasSkipOrOnly: boolean;
  mockOnlyAssertions: boolean;
  emptyDescribeBlocks: number;
  critical: string[];
  warning: string[];
}

export interface TestQualityResult {
  files: TestFileReport[];
  totalFiles: number;
  totalCritical: number;
  totalWarning: number;
  score: number;
  verdict: "PASS" | "BLOCK";
  findings: Array<{ file: string; severity: "CRITICAL" | "WARNING"; message: string }>;
}

// ─────────────────────────────────────────────
// File analysis
// ─────────────────────────────────────────────

export function analyzeTestFile(filePath: string, content: string): TestFileReport {
  const critical: string[] = [];
  const warning: string[] = [];

  // Strip block comments so comment-only mentions of forbidden tokens don't trigger.
  const code = content.replace(/\/\*[\s\S]*?\*\//g, "");

  // expect() count (all forms)
  const expectMatches = code.match(/\bexpect\s*\(/g);
  const expectCount = expectMatches ? expectMatches.length : 0;

  // Imports from src/
  const importsSrc =
    /from\s+['"][^'"]*\/src\/[^'"]*['"]/.test(code) ||
    /from\s+['"]\.\.?\/[^'"]*src[^'"]*['"]/.test(code) ||
    // sibling .js imports (e.g. "./llm-provider.js") count as importing implementation
    /from\s+['"]\.\/[^'"]+\.(js|ts)['"]/.test(code) ||
    /from\s+['"]\.\.\/[^'"]+\.(js|ts)['"]/.test(code);

  // .skip / .only
  const skipOnlyMatches =
    code.match(/\b(describe|it|test)\.(skip|only)\s*\(/g) ||
    code.match(/\b(xdescribe|xit|xtest)\s*\(/g);
  const hasSkipOrOnly = !!skipOnlyMatches && skipOnlyMatches.length > 0;
  if (hasSkipOrOnly) {
    critical.push(
      `[TEST-SKIP] Forbidden .skip/.only/xdescribe/xit found (§3.4 禁止)`,
    );
  }

  // Empty test bodies: it('...', () => {}) — matches zero-body arrow functions.
  const emptyBlocks =
    code.match(/\b(it|test)\s*\(\s*['"`][^'"`]*['"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/g) ||
    [];
  const emptyDescribeBlocks = emptyBlocks.length;
  if (emptyDescribeBlocks > 0) {
    critical.push(`[TEST-EMPTY] ${emptyDescribeBlocks} empty test block(s) found`);
  }

  // Mock-only assertions: expect(mock*) called but no other expect patterns.
  const mockAssertPatterns =
    code.match(/expect\s*\(\s*(mock|spy|stub|vi\.fn|jest\.fn)[A-Za-z_]*\s*\)/gi) ||
    [];
  const totalExpects = expectCount;
  const mockAssertions = mockAssertPatterns.length;
  const mockOnlyAssertions =
    totalExpects > 0 && mockAssertions > 0 && mockAssertions === totalExpects;
  if (mockOnlyAssertions) {
    warning.push(
      `[TEST-MOCK-ONLY] All ${totalExpects} expect()s target mocks — violates §3.4 "モックは最小限"`,
    );
  }

  // No src/ import → possibly fake test
  if (!importsSrc && expectCount > 0) {
    warning.push(
      `[TEST-NO-SRC] Test file has ${expectCount} expect()s but no imports from implementation (src/)`,
    );
  }

  // Zero expects: pure scaffolding
  if (expectCount === 0) {
    warning.push(`[TEST-NO-EXPECT] File has no expect() calls`);
  }

  return {
    file: filePath,
    expectCount,
    importsSrc,
    hasSkipOrOnly,
    mockOnlyAssertions,
    emptyDescribeBlocks,
    critical,
    warning,
  };
}

// ─────────────────────────────────────────────
// Aggregation + scoring
// ─────────────────────────────────────────────

/**
 * Score against §3.5 category #6 (テスト品質 = 10pt).
 * Start at 100, deduct for each CRITICAL/WARNING finding.
 * This is a §3.5-style deterministic pre-check; full scoring is done by
 * the test-coverage-auditor LLM.
 */
export function evaluateTestQuality(reports: TestFileReport[]): TestQualityResult {
  const findings: TestQualityResult["findings"] = [];
  let score = 100;
  let totalCritical = 0;
  let totalWarning = 0;

  for (const r of reports) {
    for (const c of r.critical) {
      findings.push({ file: r.file, severity: "CRITICAL", message: c });
      totalCritical++;
      score -= 10;
    }
    for (const w of r.warning) {
      findings.push({ file: r.file, severity: "WARNING", message: w });
      totalWarning++;
      score -= 2;
    }
  }

  if (score < 0) score = 0;
  const verdict: "PASS" | "BLOCK" = totalCritical > 0 ? "BLOCK" : "PASS";

  return {
    files: reports,
    totalFiles: reports.length,
    totalCritical,
    totalWarning,
    score,
    verdict,
    findings,
  };
}

// ─────────────────────────────────────────────
// Directory scanning
// ─────────────────────────────────────────────

export function findTestFiles(rootDir: string): string[] {
  const results: string[] = [];
  const ignore = new Set(["node_modules", "dist", ".next", "coverage", ".git"]);

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (ignore.has(name)) continue;
      const fp = path.join(dir, name);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        walk(fp);
      } else if (/\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/.test(name)) {
        results.push(fp);
      }
    }
  }
  walk(rootDir);
  return results;
}

export function checkTests(projectDir: string): TestQualityResult {
  const files = findTestFiles(projectDir);
  const reports: TestFileReport[] = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf-8");
    reports.push(analyzeTestFile(path.relative(projectDir, f), content));
  }
  return evaluateTestQuality(reports);
}

// ─────────────────────────────────────────────
// Human-readable formatting
// ─────────────────────────────────────────────

export function formatTestQualityReport(result: TestQualityResult): string {
  const lines: string[] = [];
  lines.push(`# Test Quality Report (Deterministic Pre-check)`);
  lines.push("");
  lines.push(`- Files scanned: ${result.totalFiles}`);
  lines.push(`- CRITICAL: ${result.totalCritical}`);
  lines.push(`- WARNING: ${result.totalWarning}`);
  lines.push(`- Score: ${result.score}/100`);
  lines.push(`- Verdict: **${result.verdict}**`);
  lines.push("");
  if (result.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    for (const f of result.findings) {
      lines.push(`- [${f.severity}] ${f.file}: ${f.message}`);
    }
  } else {
    lines.push("No findings.");
  }
  return lines.join("\n");
}
