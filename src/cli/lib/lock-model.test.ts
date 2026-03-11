/**
 * Tests for lock-model.ts
 * Issue: #17
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  acquireLock,
  releaseLock,
  getLockStatus,
  type LockData,
} from "./lock-model.js";

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-test-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("acquireLock", () => {
  it("acquires lock when none exists", () => {
    const dir = setup();
    const result = acquireLock(dir, "sync");
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, ".framework/plan.lock"))).toBe(true);
  });

  it("lock file contains correct fields", () => {
    const dir = setup();
    acquireLock(dir, "sync");
    const data = getLockStatus(dir);
    expect(data).not.toBeNull();
    expect(data!.pid).toBe(process.pid);
    expect(data!.command).toBe("sync");
    expect(data!.staleAfterMs).toBe(300_000);
    expect(data!.createdAt).toBeTruthy();
  });

  it("blocks when active lock held by current process", () => {
    const dir = setup();
    acquireLock(dir, "sync");
    // Try to acquire again — current process holds the lock, pid is alive
    const result = acquireLock(dir, "plan");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("active");
    }
  });

  it("clears stale lock (dead pid) and returns stale_cleared", () => {
    const dir = setup();
    // Write a lock with a dead pid
    const deadPid = 999999999;
    const lockData: LockData = {
      pid: deadPid,
      command: "sync",
      createdAt: new Date().toISOString(),
      staleAfterMs: 300_000,
    };
    fs.writeFileSync(
      path.join(dir, ".framework/plan.lock"),
      JSON.stringify(lockData),
      "utf-8",
    );

    const result = acquireLock(dir, "plan");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale_cleared");
    }
    // New lock should now be held by current process
    const status = getLockStatus(dir);
    expect(status?.pid).toBe(process.pid);
  });

  it("clears timed-out lock and returns timeout_cleared", () => {
    const dir = setup();
    const oldDate = new Date(Date.now() - 600_000).toISOString(); // 10 min ago
    const lockData: LockData = {
      pid: process.pid,
      command: "sync",
      createdAt: oldDate,
      staleAfterMs: 300_000, // 5 min
    };
    fs.writeFileSync(
      path.join(dir, ".framework/plan.lock"),
      JSON.stringify(lockData),
      "utf-8",
    );

    const result = acquireLock(dir, "plan");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("timeout_cleared");
    }
  });
});

describe("releaseLock", () => {
  it("removes lock file", () => {
    const dir = setup();
    acquireLock(dir, "sync");
    releaseLock(dir);
    expect(fs.existsSync(path.join(dir, ".framework/plan.lock"))).toBe(false);
  });

  it("is a no-op when no lock exists", () => {
    const dir = setup();
    expect(() => releaseLock(dir)).not.toThrow();
  });
});

describe("getLockStatus", () => {
  it("returns null when no lock", () => {
    const dir = setup();
    expect(getLockStatus(dir)).toBeNull();
  });

  it("returns lock data when lock exists", () => {
    const dir = setup();
    acquireLock(dir, "resequence");
    const status = getLockStatus(dir);
    expect(status?.command).toBe("resequence");
  });
});
