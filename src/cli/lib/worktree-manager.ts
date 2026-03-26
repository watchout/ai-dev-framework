/**
 * Git worktree manager for parallel task execution.
 *
 * Creates isolated worktrees per task, runs Claude Code sessions
 * in parallel, and manages lifecycle (create → run → cleanup).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type WorktreeStatus =
  | "creating"
  | "installing"
  | "running"
  | "gate"
  | "done"
  | "failed";

export interface WorktreeSession {
  taskId: string;
  branch: string;
  worktreePath: string;
  status: WorktreeStatus;
  pid?: number;
  startedAt: string;
  completedAt?: string;
  gateResult?: "PASS" | "BLOCK" | "ESCALATE";
  error?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export interface ParallelRunOptions {
  tasks: string[];
  maxWorkers: number;
  autoFix: boolean;
  skipInstall: boolean;
  baseBranch: string;
}

export interface ParallelRunResult {
  sessions: WorktreeSession[];
  succeeded: number;
  failed: number;
  elapsed: number;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const WORKTREES_DIR = ".worktrees";

/**
 * Validate and sanitize a branch name to prevent shell injection.
 */
export function validateBranchName(branch: string): string {
  if (branch.length === 0) {
    throw new Error("Branch name cannot be empty.");
  }
  const sanitized = branch.replace(/[^a-zA-Z0-9/\-_.]/g, "");
  if (sanitized !== branch) {
    throw new Error(
      `Invalid branch name: "${branch}". Only alphanumeric, /, -, _, . are allowed.`,
    );
  }
  return sanitized;
}
const LOCK_FILE = ".worktrees/.lock";
const MAX_WORKTREES = 5;

// ─────────────────────────────────────────────
// Worktree CRUD
// ─────────────────────────────────────────────

/**
 * Create a git worktree for a task.
 * @returns absolute path to the worktree directory
 */
export function createWorktree(
  taskId: string,
  baseBranch: string,
  rootDir: string,
): string {
  // Validate baseBranch to prevent shell injection
  baseBranch = validateBranchName(baseBranch);

  const worktreesDir = path.join(rootDir, WORKTREES_DIR);
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  const sanitizedId = taskId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const worktreePath = path.join(worktreesDir, sanitizedId);
  const branchName = `feature/${sanitizedId}`;

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Worktree already exists: ${worktreePath}`);
  }

  // Check if branch already exists
  try {
    execSync(`git rev-parse --verify ${branchName}`, {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    throw new Error(`Branch already exists: ${branchName}. Remove it first or use a different task ID.`);
  } catch (error) {
    // Branch doesn't exist — good
    if (error instanceof Error && error.message.includes("Branch already exists")) {
      throw error;
    }
  }

  // Create worktree with new branch
  execSync(`git worktree add "${worktreePath}" -b "${branchName}" "${baseBranch}"`, {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  return worktreePath;
}

/**
 * Remove a git worktree and its branch.
 */
export function removeWorktree(
  worktreePath: string,
  rootDir: string,
): void {
  if (!fs.existsSync(worktreePath)) return;

  // Get branch name before removing
  let branchName: string | undefined;
  try {
    branchName = execSync("git branch --show-current", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Ignore
  }

  // Remove worktree
  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Fallback: manual cleanup
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      execSync("git worktree prune", {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  // Delete branch
  if (branchName && branchName !== "main" && branchName !== "master") {
    try {
      execSync(`git branch -D "${branchName}"`, {
        cwd: rootDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore if branch already deleted
    }
  }
}

/**
 * List all worktrees in the project.
 */
export function listWorktrees(rootDir: string): WorktreeInfo[] {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: rootDir,
      encoding: "utf-8",
    });

    const worktrees: WorktreeInfo[] = [];
    const blocks = output.split("\n\n").filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.split("\n");
      const wtPath = lines.find((l) => l.startsWith("worktree "))?.replace("worktree ", "") ?? "";
      const head = lines.find((l) => l.startsWith("HEAD "))?.replace("HEAD ", "") ?? "";
      const branch = lines.find((l) => l.startsWith("branch "))?.replace("branch refs/heads/", "") ?? "";

      if (wtPath) {
        worktrees.push({ path: wtPath, branch, head });
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Remove all worktrees in .worktrees/ directory.
 */
export function cleanupWorktrees(rootDir: string): number {
  const worktreesDir = path.join(rootDir, WORKTREES_DIR);
  if (!fs.existsSync(worktreesDir)) return 0;

  let cleaned = 0;
  try {
    const entries = fs.readdirSync(worktreesDir);
    for (const entry of entries) {
      if (entry === ".lock" || entry === ".gitkeep") continue;
      const wtPath = path.join(worktreesDir, entry);
      if (fs.statSync(wtPath).isDirectory()) {
        removeWorktree(wtPath, rootDir);
        cleaned++;
      }
    }
  } catch {
    // Ignore errors during cleanup
  }

  // Release lock if held
  releaseLock(rootDir);
  return cleaned;
}

// ─────────────────────────────────────────────
// Lock management
// ─────────────────────────────────────────────

export function acquireLock(rootDir: string): boolean {
  const lockPath = path.join(rootDir, LOCK_FILE);
  const lockDir = path.dirname(lockPath);
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  if (fs.existsSync(lockPath)) {
    // Check if lock is stale (older than 2 hours)
    const stat = fs.statSync(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1000) {
      return false; // Lock is active
    }
    // Stale lock — remove it
  }

  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }), "utf-8");
  return true;
}

export function releaseLock(rootDir: string): void {
  const lockPath = path.join(rootDir, LOCK_FILE);
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // Ignore
  }
}

// ─────────────────────────────────────────────
// Parallel execution
// ─────────────────────────────────────────────

export interface ParallelCallbacks {
  onSessionUpdate: (session: WorktreeSession) => void;
  onComplete: (result: ParallelRunResult) => void;
}

/**
 * Run multiple tasks in parallel using git worktrees.
 */
export async function runParallel(
  options: ParallelRunOptions,
  rootDir: string,
  callbacks: ParallelCallbacks,
): Promise<ParallelRunResult> {
  const startTime = Date.now();
  const maxWorkers = Math.min(options.maxWorkers, MAX_WORKTREES);

  // Validate
  if (options.tasks.length === 0) {
    throw new Error("No tasks specified for parallel execution.");
  }

  if (options.tasks.length > MAX_WORKTREES) {
    throw new Error(
      `Too many tasks (${options.tasks.length}). Maximum ${MAX_WORKTREES} parallel worktrees.`,
    );
  }

  // Acquire lock
  if (!acquireLock(rootDir)) {
    throw new Error(
      "Another parallel run is in progress. Use 'framework run --cleanup' to reset.",
    );
  }

  const sessions: WorktreeSession[] = options.tasks.map((taskId) => ({
    taskId,
    branch: `feature/${taskId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`,
    worktreePath: path.join(rootDir, WORKTREES_DIR, taskId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()),
    status: "creating" as WorktreeStatus,
    startedAt: new Date().toISOString(),
  }));

  try {
    // Create worktrees
    for (const session of sessions) {
      try {
        session.worktreePath = createWorktree(
          session.taskId,
          options.baseBranch,
          rootDir,
        );
        session.status = "installing";
        callbacks.onSessionUpdate(session);
      } catch (error) {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : String(error);
        session.completedAt = new Date().toISOString();
        callbacks.onSessionUpdate(session);
      }
    }

    // Install dependencies (unless skipped)
    if (!options.skipInstall) {
      const installPromises = sessions
        .filter((s) => s.status === "installing")
        .map(async (session) => {
          try {
            execSync("npm install --ignore-scripts 2>/dev/null || true", {
              cwd: session.worktreePath,
              encoding: "utf-8",
              timeout: 120000,
              stdio: ["pipe", "pipe", "pipe"],
            });
            session.status = "running";
          } catch {
            // Install failure is non-fatal for many projects
            session.status = "running";
          }
          callbacks.onSessionUpdate(session);
        });
      await Promise.all(installPromises);
    } else {
      for (const session of sessions) {
        if (session.status === "installing") {
          session.status = "running";
          callbacks.onSessionUpdate(session);
        }
      }
    }

    // Run tasks in parallel with concurrency limit
    const runnableSessions = sessions.filter((s) => s.status === "running");
    await runWithConcurrency(runnableSessions, maxWorkers, async (session) => {
      try {
        await runTaskInWorktree(session, options.autoFix);
        session.status = "done";
        session.gateResult = "PASS";
      } catch (error) {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : String(error);
      }
      session.completedAt = new Date().toISOString();
      callbacks.onSessionUpdate(session);
    });
  } finally {
    releaseLock(rootDir);
  }

  const succeeded = sessions.filter((s) => s.status === "done").length;
  const failed = sessions.filter((s) => s.status === "failed").length;
  const elapsed = Date.now() - startTime;

  const result: ParallelRunResult = { sessions, succeeded, failed, elapsed };
  callbacks.onComplete(result);
  return result;
}

// ─────────────────────────────────────────────
// Concurrency limiter
// ─────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = fn(item).then(() => {
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

// ─────────────────────────────────────────────
// Task execution in worktree
// ─────────────────────────────────────────────

async function runTaskInWorktree(
  session: WorktreeSession,
  autoFix: boolean,
): Promise<void> {
  const prompt = `Implement task: ${session.taskId}. Follow the implementation plan in .framework/plan.json. Run tests after implementation.`;

  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(
      "claude",
      ["-p", prompt],
      {
        cwd: session.worktreePath,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      },
    );

    session.pid = child.pid;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 25 * 60 * 1000); // 25 min timeout

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Task ${session.taskId} timed out after 25 minutes`));
      } else if (code !== 0) {
        reject(new Error(`Task ${session.taskId} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Task ${session.taskId}: ${err.message}`));
    });
  });
}

// ─────────────────────────────────────────────
// Display formatting
// ─────────────────────────────────────────────

export function formatParallelStatus(
  sessions: WorktreeSession[],
  elapsed: number,
): string {
  const lines: string[] = [];
  const activeCount = sessions.filter(
    (s) => s.status === "running" || s.status === "gate" || s.status === "installing",
  ).length;
  const maxWorkers = sessions.length;

  lines.push("");
  lines.push("  ══════════════════════════════════════════════════════");
  lines.push(`  Parallel Run: ${sessions.length} tasks`);
  lines.push("  ══════════════════════════════════════════════════════");
  lines.push("");
  lines.push("    Task                  │ Status       │ Time");
  lines.push("   ───────────────────────┼──────────────┼──────────────");

  for (const session of sessions) {
    const name = session.taskId.padEnd(23).slice(0, 23);
    const statusIcon = getStatusIcon(session.status);
    const statusLabel = session.status.padEnd(12);
    const timeStr = session.completedAt
      ? formatDuration(new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime())
      : session.status === "creating" ? "—" : formatDuration(Date.now() - new Date(session.startedAt).getTime());

    lines.push(`    ${name} │ ${statusIcon} ${statusLabel} │ ${timeStr}`);
  }

  lines.push("");
  lines.push(`  Workers: ${activeCount}/${maxWorkers} active  │ Elapsed: ${formatDuration(elapsed)}`);
  lines.push("");

  return lines.join("\n");
}

function getStatusIcon(status: WorktreeStatus): string {
  switch (status) {
    case "done": return "+";
    case "failed": return "x";
    case "running": return "~";
    case "gate": return "~";
    case "creating": return ".";
    case "installing": return ".";
    default: return "?";
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const remainS = s % 60;
  return m > 0 ? `${m}m ${remainS}s` : `${remainS}s`;
}

/**
 * Cap max workers to hard limit.
 */
export function capMaxWorkers(value: number): number {
  return Math.min(Math.max(1, value), MAX_WORKTREES);
}
