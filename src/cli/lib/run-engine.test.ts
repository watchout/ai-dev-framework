import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type RunIO,
  runTask,
  initRunStateFromPlan,
  generateTaskPrompt,
  createEscalation,
  completeTaskNonInteractive,
  completeFeatureNonInteractive,
  completeWaveNonInteractive,
  syncRunStateFromGitHub,
} from "./run-engine.js";
import { type PlanState, savePlan } from "./plan-model.js";
import { saveRunState, createRunState, loadRunState } from "./run-model.js";
import { setGhExecutor, setSleepFn } from "./github-engine.js";
import { createSyncState, saveSyncState } from "./github-model.js";

function createMockIO(askResponse = "done"): RunIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
    async ask(): Promise<string> {
      return askResponse;
    },
  };
}

function makePlan(): PlanState {
  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves: [
      {
        number: 1,
        phase: "common",
        layer: 1,
        title: "Auth Foundation",
        features: [
          {
            id: "AUTH-001",
            name: "Login",
            priority: "P0",
            size: "M",
            type: "common",
            dependencies: [],
            dependencyCount: 0,
          },
        ],
      },
    ],
    circularDependencies: [],
  };
}

describe("run-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-run-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initRunStateFromPlan", () => {
    it("decomposes features into tasks (app profile uses TDD for common features)", () => {
      const plan = makePlan();
      // Common features in app profile use TDD (test first)
      const state = initRunStateFromPlan(plan, { profileType: "app" });

      expect(state.tasks.length).toBe(6);
      // TDD order for common features: TEST → DB → API → UI → INTEGRATION → REVIEW
      expect(state.tasks[0].taskId).toBe("AUTH-001-TEST");
      expect(state.tasks[1].taskId).toBe("AUTH-001-DB");
      expect(state.tasks[2].taskId).toBe("AUTH-001-API");
      expect(state.tasks[3].taskId).toBe("AUTH-001-UI");
      expect(state.tasks[4].taskId).toBe("AUTH-001-INTEGRATION");
      expect(state.tasks[5].taskId).toBe("AUTH-001-REVIEW");
    });

    it("api profile uses TDD order for all features", () => {
      const plan = makePlan();
      plan.waves[0].features[0].type = "proprietary";
      const state = initRunStateFromPlan(plan, { profileType: "api" });

      // TDD order: TEST → DB → API → UI → INTEGRATION → REVIEW
      expect(state.tasks[0].taskId).toBe("AUTH-001-TEST");
      expect(state.tasks[5].taskId).toBe("AUTH-001-REVIEW");
    });

    it("lp profile uses normal order (impl first)", () => {
      const plan = makePlan();
      plan.waves[0].features[0].type = "proprietary";
      const state = initRunStateFromPlan(plan, { profileType: "lp" });

      // Normal order: DB → API → UI → INTEGRATION → REVIEW → TEST
      expect(state.tasks[0].taskId).toBe("AUTH-001-DB");
      expect(state.tasks[4].taskId).toBe("AUTH-001-REVIEW");
      expect(state.tasks[5].taskId).toBe("AUTH-001-TEST");
    });

    it("all tasks start as backlog when feature has no status", () => {
      const plan = makePlan();
      const state = initRunStateFromPlan(plan);

      for (const task of state.tasks) {
        expect(task.status).toBe("backlog");
      }
    });

    it("handles multiple features", () => {
      const plan = makePlan();
      plan.waves[0].features.push({
        id: "AUTH-002",
        name: "Register",
        priority: "P0",
        size: "M",
        type: "common",
        dependencies: ["AUTH-001"],
        dependencyCount: 0,
      });
      const state = initRunStateFromPlan(plan);
      expect(state.tasks.length).toBe(12);
    });
  });

  describe("generateTaskPrompt", () => {
    it("generates prompt for db task", () => {
      const prompt = generateTaskPrompt({
        taskId: "FEAT-001-DB",
        featureId: "FEAT-001",
        taskKind: "db",
        name: "Feature - Database",
        status: "in_progress",
        files: [],
      });
      expect(prompt).toContain("FEAT-001-DB");
      expect(prompt).toContain("Database");
      expect(prompt).toContain("schema");
    });

    it("generates prompt for api task", () => {
      const prompt = generateTaskPrompt({
        taskId: "FEAT-001-API",
        featureId: "FEAT-001",
        taskKind: "api",
        name: "Feature - API",
        status: "in_progress",
        files: [],
      });
      expect(prompt).toContain("API endpoint");
      expect(prompt).toContain("validation");
    });

    it("generates prompt for ui task", () => {
      const prompt = generateTaskPrompt({
        taskId: "FEAT-001-UI",
        featureId: "FEAT-001",
        taskKind: "ui",
        name: "Feature - UI",
        status: "in_progress",
        files: [],
      });
      expect(prompt).toContain("React component");
    });

    it("generates prompt for test task", () => {
      const prompt = generateTaskPrompt({
        taskId: "FEAT-001-TEST",
        featureId: "FEAT-001",
        taskKind: "test",
        name: "Feature - Testing",
        status: "in_progress",
        files: [],
      });
      expect(prompt).toContain("unit tests");
      expect(prompt).toContain("boundary");
    });

    it("includes constraints section", () => {
      const prompt = generateTaskPrompt({
        taskId: "T1",
        featureId: "F1",
        taskKind: "db",
        name: "Test",
        status: "in_progress",
        files: [],
      });
      expect(prompt).toContain("Constraints");
      expect(prompt).toContain("any");
      expect(prompt).toContain("Acceptance Criteria");
    });
  });

  describe("createEscalation", () => {
    it("creates escalation with options", () => {
      const esc = createEscalation(
        "T3",
        "Implementation context",
        "Which approach?",
        [
          { description: "Option A", impact: "Fast" },
          { description: "Option B", impact: "Safe" },
        ],
        "Option A",
        "Faster delivery time",
      );

      expect(esc.triggerId).toBe("T3");
      expect(esc.options).toHaveLength(2);
      expect(esc.options[0].id).toBe(1);
      expect(esc.options[1].id).toBe(2);
      expect(esc.recommendation).toBe("Option A");
    });
  });

  describe("runTask", () => {
    it("returns error when no plan exists", async () => {
      const io = createMockIO();
      const result = await runTask({
        projectDir: tmpDir,
        io,
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.status).toBe("failed");
    });

    it("initializes run state from plan on first run", async () => {
      const io = createMockIO();
      const plan = makePlan();
      const planPath = path.join(tmpDir, ".framework/plan.json");
      fs.writeFileSync(planPath, JSON.stringify(plan), "utf-8");

      const result = await runTask({
        projectDir: tmpDir,
        io,
      });
      expect(result.status).toBe("completed");
      // Feature type is "common", defaults to app profile → TDD mode, TEST first
      expect(result.taskId).toBe("AUTH-001-TEST");

      // Verify state was persisted
      const statePath = path.join(tmpDir, ".framework/run-state.json");
      expect(fs.existsSync(statePath)).toBe(true);
    });

    it("runs specific task by ID", async () => {
      const io = createMockIO();
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
        {
          taskId: "T2", featureId: "F1", taskKind: "api",
          name: "Task 2", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({
        projectDir: tmpDir,
        io,
        taskId: "T2",
      });
      expect(result.taskId).toBe("T2");
      expect(result.status).toBe("completed");
    });

    it("returns error for unknown task ID", async () => {
      const io = createMockIO();
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({
        projectDir: tmpDir,
        io,
        taskId: "NONEXISTENT",
      });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("dry run shows prompt without executing", async () => {
      const io = createMockIO();
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({
        projectDir: tmpDir,
        io,
        dryRun: true,
      });
      expect(result.status).toBe("dry_run");
      expect(io.output.some((o) => o.includes("DRY RUN"))).toBe(true);
      expect(io.output.some((o) => o.includes("Prompt"))).toBe(true);
    });

    it("skips task when user answers skip", async () => {
      const io = createMockIO("skip");
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({
        projectDir: tmpDir,
        io,
      });
      expect(result.taskId).toBe("T1");
      // Task should be returned to backlog
      const { loadRunState: load } = await import("./run-model.js");
      const updated = load(tmpDir);
      expect(updated?.tasks[0].status).toBe("backlog");
    });

    it("fails task when user answers fail", async () => {
      const io = createMockIO("fail");
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({
        projectDir: tmpDir,
        io,
      });
      expect(result.status).toBe("failed");
    });

    it("reports all completed when no pending tasks", async () => {
      const io = createMockIO();
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "done", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await runTask({ projectDir: tmpDir, io });
      expect(io.output.some((o) => o.includes("completed"))).toBe(true);
    });
  });

  describe("completeTaskNonInteractive", () => {
    it("completes a single task", async () => {
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
        {
          taskId: "T2", featureId: "F1", taskKind: "api",
          name: "Task 2", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await completeTaskNonInteractive(tmpDir, "T1");
      expect(result.error).toBeUndefined();
      expect(result.progress).toBe(50);

      const updated = loadRunState(tmpDir);
      expect(updated?.tasks[0].status).toBe("done");
      expect(updated?.tasks[1].status).toBe("backlog");
    });

    it("returns error for nonexistent task", async () => {
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await completeTaskNonInteractive(tmpDir, "NOPE");
      expect(result.error).toContain("not found");
    });

    it("returns error for already-completed task", async () => {
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "done", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = await completeTaskNonInteractive(tmpDir, "T1");
      expect(result.error).toContain("already completed");
    });

    it("initializes state from plan when no run-state exists", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      const result = await completeTaskNonInteractive(tmpDir, "AUTH-001-TEST");
      expect(result.error).toBeUndefined();
      expect(result.progress).toBeGreaterThan(0);
    });
  });

  describe("completeFeatureNonInteractive", () => {
    it("completes all tasks for a feature", async () => {
      const state = createRunState();
      state.tasks = [
        { taskId: "F1-DB", featureId: "F1", taskKind: "db", name: "F1 DB", status: "backlog", files: [] },
        { taskId: "F1-API", featureId: "F1", taskKind: "api", name: "F1 API", status: "backlog", files: [] },
        { taskId: "F1-UI", featureId: "F1", taskKind: "ui", name: "F1 UI", status: "backlog", files: [] },
        { taskId: "F2-DB", featureId: "F2", taskKind: "db", name: "F2 DB", status: "backlog", files: [] },
      ];
      saveRunState(tmpDir, state);

      const result = await completeFeatureNonInteractive(tmpDir, "F1");
      expect(result.error).toBeUndefined();
      expect(result.completed).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.progress).toBe(75); // 3 out of 4

      const updated = loadRunState(tmpDir);
      expect(updated?.tasks[0].status).toBe("done");
      expect(updated?.tasks[1].status).toBe("done");
      expect(updated?.tasks[2].status).toBe("done");
      expect(updated?.tasks[3].status).toBe("backlog"); // F2 untouched
    });

    it("skips already-done tasks", async () => {
      const state = createRunState();
      state.tasks = [
        { taskId: "F1-DB", featureId: "F1", taskKind: "db", name: "F1 DB", status: "done", files: [] },
        { taskId: "F1-API", featureId: "F1", taskKind: "api", name: "F1 API", status: "backlog", files: [] },
      ];
      saveRunState(tmpDir, state);

      const result = await completeFeatureNonInteractive(tmpDir, "F1");
      expect(result.completed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.progress).toBe(100);
    });

    it("returns error for unknown feature", async () => {
      const state = createRunState();
      state.tasks = [
        { taskId: "F1-DB", featureId: "F1", taskKind: "db", name: "F1 DB", status: "backlog", files: [] },
      ];
      saveRunState(tmpDir, state);

      const result = await completeFeatureNonInteractive(tmpDir, "UNKNOWN");
      expect(result.error).toContain("No tasks found");
      expect(result.completed).toBe(0);
    });

    it("initializes state from plan when no run-state exists", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      const result = await completeFeatureNonInteractive(tmpDir, "AUTH-001");
      expect(result.error).toBeUndefined();
      expect(result.completed).toBe(6); // 6 standard task kinds
      expect(result.progress).toBe(100);
    });
  });

  describe("completeWaveNonInteractive", () => {
    it("completes all tasks in a wave", async () => {
      const plan = makePlan();
      // Add a second wave with another feature
      plan.waves.push({
        number: 2,
        phase: "common",
        layer: 2,
        title: "Notification Foundation",
        features: [
          {
            id: "NOTIF-001",
            name: "Email Notification",
            priority: "P1",
            size: "M",
            type: "common",
            dependencies: ["AUTH-001"],
            dependencyCount: 0,
          },
        ],
      });
      savePlan(tmpDir, plan);

      // Initialize state first so we have tasks for both waves
      const state = initRunStateFromPlan(plan);
      saveRunState(tmpDir, state);

      const result = await completeWaveNonInteractive(tmpDir, 1);
      expect(result.error).toBeUndefined();
      expect(result.completed).toBe(6); // AUTH-001's 6 tasks
      expect(result.skipped).toBe(0);

      // Wave 2 tasks should still be backlog
      const updated = loadRunState(tmpDir);
      const wave2Tasks = updated?.tasks.filter((t) => t.featureId === "NOTIF-001") ?? [];
      for (const t of wave2Tasks) {
        expect(t.status).toBe("backlog");
      }
    });

    it("returns error for nonexistent wave", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      const result = await completeWaveNonInteractive(tmpDir, 99);
      expect(result.error).toContain("Wave 99 not found");
    });

    it("returns error when no plan exists", async () => {
      const result = await completeWaveNonInteractive(tmpDir, 1);
      expect(result.error).toContain("No plan found");
    });

    it("skips already-done tasks in wave", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      // Create state with some tasks already done
      const state = initRunStateFromPlan(plan);
      // Mark first 3 tasks as done
      state.tasks[0].status = "done";
      state.tasks[0].completedAt = new Date().toISOString();
      state.tasks[1].status = "done";
      state.tasks[1].completedAt = new Date().toISOString();
      state.tasks[2].status = "done";
      state.tasks[2].completedAt = new Date().toISOString();
      saveRunState(tmpDir, state);

      const result = await completeWaveNonInteractive(tmpDir, 1);
      expect(result.completed).toBe(3); // remaining 3
      expect(result.skipped).toBe(3); // already done
      expect(result.progress).toBe(100);
    });
  });

  describe("syncRunStateFromGitHub", () => {
    let restoreExecutor: () => void;
    let restoreSleep: () => void;

    beforeEach(() => {
      restoreSleep = setSleepFn(async () => {});
    });

    afterEach(() => {
      restoreExecutor?.();
      restoreSleep?.();
    });

    it("returns error when no sync state exists", async () => {
      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.errors).toContain("No GitHub sync state found.");
      expect(result.updated).toBe(0);
    });

    it("returns error when gh CLI is unavailable", async () => {
      // Create sync state
      const syncState = createSyncState("owner/repo");
      saveSyncState(tmpDir, syncState);

      restoreExecutor = setGhExecutor(async () => {
        throw new Error("gh not found");
      });

      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.errors).toContain("gh CLI not available.");
      expect(result.updated).toBe(0);
    });

    it("returns error when no plan exists", async () => {
      const syncState = createSyncState("owner/repo");
      saveSyncState(tmpDir, syncState);

      restoreExecutor = setGhExecutor(async (args: string[]) => {
        if (args[0] === "auth") return "Logged in";
        return "[]";
      });

      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.errors).toContain("No plan found.");
    });

    it("creates run-state.json and marks closed issues as done", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      // Create sync state with task mappings
      const syncState = createSyncState("owner/repo");
      syncState.featureIssues = [
        {
          featureId: "AUTH-001",
          parentIssueNumber: 1,
          taskIssues: [
            { taskId: "AUTH-001-TEST", issueNumber: 10 },
            { taskId: "AUTH-001-DB", issueNumber: 11 },
            { taskId: "AUTH-001-API", issueNumber: 12 },
            { taskId: "AUTH-001-UI", issueNumber: 13 },
            { taskId: "AUTH-001-INTEGRATION", issueNumber: 14 },
            { taskId: "AUTH-001-REVIEW", issueNumber: 15 },
          ],
        },
      ];
      saveSyncState(tmpDir, syncState);

      // Mock gh CLI: auth succeeds, all issues are closed
      restoreExecutor = setGhExecutor(async (args: string[]) => {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "issue" && args[1] === "view") {
          const num = parseInt(args[2], 10);
          return JSON.stringify({
            number: num,
            title: `Task #${num}`,
            state: "CLOSED",
            labels: [],
          });
        }
        return "";
      });

      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.created).toBe(true);
      expect(result.updated).toBe(6);
      expect(result.progress).toBe(100);

      // Verify run-state.json was created
      const state = loadRunState(tmpDir);
      expect(state).not.toBeNull();
      expect(state?.status).toBe("completed");
      for (const task of state?.tasks ?? []) {
        expect(task.status).toBe("done");
      }
    });

    it("updates existing run-state with closed issues", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      // Create existing run-state with some backlog tasks
      const state = initRunStateFromPlan(plan);
      saveRunState(tmpDir, state);

      // Create sync state
      const syncState = createSyncState("owner/repo");
      syncState.featureIssues = [
        {
          featureId: "AUTH-001",
          parentIssueNumber: 1,
          taskIssues: [
            { taskId: "AUTH-001-TEST", issueNumber: 10 },
            { taskId: "AUTH-001-DB", issueNumber: 11 },
          ],
        },
      ];
      saveSyncState(tmpDir, syncState);

      // Mock: only TEST is closed, DB is open
      restoreExecutor = setGhExecutor(async (args: string[]) => {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "issue" && args[1] === "view") {
          const num = parseInt(args[2], 10);
          return JSON.stringify({
            number: num,
            title: `Task #${num}`,
            state: num === 10 ? "CLOSED" : "OPEN",
            labels: [],
          });
        }
        return "";
      });

      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.created).toBe(false);
      expect(result.updated).toBe(1); // only AUTH-001-TEST

      const updated = loadRunState(tmpDir);
      const testTask = updated?.tasks.find((t) => t.taskId === "AUTH-001-TEST");
      const dbTask = updated?.tasks.find((t) => t.taskId === "AUTH-001-DB");
      expect(testTask?.status).toBe("done");
      expect(dbTask?.status).toBe("backlog");
    });

    it("does not re-update already done tasks", async () => {
      const plan = makePlan();
      savePlan(tmpDir, plan);

      // Create run-state with one task already done
      const state = initRunStateFromPlan(plan);
      state.tasks[0].status = "done";
      state.tasks[0].completedAt = "2026-01-01T00:00:00.000Z";
      saveRunState(tmpDir, state);

      // Create sync state
      const syncState = createSyncState("owner/repo");
      syncState.featureIssues = [
        {
          featureId: "AUTH-001",
          parentIssueNumber: 1,
          taskIssues: [
            { taskId: "AUTH-001-TEST", issueNumber: 10 },
          ],
        },
      ];
      saveSyncState(tmpDir, syncState);

      restoreExecutor = setGhExecutor(async (args: string[]) => {
        if (args[0] === "auth") return "Logged in";
        if (args[0] === "issue" && args[1] === "view") {
          return JSON.stringify({
            number: 10,
            title: "Task #10",
            state: "CLOSED",
            labels: [],
          });
        }
        return "";
      });

      const result = await syncRunStateFromGitHub(tmpDir);
      expect(result.updated).toBe(0); // already done, no update

      // Verify original completedAt preserved
      const updated = loadRunState(tmpDir);
      const task = updated?.tasks.find((t) => t.taskId === "AUTH-001-TEST");
      expect(task?.completedAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });
});
