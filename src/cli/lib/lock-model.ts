/**
 * .framework/*.lock — Robust lock file management
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §7
 * Issue: #17
 *
 * Lock file format: { pid, command, createdAt, staleAfterMs }
 * Startup logic:
 *   1. No lock → acquire and proceed
 *   2. Lock exists, pid alive → block
 *   3. Lock exists, pid dead → stale, auto-delete + warn
 *   4. Lock exists, age > staleAfterMs → timeout, auto-delete + warn
 *
 * Supports multiple named locks (default: "plan").
 */
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_STALE_MS = 300_000; // 5 minutes

export interface LockData {
  pid: number;
  command: string;
  createdAt: string;
  staleAfterMs: number;
}

export type AcquireResult =
  | { ok: true }
  | { ok: false; reason: "active"; data: LockData }
  | { ok: false; reason: "stale_cleared"; data: LockData }
  | { ok: false; reason: "timeout_cleared"; data: LockData };

function lockPath(projectDir: string, lockName = "plan"): string {
  return path.join(projectDir, `.framework/${lockName}.lock`);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to acquire the lock.
 * Returns { ok: true } on success.
 * Returns { ok: false, reason, data } if blocked or if a stale lock was cleared.
 *
 * Callers should treat "stale_cleared" and "timeout_cleared" as warnings
 * (lock was removed) and may re-try acquisition.
 */
export function acquireLock(
  projectDir: string,
  command: string,
  staleAfterMs = DEFAULT_STALE_MS,
  lockName = "plan",
): AcquireResult {
  const lp = lockPath(projectDir, lockName);

  if (fs.existsSync(lp)) {
    const raw = fs.readFileSync(lp, "utf-8");
    let data: LockData;
    try {
      data = JSON.parse(raw) as LockData;
    } catch {
      // Corrupt lock file → remove and continue
      fs.rmSync(lp, { force: true });
      writeLock(projectDir, command, staleAfterMs, lockName);
      return { ok: true };
    }

    const age = Date.now() - new Date(data.createdAt).getTime();

    // Timeout check
    if (age > (data.staleAfterMs ?? DEFAULT_STALE_MS)) {
      fs.rmSync(lp, { force: true });
      writeLock(projectDir, command, staleAfterMs, lockName);
      return { ok: false, reason: "timeout_cleared", data };
    }

    // PID check
    if (!isPidAlive(data.pid)) {
      fs.rmSync(lp, { force: true });
      writeLock(projectDir, command, staleAfterMs, lockName);
      return { ok: false, reason: "stale_cleared", data };
    }

    // Active lock held by another process
    return { ok: false, reason: "active", data };
  }

  writeLock(projectDir, command, staleAfterMs, lockName);
  return { ok: true };
}

/**
 * Release the lock (only if owned by the current process).
 */
export function releaseLock(projectDir: string, lockName = "plan"): void {
  const lp = lockPath(projectDir, lockName);
  if (!fs.existsSync(lp)) return;

  try {
    const data = JSON.parse(fs.readFileSync(lp, "utf-8")) as LockData;
    if (data.pid === process.pid) {
      fs.rmSync(lp, { force: true });
    }
  } catch {
    fs.rmSync(lp, { force: true });
  }
}

/**
 * Check lock status without acquiring.
 */
export function getLockStatus(
  projectDir: string,
  lockName = "plan",
): LockData | null {
  const lp = lockPath(projectDir, lockName);
  if (!fs.existsSync(lp)) return null;
  try {
    return JSON.parse(fs.readFileSync(lp, "utf-8")) as LockData;
  } catch {
    return null;
  }
}

function writeLock(
  projectDir: string,
  command: string,
  staleAfterMs: number,
  lockName = "plan",
): void {
  const lp = lockPath(projectDir, lockName);
  const dir = path.dirname(lp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const data: LockData = {
    pid: process.pid,
    command,
    createdAt: new Date().toISOString(),
    staleAfterMs,
  };
  fs.writeFileSync(lp, JSON.stringify(data, null, 2), "utf-8");
}
