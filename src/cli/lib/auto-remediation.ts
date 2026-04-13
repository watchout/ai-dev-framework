/**
 * Auto-remediation engine for Gate BLOCK → fix → re-Gate cycle.
 *
 * When a Gate returns BLOCK, this engine:
 * 1. Extracts remediation instructions from the BLOCK report
 * 2. Executes fixes via `claude -p`
 * 3. Re-runs the Gate
 * 4. Repeats up to maxRetries (hard limit: 3)
 * 5. Escalates to human if still BLOCK after max retries
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  executeWithProvider,
  getProvider,
  loadProviderConfig,
} from "./llm-provider.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RemediationFinding {
  id: string;
  level: string;
  description: string;
}

export interface RemediationInstruction {
  source: "gate2" | "gate3";
  attempt: number;
  findings: RemediationFinding[];
  instruction: string;
}

export interface AutoFixOptions {
  maxRetries: number;
  timeout: number;
  runTests: boolean;
  projectDir: string;
}

export interface RemediationResult {
  success: boolean;
  error?: string;
}

export interface GateAutoFixResult {
  verdict: "PASS" | "BLOCK" | "ESCALATE";
  attempts: number;
  reports: string[];
  escalationReason?: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_RETRIES_HARD_LIMIT = 3;
const REMEDIATION_DIR = ".framework/remediation";

// ─────────────────────────────────────────────
// Remediation extraction
// ─────────────────────────────────────────────

/**
 * Extract remediation instructions from a Gate 2 BLOCK report.
 * Parses CRITICAL and WARNING findings from the quality sweep report.
 */
export function extractRemediationFromGate2(
  report: string,
  attempt: number,
): RemediationInstruction {
  const findings: RemediationFinding[] = [];

  // Parse findings from markdown table rows: | # | Level | ... | Description |
  const lines = report.split("\n");
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 4) continue;

    const level = cells[1];
    if (level === "CRITICAL" || level === "WARNING") {
      findings.push({
        id: cells[0],
        level,
        description: cells[cells.length - 1],
      });
    }
  }

  const instruction = findings.length > 0
    ? buildRemediationPrompt(findings, "gate2")
    : "No actionable findings found in Gate 2 report.";

  return { source: "gate2", attempt, findings, instruction };
}

/**
 * Extract remediation instructions from a Gate 3 BLOCK verdict.
 * Parses GUILTY findings and BLOCK conditions.
 */
export function extractRemediationFromGate3(
  verdict: string,
  attempt: number,
): RemediationInstruction {
  const findings: RemediationFinding[] = [];

  const lines = verdict.split("\n");

  // Look for GUILTY entries in verdict table
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (!line.includes("GUILTY")) continue;

    const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 5) continue;

    findings.push({
      id: cells[0],
      level: "GUILTY",
      description: cells[1],
    });
  }

  // Look for condition checklist items (SHIP_WITH_CONDITIONS or BLOCK conditions)
  for (const line of lines) {
    const condMatch = line.match(/^- \[[ x]\] (.+)/);
    if (condMatch) {
      findings.push({
        id: `COND-${findings.length + 1}`,
        level: "CONDITION",
        description: condMatch[1],
      });
    }
  }

  const instruction = findings.length > 0
    ? buildRemediationPrompt(findings, "gate3")
    : "No actionable findings found in Gate 3 verdict.";

  return { source: "gate3", attempt, findings, instruction };
}

/**
 * Generic extraction dispatcher.
 */
export function extractRemediation(
  report: string,
  gateType: "quality" | "release",
  attempt: number,
): RemediationInstruction {
  return gateType === "quality"
    ? extractRemediationFromGate2(report, attempt)
    : extractRemediationFromGate3(report, attempt);
}

// ─────────────────────────────────────────────
// Prompt building
// ─────────────────────────────────────────────

function buildRemediationPrompt(
  findings: RemediationFinding[],
  source: "gate2" | "gate3",
): string {
  const header = source === "gate2"
    ? "Gate 2 (Quality Sweep) がBLOCK判定を出しました。以下の問題を修正してください。"
    : "Gate 3 (Adversarial Review) がBLOCK判定を出しました。以下のGUILTY判定/条件を解消してください。";

  const items = findings.map((f) =>
    `- [${f.level}] ${f.id}: ${f.description}`,
  ).join("\n");

  return `${header}\n\n修正すべき項目:\n${items}\n\n修正後、既存テスト（npm test）が全てパスすることを確認してください。\n新しいテストの追加が必要な場合は追加してください。`;
}

// ─────────────────────────────────────────────
// Remediation execution
// ─────────────────────────────────────────────

/**
 * Execute a remediation attempt using `claude -p`.
 */
export async function executeRemediation(
  instruction: RemediationInstruction,
  options: { projectDir: string; timeout: number; runTests: boolean },
): Promise<RemediationResult> {
  const { projectDir, timeout, runTests } = options;

  // Save instruction to file
  const remediationDir = path.join(projectDir, REMEDIATION_DIR);
  if (!fs.existsSync(remediationDir)) {
    fs.mkdirSync(remediationDir, { recursive: true });
  }

  const attemptFile = path.join(
    remediationDir,
    `attempt-${instruction.attempt}.md`,
  );
  fs.writeFileSync(
    attemptFile,
    `# Remediation Attempt ${instruction.attempt}\n\n## Source: ${instruction.source}\n## Date: ${new Date().toISOString()}\n\n## Instruction\n\n${instruction.instruction}\n`,
    "utf-8",
  );

  // Save pre-fix git diff
  try {
    const preDiff = execSync("git diff", {
      cwd: projectDir,
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
    });
    fs.writeFileSync(
      path.join(remediationDir, `attempt-${instruction.attempt}-pre.diff`),
      preDiff,
      "utf-8",
    );
  } catch {
    // Ignore diff errors
  }

  // Execute remediation via configured LLM provider
  try {
    const providerConfig = loadProviderConfig(projectDir);
    const provider = getProvider("remediation", providerConfig);
    await executeWithProvider(provider, instruction.instruction, {
      cwd: projectDir,
      timeoutMs: timeout * 1000,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("TIMEOUT") || errMsg.includes("timed out")) {
      return { success: false, error: `Remediation timed out after ${timeout}s` };
    }
    return { success: false, error: `Remediation execution failed: ${errMsg.slice(0, 200)}` };
  }

  // Save post-fix git diff
  try {
    const postDiff = execSync("git diff", {
      cwd: projectDir,
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
    });
    fs.writeFileSync(
      path.join(remediationDir, `attempt-${instruction.attempt}-post.diff`),
      postDiff,
      "utf-8",
    );
  } catch {
    // Ignore diff errors
  }

  // Run tests if required
  if (runTests) {
    try {
      execSync("npm test", {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 120000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Tests failed — revert all changes including untracked files
      try {
        execSync("git checkout . && git clean -fd", { cwd: projectDir, encoding: "utf-8" });
      } catch {
        // Ignore revert errors
      }
      return { success: false, error: "Tests failed after remediation. Changes reverted." };
    }
  }

  return { success: true };
}

// ─────────────────────────────────────────────
// Main auto-fix loop
// ─────────────────────────────────────────────

export interface AutoFixCallbacks {
  runGate: () => Promise<{ verdict: string; report: string }>;
  onAttemptStart: (attempt: number, maxRetries: number) => void;
  onAttemptResult: (attempt: number, result: RemediationResult) => void;
  onEscalation: (reason: string, attempts: number) => void;
}

/**
 * Run Gate with auto-fix loop.
 * Returns PASS if any attempt succeeds, ESCALATE if max retries exceeded.
 */
export async function runGateWithAutoFix(
  gateType: "quality" | "release",
  options: AutoFixOptions,
  callbacks: AutoFixCallbacks,
): Promise<GateAutoFixResult> {
  const maxRetries = Math.min(options.maxRetries, MAX_RETRIES_HARD_LIMIT);
  const reports: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    callbacks.onAttemptStart(attempt, maxRetries);

    // Run the gate
    const { verdict, report } = await callbacks.runGate();
    reports.push(report);

    if (verdict === "PASS" || verdict === "SHIP") {
      return { verdict: "PASS", attempts: attempt, reports };
    }

    // Extract remediation instructions
    const instruction = extractRemediation(report, gateType, attempt);

    if (instruction.findings.length === 0) {
      const reason = "No actionable findings could be extracted from BLOCK report.";
      callbacks.onEscalation(reason, attempt);
      return { verdict: "ESCALATE", attempts: attempt, reports, escalationReason: reason };
    }

    // Execute remediation
    const result = await executeRemediation(instruction, {
      projectDir: options.projectDir,
      timeout: options.timeout,
      runTests: options.runTests,
    });

    callbacks.onAttemptResult(attempt, result);

    if (!result.success) {
      const reason = result.error ?? "Remediation failed";
      callbacks.onEscalation(reason, attempt);
      return { verdict: "ESCALATE", attempts: attempt, reports, escalationReason: reason };
    }
  }

  // All retries exhausted — run gate one final time
  const { verdict, report } = await callbacks.runGate();
  reports.push(report);

  if (verdict === "PASS" || verdict === "SHIP") {
    return { verdict: "PASS", attempts: maxRetries, reports };
  }

  const reason = `Still BLOCK after ${maxRetries} remediation attempts.`;
  callbacks.onEscalation(reason, maxRetries);
  return { verdict: "ESCALATE", attempts: maxRetries, reports, escalationReason: reason };
}

// ─────────────────────────────────────────────
// Escalation formatting
// ─────────────────────────────────────────────

export function formatEscalation(
  gateType: "quality" | "release",
  result: GateAutoFixResult,
): string {
  const gateName = gateType === "quality" ? "Quality Sweep" : "Adversarial Review";
  const lines = [
    "",
    "  ESCALATION: Auto-remediation failed",
    `  Gate: ${gateName}`,
    `  Attempts: ${result.attempts}/${MAX_RETRIES_HARD_LIMIT}`,
    `  Reason: ${result.escalationReason ?? "Unknown"}`,
    `  Remediation logs: ${REMEDIATION_DIR}/attempt-{1..${result.attempts}}.md`,
    "",
    "  Action required: Manual review and fix",
    "",
  ];
  return lines.join("\n");
}

/**
 * Cap maxRetries to the hard limit.
 */
export function capMaxRetries(value: number): number {
  return Math.min(Math.max(1, value), MAX_RETRIES_HARD_LIMIT);
}
