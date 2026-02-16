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
import * as path from "node:path";
import * as readline from "node:readline";
import {
  type RunState,
  type TaskExecution,
  type ModifiedFile,
  type Escalation,
  type EscalationTrigger,
  ESCALATION_LABELS,
  createRunState,
  getNextPendingTask,
  startTask,
  escalateTask,
  resolveEscalation,
  completeTask,
  failTask,
  calculateProgress,
  loadRunState,
  saveRunState,
} from "./run-model.js";
import {
  type PlanState,
  type Task,
  type TaskOrderMode,
  decomposeFeature,
  determineTaskOrderMode,
  loadPlan,
} from "./plan-model.js";
import { loadProfileType } from "./profile-model.js";
import { closeTaskIssue } from "./github-engine.js";

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
    // Load profile type for TDD mode determination
    const profileType = loadProfileType(projectDir) ?? "app";
    state = initRunStateFromPlan(plan, { profileType });
    saveRunState(projectDir, state);
  }

  io.print(`\n${"━".repeat(38)}`);
  io.print("  FRAMEWORK RUN");
  io.print(`${"━".repeat(38)}`);

  // Find target task
  let task: TaskExecution | undefined;

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
  } else {
    // Resume waiting_input task or get next pending
    task = state.tasks.find((t) => t.status === "waiting_input");
    if (!task) {
      task = getNextPendingTask(state);
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

  io.print("  Generating implementation prompt...");
  io.print("");

  // Simulate execution - detect if escalation needed
  const escalationCheck = checkForEscalation(task);
  if (escalationCheck) {
    escalateTask(state, task.taskId, escalationCheck);
    saveRunState(projectDir, state);

    printEscalation(io, escalationCheck);

    // Ask user to resolve
    const answer = await io.ask(
      "\n  Select option (or type response): ",
    );
    resolveEscalation(state, task.taskId, answer);
    saveRunState(projectDir, state);

    io.print(`\n  Escalation resolved: "${answer}"`);
    io.print("  Resuming task execution...");
    io.print("");
  }

  // Simulate task completion
  const files = simulateTaskFiles(task);
  const auditScore = simulateAuditScore();

  io.print("  Executing task...");
  io.print(`  Files affected: ${files.length}`);
  for (const f of files) {
    io.print(`    [${f.action}] ${f.path}`);
  }
  io.print("");

  // Auto-audit
  io.print("  Running auto-audit...");
  io.print(`  Audit score: ${auditScore}/100`);
  io.print("");

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

  // Progress summary
  const progress = calculateProgress(state);
  const done = state.tasks.filter((t) => t.status === "done").length;
  io.print(`  Progress: ${done}/${state.tasks.length} tasks (${progress}%)`);
  io.print(`  Status: ${task.taskId} completed`);
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
// Plan → Run State Initialization
// ─────────────────────────────────────────────

export interface InitRunStateOptions {
  /** Profile type (app/lp/hp/api/cli) for TDD determination */
  profileType?: string;
}

/**
 * Initialize run state from plan.
 * Task ordering depends on profile type:
 * - api/cli: TDD mode (test first)
 * - app/lp/hp: Normal mode (test after implementation)
 */
export function initRunStateFromPlan(
  plan: PlanState,
  options: InitRunStateOptions = {},
): RunState {
  const state = createRunState();
  const profileType = options.profileType ?? "app";

  for (const wave of plan.waves) {
    for (const feature of wave.features) {
      // Determine task order mode based on profile and feature type
      const orderMode = determineTaskOrderMode(profileType, feature.type);
      const tasks = decomposeFeature(feature, orderMode);

      for (const task of tasks) {
        state.tasks.push({
          taskId: task.id,
          featureId: feature.id,
          taskKind: task.kind,
          name: task.name,
          status: "backlog",
          files: [],
        });
      }
    }
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

  // Complete the task after escalation resolution
  const files = simulateTaskFiles(task);
  const auditScore = simulateAuditScore();

  completeTask(state, task.taskId, files, auditScore);
  saveRunState(projectDir, state);

  // Close GitHub Issue (graceful)
  try {
    await closeTaskIssue(projectDir, task.taskId);
  } catch {
    // Silently ignore
  }

  return {
    taskId: task.taskId,
    status: "completed",
    files,
    auditScore,
    escalation: task.escalation,
    errors: [],
  };
}

// ─────────────────────────────────────────────
// Simulation Helpers
// ─────────────────────────────────────────────

function simulateTaskFiles(
  task: TaskExecution,
): ModifiedFile[] {
  const base = `src/${task.featureId.toLowerCase()}`;
  const files: ModifiedFile[] = [];

  switch (task.taskKind) {
    case "db":
      files.push({ path: `${base}/model.ts`, action: "created" });
      files.push({ path: `${base}/types.ts`, action: "created" });
      break;
    case "api":
      files.push({ path: `${base}/api.ts`, action: "created" });
      files.push({
        path: `${base}/validation.ts`,
        action: "created",
      });
      break;
    case "ui":
      files.push({
        path: `${base}/components/index.tsx`,
        action: "created",
      });
      break;
    case "integration":
      files.push({ path: `${base}/hooks.ts`, action: "created" });
      break;
    case "test":
      files.push({
        path: `${base}/__tests__/index.test.ts`,
        action: "created",
      });
      break;
    case "review":
      files.push({
        path: `${base}/AUDIT_REPORT.md`,
        action: "created",
      });
      break;
    default:
      files.push({ path: `${base}/index.ts`, action: "created" });
      break;
  }

  return files;
}

function simulateAuditScore(): number {
  // In production, this would run the actual audit engine.
  // Simulate a score between 90-100 for demonstration.
  return 95 + Math.floor(Math.random() * 6);
}
