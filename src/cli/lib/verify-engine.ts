/**
 * Verify engine - Runs targeted verification checks
 * Reference: 25_VERIFICATION_LOOPS.md
 *
 * Verifies individual quality axes:
 * ssot, code, tests, types, or all combined.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import {
  type VerifyTarget,
  type VerifyResult,
  type CheckpointIssue,
  type CheckpointScores,
  scoreLevel,
  saveVerifyResult,
} from "./verification-model.js";
import {
  collectSourceFiles,
  scoreSSOTAlignment,
  scoreCodeQuality,
  scoreTestCoverage,
  scoreTypeSafety,
  scoreLint,
} from "./checkpoint-engine.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface VerifyIO {
  print(message: string): void;
  ask(prompt: string): Promise<string>;
}

export function createVerifyTerminalIO(): VerifyIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    ask(prompt: string): Promise<string> {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    },
  };
}

export async function runVerify(
  projectDir: string,
  target: VerifyTarget,
  options: { strict?: boolean; fix?: boolean },
  io: VerifyIO,
): Promise<VerifyResult> {
  io.print(`\n${"━".repeat(38)}`);
  io.print("  VERIFY");
  io.print(`${"━".repeat(38)}`);
  io.print(`  Target: ${target}`);
  if (options.strict) io.print("  Mode: strict");
  io.print("");

  const issues: CheckpointIssue[] = [];
  const scores: Partial<CheckpointScores> = {};

  const targets = resolveTargets(target);

  for (const t of targets) {
    io.print(`  Checking ${t}...`);
    const result = runSingleCheck(projectDir, t, issues);
    assignScore(scores, t, result);
  }

  const verdict = determineVerdict(scores, issues, options.strict);
  const verifyResult: VerifyResult = {
    target,
    grader: "auto",
    scores,
    issues,
    verdict,
  };

  saveVerifyResult(projectDir, verifyResult);
  printVerifyResult(io, verifyResult);

  if (options.fix) {
    io.print("  --fix: auto-fix not yet implemented.");
    io.print("  Review issues above and fix manually.");
    io.print("");
  }

  return verifyResult;
}

// ─────────────────────────────────────────────
// Target Resolution
// ─────────────────────────────────────────────

type SingleTarget = Exclude<VerifyTarget, "all">;

function resolveTargets(target: VerifyTarget): SingleTarget[] {
  if (target === "all") {
    return ["ssot", "code", "tests", "types"];
  }
  return [target];
}

// ─────────────────────────────────────────────
// Single Check Runner
// ─────────────────────────────────────────────

function runSingleCheck(
  projectDir: string,
  target: SingleTarget,
  issues: CheckpointIssue[],
): number {
  const srcFiles = collectSourceFiles(projectDir, "src");
  const testFiles = srcFiles.filter((f) => f.includes(".test."));
  const nonTestFiles = srcFiles.filter((f) => !f.includes(".test."));

  switch (target) {
    case "ssot":
      return scoreSSOTAlignment(projectDir, issues);
    case "code":
      return scoreCodeQuality(projectDir, nonTestFiles, issues);
    case "tests":
      return scoreTestCoverage(nonTestFiles, testFiles, issues);
    case "types":
      return scoreTypeSafety(projectDir, nonTestFiles, issues);
  }
}

function assignScore(
  scores: Partial<CheckpointScores>,
  target: SingleTarget,
  value: number,
): void {
  switch (target) {
    case "ssot":
      scores.ssotAlignment = value;
      break;
    case "code":
      scores.codeQuality = value;
      break;
    case "tests":
      scores.testCoverage = value;
      break;
    case "types":
      scores.typeSafety = value;
      break;
  }
}

// ─────────────────────────────────────────────
// Verdict
// ─────────────────────────────────────────────

function determineVerdict(
  scores: Partial<CheckpointScores>,
  issues: CheckpointIssue[],
  strict?: boolean,
): "pass" | "warning" | "fail" {
  const scoreValues = Object.values(scores).filter(
    (v): v is number => typeof v === "number",
  );

  if (scoreValues.length === 0) return "fail";

  const minScore = Math.min(...scoreValues);
  const hasErrors = issues.some((i) => i.severity === "error");

  if (strict) {
    if (hasErrors || minScore < 90) return "fail";
    return "pass";
  }

  const level = scoreLevel(minScore);
  if (level === "fail") return "fail";
  if (level === "warning" || hasErrors) return "warning";
  return "pass";
}

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

function printVerifyResult(
  io: VerifyIO,
  result: VerifyResult,
): void {
  io.print("");
  io.print("  Results:");

  const entries: Array<[string, number | undefined]> = [
    ["SSOT Alignment", result.scores.ssotAlignment],
    ["Code Quality", result.scores.codeQuality],
    ["Test Coverage", result.scores.testCoverage],
    ["Type Safety", result.scores.typeSafety],
    ["Lint", result.scores.lint],
  ];

  for (const [name, score] of entries) {
    if (score === undefined) continue;
    const level = scoreLevel(score);
    const label = level.toUpperCase();
    io.print(`    ${name}: ${score} [${label}]`);
  }

  io.print("");

  if (result.issues.length > 0) {
    const errs = result.issues.filter(
      (i) => i.severity === "error",
    ).length;
    const warns = result.issues.filter(
      (i) => i.severity === "warning",
    ).length;
    io.print(`  Issues: ${errs} errors, ${warns} warnings`);

    for (const issue of result.issues.slice(0, 10)) {
      const prefix =
        issue.severity === "error" ? "[ERR]" : "[WRN]";
      const loc = issue.line
        ? `${issue.file}:${issue.line}`
        : issue.file;
      io.print(`    ${prefix} ${loc} - ${issue.message}`);
    }

    if (result.issues.length > 10) {
      io.print(
        `    ... and ${result.issues.length - 10} more issues`,
      );
    }
    io.print("");
  }

  io.print(`  Verdict: ${result.verdict.toUpperCase()}`);
  io.print("");
}
