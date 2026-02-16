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
} from "./run-engine.js";
import { type PlanState } from "./plan-model.js";
import { saveRunState, createRunState } from "./run-model.js";

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

    it("marks tasks done when feature status is done", () => {
      const plan = makePlan();
      plan.waves[0].features[0].status = "done";
      const state = initRunStateFromPlan(plan);

      for (const task of state.tasks) {
        expect(task.status).toBe("done");
        expect(task.completedAt).toBeDefined();
      }
    });

    it("keeps tasks as backlog when feature status is in_progress", () => {
      const plan = makePlan();
      plan.waves[0].features[0].status = "in_progress";
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
});
