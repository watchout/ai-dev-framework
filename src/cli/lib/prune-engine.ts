/**
 * framework prune — Remove orphaned tasks from plan.json
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §9
 * Issue: #18
 *
 * Orphaned task = exists in plan.json but has no corresponding GitHub Issue.
 * Detected by framework sync; explicitly removed by framework prune.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPlan, savePlan } from "./plan-model.js";
import { acquireLock, releaseLock } from "./lock-model.js";
import { atomicWritePlan } from "./sync-engine.js";

export interface PruneResult {
  ok: boolean;
  error?: string;
  removed: string[];
  notFound: string[];
}

/**
 * Remove specific tasks from plan.json by taskId.
 * Uses atomic write + lock for safety.
 */
export async function pruneTask(
  projectDir: string,
  taskIds: string[],
): Promise<PruneResult> {
  const lockResult = acquireLock(projectDir, "prune");
  if (!lockResult.ok && lockResult.reason === "active") {
    return {
      ok: false,
      error: `別の ${lockResult.data.command} が実行中です。`,
      removed: [],
      notFound: [],
    };
  }

  try {
    const plan = loadPlan(projectDir);
    if (!plan || !plan.tasks) {
      return {
        ok: false,
        error: "plan.json が見つかりません。",
        removed: [],
        notFound: [],
      };
    }

    const removed: string[] = [];
    const notFound: string[] = [];
    const taskIdSet = new Set(taskIds);

    for (const taskId of taskIds) {
      const exists = plan.tasks.some((t) => t.id === taskId);
      if (exists) {
        removed.push(taskId);
      } else {
        notFound.push(taskId);
      }
    }

    // Filter out removed tasks
    plan.tasks = plan.tasks.filter((t) => !taskIdSet.has(t.id));

    // Also remove from waves: prune features that have zero tasks remaining
    for (const wave of plan.waves) {
      wave.features = wave.features.filter((f) => {
        // Keep features that still have at least one task remaining
        const hasRemainingTasks = (plan.tasks ?? []).some((t) => t.featureId === f.id);
        return hasRemainingTasks;
      });
    }

    atomicWritePlan(projectDir, plan);

    return { ok: true, removed, notFound };
  } finally {
    releaseLock(projectDir);
  }
}

/**
 * List all task IDs currently in plan.json.
 */
export function listPlanTasks(
  projectDir: string,
): { taskId: string; seq?: string; status?: string }[] {
  const plan = loadPlan(projectDir);
  if (!plan?.tasks) return [];
  return plan.tasks.map((t) => ({ taskId: t.id, seq: t.seq }));
}
