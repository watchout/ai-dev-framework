import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import {
  createWorktree,
  removeWorktree,
  listWorktrees,
  cleanupWorktrees,
  acquireLock,
  releaseLock,
  capMaxWorkers,
  formatParallelStatus,
  validateBranchName,
  type WorktreeSession,
} from "./worktree-manager.js";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

function createTestRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-wt-test-"));
  // Force initial branch name to "main" regardless of the host git config.
  // Older git versions don't support -b on init, so we fall back to renaming.
  try {
    execSync("git init -b main", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    execSync("git init", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  }
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  fs.writeFileSync(path.join(dir, "README.md"), "# Test", "utf-8");
  execSync("git add . && git commit -m 'init'", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  // After the first commit, if HEAD is not on "main", rename it so tests
  // that reference "main" as the base branch succeed on CI hosts where
  // git defaults to "master".
  const current = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8" }).trim();
  if (current && current !== "main") {
    execSync(`git branch -m ${current} main`, { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  }
  return dir;
}

// ─────────────────────────────────────────────
// Worktree CRUD tests
// ─────────────────────────────────────────────

describe("worktree-manager", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTestRepo();
  });

  afterEach(() => {
    try {
      // Cleanup worktrees first
      cleanupWorktrees(repoDir);
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createWorktree", () => {
    it("creates worktree with new branch", () => {
      const wtPath = createWorktree("test-task", "main", repoDir);

      expect(fs.existsSync(wtPath)).toBe(true);
      expect(fs.existsSync(path.join(wtPath, "README.md"))).toBe(true);

      // Verify branch was created
      const branch = execSync("git branch --show-current", {
        cwd: wtPath,
        encoding: "utf-8",
      }).trim();
      expect(branch).toBe("feature/test-task");
    });

    it("throws on duplicate worktree", () => {
      createWorktree("dupe-task", "main", repoDir);
      expect(() => createWorktree("dupe-task", "main", repoDir)).toThrow("already exists");
    });

    it("sanitizes task ID for branch name", () => {
      const wtPath = createWorktree("AUTH-001/DB", "main", repoDir);
      expect(fs.existsSync(wtPath)).toBe(true);
    });
  });

  describe("removeWorktree", () => {
    it("removes worktree and branch", () => {
      const wtPath = createWorktree("remove-test", "main", repoDir);
      expect(fs.existsSync(wtPath)).toBe(true);

      removeWorktree(wtPath, repoDir);
      expect(fs.existsSync(wtPath)).toBe(false);
    });

    it("handles non-existent worktree gracefully", () => {
      expect(() => removeWorktree("/tmp/nonexistent", repoDir)).not.toThrow();
    });
  });

  describe("listWorktrees", () => {
    it("lists created worktrees", () => {
      createWorktree("list-test", "main", repoDir);

      const worktrees = listWorktrees(repoDir);
      // At least 2: main + the new worktree
      expect(worktrees.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cleanupWorktrees", () => {
    it("removes all worktrees in .worktrees/", () => {
      createWorktree("cleanup-a", "main", repoDir);
      createWorktree("cleanup-b", "main", repoDir);

      const cleaned = cleanupWorktrees(repoDir);
      expect(cleaned).toBe(2);
    });

    it("handles empty .worktrees/", () => {
      expect(() => cleanupWorktrees(repoDir)).not.toThrow();
    });
  });
});

// ─────────────────────────────────────────────
// Lock tests
// ─────────────────────────────────────────────

describe("lock management", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-lock-test-"));
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it("acquires and releases lock", () => {
    expect(acquireLock(repoDir)).toBe(true);
    expect(acquireLock(repoDir)).toBe(false); // Already held
    releaseLock(repoDir);
    expect(acquireLock(repoDir)).toBe(true); // Released, can acquire again
    releaseLock(repoDir);
  });
});

// ─────────────────────────────────────────────
// Safety tests
// ─────────────────────────────────────────────

describe("validateBranchName", () => {
  it("accepts valid branch names", () => {
    expect(validateBranchName("main")).toBe("main");
    expect(validateBranchName("feature/auth")).toBe("feature/auth");
    expect(validateBranchName("release-1.0")).toBe("release-1.0");
    expect(validateBranchName("fix/bug_123")).toBe("fix/bug_123");
  });

  it("rejects shell injection attempts", () => {
    expect(() => validateBranchName("main; rm -rf /")).toThrow("Invalid branch name");
    expect(() => validateBranchName("main && echo pwned")).toThrow("Invalid branch name");
    expect(() => validateBranchName("$(whoami)")).toThrow("Invalid branch name");
    expect(() => validateBranchName("main`id`")).toThrow("Invalid branch name");
  });

  it("rejects empty branch name", () => {
    expect(() => validateBranchName("")).toThrow("cannot be empty");
  });
});

describe("capMaxWorkers", () => {
  it("caps at 5", () => {
    expect(capMaxWorkers(10)).toBe(5);
    expect(capMaxWorkers(6)).toBe(5);
  });

  it("allows 1-5", () => {
    expect(capMaxWorkers(1)).toBe(1);
    expect(capMaxWorkers(3)).toBe(3);
    expect(capMaxWorkers(5)).toBe(5);
  });

  it("floors at 1", () => {
    expect(capMaxWorkers(0)).toBe(1);
    expect(capMaxWorkers(-1)).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Display tests
// ─────────────────────────────────────────────

describe("formatParallelStatus", () => {
  it("formats session status table", () => {
    const sessions: WorktreeSession[] = [
      {
        taskId: "auth-setup",
        branch: "feature/auth-setup",
        worktreePath: "/tmp/wt/auth-setup",
        status: "done",
        startedAt: new Date(Date.now() - 60000).toISOString(),
        completedAt: new Date().toISOString(),
        gateResult: "PASS",
      },
      {
        taskId: "db-schema",
        branch: "feature/db-schema",
        worktreePath: "/tmp/wt/db-schema",
        status: "running",
        startedAt: new Date(Date.now() - 30000).toISOString(),
      },
    ];

    const output = formatParallelStatus(sessions, 60000);
    expect(output).toContain("Parallel Run");
    expect(output).toContain("auth-setup");
    expect(output).toContain("db-schema");
    expect(output).toContain("done");
    expect(output).toContain("running");
  });
});
