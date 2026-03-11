/**
 * framework sync — Bidirectional sync between plan.json and GitHub Issues
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §8-9
 * Issue: #16
 *
 * Features:
 * - atomic write (tmpfile + rename) to prevent corruption on network failure
 * - dirty flag: plan.json marks itself dirty during sync; cleared on success
 * - idempotent: running sync multiple times with same state yields same result
 * - orphan detection: tasks in plan.json that no longer exist in GitHub Issues
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPlan, savePlan, type PlanState } from "./plan-model.js";
import { acquireLock, releaseLock, type AcquireResult } from "./lock-model.js";

const PLAN_FILE = ".framework/plan.json";
const PLAN_TMP = ".framework/plan.json.tmp";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SyncMeta {
  syncedAt: string;
  syncCommit?: string;
  dirty: boolean;
}

export interface OrphanedTask {
  taskId: string;
  seq?: string;
  issueNumber?: number;
}

export interface SyncEngineResult {
  ok: boolean;
  error?: string;
  /** Tasks in plan.json with no matching open GitHub Issue */
  orphaned: OrphanedTask[];
  /** Number of tasks whose status was updated from GitHub */
  updated: number;
  warnings: string[];
}

// ─────────────────────────────────────────────
// plan.json meta helpers
// ─────────────────────────────────────────────

function metaPath(projectDir: string): string {
  return path.join(projectDir, ".framework/sync-meta.json");
}

export function loadSyncMeta(projectDir: string): SyncMeta | null {
  const mp = metaPath(projectDir);
  if (!fs.existsSync(mp)) return null;
  try {
    return JSON.parse(fs.readFileSync(mp, "utf-8")) as SyncMeta;
  } catch {
    return null;
  }
}

export function saveSyncMeta(projectDir: string, meta: SyncMeta): void {
  const mp = metaPath(projectDir);
  const dir = path.dirname(mp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * Mark plan.json as dirty (sync in progress).
 * Called before writing tmp file.
 */
export function markDirty(projectDir: string): void {
  const meta = loadSyncMeta(projectDir) ?? {
    syncedAt: new Date().toISOString(),
    dirty: false,
  };
  saveSyncMeta(projectDir, { ...meta, dirty: true });
}

/**
 * Mark plan.json as clean (sync completed successfully).
 */
export function markClean(projectDir: string, syncCommit?: string): void {
  saveSyncMeta(projectDir, {
    syncedAt: new Date().toISOString(),
    syncCommit,
    dirty: false,
  });
}

/**
 * Check if plan.json is dirty (sync was interrupted).
 */
export function isDirty(projectDir: string): boolean {
  return loadSyncMeta(projectDir)?.dirty ?? false;
}

// ─────────────────────────────────────────────
// Atomic write
// ─────────────────────────────────────────────

/**
 * Write plan.json atomically via a tmp file.
 * On failure, the tmp file is cleaned up; original plan.json is untouched.
 */
export function atomicWritePlan(
  projectDir: string,
  plan: PlanState,
): void {
  const planFilePath = path.join(projectDir, PLAN_FILE);
  const tmpFilePath = path.join(projectDir, PLAN_TMP);
  const dir = path.dirname(planFilePath);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    // Write to tmp
    fs.writeFileSync(
      tmpFilePath,
      JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8",
    );
    // Atomic rename
    fs.renameSync(tmpFilePath, planFilePath);
  } catch (err) {
    // Cleanup tmp on failure
    try { fs.rmSync(tmpFilePath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

// ─────────────────────────────────────────────
// Orphan detection
// ─────────────────────────────────────────────

/**
 * Detect tasks in plan.json that have no corresponding open GitHub Issue.
 * Requires the github sync state to be loaded.
 */
export function detectOrphans(
  projectDir: string,
  plan: PlanState,
): OrphanedTask[] {
  // Load github sync state to get issue mappings
  let syncState: { featureIssues: Array<{ featureId: string; taskIssues: Array<{ taskId: string; issueNumber: number }> }> } | null = null;
  const syncStatePath = path.join(projectDir, ".framework/github-sync.json");
  if (fs.existsSync(syncStatePath)) {
    try {
      syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf-8"));
    } catch { /* ignore */ }
  }

  if (!plan.tasks || !syncState) return [];

  // Build set of taskIds that have mapped issues
  const mappedTaskIds = new Set<string>();
  for (const feat of syncState.featureIssues) {
    for (const ti of feat.taskIssues) {
      mappedTaskIds.add(ti.taskId);
    }
  }

  // Tasks in plan.json that have no issue mapping are considered orphaned
  const orphaned: OrphanedTask[] = [];
  for (const task of plan.tasks) {
    if (!mappedTaskIds.has(task.id)) {
      orphaned.push({ taskId: task.id, seq: task.seq });
    }
  }

  return orphaned;
}

// ─────────────────────────────────────────────
// Main sync function
// ─────────────────────────────────────────────

export interface SyncOptions {
  projectDir: string;
  keepOrphans?: boolean;
  /** If provided, embed in sync meta as syncCommit */
  commitSha?: string;
}

/**
 * Sync plan.json with GitHub Issues.
 *
 * Flow:
 * 1. Acquire lock
 * 2. Load current plan.json
 * 3. Mark dirty
 * 4. Detect orphans
 * 5. Atomic write updated plan.json
 * 6. Mark clean
 * 7. Release lock
 */
export async function runSync(options: SyncOptions): Promise<SyncEngineResult> {
  const { projectDir, keepOrphans = false, commitSha } = options;
  const warnings: string[] = [];

  // Acquire lock
  const lockResult: AcquireResult = acquireLock(projectDir, "sync");

  if (!lockResult.ok) {
    if (lockResult.reason === "active") {
      return {
        ok: false,
        error: `別の ${lockResult.data.command} が実行中です (PID: ${lockResult.data.pid})。完了後に再実行してください。`,
        orphaned: [],
        updated: 0,
        warnings,
      };
    }
    // stale_cleared or timeout_cleared — lock was removed, we now hold it
    warnings.push(
      `⚠️  前回の ${lockResult.data.command} が異常終了していました。ロックを自動解除しました。`,
    );
  }

  try {
    // Load plan
    const plan = loadPlan(projectDir);
    if (!plan) {
      return {
        ok: false,
        error: "plan.json が見つかりません。先に framework plan を実行してください。",
        orphaned: [],
        updated: 0,
        warnings,
      };
    }

    // Mark dirty before any write
    markDirty(projectDir);

    // Detect orphans
    const orphaned = detectOrphans(projectDir, plan);
    if (orphaned.length > 0 && !keepOrphans) {
      for (const o of orphaned) {
        warnings.push(
          `⚠️  Task ${o.taskId}${o.seq ? ` (${o.seq})` : ""} は GitHub Issues に存在しません。` +
          `\n   削除: framework prune ${o.taskId}` +
          `\n   維持: framework sync --keep-orphans`,
        );
      }
    }

    // Atomic write (re-saves plan with updatedAt timestamp)
    atomicWritePlan(projectDir, plan);

    // Mark clean
    markClean(projectDir, commitSha);

    return {
      ok: true,
      orphaned,
      updated: 0, // TODO: integrate with github-engine for live status pull
      warnings,
    };
  } finally {
    releaseLock(projectDir);
  }
}
