/**
 * Run engine - orchestrates task execution with escalation protocol
 * Based on: SSOT-3 §2.5, SSOT-2 §2-3, 21_AI_ESCALATION.md
 *
 * Pipeline per task (profile-aware):
 *
 * Normal flow (app/lp/hp):
 *   SSOT → Implementation → Code Audit (Adversarial Review) → Test
 *
 * TDD flow (api/cli, or CORE/CONTRACT layers):
 *   SSOT → Test Creation → Implementation → Code Audit
 *
 * Steps:
 * 1. Load plan and build task list (TDD-aware ordering)
 * 2. Pick next pending task (or specified taskId)
 * 3. Generate implementation prompt
 * 4. Execute (with escalation triggers)
 * 5. Auto-audit (Adversarial Review) on completion
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
import {
  type RunState,
  type TaskExecution,
  type ModifiedFile,
  type AcceptanceCheck,
  type Escalation,
  type EscalationTrigger,
  ESCALATION_LABELS,
  createRunState,
  getNextPendingTask,
  getNextTaskBySeq,
  getTaskExecutionHealth,
  areTaskBlockersSatisfied,
  startTask,
  escalateTask,
  resolveEscalation,
  completeTask,
  failTask,
  touchTaskHeartbeat,
  calculateProgress,
  loadRunState,
  saveRunState,
} from "./run-model.js";
import {
  type PlanState,
  type Task,
  loadPlan,
} from "./plan-model.js";
import { closeTaskIssue, closeFeatureIssue, labelTaskIssue, syncStatusFromGitHub, isGhAvailable } from "./github-engine.js";
import { loadSyncState } from "./github-model.js";
import { acquireLock, releaseLock } from "./lock-model.js";

const RUN_LOCK_NAME = "run-state";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface RunIO {
  print(message: string): void;
  ask(prompt: string): Promise<string>;
}

export interface RunOptions {
  projectDir: string;
  io: RunIO;
  taskId?: string;
  dryRun?: boolean;
  autoCommit?: boolean;
}

export interface RunResult {
  taskId: string;
  status: "completed" | "escalated" | "failed" | "dry_run";
  files: { path: string; action: string }[];
  auditScore?: number;
  escalation?: Escalation;
  errors: string[];
}

export function createRunTerminalIO(): RunIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    async ask(prompt: string): Promise<string> {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      return new Promise((resolve) => {
        rl.question(prompt, (answer: string) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    },
  };
}

/**
 * Run the next task (or specific task) from the implementation plan
 */
export async function runTask(
  options: RunOptions,
): Promise<RunResult> {
  const { projectDir, io } = options;
  const errors: string[] = [];

  // Load or create run state
  let state = loadRunState(projectDir);
  if (!state) {
    const plan = loadPlan(projectDir);
    if (!plan || plan.waves.length === 0) {
      errors.push(
        "No implementation plan found. Run 'framework plan' first.",
      );
      return {
        taskId: "",
        status: "failed",
        files: [],
        errors,
      };
    }
    state = initRunStateFromPlan(plan);
    saveRunState(projectDir, state);
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  FRAMEWORK RUN");
  io.print(`${"━".repeat(38)}`);

  // Find target task
  let task: TaskExecution | undefined;
  const activeTask = state.tasks.find((t) => t.status === "in_progress");

  if (activeTask) {
    const health = getTaskExecutionHealth(activeTask);
    if (health.expired) {
      failTask(
        state,
        activeTask.taskId,
        health.reason ?? "max_idle_exceeded",
        health.detail,
      );
      saveRunState(projectDir, state);
      io.print(
        `  Previous task ${activeTask.taskId} marked failed: ${health.detail}`,
      );
      io.print("");
    } else {
      errors.push(
        `Task already in progress: ${activeTask.taskId}. Complete or fail it before starting another task.`,
      );
      return {
        taskId: activeTask.taskId,
        status: "failed",
        files: [],
        errors,
      };
    }
  }

  if (options.taskId) {
    task = state.tasks.find((t) => t.taskId === options.taskId);
    if (!task) {
      errors.push(`Task not found: ${options.taskId}`);
      return {
        taskId: options.taskId,
        status: "failed",
        files: [],
        errors,
      };
    }
    if (task.status === "done") {
      errors.push(`Task already completed: ${options.taskId}`);
      return {
        taskId: options.taskId,
        status: "failed",
        files: [],
        errors,
      };
    }
    if (!areTaskBlockersSatisfied(state, task)) {
      errors.push(`Task is blocked by: ${task.blockedBy.join(", ")}`);
      return {
        taskId: options.taskId,
        status: "failed",
        files: [],
        errors,
      };
    }
  } else {
    // Resume waiting_input task or get next pending
    task = state.tasks.find((t) => t.status === "waiting_input");
    if (!task) {
      task = getNextTaskBySeq(state);
    }
  }

  if (!task) {
    const progress = calculateProgress(state);
    if (progress === 100) {
      io.print("  All tasks completed!");
      state.status = "completed";
      saveRunState(projectDir, state);
    } else {
      io.print("  No pending tasks available.");
    }
    return {
      taskId: "",
      status: "completed",
      files: [],
      errors,
    };
  }

  // Display task info
  io.print(`  Task: ${task.taskId}`);
  io.print(`  Name: ${task.name}`);
  io.print(`  Feature: ${task.featureId}`);
  if (task.blockedBy.length > 0) {
    io.print(`  Blocked By: ${task.blockedBy.join(", ")}`);
  }
  io.print("");

  if (options.dryRun) {
    io.print("  [DRY RUN] Would execute this task.");
    io.print("");
    const prompt = generateTaskPrompt(task);
    io.print("  Generated Prompt:");
    io.print(`  ${"-".repeat(34)}`);
    const promptLines = prompt.split("\n");
    for (const line of promptLines.slice(0, 20)) {
      io.print(`  ${line}`);
    }
    if (promptLines.length > 20) {
      io.print(`  ... (${promptLines.length - 20} more lines)`);
    }
    io.print("");

    return {
      taskId: task.taskId,
      status: "dry_run",
      files: [],
      errors,
    };
  }

  // Handle existing escalation
  if (task.status === "waiting_input" && task.escalation) {
    return await handleExistingEscalation(
      state,
      task,
      io,
      projectDir,
    );
  }

  // Start task execution
  startTask(state, task.taskId);
  saveRunState(projectDir, state);

  // Generate implementation prompt
  const prompt = generateTaskPrompt(task);
  task.prompt = prompt;
  touchTaskHeartbeat(state, task.taskId);
  saveRunState(projectDir, state);

  io.print("  Implementation Prompt:");
  io.print(`  ${"─".repeat(34)}`);
  for (const line of prompt.split("\n")) {
    io.print(`  ${line}`);
  }
  io.print(`  ${"─".repeat(34)}`);
  io.print("");

  // Detect if escalation needed
  const escalationCheck = checkForEscalation(task);
  if (escalationCheck) {
    escalateTask(state, task.taskId, escalationCheck);
    saveRunState(projectDir, state);

    printEscalation(io, escalationCheck);

    const answer = await io.ask(
      "\n  Select option (or type response): ",
    );
    resolveEscalation(state, task.taskId, answer);
    saveRunState(projectDir, state);

    io.print(`\n  Escalation resolved: "${answer}"`);
    io.print("  Resuming task execution...");
    io.print("");
  }

  // ── Interactive completion flow ──
  // The task is now in_progress. The user/AI implements the task,
  // then confirms completion.
  io.print("  Task is now IN_PROGRESS.");
  io.print("  Implement the task according to the prompt above,");
  io.print("  then confirm completion.");
  io.print("");

  const completionAnswer = await io.ask(
    "  Mark as done? (done / skip / fail): ",
  );
  const normalized = completionAnswer.toLowerCase().trim();

  if (normalized === "skip" || normalized === "s") {
    task.status = "backlog";
    task.startedAt = undefined;
    state.currentTaskId = null;
    state.status = "running";
    saveRunState(projectDir, state);
    io.print(`  Task ${task.taskId} skipped (returned to backlog).`);
    io.print("");
    return {
      taskId: task.taskId,
      status: "completed",
      files: [],
      errors,
    };
  }

  if (normalized === "fail" || normalized === "f") {
    failTask(
      state,
      task.taskId,
      "manual_fail",
      "Marked as failed by operator",
    );
    saveRunState(projectDir, state);

    // Label GitHub Issue as "failed" (keep open for re-execution)
    try {
      const lblResult = await labelTaskIssue(projectDir, task.taskId, "failed");
      if (lblResult.labeled) {
        io.print(`  GitHub: Issue labeled "failed" for ${task.taskId}`);
      }
    } catch {
      // Silently ignore — GitHub sync is optional
    }

    io.print(`  Task ${task.taskId} marked as failed.`);
    io.print("");
    return {
      taskId: task.taskId,
      status: "failed",
      files: [],
      errors,
    };
  }

  // Default: mark as done
  const files = detectModifiedFiles(projectDir);
  const validation = validateTaskCompletion(projectDir, state, task, files);
  if (!validation.ok) {
    task.acceptanceChecks = validation.checks;
    task.stopReason = validation.reason;
    task.stopDetails = validation.detail;
    touchTaskHeartbeat(state, task.taskId);
    saveRunState(projectDir, state);
    errors.push(validation.detail);
    return {
      taskId: task.taskId,
      status: "failed",
      files,
      errors,
    };
  }
  const auditScore = 100; // Actual audit should be run separately via `framework audit`

  task.acceptanceChecks = validation.checks;
  completeTask(state, task.taskId, files, auditScore);
  saveRunState(projectDir, state);

  // Close GitHub Issue (graceful — warn only on failure)
  try {
    const ghResult = await closeTaskIssue(projectDir, task.taskId);
    if (ghResult.closed) {
      io.print(`  GitHub: Issue closed for ${task.taskId}`);
    }
  } catch {
    // Silently ignore — GitHub sync is optional
  }

  // Close parent Feature Issue if all tasks for this feature are done
  try {
    const parentClosed = await tryCloseParentIssue(state, task.featureId, projectDir);
    if (parentClosed) {
      io.print(`  GitHub: Parent issue closed for ${task.featureId}`);
    }
  } catch {
    // Silently ignore
  }

  // Progress summary
  const progress = calculateProgress(state);
  const doneCount = state.tasks.filter((t) => t.status === "done").length;
  io.print(`  ✅ Task ${task.taskId} completed`);
  io.print(`  Progress: ${doneCount}/${state.tasks.length} tasks (${progress}%)`);
  io.print("");

  return {
    taskId: task.taskId,
    status: "completed",
    files,
    auditScore,
    errors,
  };
}

// ─────────────────────────────────────────────
// Non-interactive Task Completion
// ─────────────────────────────────────────────

export interface CompleteResult {
  error?: string;
  progress: number;
  issueClosed: boolean;
  parentClosed?: boolean;
}

export interface StartTaskResult {
  error?: string;
  taskId: string;
  progress: number;
  prompt?: string;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
}

export interface HeartbeatResult {
  error?: string;
  taskId: string;
  progress: number;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
}

export interface FailTaskResult {
  error?: string;
  taskId: string;
  progress: number;
  issueLabeled: boolean;
}

/**
 * Mark a task as done without interactive prompts.
 * Designed for use from Claude Code sessions / CI / scripts.
 *
 * Usage: framework run <taskId> --complete
 */
export async function completeTaskNonInteractive(
  projectDir: string,
  taskId: string,
): Promise<CompleteResult> {
  const lockResult = acquireLock(projectDir, "run:complete", undefined, RUN_LOCK_NAME);
  if (lockResult.ok === false && lockResult.reason === "active") {
    return { error: `Run state is locked by another process (pid: ${lockResult.data.pid}).`, progress: 0, issueClosed: false };
  }
  try {
  // Load or create run state
  let state = loadRunState(projectDir);
  if (!state) {
    const plan = loadPlan(projectDir);
    if (!plan || plan.waves.length === 0) {
      return { error: "No plan found. Run 'framework plan' first.", progress: 0, issueClosed: false };
    }
    state = initRunStateFromPlan(plan);
    saveRunState(projectDir, state);
  }

  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    return { error: `Task not found: ${taskId}`, progress: 0, issueClosed: false };
  }
  if (task.status === "done") {
    return { error: `Task already completed: ${taskId}`, progress: calculateProgress(state), issueClosed: false };
  }

  // Detect modified files and complete
  const files = detectModifiedFiles(projectDir);
  const validation = validateTaskCompletion(projectDir, state, task, files);
  if (!validation.ok) {
    task.acceptanceChecks = validation.checks;
    task.stopReason = validation.reason;
    task.stopDetails = validation.detail;
    touchTaskHeartbeat(state, task.taskId);
    saveRunState(projectDir, state);
    return {
      error: validation.detail,
      progress: calculateProgress(state),
      issueClosed: false,
    };
  }
  task.acceptanceChecks = validation.checks;
  completeTask(state, taskId, files, 100);
  saveRunState(projectDir, state);

  // Close GitHub Issue (graceful)
  let issueClosed = false;
  try {
    const ghResult = await closeTaskIssue(projectDir, taskId);
    issueClosed = ghResult.closed;
  } catch {
    // Silently ignore
  }

  // Close parent Feature Issue if all tasks for this feature are done
  let parentClosed = false;
  try {
    parentClosed = await tryCloseParentIssue(state, task.featureId, projectDir);
  } catch {
    // Silently ignore
  }

  return {
    progress: calculateProgress(state),
    issueClosed,
    parentClosed,
  };
  } finally {
    releaseLock(projectDir, RUN_LOCK_NAME);
  }
}

export async function startTaskNonInteractive(
  projectDir: string,
  taskId?: string,
): Promise<StartTaskResult> {
  const lockResult = acquireLock(projectDir, "run:start", undefined, RUN_LOCK_NAME);
  if (lockResult.ok === false && lockResult.reason === "active") {
    return {
      error: `Run state is locked by another process (pid: ${lockResult.data.pid}, command: ${lockResult.data.command}).`,
      taskId: taskId ?? "",
      progress: 0,
    };
  }
  try {
  const state = loadOrInitRunState(projectDir);
  if ("error" in state) {
    return {
      error: state.error,
      taskId: taskId ?? "",
      progress: 0,
    };
  }

  const runState = state;
  const activeTask = runState.tasks.find((t) => t.status === "in_progress");
  if (activeTask) {
    const health = getTaskExecutionHealth(activeTask);
    if (health.expired) {
      failTask(
        runState,
        activeTask.taskId,
        health.reason ?? "max_idle_exceeded",
        health.detail,
      );
      saveRunState(projectDir, runState);
    } else {
      return {
        error: `Task already in progress: ${activeTask.taskId}`,
        taskId: activeTask.taskId,
        progress: calculateProgress(runState),
        prompt: activeTask.prompt,
        heartbeatAt: activeTask.heartbeatAt,
        leaseExpiresAt: activeTask.leaseExpiresAt,
      };
    }
  }

  let task: TaskExecution | undefined;
  if (taskId) {
    task = runState.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      return {
        error: `Task not found: ${taskId}`,
        taskId,
        progress: calculateProgress(runState),
      };
    }
    if (task.status === "done") {
      return {
        error: `Task already completed: ${taskId}`,
        taskId,
        progress: calculateProgress(runState),
      };
    }
    if (task.status === "waiting_input") {
      return {
        error: `Task requires escalation input before start: ${taskId}`,
        taskId,
        progress: calculateProgress(runState),
      };
    }
    if (!areTaskBlockersSatisfied(runState, task)) {
      return {
        error: `Task is blocked by: ${task.blockedBy.join(", ")}`,
        taskId,
        progress: calculateProgress(runState),
      };
    }
  } else {
    task = getNextTaskBySeq(runState);
  }

  if (!task) {
    return {
      error: "No startable task available.",
      taskId: taskId ?? "",
      progress: calculateProgress(runState),
    };
  }

  startTask(runState, task.taskId);
  task.prompt = generateTaskPrompt(task);
  touchTaskHeartbeat(runState, task.taskId);
  saveRunState(projectDir, runState);

  return {
    taskId: task.taskId,
    progress: calculateProgress(runState),
    prompt: task.prompt,
    heartbeatAt: task.heartbeatAt,
    leaseExpiresAt: task.leaseExpiresAt,
  };
  } finally {
    releaseLock(projectDir, RUN_LOCK_NAME);
  }
}

export function heartbeatTaskNonInteractive(
  projectDir: string,
  taskId?: string,
): HeartbeatResult {
  const state = loadRunState(projectDir);
  if (!state) {
    return {
      error: "No run state found. Run 'framework run --start-only' first.",
      taskId: taskId ?? "",
      progress: 0,
    };
  }

  const task = taskId
    ? state.tasks.find((t) => t.taskId === taskId)
    : state.tasks.find((t) => t.status === "in_progress");

  if (!task) {
    return {
      error: taskId
        ? `Task not found: ${taskId}`
        : "No in-progress task found.",
      taskId: taskId ?? "",
      progress: calculateProgress(state),
    };
  }

  if (task.status !== "in_progress") {
    return {
      error: `Task is not in progress: ${task.taskId}`,
      taskId: task.taskId,
      progress: calculateProgress(state),
    };
  }

  const health = getTaskExecutionHealth(task);
  if (health.expired) {
    failTask(
      state,
      task.taskId,
      health.reason ?? "max_idle_exceeded",
      health.detail,
    );
    saveRunState(projectDir, state);
    return {
      error: health.detail ?? "Task execution expired.",
      taskId: task.taskId,
      progress: calculateProgress(state),
    };
  }

  const updated = touchTaskHeartbeat(state, task.taskId);
  saveRunState(projectDir, state);

  return {
    taskId: task.taskId,
    progress: calculateProgress(state),
    heartbeatAt: updated?.heartbeatAt,
    leaseExpiresAt: updated?.leaseExpiresAt,
  };
}

export async function failTaskNonInteractive(
  projectDir: string,
  taskId: string,
  reason = "manual_fail",
  detail?: string,
): Promise<FailTaskResult> {
  const state = loadRunState(projectDir);
  if (!state) {
    return {
      error: "No run state found. Run 'framework run --start-only' first.",
      taskId,
      progress: 0,
      issueLabeled: false,
    };
  }

  const task = state.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    return {
      error: `Task not found: ${taskId}`,
      taskId,
      progress: calculateProgress(state),
      issueLabeled: false,
    };
  }

  failTask(state, taskId, reason as Parameters<typeof failTask>[2], detail);
  saveRunState(projectDir, state);

  let issueLabeled = false;
  try {
    const lblResult = await labelTaskIssue(projectDir, taskId, "failed");
    issueLabeled = lblResult.labeled;
  } catch {
    // Silently ignore — GitHub sync is optional
  }

  return {
    taskId,
    progress: calculateProgress(state),
    issueLabeled,
  };
}

export interface BatchCompleteResult {
  error?: string;
  completed: number;
  skipped: number;
  progress: number;
  issuesClosed: number;
  parentClosed?: boolean;
}

/**
 * Mark all tasks for a feature as done (non-interactive batch).
 *
 * Usage: framework run <featureId> --complete-feature
 */
export async function completeFeatureNonInteractive(
  projectDir: string,
  featureId: string,
): Promise<BatchCompleteResult> {
  let state = loadRunState(projectDir);
  if (!state) {
    const plan = loadPlan(projectDir);
    if (!plan || plan.waves.length === 0) {
      return { error: "No plan found.", completed: 0, skipped: 0, progress: 0, issuesClosed: 0 };
    }
    state = initRunStateFromPlan(plan);
    saveRunState(projectDir, state);
  }

  const featureTasks = state.tasks.filter((t) => t.featureId === featureId);
  if (featureTasks.length === 0) {
    return { error: `No tasks found for feature: ${featureId}`, completed: 0, skipped: 0, progress: 0, issuesClosed: 0 };
  }

  let completed = 0;
  let skipped = 0;
  let issuesClosed = 0;

  for (const task of featureTasks) {
    if (task.status === "done") {
      skipped++;
      continue;
    }
    completeTask(state, task.taskId, [], 100);
    completed++;

    try {
      const ghResult = await closeTaskIssue(projectDir, task.taskId);
      if (ghResult.closed) issuesClosed++;
    } catch {
      // Silently ignore
    }
  }

  // Close parent Feature Issue (all tasks are now done)
  let parentClosed = false;
  try {
    parentClosed = await tryCloseParentIssue(state, featureId, projectDir);
  } catch {
    // Silently ignore
  }

  saveRunState(projectDir, state);
  return { completed, skipped, progress: calculateProgress(state), issuesClosed, parentClosed };
}

/**
 * Mark all tasks in a wave as done (non-interactive batch).
 *
 * Usage: framework run <waveNumber> --complete-wave
 */
export async function completeWaveNonInteractive(
  projectDir: string,
  waveNumber: number,
): Promise<BatchCompleteResult> {
  const plan = loadPlan(projectDir);
  if (!plan || plan.waves.length === 0) {
    return { error: "No plan found.", completed: 0, skipped: 0, progress: 0, issuesClosed: 0 };
  }

  const wave = plan.waves.find((w) => w.number === waveNumber);
  if (!wave) {
    return { error: `Wave ${waveNumber} not found.`, completed: 0, skipped: 0, progress: 0, issuesClosed: 0 };
  }

  let state = loadRunState(projectDir);
  if (!state) {
    state = initRunStateFromPlan(plan);
    saveRunState(projectDir, state);
  }

  const featureIds = new Set(wave.features.map((f) => f.id));
  const waveTasks = state.tasks.filter((t) => featureIds.has(t.featureId));

  if (waveTasks.length === 0) {
    return { error: `No tasks found for wave ${waveNumber}.`, completed: 0, skipped: 0, progress: 0, issuesClosed: 0 };
  }

  let completed = 0;
  let skipped = 0;
  let issuesClosed = 0;

  for (const task of waveTasks) {
    if (task.status === "done") {
      skipped++;
      continue;
    }
    completeTask(state, task.taskId, [], 100);
    completed++;

    try {
      const ghResult = await closeTaskIssue(projectDir, task.taskId);
      if (ghResult.closed) issuesClosed++;
    } catch {
      // Silently ignore
    }
  }

  // Close parent Feature Issues for all features in the wave
  let parentsClosed = 0;
  for (const fId of featureIds) {
    try {
      const closed = await tryCloseParentIssue(state, fId, projectDir);
      if (closed) parentsClosed++;
    } catch {
      // Silently ignore
    }
  }

  saveRunState(projectDir, state);
  return { completed, skipped, progress: calculateProgress(state), issuesClosed, parentClosed: parentsClosed > 0 };
}

// ─────────────────────────────────────────────
// GitHub → Run State Writeback
// ─────────────────────────────────────────────

export interface GitHubWritebackResult {
  updated: number;
  created: boolean;
  progress: number;
  errors: string[];
}

/**
 * Sync GitHub Issue statuses back to run-state.json.
 * If run-state.json doesn't exist, creates it from plan.json.
 * Marks tasks as "done" when their corresponding GitHub Issue is closed.
 */
export async function syncRunStateFromGitHub(
  projectDir: string,
): Promise<GitHubWritebackResult> {
  const errors: string[] = [];

  // Require GitHub sync state (created by `framework plan --sync`)
  const syncState = loadSyncState(projectDir);
  if (!syncState) {
    return { updated: 0, created: false, progress: 0, errors: ["No GitHub sync state found."] };
  }

  // Check gh CLI availability
  const ghOk = await isGhAvailable();
  if (!ghOk) {
    return { updated: 0, created: false, progress: 0, errors: ["gh CLI not available."] };
  }

  // Load or create run state from plan
  let created = false;
  let state = loadRunState(projectDir);
  if (!state) {
    const plan = loadPlan(projectDir);
    if (!plan || plan.waves.length === 0) {
      return { updated: 0, created: false, progress: 0, errors: ["No plan found."] };
    }
    state = initRunStateFromPlan(plan);
    created = true;
  }

  // Fetch live statuses from GitHub
  const ghResult = await syncStatusFromGitHub(projectDir);
  if (ghResult.errors.length > 0) {
    errors.push(...ghResult.errors);
  }

  // Build issue status map: taskId → "open" | "closed"
  const issueStatusMap = new Map<string, "open" | "closed">();
  for (const issue of ghResult.issues) {
    issueStatusMap.set(issue.taskId, issue.status);
  }

  // Update run-state tasks: GitHub closed → done
  let updated = 0;
  for (const task of state.tasks) {
    const ghStatus = issueStatusMap.get(task.taskId);
    if (ghStatus === "closed" && task.status !== "done") {
      task.status = "done";
      task.completedAt = new Date().toISOString();
      updated++;
    }
  }

  // Update overall status if all tasks are done
  const allDone = state.tasks.every(
    (t) => t.status === "done" || t.status === "failed",
  );
  if (allDone && state.tasks.length > 0) {
    state.status = "completed";
    state.completedAt = new Date().toISOString();
  }

  // Save if there were changes
  if (updated > 0 || created) {
    saveRunState(projectDir, state);
  }

  return {
    updated,
    created,
    progress: calculateProgress(state),
    errors,
  };
}

function loadOrInitRunState(
  projectDir: string,
): RunState | { error: string } {
  let state = loadRunState(projectDir);
  if (state) {
    return state;
  }

  const plan = loadPlan(projectDir);
  if (!plan || plan.waves.length === 0) {
    return { error: "No plan found. Run 'framework plan' first." };
  }

  state = initRunStateFromPlan(plan);
  saveRunState(projectDir, state);
  return state;
}

// ─────────────────────────────────────────────
// Plan → Run State Initialization
// ─────────────────────────────────────────────

/**
 * Initialize run state from plan.
 * Task IDs and ordering come directly from plan.tasks (Single Source of Truth).
 *
 * Features with status "done" in plan.json are initialized as "done" in run-state,
 * ensuring that already-implemented features (e.g., from retrofit) are not re-queued.
 */
export function initRunStateFromPlan(plan: PlanState): RunState {
  if (!plan.tasks || plan.tasks.length === 0) {
    throw new Error(
      "plan.json missing tasks[]. Re-run 'framework plan' to regenerate.",
    );
  }

  const state = createRunState();

  // Use pre-computed tasks from plan.json (Single Source of Truth)
  for (const task of plan.tasks) {
    state.tasks.push({
      taskId: task.id,
      featureId: task.featureId,
      taskKind: task.kind,
      name: task.name,
      status: "backlog",
      blockedBy: task.blockedBy,
      seq: task.seq,
      files: [],
    });
  }

  return state;
}

// ─────────────────────────────────────────────
// Prompt Generation
// ─────────────────────────────────────────────

export function generateTaskPrompt(task: TaskExecution): string {
  const lines: string[] = [];

  lines.push(`# Implementation Task: ${task.taskId}`);
  lines.push("");
  lines.push(`## Feature: ${task.featureId}`);
  lines.push(`## Task: ${task.name}`);
  lines.push(`## Type: ${task.taskKind}`);
  lines.push("");
  lines.push("## Instructions");
  lines.push("");

  switch (task.taskKind) {
    case "db":
      lines.push("1. Create database schema/migration");
      lines.push("2. Define TypeScript types matching SSOT-4");
      lines.push("3. Implement data access layer");
      break;
    case "api":
      lines.push("1. Implement API endpoint per SSOT-3");
      lines.push("2. Add request validation");
      lines.push("3. Add error handling per §9");
      lines.push("4. Add auth checks per §7");
      break;
    case "ui":
      lines.push("1. Create React component per SSOT-2");
      lines.push("2. Implement state management");
      lines.push("3. Add form validation");
      lines.push("4. Handle loading/error states");
      break;
    case "integration":
      lines.push("1. Wire API to UI components");
      lines.push("2. Test end-to-end data flow");
      lines.push("3. Verify state transitions");
      break;
    case "test":
      lines.push("1. Write unit tests for business logic");
      lines.push("2. Write integration tests for API");
      lines.push("3. Cover normal, abnormal, boundary cases");
      break;
    case "review":
      lines.push("1. Run Adversarial Review (framework audit code)");
      lines.push("2. Verify SSOT compliance");
      lines.push("3. Check all MUST requirements");
      lines.push("4. Identify edge cases and failure modes");
      break;
    default:
      lines.push("1. Implement feature according to SSOT");
      break;
  }

  lines.push("");
  lines.push("## Constraints");
  lines.push("- Follow CODING_STANDARDS.md");
  lines.push("- No `any` types");
  lines.push("- No console.log in production code");
  lines.push("- Handle all error cases");
  lines.push(
    `- Timebox: ${task.maxRuntimeMin ?? 25} min runtime / ${task.maxIdleMin ?? 7} min idle`,
  );
  if (task.blockedBy.length > 0) {
    lines.push(`- Start only after: ${task.blockedBy.join(", ")}`);
  }
  lines.push("");
  lines.push("## Acceptance Criteria");
  lines.push("- All MUST requirements from SSOT implemented");
  lines.push("- Code audit score: 100/100");
  lines.push("- Tests pass with adequate coverage");

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Escalation Handling
// ─────────────────────────────────────────────

/**
 * Check if a task needs escalation (heuristic-based)
 */
export function checkForEscalation(
  task: TaskExecution,
): Escalation | null {
  // In a real system, this would analyze the SSOT and code context.
  // For now, return null (no escalation needed for automated tasks).
  // Escalation is triggered manually or by AI during actual code gen.
  return null;
}

/**
 * Create an escalation for manual triggering
 */
export function createEscalation(
  triggerId: EscalationTrigger,
  context: string,
  question: string,
  options: { description: string; impact: string }[],
  recommendation: string,
  recommendationReason: string,
): Escalation {
  return {
    triggerId,
    context,
    question,
    options: options.map((o, i) => ({
      id: i + 1,
      description: o.description,
      impact: o.impact,
    })),
    recommendation,
    recommendationReason,
  };
}

function printEscalation(io: RunIO, escalation: Escalation): void {
  io.print(`${"━".repeat(38)}`);
  io.print("  ESCALATION - Confirmation Required");
  io.print("");
  io.print(
    `  Trigger: [${escalation.triggerId}] ${ESCALATION_LABELS[escalation.triggerId]}`,
  );
  io.print(`  Context: ${escalation.context}`);
  io.print("");
  io.print(`  Question: ${escalation.question}`);
  io.print("");

  if (escalation.options.length > 0) {
    io.print("  Options:");
    for (const opt of escalation.options) {
      io.print(`    ${opt.id}) ${opt.description}`);
      io.print(`       Impact: ${opt.impact}`);
    }
    io.print("");
  }

  io.print(`  Recommendation: ${escalation.recommendation}`);
  io.print(`  Reason: ${escalation.recommendationReason}`);
  io.print(`${"━".repeat(38)}`);
}

async function handleExistingEscalation(
  state: RunState,
  task: TaskExecution,
  io: RunIO,
  projectDir: string,
): Promise<RunResult> {
  if (!task.escalation) {
    return {
      taskId: task.taskId,
      status: "failed",
      files: [],
      errors: ["No escalation found"],
    };
  }

  printEscalation(io, task.escalation);
  const answer = await io.ask("\n  Select option (or type response): ");
  resolveEscalation(state, task.taskId, answer);
  saveRunState(projectDir, state);

  io.print(`\n  Escalation resolved: "${answer}"`);
  io.print("  Resuming task execution...");
  io.print("");
  io.print("  Task is now IN_PROGRESS.");
  io.print("  Implement the task, then confirm completion.");
  io.print("");

  const completionAnswer = await io.ask(
    "  Mark as done? (done / skip / fail): ",
  );
  const normalized = completionAnswer.toLowerCase().trim();

  if (normalized === "skip" || normalized === "s") {
    task.status = "backlog";
    task.startedAt = undefined;
    state.currentTaskId = null;
    state.status = "running";
    saveRunState(projectDir, state);
    return {
      taskId: task.taskId,
      status: "completed",
      files: [],
      escalation: task.escalation,
      errors: [],
    };
  }

  if (normalized === "fail" || normalized === "f") {
    failTask(
      state,
      task.taskId,
      "manual_fail",
      "Marked as failed by operator",
    );
    saveRunState(projectDir, state);

    // Label GitHub Issue as "failed" (keep open for re-execution)
    try {
      await labelTaskIssue(projectDir, task.taskId, "failed");
    } catch {
      // Silently ignore
    }

    return {
      taskId: task.taskId,
      status: "failed",
      files: [],
      escalation: task.escalation,
      errors: [],
    };
  }

  // Default: mark as done
  const files = detectModifiedFiles(projectDir);
  const validation = validateTaskCompletion(projectDir, state, task, files);
  if (!validation.ok) {
    task.acceptanceChecks = validation.checks;
    task.stopReason = validation.reason;
    task.stopDetails = validation.detail;
    touchTaskHeartbeat(state, task.taskId);
    saveRunState(projectDir, state);
    return {
      taskId: task.taskId,
      status: "failed",
      files,
      escalation: task.escalation,
      errors: [validation.detail],
    };
  }
  task.acceptanceChecks = validation.checks;
  completeTask(state, task.taskId, files, 100);
  saveRunState(projectDir, state);

  // Close GitHub Issue (graceful)
  try {
    await closeTaskIssue(projectDir, task.taskId);
  } catch {
    // Silently ignore
  }

  // Close parent Feature Issue if all tasks for this feature are done
  try {
    await tryCloseParentIssue(state, task.featureId, projectDir);
  } catch {
    // Silently ignore
  }

  return {
    taskId: task.taskId,
    status: "completed",
    files,
    auditScore: 100,
    escalation: task.escalation,
    errors: [],
  };
}

// ─────────────────────────────────────────────
// Parent Feature Issue Auto-Close
// ─────────────────────────────────────────────

/**
 * Check if all tasks for a feature are done, and close the parent Issue if so.
 * Returns true if the parent issue was closed.
 */
async function tryCloseParentIssue(
  state: RunState,
  featureId: string,
  projectDir: string,
): Promise<boolean> {
  const featureTasks = state.tasks.filter((t) => t.featureId === featureId);
  const allDone = featureTasks.every((t) => t.status === "done");
  if (!allDone) return false;

  try {
    const result = await closeFeatureIssue(projectDir, featureId);
    return result.closed;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// File Detection
// ─────────────────────────────────────────────

/**
 * Detect actually modified files via git diff (best effort).
 * Falls back to empty list if git is not available.
 */
function detectModifiedFiles(projectDir: string): ModifiedFile[] {
  try {
    // Get both staged and unstaged changes
    const output = execSync(
      "git diff --name-status HEAD 2>/dev/null || git diff --name-status --cached 2>/dev/null || echo ''",
      { cwd: projectDir, encoding: "utf-8", timeout: 5000 },
    ).trim();

    if (!output) return [];

    const files: ModifiedFile[] = [];
    for (const line of output.split("\n")) {
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const status = parts[0].trim();
      const filePath = parts[1].trim();
      if (!filePath) continue;

      let action: "created" | "modified" | "deleted" = "modified";
      if (status === "A") action = "created";
      else if (status === "D") action = "deleted";
      else if (status === "M") action = "modified";

      files.push({ path: filePath, action });
    }
    return files;
  } catch {
    return [];
  }
}

function validateTaskCompletion(
  projectDir: string,
  state: RunState,
  task: TaskExecution,
  files: ModifiedFile[],
): {
  ok: boolean;
  reason?: TaskExecution["stopReason"];
  detail: string;
  checks: AcceptanceCheck[];
} {
  const checks: AcceptanceCheck[] = [];

  const blockersSatisfied = areTaskBlockersSatisfied(state, task);
  checks.push({
    name: "dependencies_resolved",
    passed: blockersSatisfied,
    detail: blockersSatisfied
      ? "All blockedBy tasks are completed"
      : `Pending blockers: ${task.blockedBy.join(", ")}`,
  });
  if (!blockersSatisfied) {
    return {
      ok: false,
      reason: "dependency_blocked",
      detail: `Task is blocked by: ${task.blockedBy.join(", ")}`,
      checks,
    };
  }

  const executionHealth = getTaskExecutionHealth(task);
  checks.push({
    name: "execution_window",
    passed: !executionHealth.expired,
    detail: executionHealth.detail ?? "Execution lease is healthy",
  });
  if (executionHealth.expired) {
    return {
      ok: false,
      reason: executionHealth.reason,
      detail: executionHealth.detail ?? "Execution window expired",
      checks,
    };
  }

  const requiresChanges =
    task.taskKind !== "review" && fs.existsSync(path.join(projectDir, ".git"));
  const hasMeaningfulChanges = files.some((file) => file.action !== "deleted");
  checks.push({
    name: "meaningful_changes_detected",
    passed: !requiresChanges || hasMeaningfulChanges,
    detail: !requiresChanges
      ? "Review tasks may complete without code changes"
      : hasMeaningfulChanges
        ? `${files.length} changed file(s) detected`
        : "No modified files detected for implementation task",
  });
  if (requiresChanges && !hasMeaningfulChanges) {
    return {
      ok: false,
      reason: "no_changes_detected",
      detail: "No modified files detected. Refusing to mark implementation task as done.",
      checks,
    };
  }

  return {
    ok: true,
    detail: "Task satisfies basic automation checks",
    checks,
  };
}
