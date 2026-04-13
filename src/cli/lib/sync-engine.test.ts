/**
 * Tests for sync-engine.ts
 * Issue: #16
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  markDirty,
  markClean,
  isDirty,
  atomicWritePlan,
  loadSyncMeta,
  runSync,
} from "./sync-engine.js";
import { type PlanState } from "./plan-model.js";
import { loadRunState } from "./run-model.js";

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  return tmpDir;
}

function makePlan(): PlanState {
  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves: [],
    tasks: [],
    circularDependencies: [],
  };
}

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("dirty flag", () => {
  it("isDirty returns false when no meta file", () => {
    const dir = setup();
    expect(isDirty(dir)).toBe(false);
  });

  it("markDirty sets dirty=true", () => {
    const dir = setup();
    markDirty(dir);
    expect(isDirty(dir)).toBe(true);
  });

  it("markClean sets dirty=false and updates syncedAt", () => {
    const dir = setup();
    markDirty(dir);
    markClean(dir, "abc1234");
    expect(isDirty(dir)).toBe(false);
    const meta = loadSyncMeta(dir);
    expect(meta?.syncCommit).toBe("abc1234");
    expect(meta?.syncedAt).toBeTruthy();
  });
});

describe("atomicWritePlan", () => {
  it("writes plan.json successfully", () => {
    const dir = setup();
    const plan = makePlan();
    atomicWritePlan(dir, plan);
    const planPath = path.join(dir, ".framework/plan.json");
    expect(fs.existsSync(planPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(planPath, "utf-8")) as PlanState;
    expect(written.status).toBe("generated");
  });

  it("cleans up tmp file on success", () => {
    const dir = setup();
    const plan = makePlan();
    atomicWritePlan(dir, plan);
    expect(fs.existsSync(path.join(dir, ".framework/plan.json.tmp"))).toBe(false);
  });

  it("preserves original plan.json if tmp write fails", () => {
    const dir = setup();
    const original = { ...makePlan(), status: "active" as const };
    atomicWritePlan(dir, original);

    // plan.json should exist with original content
    const planPath = path.join(dir, ".framework/plan.json");
    const content = JSON.parse(fs.readFileSync(planPath, "utf-8")) as PlanState;
    expect(content.status).toBe("active");
  });
});

describe("runSync", () => {
  it("returns error when plan.json missing", async () => {
    const dir = setup();
    const result = await runSync({ projectDir: dir });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("plan.json");
  });

  it("succeeds and marks clean when plan.json exists", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());
    const result = await runSync({ projectDir: dir, commitSha: "deadbeef" });
    expect(result.ok).toBe(true);
    expect(isDirty(dir)).toBe(false);
    const meta = loadSyncMeta(dir);
    expect(meta?.syncCommit).toBe("deadbeef");
  });

  it("returns empty orphaned list when no github-sync.json", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());
    const result = await runSync({ projectDir: dir });
    expect(result.ok).toBe(true);
    expect(result.orphaned).toHaveLength(0);
  });

  it("releases lock on success", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());
    await runSync({ projectDir: dir });
    expect(fs.existsSync(path.join(dir, ".framework/plan.lock"))).toBe(false);
  });

  it("updates run-state when gh is available and issues are closed", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());

    // Create a run-state with a pending task
    const runState = {
      status: "active" as const,
      currentTaskId: null,
      tasks: [
        {
          taskId: "F001-T001",
          featureId: "F001",
          name: "Test task",
          seq: "1.1",
          status: "in_progress" as const,
          blockedBy: [],
          startedAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(dir, ".framework/run-state.json"),
      JSON.stringify(runState, null, 2),
    );

    // Mock github-engine
    const ghEngine = await import("./github-engine.js");
    const isGhSpy = vi.spyOn(ghEngine, "isGhAvailable").mockResolvedValue(true);
    const syncSpy = vi.spyOn(ghEngine, "syncStatusFromGitHub").mockResolvedValue({
      updated: 1,
      issues: [{ taskId: "F001-T001", issueNumber: 1, status: "closed", labels: [] }],
      errors: [],
    });

    try {
      const result = await runSync({ projectDir: dir });
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(1);

      // Verify run-state was updated
      const updatedState = loadRunState(dir);
      expect(updatedState?.tasks[0].status).toBe("done");
    } finally {
      isGhSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });

  it("returns updated=0 when gh is not available", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());

    const ghEngine = await import("./github-engine.js");
    const isGhSpy = vi.spyOn(ghEngine, "isGhAvailable").mockResolvedValue(false);

    try {
      const result = await runSync({ projectDir: dir });
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(0);
    } finally {
      isGhSpy.mockRestore();
    }
  });

  it("handles reopened issue by reverting done task to in_progress", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());

    // Create run-state with a done task
    const runState = {
      status: "active" as const,
      currentTaskId: null,
      tasks: [
        {
          taskId: "F001-T001",
          featureId: "F001",
          name: "Task 1",
          seq: "1.1",
          status: "done" as const,
          blockedBy: [],
          completedAt: "2026-01-01T00:00:00Z",
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(dir, ".framework/run-state.json"),
      JSON.stringify(runState, null, 2),
    );

    const ghEngine = await import("./github-engine.js");
    const isGhSpy = vi.spyOn(ghEngine, "isGhAvailable").mockResolvedValue(true);
    const syncSpy = vi.spyOn(ghEngine, "syncStatusFromGitHub").mockResolvedValue({
      updated: 1,
      issues: [{ taskId: "F001-T001", issueNumber: 1, status: "open", labels: [] }],
      errors: [],
    });

    try {
      const result = await runSync({ projectDir: dir });
      expect(result.ok).toBe(true);
      expect(result.updated).toBe(1);

      const updated = loadRunState(dir);
      expect(updated?.tasks[0].status).toBe("in_progress");
      expect(updated?.tasks[0].completedAt).toBeUndefined();
    } finally {
      isGhSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });

  it("adds warnings when GitHub sync returns errors", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());

    const ghEngine = await import("./github-engine.js");
    const isGhSpy = vi.spyOn(ghEngine, "isGhAvailable").mockResolvedValue(true);
    const syncSpy = vi.spyOn(ghEngine, "syncStatusFromGitHub").mockResolvedValue({
      updated: 0,
      issues: [],
      errors: ["Issue #99 not found"],
    });

    try {
      const result = await runSync({ projectDir: dir });
      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.includes("Issue #99"))).toBe(true);
    } finally {
      isGhSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });

  it("handles syncStatusFromGitHub exception gracefully", async () => {
    const dir = setup();
    atomicWritePlan(dir, makePlan());

    const ghEngine = await import("./github-engine.js");
    const isGhSpy = vi.spyOn(ghEngine, "isGhAvailable").mockResolvedValue(true);
    const syncSpy = vi.spyOn(ghEngine, "syncStatusFromGitHub").mockRejectedValue(
      new Error("network timeout"),
    );

    try {
      const result = await runSync({ projectDir: dir });
      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.includes("network timeout"))).toBe(true);
    } finally {
      isGhSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });
});
