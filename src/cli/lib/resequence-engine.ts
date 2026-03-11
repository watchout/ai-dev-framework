/**
 * framework resequence — Re-assign WWWFFFFTTT numbers in 10-step intervals
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §5
 * Issue: #19
 *
 * Use cases:
 * - After insertions pile up (011,012,013...) → restore clean 10-step spacing
 * - --migrate: convert old format tasks (no seq) to WWWFFFFTTT
 */
import { loadPlan, savePlan, assignSeqNumbers, type PlanState } from "./plan-model.js";
import { acquireLock, releaseLock } from "./lock-model.js";
import { atomicWritePlan } from "./sync-engine.js";

export interface ResequenceResult {
  ok: boolean;
  error?: string;
  resequenced: number;
  migrated: number;
  warnings: string[];
}

/**
 * Resequence all tasks in plan.json to 10-step WWWFFFFTTT intervals.
 *
 * @param projectDir  Project root
 * @param migrate     If true, also assign seq to tasks that have none (migration mode)
 */
export async function runResequence(
  projectDir: string,
  migrate = false,
): Promise<ResequenceResult> {
  const warnings: string[] = [];

  const lockResult = acquireLock(projectDir, "resequence");
  if (!lockResult.ok && lockResult.reason === "active") {
    return {
      ok: false,
      error: `別の ${lockResult.data.command} が実行中です。`,
      resequenced: 0,
      migrated: 0,
      warnings,
    };
  }
  if (!lockResult.ok) {
    warnings.push(`⚠️  前回の ${lockResult.data.command} が異常終了していました。ロックを自動解除しました。`);
  }

  try {
    const plan = loadPlan(projectDir);
    if (!plan || !plan.tasks) {
      return {
        ok: false,
        error: "plan.json が見つかりません。先に framework plan を実行してください。",
        resequenced: 0,
        migrated: 0,
        warnings,
      };
    }

    const before = plan.tasks.map((t) => ({ id: t.id, seq: t.seq }));

    // Count tasks without seq (migration candidates)
    const withoutSeq = plan.tasks.filter((t) => !t.seq).length;

    if (withoutSeq > 0 && !migrate) {
      warnings.push(
        `⚠️  ${withoutSeq} 件のタスクに seq がありません。--migrate を付けて実行してください。`,
      );
    }

    // Re-assign seq numbers based on current wave/feature order
    assignSeqNumbers(plan.waves, plan.tasks);

    const after = plan.tasks.map((t) => ({ id: t.id, seq: t.seq }));
    const changed = after.filter((a, i) => a.seq !== before[i]?.seq).length;
    const migrated = migrate ? withoutSeq : 0;

    atomicWritePlan(projectDir, plan);

    return {
      ok: true,
      resequenced: changed,
      migrated,
      warnings,
    };
  } finally {
    releaseLock(projectDir);
  }
}
