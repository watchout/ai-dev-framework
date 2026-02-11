/**
 * Deploy/Release data model - Types, versioning, and report structure
 * Based on: 23_DEPLOY_RELEASE.md
 *
 * Deploy pipeline: migrate -> deploy -> smoke-test -> monitor
 * Supports staging and production environments.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Environment = "dev" | "staging" | "production";
export type DeployStep =
  | "migrate"
  | "deploy"
  | "smoke-test"
  | "monitor"
  | "rollback";
export type DeployStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";
export type RollbackSeverity = "critical" | "major" | "minor";

export interface DeployStepResult {
  step: DeployStep;
  status: DeployStatus;
  detail: string;
  timestamp: string;
}

export interface DeployConfig {
  environment: Environment;
  version: string;
  branch: string;
  commit: string;
  previousVersion?: string;
}

export interface DeployReport {
  config: DeployConfig;
  steps: DeployStepResult[];
  startedAt: string;
  completedAt?: string;
  success: boolean;
  releaseNotes?: string;
}

export interface ReleaseInfo {
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  breakingChanges: string[];
  knownIssues: string[];
}

// ─────────────────────────────────────────────
// Version Utilities
// ─────────────────────────────────────────────

export function parseVersion(
  version: string,
): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function bumpVersion(
  current: string,
  type: "major" | "minor" | "patch",
): string {
  const parsed = parseVersion(current);
  if (!parsed) return "0.1.0";

  switch (type) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
}

// ─────────────────────────────────────────────
// Deploy Steps
// ─────────────────────────────────────────────

export function createDeploySteps(
  environment: Environment,
): DeployStepResult[] {
  const now = new Date().toISOString();
  const pending = (step: DeployStep): DeployStepResult => ({
    step,
    status: "pending",
    detail: "",
    timestamp: now,
  });

  switch (environment) {
    case "dev":
      return [pending("deploy"), pending("smoke-test")];
    case "staging":
      return [pending("migrate"), pending("deploy"), pending("smoke-test")];
    case "production":
      return [
        pending("migrate"),
        pending("deploy"),
        pending("smoke-test"),
        pending("monitor"),
      ];
  }
}

// ─────────────────────────────────────────────
// Deploy Readiness
// ─────────────────────────────────────────────

export function validateDeployReadiness(
  projectDir: string,
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // Check CI report exists and passed
  const auditsDir = path.join(projectDir, ".framework", "audits");
  if (fs.existsSync(auditsDir)) {
    const ciFiles = fs
      .readdirSync(auditsDir)
      .filter((f) => f.startsWith("ci-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (ciFiles.length === 0) {
      blockers.push("No CI reports found - run 'framework ci' first");
    } else {
      const raw = fs.readFileSync(
        path.join(auditsDir, ciFiles[0]),
        "utf-8",
      );
      const latest = JSON.parse(raw) as { verdict: string };
      if (latest.verdict !== "ready") {
        blockers.push("Latest CI report verdict is not 'ready'");
      }
    }
  } else {
    blockers.push("No CI reports found - run 'framework ci' first");
  }

  // Check build output exists
  const hasDist = fs.existsSync(path.join(projectDir, "dist"));
  const hasNext = fs.existsSync(path.join(projectDir, ".next"));
  if (!hasDist && !hasNext) {
    blockers.push("No build output found (dist/ or .next/) - run build first");
  }

  // Check package.json exists
  if (!fs.existsSync(path.join(projectDir, "package.json"))) {
    blockers.push("package.json not found");
  }

  return { ready: blockers.length === 0, blockers };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const DEPLOY_DIR = ".framework/deploys";

export function saveDeployReport(
  projectDir: string,
  report: DeployReport,
): string {
  const dir = path.join(projectDir, DEPLOY_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = `${report.config.environment}-${Date.now()}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filename;
}

export function loadDeployReports(
  projectDir: string,
  environment?: Environment,
): DeployReport[] {
  const dir = path.join(projectDir, DEPLOY_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"));
  const reports: DeployReport[] = [];

  for (const file of files) {
    if (environment && !file.startsWith(environment)) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    reports.push(JSON.parse(raw) as DeployReport);
  }

  return reports.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

// ─────────────────────────────────────────────
// Release Notes
// ─────────────────────────────────────────────

export function generateReleaseNotes(info: ReleaseInfo): string {
  const lines: string[] = [];

  lines.push(`# Release ${info.version}`);
  lines.push("");
  lines.push(`**Date**: ${info.date}`);
  lines.push("");

  if (info.features.length > 0) {
    lines.push("## Features");
    lines.push("");
    for (const f of info.features) lines.push(`- ${f}`);
    lines.push("");
  }

  if (info.fixes.length > 0) {
    lines.push("## Bug Fixes");
    lines.push("");
    for (const f of info.fixes) lines.push(`- ${f}`);
    lines.push("");
  }

  if (info.breakingChanges.length > 0) {
    lines.push("## Breaking Changes");
    lines.push("");
    for (const c of info.breakingChanges) lines.push(`- ${c}`);
    lines.push("");
  }

  if (info.knownIssues.length > 0) {
    lines.push("## Known Issues");
    lines.push("");
    for (const i of info.knownIssues) lines.push(`- ${i}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Markdown Report
// ─────────────────────────────────────────────

export function formatDeployMarkdown(report: DeployReport): string {
  const lines: string[] = [];
  const cfg = report.config;

  lines.push("# Deploy Report");
  lines.push("");
  lines.push(`- **Environment**: ${cfg.environment}`);
  lines.push(`- **Version**: ${cfg.version}`);
  lines.push(`- **Branch**: ${cfg.branch}`);
  lines.push(`- **Commit**: ${cfg.commit}`);
  lines.push(`- **Started**: ${report.startedAt}`);
  if (report.completedAt) {
    lines.push(`- **Completed**: ${report.completedAt}`);
  }
  lines.push(`- **Success**: ${report.success ? "Yes" : "No"}`);
  lines.push("");

  lines.push("## Steps");
  lines.push("");
  lines.push("| Step | Status | Detail | Timestamp |");
  lines.push("|------|--------|--------|-----------|");

  for (const step of report.steps) {
    lines.push(
      `| ${step.step} | ${step.status.toUpperCase()} | ${step.detail || "-"} | ${step.timestamp} |`,
    );
  }
  lines.push("");

  if (report.releaseNotes) {
    lines.push("## Release Notes");
    lines.push("");
    lines.push(report.releaseNotes);
    lines.push("");
  }

  return lines.join("\n");
}
