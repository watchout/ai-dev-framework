/**
 * Run data model - Task execution state, escalation protocol
 * Based on: SSOT-3 §2.5, SSOT-2 §2-3, 21_AI_ESCALATION.md
 *
 * Manages task execution state machine:
 * Running → WaitingInput (escalation) → Auditing → Completed/Failed
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Escalation Types (21_AI_ESCALATION.md)
// ─────────────────────────────────────────────

export type EscalationTrigger =
  | "T1" // SSOT has no behavior for edge case
  | "T2" // Ambiguous SSOT wording
  | "T3" // Multiple technical options
  | "T4" // SSOT contradicts implementation
  | "T5" // Undefined constraint/convention
  | "T6" // Unclear change impact scope
  | "T7"; // Business judgment needed

export const ESCALATION_LABELS: Record<EscalationTrigger, string> = {
  T1: "SSOT edge case undefined",
  T2: "Ambiguous specification",
  T3: "Multiple technical options",
  T4: "SSOT-implementation conflict",
  T5: "Undefined constraint",
  T6: "Unclear impact scope",
  T7: "Business judgment needed",
};

export interface EscalationOption {
  id: number;
  description: string;
  impact: string;
}

export interface Escalation {
  triggerId: EscalationTrigger;
  context: string;
  question: string;
  options: EscalationOption[];
  recommendation: string;
  recommendationReason: string;
  resolvedAt?: string;
  resolution?: string;
}

// ─────────────────────────────────────────────
// Task Execution Types
// ─────────────────────────────────────────────

export type TaskExecutionStatus =
  | "backlog"
  | "in_progress"
  | "waiting_input"
  | "auditing"
  | "review"
  | "done"
  | "failed";

export interface ModifiedFile {
  path: string;
  action: "created" | "modified" | "deleted";
}

export interface TaskExecution {
  taskId: string;
  featureId: string;
  taskKind: string;
  name: string;
  status: TaskExecutionStatus;
  /** Task IDs that must complete before this task can start */
  blockedBy: string[];
  prompt?: string;
  files: ModifiedFile[];
  auditScore?: number;
  escalation?: Escalation;
  startedAt?: string;
  completedAt?: string;
}

// ─────────────────────────────────────────────
// Run State
// ─────────────────────────────────────────────

export type RunStatus =
  | "idle"
  | "running"
  | "waiting_input"
  | "auditing"
  | "completed"
  | "failed";

export interface RunState {
  status: RunStatus;
  currentTaskId: string | null;
  tasks: TaskExecution[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─────────────────────────────────────────────
// State Operations
// ─────────────────────────────────────────────

export function createRunState(): RunState {
  const now = new Date().toISOString();
  return {
    status: "idle",
    currentTaskId: null,
    tasks: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function getNextPendingTask(
  state: RunState,
): TaskExecution | undefined {
  return state.tasks.find((t) => t.status === "backlog");
}

export function startTask(
  state: RunState,
  taskId: string,
): TaskExecution | undefined {
  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) return undefined;

  task.status = "in_progress";
  task.startedAt = new Date().toISOString();
  state.currentTaskId = taskId;
  state.status = "running";
  return task;
}

export function escalateTask(
  state: RunState,
  taskId: string,
  escalation: Escalation,
): void {
  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) return;

  task.status = "waiting_input";
  task.escalation = escalation;
  state.status = "waiting_input";
}

export function resolveEscalation(
  state: RunState,
  taskId: string,
  resolution: string,
): void {
  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task || !task.escalation) return;

  task.escalation.resolvedAt = new Date().toISOString();
  task.escalation.resolution = resolution;
  task.status = "in_progress";
  state.status = "running";
}

export function completeTask(
  state: RunState,
  taskId: string,
  files: ModifiedFile[],
  auditScore?: number,
): void {
  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) return;

  task.status = "done";
  task.files = files;
  task.auditScore = auditScore;
  task.completedAt = new Date().toISOString();

  // Check if all tasks are done
  const allDone = state.tasks.every(
    (t) => t.status === "done" || t.status === "failed",
  );
  if (allDone) {
    state.status = "completed";
    state.completedAt = new Date().toISOString();
  } else {
    state.currentTaskId = null;
    state.status = "running";
  }
}

export function failTask(
  state: RunState,
  taskId: string,
): void {
  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) return;

  task.status = "failed";
  task.completedAt = new Date().toISOString();
  state.status = "failed";
}

// ─────────────────────────────────────────────
// Progress Calculation
// ─────────────────────────────────────────────

export function calculateProgress(state: RunState): number {
  if (state.tasks.length === 0) return 0;
  const done = state.tasks.filter((t) => t.status === "done").length;
  return Math.round((done / state.tasks.length) * 100);
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const RUN_STATE_FILE = ".framework/run-state.json";

export function loadRunState(
  projectDir: string,
): RunState | null {
  const filePath = path.join(projectDir, RUN_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as RunState;
}

export function saveRunState(
  projectDir: string,
  state: RunState,
): void {
  const filePath = path.join(projectDir, RUN_STATE_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
