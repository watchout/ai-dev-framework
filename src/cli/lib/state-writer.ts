/**
 * State writer — write-through layer for GitHub Issues sync.
 *
 * Part of ADF overhaul #61 sub-PR 4/7 (write path → GitHub Issues).
 *
 * Intercepts meaningful state transitions in RunState/PlanState and
 * syncs them to GitHub Issues. Intermediate saves (heartbeat, etc.)
 * are local-only.
 *
 * This ends the dual-source period: reads come from state-reader.ts
 * (GitHub Issues), writes go to both local files AND GitHub Issues.
 */
import { execGh } from "./github-engine.js";
import {
  LABEL_IN_PROGRESS,
  LABEL_BLOCKED,
  LABEL_COMPLETED,
  clearStatusLabels,
  markInProgress,
  markBlocked,
  markCompleted,
} from "./task-state.js";
import type { TaskExecutionStatus } from "./run-model.js";

// ─────────────────────────────────────────────
// Task status → GitHub Issue sync
// ─────────────────────────────────────────────

interface StatusTransition {
  taskId: string;
  issueNumber: number | null;
  oldStatus: TaskExecutionStatus;
  newStatus: TaskExecutionStatus;
  reason?: string;
}

const MEANINGFUL_TRANSITIONS: TaskExecutionStatus[] = [
  "in_progress",
  "done",
  "failed",
  "waiting_input",
];

export async function syncTaskStatusToGitHub(
  transition: StatusTransition,
): Promise<void> {
  if (!transition.issueNumber) return;
  if (!MEANINGFUL_TRANSITIONS.includes(transition.newStatus)) return;

  try {
    switch (transition.newStatus) {
      case "in_progress":
        await markInProgress(transition.issueNumber);
        break;
      case "done":
        await markCompleted(transition.issueNumber);
        break;
      case "failed":
        await markBlocked(transition.issueNumber, transition.reason ?? "Task failed");
        break;
      case "waiting_input":
        await markBlocked(transition.issueNumber, transition.reason ?? "Waiting for input");
        break;
    }
  } catch {
    // Write-through is best-effort: local write always succeeds,
    // GitHub sync failure is logged but doesn't block execution.
    console.warn(
      `[state-writer] Failed to sync task ${transition.taskId} (#${transition.issueNumber}) to GitHub. Local state is authoritative.`,
    );
  }
}

// ─────────────────────────────────────────────
// Issue number resolution (taskId → Issue number)
// ─────────────────────────────────────────────

const _issueNumberCache = new Map<string, number>();

export async function resolveIssueNumber(
  taskId: string,
): Promise<number | null> {
  if (_issueNumberCache.has(taskId)) {
    return _issueNumberCache.get(taskId)!;
  }

  try {
    const output = await execGh([
      "issue",
      "list",
      "--search",
      `[${taskId}] in:title`,
      "--json",
      "number",
      "--limit",
      "1",
    ]);
    const issues = JSON.parse(output) as { number: number }[];
    if (issues.length > 0) {
      _issueNumberCache.set(taskId, issues[0].number);
      return issues[0].number;
    }
  } catch {
    // Resolution failure is non-fatal
  }
  return null;
}

export function clearIssueNumberCache(): void {
  _issueNumberCache.clear();
}

// ─────────────────────────────────────────────
// Batch sync: full RunState → GitHub Issues
// ─────────────────────────────────────────────

interface TaskState {
  taskId: string;
  status: TaskExecutionStatus;
  reason?: string;
}

export async function batchSyncToGitHub(
  tasks: TaskState[],
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  for (const task of tasks) {
    if (!MEANINGFUL_TRANSITIONS.includes(task.status)) continue;

    const issueNumber = await resolveIssueNumber(task.taskId);
    if (!issueNumber) {
      failed++;
      continue;
    }

    try {
      await syncTaskStatusToGitHub({
        taskId: task.taskId,
        issueNumber,
        oldStatus: "backlog",
        newStatus: task.status,
        reason: task.reason,
      });
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
