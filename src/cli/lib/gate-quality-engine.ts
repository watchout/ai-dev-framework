/**
 * Gate 2: Quality Sweep — Parallel execution engine
 *
 * ADR-016 Phase B-3: Run 4 validators in parallel,
 * parse results, auto-aggregate, and verdict.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  executeWithProvider,
  getProvider,
  loadProviderConfig,
} from "./llm-provider.js";
import {
  checkTests,
  formatTestQualityReport,
} from "./test-quality-checker.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ValidatorResult {
  name: string;
  critical: number;
  warning: number;
  info: number;
  criticalFindings: string[];
  warningFindings: string[];
  rawOutput: string;
  elapsedMs: number;
  error?: string;
}

export interface QualitySweepResult {
  validators: ValidatorResult[];
  totalCritical: number;
  totalWarning: number;
  totalInfo: number;
  verdict: "PASS" | "BLOCK";
  elapsedMs: number;
  warningThreshold: number;
}

export const VALIDATORS = [
  { id: "ssot-drift-detector", name: "SSOT Drift" },
  { id: "security-scanner", name: "Security" },
  { id: "test-coverage-auditor", name: "Test Coverage" },
  { id: "perf-profiler", name: "Performance" },
] as const;

// ─────────────────────────────────────────────
// Report Parser
// ─────────────────────────────────────────────

export interface ParsedValidatorOutput {
  critical: number;
  warning: number;
  info: number;
  criticalFindings: string[];
  warningFindings: string[];
  status?: "PASS" | "BLOCK";
}

/**
 * Validate that a parsed validator output matches the schema from
 * docs/specs/06_CODE_QUALITY.md §6.1 (監査レポートテンプレート):
 *   - Status: PASS | BLOCK
 *   - Critical: number
 *   - Warning: number
 */
export function validateOutputSchema(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.critical !== "number") return false;
  if (typeof p.warning !== "number") return false;
  if (p.status !== "PASS" && p.status !== "BLOCK") return false;
  return true;
}

/**
 * Parse validator output. Returns null if schema validation fails
 * (caller should retry with format instruction before giving up).
 */
export function parseValidatorOutputStrict(
  output: string,
): ParsedValidatorOutput | null {
  if (!output || output.trim().length === 0) return null;

  const critMatch = output.match(/[Cc]ritical:\s*(\d+)/);
  const warnMatch = output.match(/[Ww]arning:\s*(\d+)/);
  const infoMatch = output.match(/[Ii]nfo:\s*(\d+)/);
  const statusMatch = output.match(/[Ss]tatus:\s*(PASS|BLOCK)/);

  if (!critMatch || !warnMatch || !statusMatch) return null;

  const critical = parseInt(critMatch[1], 10);
  const warning = parseInt(warnMatch[1], 10);
  const info = infoMatch ? parseInt(infoMatch[1], 10) : 0;
  const status = statusMatch[1] as "PASS" | "BLOCK";

  const parsed: ParsedValidatorOutput = {
    critical,
    warning,
    info,
    status,
    criticalFindings: extractFindings(output, "CRITICAL"),
    warningFindings: extractFindings(output, "WARNING"),
  };

  if (!validateOutputSchema(parsed)) return null;
  return parsed;
}

export function parseValidatorOutput(output: string): {
  critical: number;
  warning: number;
  info: number;
  criticalFindings: string[];
  warningFindings: string[];
} {
  if (!output || output.trim().length === 0) {
    return {
      critical: 1,
      warning: 0,
      info: 0,
      criticalFindings: ["[PARSE-001] Validator produced no output"],
      warningFindings: [],
    };
  }

  let critical = 0;
  let warning = 0;
  let info = 0;

  // Parse "Critical: N" / "CRITICAL: N" patterns
  const critMatch = output.match(/[Cc]ritical:\s*(\d+)/);
  const warnMatch = output.match(/[Ww]arning:\s*(\d+)/);
  const infoMatch = output.match(/[Ii]nfo:\s*(\d+)/);

  if (critMatch) critical = parseInt(critMatch[1], 10);
  if (warnMatch) warning = parseInt(warnMatch[1], 10);
  if (infoMatch) info = parseInt(infoMatch[1], 10);

  // If no counts found, treat as parse failure
  if (!critMatch && !warnMatch) {
    return {
      critical: 0,
      warning: 1,
      info: 0,
      criticalFindings: [],
      warningFindings: ["[PARSE-001] Could not parse validator output counts"],
    };
  }

  // Extract findings
  const criticalFindings = extractFindings(output, "CRITICAL");
  const warningFindings = extractFindings(output, "WARNING");

  return { critical, warning, info, criticalFindings, warningFindings };
}

function extractFindings(output: string, level: string): string[] {
  const findings: string[] = [];
  const lines = output.split("\n");
  let inSection = false;

  for (const line of lines) {
    if (line.match(new RegExp(`^#{1,4}\\s*${level}`, "i"))) {
      inSection = true;
      continue;
    }
    if (inSection && line.match(/^#{1,4}\s/)) {
      inSection = false;
      continue;
    }
    if (inSection && line.trim().startsWith("- [") || (inSection && line.trim().startsWith("| ") && line.includes(level))) {
      findings.push(line.trim());
    }
  }

  return findings;
}

// ─────────────────────────────────────────────
// Validator Execution
// ─────────────────────────────────────────────

export type ValidatorRunner = (
  validatorId: string,
  prompt: string,
  timeoutMs: number,
) => Promise<string>;

let _runner: ValidatorRunner = defaultRunner;

async function defaultRunner(
  _validatorId: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const config = loadProviderConfig(process.cwd());
  const provider = getProvider("validation", config);
  return executeWithProvider(provider, prompt, {
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    experimentalAgentTeams: true,
    timeoutMs,
  });
}

export function setValidatorRunner(runner: ValidatorRunner): () => void {
  const prev = _runner;
  _runner = runner;
  return () => { _runner = prev; };
}

// ─────────────────────────────────────────────
// Main execution
// ─────────────────────────────────────────────

export async function runQualitySweep(
  projectDir: string,
  options: {
    sequential?: boolean;
    timeoutMs?: number;
    warningThreshold?: number;
  } = {},
): Promise<QualitySweepResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const warningThreshold = options.warningThreshold ?? 5;
  const startTime = Date.now();

  // Read context
  const contextPath = path.join(projectDir, ".framework/gate-context/quality-sweep.md");
  if (!fs.existsSync(contextPath)) {
    throw new Error("No quality sweep context found. Run 'framework gate quality' first to collect context.");
  }
  let context = fs.readFileSync(contextPath, "utf-8");

  // Deterministic test-quality pre-check (改修B).
  // Results are appended to context so test-coverage-auditor can incorporate them.
  try {
    const testQualityResult = checkTests(projectDir);
    const reportsDir = path.join(projectDir, ".framework/reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, "gate2-test-quality-deterministic.md"),
      formatTestQualityReport(testQualityResult),
      "utf-8",
    );
    context += `\n\n## Deterministic Test Quality Pre-check\n\n${formatTestQualityReport(testQualityResult)}\n`;
  } catch {
    // Pre-check is best-effort; failures should not block the sweep.
  }

  // Read validator prompts
  const validatorPrompts = VALIDATORS.map((v) => {
    const promptPath = path.join(projectDir, `.claude/agents/validators/${v.id}.md`);
    if (!fs.existsSync(promptPath)) {
      return { ...v, prompt: "" };
    }
    return { ...v, prompt: fs.readFileSync(promptPath, "utf-8") };
  });

  // Build full prompts
  const tasks = validatorPrompts.map((v) => ({
    ...v,
    fullPrompt: `あなたは ${v.name} です。以下の指示に従ってコードを検証してください。

## Validator Prompt
${v.prompt}

## コンテキスト
${context}

検証結果を以下のフォーマットで出力してください:

## ${v.name} Report

### Summary
- Status: PASS | BLOCK
- Critical: {count}
- Warning: {count}
- Info: {count}

### Findings

#### CRITICAL
- [{ID}] {内容}

#### WARNING
- [{ID}] {内容}

#### INFO
- [{ID}] {内容}
`,
  }));

  // Execute validators
  const results: ValidatorResult[] = [];

  if (options.sequential) {
    for (const task of tasks) {
      const result = await executeValidator(task, timeoutMs);
      results.push(result);
    }
  } else {
    const promises = tasks.map((task) => executeValidator(task, timeoutMs));
    const settled = await Promise.allSettled(promises);
    for (let i = 0; i < settled.length; i++) {
      if (settled[i].status === "fulfilled") {
        results.push((settled[i] as PromiseFulfilledResult<ValidatorResult>).value);
      } else {
        results.push({
          name: tasks[i].name,
          critical: 1,
          warning: 0,
          info: 0,
          criticalFindings: [`[ERR-001] Validator failed: ${(settled[i] as PromiseRejectedResult).reason}`],
          warningFindings: [],
          rawOutput: "",
          elapsedMs: 0,
          error: String((settled[i] as PromiseRejectedResult).reason),
        });
      }
    }
  }

  // Save individual reports
  const reportsDir = path.join(projectDir, ".framework/reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  for (const r of results) {
    const id = VALIDATORS.find((v) => v.name === r.name)?.id ?? r.name;
    fs.writeFileSync(path.join(reportsDir, `gate2-${id}.md`), r.rawOutput || `# ${r.name} — No output`, "utf-8");
  }

  // Aggregate
  const totalCritical = results.reduce((sum, v) => sum + v.critical, 0);
  const totalWarning = results.reduce((sum, v) => sum + v.warning, 0);
  const totalInfo = results.reduce((sum, v) => sum + v.info, 0);
  const verdict: "PASS" | "BLOCK" = totalCritical > 0 || totalWarning > warningThreshold ? "BLOCK" : "PASS";

  const sweepResult: QualitySweepResult = {
    validators: results,
    totalCritical,
    totalWarning,
    totalInfo,
    verdict,
    elapsedMs: Date.now() - startTime,
    warningThreshold,
  };

  // Save integrated report
  const branch = context.match(/## Branch\n(.+)/)?.[1]?.trim() ?? "unknown";
  const reportContent = generateIntegratedReport(sweepResult, branch);
  fs.writeFileSync(path.join(reportsDir, `quality-sweep-${branch.replace(/\//g, "-")}.md`), reportContent, "utf-8");

  return sweepResult;
}

/**
 * Run validator with schema validation + one retry.
 *
 * Flow (per directive improvement A):
 *   1. Initial run → parseValidatorOutputStrict → validateOutputSchema
 *   2. If schema invalid → retry once with explicit §6.1 format instruction
 *   3. If still invalid → emit CRITICAL "Validator output format invalid"
 */
export async function runValidatorWithRetry(
  task: { id: string; name: string; fullPrompt: string },
  timeoutMs: number,
): Promise<{ output: string; parsed: ParsedValidatorOutput | null; attempts: number }> {
  const output1 = await _runner(task.id, task.fullPrompt, timeoutMs);
  const parsed1 = parseValidatorOutputStrict(output1);
  if (parsed1) return { output: output1, parsed: parsed1, attempts: 1 };

  const retryPrompt = `${task.fullPrompt}

---

**IMPORTANT: Output format requirement (§6.1 of 06_CODE_QUALITY)**

Your previous response did not match the required schema. You MUST output EXACTLY the following section (case-sensitive keys):

## ${task.name} Report

### Summary
- Status: PASS | BLOCK
- Critical: <integer>
- Warning: <integer>
- Info: <integer>

### Findings

#### CRITICAL
- [ID] description

#### WARNING
- [ID] description

Status MUST be either "PASS" or "BLOCK". Critical and Warning MUST be integers.`;

  const output2 = await _runner(task.id, retryPrompt, timeoutMs);
  const parsed2 = parseValidatorOutputStrict(output2);
  return {
    output: `${output1}\n\n---\nRETRY OUTPUT:\n${output2}`,
    parsed: parsed2,
    attempts: 2,
  };
}

async function executeValidator(
  task: { id: string; name: string; fullPrompt: string },
  timeoutMs: number,
): Promise<ValidatorResult> {
  const start = Date.now();
  try {
    const { output, parsed, attempts } = await runValidatorWithRetry(task, timeoutMs);

    if (parsed) {
      return {
        name: task.name,
        critical: parsed.critical,
        warning: parsed.warning,
        info: parsed.info,
        criticalFindings: parsed.criticalFindings,
        warningFindings: parsed.warningFindings,
        rawOutput: output,
        elapsedMs: Date.now() - start,
      };
    }

    // Schema validation failed after retry → CRITICAL per directive
    return {
      name: task.name,
      critical: 1,
      warning: 0,
      info: 0,
      criticalFindings: [
        `[SCHEMA-001] Validator output format invalid after ${attempts} attempts (§6.1 schema violation: missing Status/Critical/Warning)`,
      ],
      warningFindings: [],
      rawOutput: output,
      elapsedMs: Date.now() - start,
      error: "schema_validation_failed",
    };
  } catch (err) {
    return {
      name: task.name,
      critical: 1,
      warning: 0,
      info: 0,
      criticalFindings: [`[ERR-001] ${err instanceof Error ? err.message : String(err)}`],
      warningFindings: [],
      rawOutput: "",
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function generateIntegratedReport(result: QualitySweepResult, branch: string): string {
  const lines: string[] = [
    "# Quality Sweep Report",
    "",
    `## Date: ${new Date().toISOString()}`,
    `## Branch: ${branch}`,
    `## Verdict: ${result.verdict}`,
    "",
    "## Validator Results",
    "",
    "| Validator | Critical | Warning | Info | Time |",
    "|-----------|----------|---------|------|------|",
  ];

  for (const v of result.validators) {
    lines.push(`| ${v.name} | ${v.critical} | ${v.warning} | ${v.info} | ${Math.round(v.elapsedMs / 1000)}s |`);
  }

  lines.push(`| **Total** | **${result.totalCritical}** | **${result.totalWarning}** | **${result.totalInfo}** | **${Math.round(result.elapsedMs / 1000)}s** |`);
  lines.push("");
  lines.push(`## Aggregate`);
  lines.push(`- Total CRITICAL: ${result.totalCritical}`);
  lines.push(`- Total WARNING: ${result.totalWarning} (threshold: ≤${result.warningThreshold})`);
  lines.push(`- Total INFO: ${result.totalInfo}`);
  lines.push(`- Verdict: **${result.verdict}**`);

  if (result.totalCritical > 0) {
    lines.push("");
    lines.push("## CRITICAL Findings (must fix)");
    for (const v of result.validators) {
      for (const f of v.criticalFindings) {
        lines.push(`- [${v.name}] ${f}`);
      }
    }
  }

  if (result.totalWarning > 0) {
    lines.push("");
    lines.push("## WARNING Findings");
    for (const v of result.validators) {
      for (const f of v.warningFindings) {
        lines.push(`- [${v.name}] ${f}`);
      }
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// CLI Output Formatter
// ─────────────────────────────────────────────

export function formatSweepOutput(result: QualitySweepResult): string {
  const w = 55;
  const lines: string[] = [];
  const sep = "+" + "=".repeat(w) + "+";
  const verdictLabel = result.verdict === "PASS"
    ? `Gate 2: Quality Sweep — PASS`
    : `Gate 2: Quality Sweep — BLOCK`;

  lines.push(sep);
  lines.push(`|  ${verdictLabel.padEnd(w - 2)}|`);
  lines.push(sep);
  lines.push(`|  ${"Validator".padEnd(22)}| ${"Crit".padEnd(6)}| ${"Warn".padEnd(6)}| ${"Time".padEnd(8)}|`);
  lines.push(`|  ${"".padEnd(22, "-")}+${"".padEnd(7, "-")}+${"".padEnd(7, "-")}+${"".padEnd(9, "-")}|`);

  for (const v of result.validators) {
    const time = `${Math.round(v.elapsedMs / 1000)}s`;
    lines.push(`|  ${v.name.padEnd(22)}| ${String(v.critical).padEnd(6)}| ${String(v.warning).padEnd(6)}| ${time.padEnd(8)}|`);
  }

  lines.push(`|  ${"".padEnd(22, "-")}+${"".padEnd(7, "-")}+${"".padEnd(7, "-")}+${"".padEnd(9, "-")}|`);
  const totalTime = `${Math.round(result.elapsedMs / 1000)}s`;
  lines.push(`|  ${"Total".padEnd(22)}| ${String(result.totalCritical).padEnd(6)}| ${String(result.totalWarning).padEnd(6)}| ${totalTime.padEnd(8)}|`);
  lines.push(sep);

  if (result.verdict === "PASS") {
    lines.push(`|  Verdict: PASS (${result.totalCritical} critical, ${result.totalWarning} warning <= ${result.warningThreshold})`.padEnd(w + 1) + "|");
  } else {
    lines.push(`|  Verdict: BLOCK`.padEnd(w + 1) + "|");
  }

  if (result.totalCritical > 0) {
    lines.push("|" + " ".repeat(w) + "|");
    lines.push(`|  CRITICAL (must fix before PR):`.padEnd(w + 1) + "|");
    for (const v of result.validators) {
      for (const f of v.criticalFindings) {
        lines.push(`|  ${f.slice(0, w - 3)}`.padEnd(w + 1) + "|");
      }
    }
  }

  if (result.totalWarning > 0 && result.verdict === "PASS") {
    lines.push("|" + " ".repeat(w) + "|");
    lines.push(`|  Warnings:`.padEnd(w + 1) + "|");
    for (const v of result.validators) {
      for (const f of v.warningFindings.slice(0, 5)) {
        lines.push(`|  ${f.slice(0, w - 3)}`.padEnd(w + 1) + "|");
      }
    }
  }

  lines.push(sep);
  return lines.join("\n");
}
