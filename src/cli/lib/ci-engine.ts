/**
 * CI engine - Runs CI pipeline stages and reports results
 * Based on: 19_CI_PR_STANDARDS.md
 *
 * Orchestrates 6 stages: lint, unit-test, integration-test, build, e2e, security
 * Supports --status (history) and --checklist (PR readiness) modes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CIStage,
  type CIStageResult,
  type CIReport,
  createDefaultStages,
  evaluateStage,
  determineCIVerdict,
  generatePRChecklist,
  saveCIReport,
  loadCIReports,
} from "./ci-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface CIIO {
  print(message: string): void;
}

export function createCITerminalIO(): CIIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

export function runCI(
  projectDir: string,
  options: { stage?: CIStage; status?: boolean; checklist?: boolean },
  io: CIIO,
): CIReport {
  if (options.status) {
    return handleStatus(projectDir, io);
  }

  if (options.checklist) {
    return handleChecklist(projectDir, io);
  }

  return handlePipeline(projectDir, options.stage, io);
}

// ─────────────────────────────────────────────
// Status Mode
// ─────────────────────────────────────────────

function handleStatus(projectDir: string, io: CIIO): CIReport {
  const reports = loadCIReports(projectDir);

  if (reports.length === 0) {
    io.print("\n  No CI reports found. Run 'framework ci' to check.\n");
    return createEmptyReport();
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  CI HISTORY");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  for (const report of reports.slice(0, 10)) {
    const verdictLabel = report.verdict === "ready" ? "READY" : "NOT READY";
    const passed = report.stages.filter((s) => s.status === "pass").length;
    const total = report.stages.length;
    io.print(
      `  ${report.timestamp} - ${passed}/${total} stages passed - ${verdictLabel}`,
    );
  }
  io.print("");

  return reports[0];
}

// ─────────────────────────────────────────────
// Checklist Mode
// ─────────────────────────────────────────────

function handleChecklist(projectDir: string, io: CIIO): CIReport {
  const reports = loadCIReports(projectDir);

  if (reports.length === 0) {
    io.print("\n  No CI reports found. Run 'framework ci' first.\n");
    return createEmptyReport();
  }

  const latest = reports[0];
  const checklist = generatePRChecklist(latest.stages);

  io.print(`\n${"━".repeat(38)}`);
  io.print("  PR CHECKLIST");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  const items: Array<[string, boolean]> = [
    ["Type check passed", checklist.typeCheckPassed],
    ["Lint passed", checklist.lintPassed],
    ["Formatter passed", checklist.formatterPassed],
    ["Unit tests passed", checklist.unitTestsPassed],
    ["Integration tests passed", checklist.integrationTestsPassed],
    ["Coverage above 80%", checklist.coverageAbove80],
    ["Build succeeded", checklist.buildSucceeded],
    ["No skipped required tests", checklist.noSkippedTests],
  ];

  for (const [label, passed] of items) {
    const icon = passed ? "[x]" : "[ ]";
    io.print(`  ${icon} ${label}`);
  }
  io.print("");

  return latest;
}

// ─────────────────────────────────────────────
// Pipeline Mode
// ─────────────────────────────────────────────

function handlePipeline(
  projectDir: string,
  singleStage: CIStage | undefined,
  io: CIIO,
): CIReport {
  io.print(`\n${"━".repeat(38)}`);
  io.print("  CI PIPELINE");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  const defaults = createDefaultStages();
  const stagesToRun = singleStage
    ? defaults.filter((s) => s.stage === singleStage)
    : defaults;

  const evaluatedStages: CIStageResult[] = [];

  for (const def of defaults) {
    const shouldRun = stagesToRun.some((s) => s.stage === def.stage);
    if (shouldRun) {
      const result = evaluateStage(projectDir, def.stage);
      evaluatedStages.push(result);
      printStageResult(io, result);
    } else {
      evaluatedStages.push(def);
    }
  }

  const verdict = determineCIVerdict(evaluatedStages);
  const blockers = evaluatedStages
    .filter((s) => s.required && s.status !== "pass")
    .map((s) => `${s.name}: ${s.status}`);

  const report: CIReport = {
    timestamp: new Date().toISOString(),
    branch: readGitBranch(projectDir),
    commit: readGitCommit(projectDir),
    stages: evaluatedStages,
    allRequiredPassed: verdict === "ready",
    verdict,
    blockers,
  };

  io.print("");
  io.print(`  Verdict: ${verdict === "ready" ? "READY" : "NOT READY"}`);

  if (blockers.length > 0) {
    io.print("");
    io.print("  Blockers:");
    for (const b of blockers) {
      io.print(`    - ${b}`);
    }
  }
  io.print("");

  const filename = saveCIReport(projectDir, report);
  io.print(`  Report saved: .framework/audits/${filename}`);
  io.print("");

  return report;
}

// ─────────────────────────────────────────────
// Output Helpers
// ─────────────────────────────────────────────

function printStageResult(io: CIIO, result: CIStageResult): void {
  const statusLabel = result.status.toUpperCase().padEnd(4);
  const requiredTag = result.required ? "(required)" : "(optional)";
  io.print(`  [${statusLabel}] ${result.name} ${requiredTag}`);
  for (const detail of result.details) {
    io.print(`         ${detail}`);
  }
}

// ─────────────────────────────────────────────
// Git Helpers
// ─────────────────────────────────────────────

function readGitBranch(projectDir: string): string {
  const headPath = path.join(projectDir, ".git", "HEAD");
  if (!fs.existsSync(headPath)) return "unknown";
  const content = fs.readFileSync(headPath, "utf-8").trim();
  if (content.startsWith("ref: refs/heads/")) {
    return content.replace("ref: refs/heads/", "");
  }
  return content.substring(0, 8);
}

function readGitCommit(projectDir: string): string {
  const headPath = path.join(projectDir, ".git", "HEAD");
  if (!fs.existsSync(headPath)) return "unknown";
  const content = fs.readFileSync(headPath, "utf-8").trim();
  if (content.startsWith("ref: ")) {
    const refPath = path.join(
      projectDir,
      ".git",
      content.replace("ref: ", ""),
    );
    if (fs.existsSync(refPath)) {
      return fs.readFileSync(refPath, "utf-8").trim().substring(0, 8);
    }
  }
  return content.substring(0, 8);
}

function createEmptyReport(): CIReport {
  return {
    timestamp: new Date().toISOString(),
    branch: "unknown",
    commit: "unknown",
    stages: [],
    allRequiredPassed: false,
    verdict: "not_ready",
    blockers: [],
  };
}
