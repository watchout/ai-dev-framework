/**
 * State reader — dual-source facade for plan/run state reads.
 *
 * Part of ADF overhaul #61 sub-PR 3/7 (read path → GitHub Issues).
 *
 * During the dual-source transition period (sub-PR 3 and 4):
 *   - READ: from GitHub Issues via task-state.ts
 *   - WRITE: still to local files (removed in sub-PR 4)
 *
 * This module provides loadPlan/loadRunState-compatible interfaces
 * backed by GitHub Issues. Consumers switch imports one at a time.
 *
 * After sub-PR 4, local file reads are fully removed.
 */
import {
  listFeatures,
  getActiveTask,
  listMyOpenIssues,
  type TaskIssue,
} from "./task-state.js";
import type {
  PlanState,
  Feature,
  Priority,
  Size,
  FeatureType,
} from "./plan-model.js";

// ─────────────────────────────────────────────
// adf-meta parser (extracts structured data from Issue body)
// ─────────────────────────────────────────────

interface AdfMeta {
  version: string;
  type: "feature" | "task";
  id: string;
  migratedFrom?: string;
  migratedAt?: string;
  [key: string]: unknown;
}

const META_REGEX = /<!--\s*adf-meta:begin\s*\n([\s\S]*?)\nadf-meta:end\s*-->/;

export function parseAdfMeta(body: string): AdfMeta | null {
  const match = META_REGEX.exec(body);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as AdfMeta;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Issue → Feature/Task conversion
// ─────────────────────────────────────────────

function extractTableValue(body: string, field: string): string {
  const regex = new RegExp(`\\|\\s*${field}\\s*\\|\\s*([^|]+)\\|`);
  const match = regex.exec(body);
  return match ? match[1].trim() : "";
}

function issueToFeature(issue: TaskIssue): Feature {
  const meta = parseAdfMeta(issue.body);
  const id = meta?.id ?? extractIdFromTitle(issue.title);

  const priorityRaw = extractTableValue(issue.body, "Priority");
  const sizeRaw = extractTableValue(issue.body, "Size");
  const typeRaw = extractTableValue(issue.body, "Type");
  const depsRaw = extractTableValue(issue.body, "Dependencies");

  return {
    id,
    name: extractNameFromTitle(issue.title),
    priority: (["P0", "P1", "P2"].includes(priorityRaw) ? priorityRaw : "P2") as Priority,
    size: (["S", "M", "L", "XL"].includes(sizeRaw) ? sizeRaw : "M") as Size,
    type: (typeRaw === "common" ? "common" : "proprietary") as FeatureType,
    dependencies: depsRaw && depsRaw !== "none" ? depsRaw.split(",").map((d) => d.trim()) : [],
    dependencyCount: 0,
    ssotFile: extractTableValue(issue.body, "SSOT File") || undefined,
  };
}

function extractIdFromTitle(title: string): string {
  const match = /\[([^\]]+)\]/.exec(title);
  return match ? match[1] : title;
}

function extractNameFromTitle(title: string): string {
  const match = /\]\s*(.+)$/.exec(title);
  return match ? match[1].trim() : title;
}

// ─────────────────────────────────────────────
// GitHub Issues → PlanState adapter
// ─────────────────────────────────────────────

export async function loadPlanFromGitHub(): Promise<PlanState | null> {
  let featureIssues: TaskIssue[];
  try {
    featureIssues = await listFeatures();
  } catch {
    return null;
  }
  if (featureIssues.length === 0) return null;

  const features = featureIssues.map(issueToFeature);

  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves: [
      {
        number: 1,
        phase: "individual",
        title: "All Features (from GitHub Issues)",
        features,
      },
    ],
    tasks: [],
    circularDependencies: [],
  };
}

// ─────────────────────────────────────────────
// GitHub Issues → RunState adapter
// ─────────────────────────────────────────────

export interface RunStateFromGitHub {
  hasActiveTask: boolean;
  activeTask: TaskIssue | null;
  openIssueCount: number;
}

export async function loadRunStateFromGitHub(): Promise<RunStateFromGitHub> {
  try {
    const activeTask = await getActiveTask();
    const openIssues = await listMyOpenIssues();

    return {
      hasActiveTask: activeTask !== null,
      activeTask,
      openIssueCount: openIssues.length,
    };
  } catch {
    return {
      hasActiveTask: false,
      activeTask: null,
      openIssueCount: 0,
    };
  }
}

// ─────────────────────────────────────────────
// Deprecation warning for direct local reads
// ─────────────────────────────────────────────

let _deprecationWarned = false;

export function warnLocalReadDeprecated(caller: string): void {
  if (_deprecationWarned) return;
  _deprecationWarned = true;
  console.warn(
    `[deprecated] ${caller}: reading from local plan.json/run-state.json. ` +
      `Migrate to state-reader.ts (GitHub Issues). See #61.`,
  );
}

export function resetDeprecationWarning(): void {
  _deprecationWarned = false;
}
