/**
 * Migration engine — plan.json / run-state.json → GitHub Issues
 *
 * Part of ADF overhaul #61 sub-PR 2/7 (migration script).
 *
 * Reads existing local state files and creates corresponding GitHub Issues
 * with hidden HTML comment metadata (adf-meta marker, per ARC Q3 decision).
 *
 * Modes:
 *   --dry-run (default): report only, no side effects
 *   --apply: create Issues, rename local files to .bak
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execGh } from "./github-engine.js";
import { type PlanState, type Feature, type Task } from "./plan-model.js";
import { LABEL_FEATURE, LABEL_MIGRATED } from "./task-state.js";

const PLAN_FILE = ".framework/plan.json";
const RUN_STATE_FILE = ".framework/run-state.json";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MigrationReport {
  planFile: { exists: boolean; isEmpty: boolean; featureCount: number; taskCount: number };
  runStateFile: { exists: boolean; isEmpty: boolean; taskCount: number };
  toCreate: MigrationItem[];
  toSkip: MigrationItem[];
  alreadyMigrated: string[];
  errors: string[];
}

export interface MigrationItem {
  type: "feature" | "task";
  id: string;
  title: string;
  reason?: string;
}

export interface MigrationResult {
  created: { number: number; title: string; url: string }[];
  skipped: MigrationItem[];
  backedUp: string[];
  errors: string[];
}

// ─────────────────────────────────────────────
// adf-meta marker (ARC Q3 decision: hidden HTML comment)
// ─────────────────────────────────────────────

interface AdfMeta {
  version: string;
  type: "feature" | "task";
  id: string;
  migratedFrom: string;
  migratedAt: string;
  schema?: string;
}

function buildMetaMarker(meta: AdfMeta): string {
  const json = JSON.stringify(meta, null, 2);
  return `<!-- adf-meta:begin\n${json}\nadf-meta:end -->`;
}

// ─────────────────────────────────────────────
// Issue body builders
// ─────────────────────────────────────────────

function buildFeatureIssueBody(feature: Feature, meta: AdfMeta): string {
  const marker = buildMetaMarker(meta);
  const deps =
    feature.dependencies.length > 0
      ? feature.dependencies.join(", ")
      : "none";

  return `## ${feature.id}: ${feature.name}

| Field | Value |
|---|---|
| Priority | ${feature.priority} |
| Size | ${feature.size} |
| Type | ${feature.type} |
| Dependencies | ${deps} |
${feature.ssotFile ? `| SSOT File | ${feature.ssotFile} |` : ""}

---
_Migrated from plan.json by \`framework migrate plan-state\`_

${marker}`;
}

function buildTaskIssueBody(task: Task, meta: AdfMeta): string {
  const marker = buildMetaMarker(meta);
  const refs = task.references.join(", ");
  const blockedBy =
    task.blockedBy.length > 0 ? task.blockedBy.join(", ") : "none";

  return `## ${task.id}: ${task.name}

| Field | Value |
|---|---|
| Feature | ${task.featureId} |
| Kind | ${task.kind} |
| Size | ${task.size} |
| References | ${refs} |
| Blocked By | ${blockedBy} |
${task.seq ? `| Seq | ${task.seq} |` : ""}

---
_Migrated from plan.json by \`framework migrate plan-state\`_

${marker}`;
}

// ─────────────────────────────────────────────
// Scaffold / boilerplate detection
// ─────────────────────────────────────────────

function isBoilerplateFeature(feature: Feature): boolean {
  const boilerplateNames = [
    "example feature",
    "sample feature",
    "template feature",
    "placeholder",
  ];
  const nameLower = feature.name.toLowerCase();
  return boilerplateNames.some((bp) => nameLower.includes(bp));
}

function isPlanEmpty(plan: PlanState): boolean {
  const totalFeatures = plan.waves.reduce(
    (sum, w) => sum + w.features.length,
    0,
  );
  const totalTasks = plan.tasks?.length ?? 0;
  return totalFeatures === 0 && totalTasks === 0;
}

// ─────────────────────────────────────────────
// Analysis (dry-run)
// ─────────────────────────────────────────────

export async function findAlreadyMigrated(): Promise<string[]> {
  try {
    const output = await execGh([
      "issue",
      "list",
      "--label",
      LABEL_MIGRATED,
      "--state",
      "all",
      "--json",
      "title",
      "--limit",
      "500",
    ]);
    const issues = JSON.parse(output) as { title: string }[];
    return issues.map((i) => i.title);
  } catch {
    return [];
  }
}

export function analyzeMigration(projectDir: string, alreadyMigrated: string[] = []): MigrationReport {
  const report: MigrationReport = {
    planFile: { exists: false, isEmpty: true, featureCount: 0, taskCount: 0 },
    runStateFile: { exists: false, isEmpty: true, taskCount: 0 },
    toCreate: [],
    toSkip: [],
    alreadyMigrated: [],
    errors: [],
  };

  const planPath = path.join(projectDir, PLAN_FILE);
  if (fs.existsSync(planPath)) {
    report.planFile.exists = true;
    try {
      const raw = fs.readFileSync(planPath, "utf-8");
      const plan = JSON.parse(raw) as PlanState;

      // Handle legacy schema (features[] instead of waves[].features[])
      const legacyPlan = plan as unknown as { features?: unknown[] };
      const features = plan.waves
        ? plan.waves.flatMap((w) => w.features)
        : [];
      const tasks = plan.tasks ?? [];

      if (!plan.waves && legacyPlan.features) {
        report.planFile.featureCount = legacyPlan.features.length;
        report.planFile.taskCount = 0;
        report.planFile.isEmpty = legacyPlan.features.length === 0;
        report.toSkip.push({
          type: "feature",
          id: "*",
          title: "Legacy schema (features[] without waves[])",
          reason: "incompatible schema — manual migration required",
        });
        return report;
      }
      report.planFile.featureCount = features.length;
      report.planFile.taskCount = tasks.length;
      report.planFile.isEmpty = isPlanEmpty(plan);

      for (const feature of features) {
        const issueTitle = `[${feature.id}] ${feature.name}`;
        if (alreadyMigrated.includes(issueTitle)) {
          report.alreadyMigrated.push(issueTitle);
        } else if (isBoilerplateFeature(feature)) {
          report.toSkip.push({
            type: "feature",
            id: feature.id,
            title: feature.name,
            reason: "scaffold boilerplate",
          });
        } else {
          report.toCreate.push({
            type: "feature",
            id: feature.id,
            title: feature.name,
          });
        }
      }

      for (const task of tasks) {
        const issueTitle = `[${task.id}] ${task.name}`;
        if (alreadyMigrated.includes(issueTitle)) {
          report.alreadyMigrated.push(issueTitle);
        } else {
          const parentSkipped = report.toSkip.some(
            (s) => s.type === "feature" && s.id === task.featureId,
          );
          if (parentSkipped) {
            report.toSkip.push({
              type: "task",
              id: task.id,
              title: task.name,
              reason: "parent feature is boilerplate",
            });
          } else {
            report.toCreate.push({
              type: "task",
              id: task.id,
              title: task.name,
            });
          }
        }
      }
    } catch (e) {
      report.errors.push(`Failed to parse plan.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const runStatePath = path.join(projectDir, RUN_STATE_FILE);
  if (fs.existsSync(runStatePath)) {
    report.runStateFile.exists = true;
    try {
      const raw = fs.readFileSync(runStatePath, "utf-8");
      const runState = JSON.parse(raw) as { tasks?: unknown[] };
      report.runStateFile.taskCount = runState.tasks?.length ?? 0;
      report.runStateFile.isEmpty = report.runStateFile.taskCount === 0;
    } catch (e) {
      report.errors.push(`Failed to parse run-state.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return report;
}

// ─────────────────────────────────────────────
// Execution (--apply)
// ─────────────────────────────────────────────

export async function executeMigration(
  projectDir: string,
  report: MigrationReport,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    created: [],
    skipped: [...report.toSkip],
    backedUp: [],
    errors: [],
  };

  const planPath = path.join(projectDir, PLAN_FILE);
  if (!report.planFile.exists) {
    return result;
  }

  let plan: PlanState;
  try {
    const raw = fs.readFileSync(planPath, "utf-8");
    plan = JSON.parse(raw) as PlanState;
  } catch (e) {
    result.errors.push(`Failed to read plan.json: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const now = new Date().toISOString();
  const features = plan.waves.flatMap((w) => w.features);
  const tasks = plan.tasks ?? [];

  for (const item of report.toCreate) {
    try {
      if (item.type === "feature") {
        const feature = features.find((f) => f.id === item.id);
        if (!feature) continue;

        const meta: AdfMeta = {
          version: "1.0",
          type: "feature",
          id: feature.id,
          migratedFrom: "plan.json",
          migratedAt: now,
        };
        const body = buildFeatureIssueBody(feature, meta);
        const labels = [LABEL_FEATURE, LABEL_MIGRATED, feature.priority].join(",");
        const title = `[${feature.id}] ${feature.name}`;

        const output = await execGh([
          "issue",
          "create",
          "--title",
          title,
          "--body",
          body,
          "--label",
          labels,
        ]);

        const url = output.trim();
        const numberMatch = url.match(/\/(\d+)$/);
        result.created.push({
          number: numberMatch ? parseInt(numberMatch[1], 10) : 0,
          title,
          url,
        });
      } else {
        const task = tasks.find((t) => t.id === item.id);
        if (!task) continue;

        const meta: AdfMeta = {
          version: "1.0",
          type: "task",
          id: task.id,
          migratedFrom: "plan.json",
          migratedAt: now,
        };
        const body = buildTaskIssueBody(task, meta);
        const labels = [LABEL_MIGRATED, task.kind].join(",");
        const title = `[${task.id}] ${task.name}`;

        const output = await execGh([
          "issue",
          "create",
          "--title",
          title,
          "--body",
          body,
          "--label",
          labels,
        ]);

        const url = output.trim();
        const numberMatch = url.match(/\/(\d+)$/);
        result.created.push({
          number: numberMatch ? parseInt(numberMatch[1], 10) : 0,
          title,
          url,
        });
      }
    } catch (e) {
      result.errors.push(
        `Failed to create Issue for ${item.type} ${item.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Abort on first error — partial migration is not retryable if we continue
      break;
    }
  }

  // Backup local files only if zero errors (BLOCKER: partial failure → no rename, keep retryable)
  if (result.errors.length === 0) {
    for (const relPath of [PLAN_FILE, RUN_STATE_FILE]) {
      const fullPath = path.join(projectDir, relPath);
      if (fs.existsSync(fullPath)) {
        const bakPath = `${fullPath}.bak`;
        fs.renameSync(fullPath, bakPath);
        result.backedUp.push(relPath);
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Report formatting
// ─────────────────────────────────────────────

export function formatDryRunReport(report: MigrationReport): string {
  const lines: string[] = [];
  lines.push("=== Migration Dry-Run Report ===\n");

  lines.push(`plan.json: ${report.planFile.exists ? "found" : "not found"}`);
  if (report.planFile.exists) {
    lines.push(`  Features: ${report.planFile.featureCount}`);
    lines.push(`  Tasks: ${report.planFile.taskCount}`);
    lines.push(`  Empty/template-only: ${report.planFile.isEmpty ? "yes" : "no"}`);
  }

  lines.push(`\nrun-state.json: ${report.runStateFile.exists ? "found" : "not found"}`);
  if (report.runStateFile.exists) {
    lines.push(`  Tasks: ${report.runStateFile.taskCount}`);
    lines.push(`  Empty: ${report.runStateFile.isEmpty ? "yes" : "no"}`);
    lines.push(`  Note: run-state.json tracks execution state, not task definitions.`);
    lines.push(`  It maps to Issue labels (status:in-progress etc.) in sub-PR 3+.`);
    lines.push(`  This migration handles plan.json only. run-state.json is backed up.`);
  }

  if (report.alreadyMigrated.length > 0) {
    lines.push(`\nAlready migrated (${report.alreadyMigrated.length} Issues exist, will skip):`);
    for (const title of report.alreadyMigrated) {
      lines.push(`  = ${title}`);
    }
  }

  if (report.toCreate.length > 0) {
    lines.push(`\nWill create ${report.toCreate.length} Issues:`);
    for (const item of report.toCreate) {
      lines.push(`  + [${item.type}] ${item.id}: ${item.title}`);
    }
  }

  if (report.toSkip.length > 0) {
    lines.push(`\nWill skip ${report.toSkip.length} items:`);
    for (const item of report.toSkip) {
      lines.push(`  - [${item.type}] ${item.id}: ${item.title} (${item.reason})`);
    }
  }

  if (report.errors.length > 0) {
    lines.push(`\nErrors:`);
    for (const err of report.errors) {
      lines.push(`  ! ${err}`);
    }
  }

  if (report.toCreate.length === 0 && report.toSkip.length === 0) {
    lines.push("\nNo features or tasks to migrate.");
    if (report.planFile.exists) {
      lines.push("plan.json exists but contains no data. Safe to remove manually.");
    }
  }

  return lines.join("\n");
}

export function formatApplyResult(result: MigrationResult): string {
  const lines: string[] = [];
  lines.push("=== Migration Result ===\n");

  if (result.created.length > 0) {
    lines.push(`Created ${result.created.length} Issues:`);
    for (const issue of result.created) {
      lines.push(`  #${issue.number}: ${issue.title}`);
      lines.push(`    ${issue.url}`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push(`\nSkipped ${result.skipped.length} items:`);
    for (const item of result.skipped) {
      lines.push(`  - ${item.id}: ${item.title} (${item.reason})`);
    }
  }

  if (result.backedUp.length > 0) {
    lines.push(`\nBacked up ${result.backedUp.length} files:`);
    for (const f of result.backedUp) {
      lines.push(`  ${f} → ${f}.bak`);
    }
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors:`);
    for (const err of result.errors) {
      lines.push(`  ! ${err}`);
    }
  }

  if (result.created.length > 0 && result.errors.length === 0) {
    lines.push(`\nMigration complete. Local files backed up to .bak.`);
    lines.push(`Verify Issues at: gh issue list --label ${LABEL_MIGRATED}`);
  }

  return lines.join("\n");
}
