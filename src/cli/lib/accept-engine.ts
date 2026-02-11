/**
 * Acceptance engine - runs feature acceptance checks
 * Based on: 22_FEATURE_ACCEPTANCE.md
 *
 * Pipeline:
 * 1. Load feature info from plan state
 * 2. Check MUST requirements
 * 3. Check user flow completeness
 * 4. Check error handling
 * 5. Check non-functional requirements
 * 6. Check integration
 * 7. Generate scorecard
 * 8. Print formatted results
 * 9. Save report
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type AcceptanceReport,
  type AcceptanceCheck,
  analyzeFeatureCompleteness,
  calculateAcceptanceScore,
  determineAcceptanceVerdict,
  saveAcceptanceReport,
  loadAcceptanceReports,
} from "./accept-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface AcceptIO {
  print(message: string): void;
}

export function createAcceptTerminalIO(): AcceptIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Run acceptance check for a feature
 */
export function runAcceptance(
  projectDir: string,
  featureId: string,
  options: { status?: boolean },
  io: AcceptIO,
): AcceptanceReport {
  if (options.status) {
    printAcceptanceStatus(projectDir, io);
    return createEmptyReport(featureId);
  }

  const featureName = resolveFeatureName(projectDir, featureId);

  io.print(`\n${"━".repeat(38)}`);
  io.print("  FEATURE ACCEPTANCE");
  io.print(`${"━".repeat(38)}`);
  io.print(`  Feature: ${featureId} - ${featureName}`);
  io.print("");

  // 1. Run all acceptance checks
  const checks = analyzeFeatureCompleteness(projectDir, featureId);

  // 2. Calculate scorecard
  const scorecard = calculateAcceptanceScore(checks);
  const verdict = determineAcceptanceVerdict(scorecard);

  // 3. Collect rejection reasons
  const rejectionReasons = checks
    .filter((c) => !c.passed)
    .map((c) => `${c.name}: ${c.detail}`);

  // 4. Print results
  printChecks(io, checks);
  printScorecard(io, scorecard);

  const verdictLabel = verdict === "accepted" ? "ACCEPTED" : "REJECTED";
  io.print(`  Verdict: ${verdictLabel} (${scorecard.total}/100)`);

  if (rejectionReasons.length > 0) {
    io.print("");
    io.print("  Rejection reasons:");
    for (const reason of rejectionReasons) {
      io.print(`    - ${reason}`);
    }
  }
  io.print("");

  // 5. Build and save report
  const report: AcceptanceReport = {
    featureId,
    featureName,
    timestamp: new Date().toISOString(),
    checks,
    scorecard,
    verdict,
    rejectionReasons,
  };

  const filename = saveAcceptanceReport(projectDir, report);
  io.print(`  Report saved: .framework/audits/${filename}`);
  io.print("");

  return report;
}

// ─────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────

function resolveFeatureName(
  projectDir: string,
  featureId: string,
): string {
  // Try to find feature name from plan.json
  const planPath = path.join(projectDir, ".framework/plan.json");
  if (fs.existsSync(planPath)) {
    const raw = fs.readFileSync(planPath, "utf-8");
    const plan = JSON.parse(raw) as {
      waves?: Array<{
        features?: Array<{ id: string; name: string }>;
      }>;
    };

    if (plan.waves) {
      for (const wave of plan.waves) {
        if (wave.features) {
          const feature = wave.features.find(
            (f) => f.id.toLowerCase() === featureId.toLowerCase(),
          );
          if (feature) return feature.name;
        }
      }
    }
  }

  return featureId;
}

function printChecks(io: AcceptIO, checks: AcceptanceCheck[]): void {
  const categories = [...new Set(checks.map((c) => c.category))];

  for (const category of categories) {
    const categoryChecks = checks.filter((c) => c.category === category);
    const categoryLabel = category.replace(/-/g, " ").replace(
      /\b\w/g, (c) => c.toUpperCase(),
    );
    io.print(`  ${categoryLabel}:`);

    for (const check of categoryChecks) {
      const icon = check.passed ? "[PASS]" : "[FAIL]";
      io.print(
        `    ${icon} ${check.name} (${check.points}/${check.maxPoints})`,
      );
      io.print(`          ${check.detail}`);
    }
    io.print("");
  }
}

function printScorecard(
  io: AcceptIO,
  scorecard: AcceptanceReport["scorecard"],
): void {
  io.print("  Scorecard:");
  io.print("  ┌───────────────────────┬─────┬────────┐");
  io.print("  │ Category              │ Max │ Earned │");
  io.print("  ├───────────────────────┼─────┼────────┤");

  const rows: [string, number, number][] = [
    ["MUST Requirements", 30, scorecard.mustRequirements],
    ["User Flow E2E", 25, scorecard.userFlowE2E],
    ["Error Flows", 20, scorecard.errorFlows],
    ["Non-Functional", 15, scorecard.nonFunctional],
    ["Integration", 10, scorecard.integration],
  ];

  for (const [name, max, earned] of rows) {
    const paddedName = name.padEnd(21);
    const paddedMax = String(max).padStart(3);
    const paddedEarned = String(earned).padStart(6);
    io.print(`  │ ${paddedName} │ ${paddedMax} │ ${paddedEarned} │`);
  }

  io.print("  └───────────────────────┴─────┴────────┘");
  io.print(`  Total: ${scorecard.total}/100`);
  io.print("");
}

function printAcceptanceStatus(
  projectDir: string,
  io: AcceptIO,
): void {
  const reports = loadAcceptanceReports(projectDir);

  if (reports.length === 0) {
    io.print("  No acceptance reports found. Run 'framework accept <feature-id>' to check.");
    return;
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  ACCEPTANCE STATUS");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  for (const report of reports.slice(0, 10)) {
    const verdictLabel = report.verdict.toUpperCase();
    io.print(
      `  [${verdictLabel}] ${report.featureId}: ${report.featureName} - ` +
      `${report.scorecard.total}/100 (${report.timestamp})`,
    );
  }
  io.print("");
}

function createEmptyReport(featureId: string): AcceptanceReport {
  return {
    featureId,
    featureName: featureId,
    timestamp: new Date().toISOString(),
    checks: [],
    scorecard: {
      mustRequirements: 0,
      userFlowE2E: 0,
      errorFlows: 0,
      nonFunctional: 0,
      integration: 0,
      total: 0,
    },
    verdict: "rejected",
    rejectionReasons: [],
  };
}
