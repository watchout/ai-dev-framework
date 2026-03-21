import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type RunState,
  type TaskExecution,
  createRunState,
  getNextPendingTask,
  getTaskExecutionHealth,
  startTask,
  escalateTask,
  resolveEscalation,
  completeTask,
  failTask,
  areTaskBlockersSatisfied,
  touchTaskHeartbeat,
  calculateProgress,
  loadRunState,
  saveRunState,
} from "./run-model.js";

function makeTask(overrides?: Partial<TaskExecution>): TaskExecution {
  return {
    taskId: "FEAT-001-DB",
    featureId: "FEAT-001",
    taskKind: "db",
    name: "Feature 1 - Database",
    status: "backlog",
    blockedBy: [],
    files: [],
    ...overrides,
  };
}

describe("run-model", () => {
  describe("createRunState", () => {
    it("creates idle state with empty tasks", () => {
      const state = createRunState();
      expect(state.status).toBe("idle");
      expect(state.tasks).toHaveLength(0);
      expect(state.currentTaskId).toBeNull();
    });
  });

  describe("getNextPendingTask", () => {
    it("returns first backlog task", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({ taskId: "T1", status: "done" }),
        makeTask({ taskId: "T2", status: "backlog" }),
        makeTask({ taskId: "T3", status: "backlog" }),
      ];
      const next = getNextPendingTask(state);
      expect(next?.taskId).toBe("T2");
    });

    it("returns undefined when no pending tasks", () => {
      const state = createRunState();
      state.tasks = [makeTask({ status: "done" })];
      expect(getNextPendingTask(state)).toBeUndefined();
    });
  });

  describe("startTask", () => {
    it("transitions task to in_progress", () => {
      const state = createRunState();
      state.tasks = [makeTask({ taskId: "T1" })];
      const task = startTask(state, "T1");

      expect(task?.status).toBe("in_progress");
      expect(task?.startedAt).toBeDefined();
      expect(task?.heartbeatAt).toBeDefined();
      expect(task?.leaseExpiresAt).toBeDefined();
      expect(task?.maxRuntimeMin).toBe(25);
      expect(task?.maxIdleMin).toBe(7);
      expect(state.currentTaskId).toBe("T1");
      expect(state.status).toBe("running");
    });

    it("returns undefined for missing task", () => {
      const state = createRunState();
      expect(startTask(state, "NONEXISTENT")).toBeUndefined();
    });
  });

  describe("escalateTask", () => {
    it("transitions to waiting_input with escalation", () => {
      const state = createRunState();
      state.tasks = [makeTask({ taskId: "T1", status: "in_progress" })];
      state.status = "running";

      escalateTask(state, "T1", {
        triggerId: "T3",
        context: "Multiple options",
        question: "Which approach?",
        options: [
          { id: 1, description: "Option A", impact: "Fast" },
          { id: 2, description: "Option B", impact: "Safe" },
        ],
        recommendation: "Option A",
        recommendationReason: "Faster delivery",
      });

      expect(state.tasks[0].status).toBe("waiting_input");
      expect(state.tasks[0].escalation?.triggerId).toBe("T3");
      expect(state.status).toBe("waiting_input");
    });
  });

  describe("resolveEscalation", () => {
    it("resumes task after escalation resolution", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({
          taskId: "T1",
          status: "waiting_input",
          escalation: {
            triggerId: "T3",
            context: "test",
            question: "test?",
            options: [],
            recommendation: "A",
            recommendationReason: "reason",
          },
        }),
      ];
      state.status = "waiting_input";

      resolveEscalation(state, "T1", "Option A");

      expect(state.tasks[0].status).toBe("in_progress");
      expect(state.tasks[0].escalation?.resolution).toBe("Option A");
      expect(state.tasks[0].escalation?.resolvedAt).toBeDefined();
      expect(state.status).toBe("running");
    });
  });

  describe("completeTask", () => {
    it("marks task as done with files and audit", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({ taskId: "T1", status: "in_progress" }),
        makeTask({ taskId: "T2", status: "backlog" }),
      ];
      state.currentTaskId = "T1";
      state.status = "running";

      completeTask(state, "T1", [
        { path: "src/model.ts", action: "created" },
      ], 98);

      expect(state.tasks[0].status).toBe("done");
      expect(state.tasks[0].files).toHaveLength(1);
      expect(state.tasks[0].auditScore).toBe(98);
      expect(state.tasks[0].completedAt).toBeDefined();
      expect(state.status).toBe("running");
    });

    it("marks state completed when all tasks done", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({ taskId: "T1", status: "in_progress" }),
      ];
      state.status = "running";

      completeTask(state, "T1", [], 100);

      expect(state.status).toBe("completed");
      expect(state.completedAt).toBeDefined();
    });
  });

  describe("failTask", () => {
    it("marks task and state as failed", () => {
      const state = createRunState();
      state.tasks = [makeTask({ taskId: "T1", status: "in_progress" })];
      state.status = "running";

      failTask(state, "T1", "manual_fail", "operator");

      expect(state.tasks[0].status).toBe("failed");
      expect(state.tasks[0].stopReason).toBe("manual_fail");
      expect(state.tasks[0].stopDetails).toBe("operator");
      expect(state.status).toBe("failed");
    });
  });

  describe("runtime health", () => {
    it("detects max runtime timeout", () => {
      const task = makeTask({
        taskId: "T1",
        status: "in_progress",
        startedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
        heartbeatAt: new Date().toISOString(),
        maxRuntimeMin: 25,
      });

      const health = getTaskExecutionHealth(task);
      expect(health.expired).toBe(true);
      expect(health.reason).toBe("max_runtime_exceeded");
    });

    it("updates heartbeat lease", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({
          taskId: "T1",
          status: "in_progress",
          maxIdleMin: 7,
        }),
      ];

      const before = state.tasks[0].leaseExpiresAt;
      const updated = touchTaskHeartbeat(state, "T1", new Date());
      expect(updated?.heartbeatAt).toBeDefined();
      expect(updated?.leaseExpiresAt).toBeDefined();
      expect(updated?.leaseExpiresAt).not.toBe(before);
    });
  });

  describe("calculateProgress", () => {
    it("returns 0 for empty tasks", () => {
      const state = createRunState();
      expect(calculateProgress(state)).toBe(0);
    });

    it("calculates percentage of done tasks", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({ status: "done" }),
        makeTask({ taskId: "T2", status: "done" }),
        makeTask({ taskId: "T3", status: "backlog" }),
        makeTask({ taskId: "T4", status: "backlog" }),
      ];
      expect(calculateProgress(state)).toBe(50);
    });

    it("returns 100 when all done", () => {
      const state = createRunState();
      state.tasks = [
        makeTask({ status: "done" }),
        makeTask({ taskId: "T2", status: "done" }),
      ];
      expect(calculateProgress(state)).toBe(100);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-run-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads run state", () => {
      const state = createRunState();
      state.tasks = [makeTask()];
      saveRunState(tmpDir, state);

      const loaded = loadRunState(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.tasks).toHaveLength(1);
      expect(loaded!.tasks[0].taskId).toBe("FEAT-001-DB");
    });

    it("returns null when no state file", () => {
      expect(loadRunState(tmpDir)).toBeNull();
    });

    it("creates .framework directory", () => {
      const state = createRunState();
      saveRunState(tmpDir, state);
      expect(
        fs.existsSync(path.join(tmpDir, ".framework")),
      ).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// getCurrentTask / getNextTaskBySeq
// ─────────────────────────────────────────────

import { getCurrentTask, getNextTaskBySeq } from "./run-model.js";

function makeTaskWithSeq(
  taskId: string,
  status: TaskExecution["status"],
  seq?: string,
): TaskExecution {
  return {
    taskId,
    featureId: "F1",
    taskKind: "db",
    name: taskId,
    status,
    blockedBy: [],
    files: [],
    seq,
  };
}

describe("getCurrentTask", () => {
  it("returns in_progress task", () => {
    const state = createRunState();
    state.tasks = [
      makeTaskWithSeq("T1", "backlog", "1000100010"),
      makeTaskWithSeq("T2", "in_progress", "1000100020"),
    ];
    expect(getCurrentTask(state)?.taskId).toBe("T2");
  });

  it("returns undefined when no in_progress task", () => {
    const state = createRunState();
    state.tasks = [makeTaskWithSeq("T1", "backlog", "1000100010")];
    expect(getCurrentTask(state)).toBeUndefined();
  });
});

describe("getNextTaskBySeq", () => {
  it("returns backlog task with smallest seq", () => {
    const state = createRunState();
    state.tasks = [
      makeTaskWithSeq("T3", "backlog", "1000300010"),
      makeTaskWithSeq("T1", "backlog", "1000100010"),
      makeTaskWithSeq("T2", "backlog", "1000200010"),
    ];
    expect(getNextTaskBySeq(state)?.taskId).toBe("T1");
  });

  it("skips done tasks", () => {
    const state = createRunState();
    state.tasks = [
      makeTaskWithSeq("T1", "done", "1000100010"),
      makeTaskWithSeq("T2", "backlog", "1000200010"),
    ];
    expect(getNextTaskBySeq(state)?.taskId).toBe("T2");
  });

  it("returns undefined when no backlog tasks", () => {
    const state = createRunState();
    state.tasks = [makeTaskWithSeq("T1", "done", "1000100010")];
    expect(getNextTaskBySeq(state)).toBeUndefined();
  });

  it("falls back to insertion order when seq is absent", () => {
    const state = createRunState();
    state.tasks = [
      makeTaskWithSeq("T1", "backlog", undefined),
      makeTaskWithSeq("T2", "backlog", undefined),
    ];
    expect(getNextTaskBySeq(state)?.taskId).toBe("T1");
  });

  it("skips blocked backlog tasks", () => {
    const state = createRunState();
    state.tasks = [
      makeTaskWithSeq("T1", "backlog", "1000100010"),
      {
        ...makeTaskWithSeq("T2", "backlog", "1000100020"),
        blockedBy: ["T1"],
      },
      makeTaskWithSeq("T3", "backlog", "1000100030"),
    ];

    expect(areTaskBlockersSatisfied(state, state.tasks[1])).toBe(false);
    expect(getNextTaskBySeq(state)?.taskId).toBe("T1");

    state.tasks[0].status = "done";
    expect(areTaskBlockersSatisfied(state, state.tasks[1])).toBe(true);
    expect(getNextTaskBySeq(state)?.taskId).toBe("T2");
  });
});
