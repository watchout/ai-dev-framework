import { describe, it, expect } from "vitest";
import {
  buildTaskDependencyGraph,
  countTransitiveDependents,
  findCriticalPath,
  formatPriorityDisplay,
  type TaskNode,
} from "./dependency-graph.js";
import type { PlanState, Task, Feature, Wave } from "./plan-model.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { id: string; featureId: string }): Task {
  return {
    kind: "api",
    name: overrides.id,
    references: [],
    blockedBy: [],
    blocks: [],
    size: "M",
    ...overrides,
  };
}

function makeFeature(id: string, deps: string[] = []): Feature {
  return {
    id,
    name: id,
    priority: "P0",
    size: "M",
    type: "proprietary",
    dependencies: deps,
    dependencyCount: 0,
  };
}

function makePlan(waves: Wave[], tasks: Task[]): PlanState {
  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves,
    tasks,
    circularDependencies: [],
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("dependency-graph", () => {
  describe("basic linear dependency (A→B→C)", () => {
    it("builds correct dependency chain", () => {
      const tasks = [
        makeTask({ id: "A-DB", featureId: "A", kind: "db", blockedBy: [] }),
        makeTask({ id: "A-API", featureId: "A", kind: "api", blockedBy: ["A-DB"] }),
        makeTask({ id: "A-UI", featureId: "A", kind: "ui", blockedBy: ["A-API"] }),
      ];
      const wave: Wave = {
        number: 1,
        phase: "individual",
        title: "Wave 1",
        features: [makeFeature("A")],
      };
      const plan = makePlan([wave], tasks);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.nodes).toHaveLength(3);

      const dbNode = graph.nodes.find((n) => n.id === "A-DB");
      expect(dbNode).toBeDefined();
      expect(dbNode!.dependents).toContain("A-API");

      const apiNode = graph.nodes.find((n) => n.id === "A-API");
      expect(apiNode!.dependencies).toContain("A-DB");
      expect(apiNode!.dependents).toContain("A-UI");
    });
  });

  describe("critical path detection", () => {
    it("finds the longest path", () => {
      // A-DB → A-API → A-UI (path length 3)
      // B-DB → B-API (path length 2)
      const tasks = [
        makeTask({ id: "A-DB", featureId: "A", kind: "db" }),
        makeTask({ id: "A-API", featureId: "A", kind: "api", blockedBy: ["A-DB"] }),
        makeTask({ id: "A-UI", featureId: "A", kind: "ui", blockedBy: ["A-API"] }),
        makeTask({ id: "B-DB", featureId: "B", kind: "db" }),
        makeTask({ id: "B-API", featureId: "B", kind: "api", blockedBy: ["B-DB"] }),
      ];
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("A"), makeFeature("B")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.criticalPath).toHaveLength(3);
      expect(graph.criticalPath).toEqual(["A-DB", "A-API", "A-UI"]);
    });
  });

  describe("priority calculation", () => {
    it("scores nodes by transitive dependents count", () => {
      // A-DB blocks A-API, A-API blocks A-UI
      // A-DB has 2 transitive dependents, A-API has 1
      const tasks = [
        makeTask({ id: "A-DB", featureId: "A", kind: "db" }),
        makeTask({ id: "A-API", featureId: "A", kind: "api", blockedBy: ["A-DB"] }),
        makeTask({ id: "A-UI", featureId: "A", kind: "ui", blockedBy: ["A-API"] }),
      ];
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("A")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      // A-DB: transitive=2, direct=1, layer=5(schema), critical_path=10 → high score
      const dbNode = graph.nodes.find((n) => n.id === "A-DB")!;
      const uiNode = graph.nodes.find((n) => n.id === "A-UI")!;

      expect(dbNode.priority).toBeGreaterThan(uiNode.priority);
    });
  });

  describe("20% extraction boundary values", () => {
    it("extracts minimum 3 tasks even for small lists", () => {
      // 5 tasks → 20% = 1, but minimum 3
      const tasks = Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `T${i}`, featureId: "F", kind: "api" }),
      );
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("F")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.priorityTasks.length).toBe(3);
    });

    it("extracts 2 tasks (20%) for 10 tasks", () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        makeTask({ id: `T${i}`, featureId: "F", kind: "api" }),
      );
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("F")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      // 20% of 10 = 2, but min 3 → 3
      expect(graph.priorityTasks.length).toBe(3);
    });

    it("extracts 20% for larger lists (20 tasks → 4)", () => {
      const tasks = Array.from({ length: 20 }, (_, i) =>
        makeTask({ id: `T${i}`, featureId: "F", kind: "api" }),
      );
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("F")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.priorityTasks.length).toBe(4);
    });
  });

  describe("circular dependency handling", () => {
    it("returns empty critical path when cycles exist", () => {
      // A-DB blocks A-API, A-API blocks A-DB (cycle)
      const tasks = [
        makeTask({ id: "A-DB", featureId: "A", kind: "db", blockedBy: ["A-API"] }),
        makeTask({ id: "A-API", featureId: "A", kind: "api", blockedBy: ["A-DB"] }),
      ];
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("A")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.criticalPath).toHaveLength(0);
    });
  });

  describe("cross-feature dependencies", () => {
    it("adds cross-feature deps from feature dependencies", () => {
      // Feature B depends on Feature A
      // B's first task should be blocked by A's last task
      const tasks = [
        makeTask({ id: "A-DB", featureId: "A", kind: "db" }),
        makeTask({ id: "A-API", featureId: "A", kind: "api", blockedBy: ["A-DB"] }),
        makeTask({ id: "B-DB", featureId: "B", kind: "db" }),
        makeTask({ id: "B-API", featureId: "B", kind: "api", blockedBy: ["B-DB"] }),
      ];
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("A")] },
        { number: 2, phase: "individual", title: "Wave 2", features: [makeFeature("B", ["A"])] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      // B-DB should now depend on A-API (last task of feature A)
      const bDbNode = graph.nodes.find((n) => n.id === "B-DB")!;
      expect(bDbNode.dependencies).toContain("A-API");

      // A-API should have B-DB as dependent
      const aApiNode = graph.nodes.find((n) => n.id === "A-API")!;
      expect(aApiNode.dependents).toContain("B-DB");
    });
  });

  describe("layer mapping", () => {
    it("maps task kinds to correct layers", () => {
      const tasks = [
        makeTask({ id: "T-DB", featureId: "F", kind: "db" }),
        makeTask({ id: "T-API", featureId: "F", kind: "api" }),
        makeTask({ id: "T-UI", featureId: "F", kind: "ui" }),
        makeTask({ id: "T-INT", featureId: "F", kind: "integration" }),
        makeTask({ id: "T-TEST", featureId: "F", kind: "test" }),
        makeTask({ id: "T-REV", featureId: "F", kind: "review" }),
      ];
      const waves: Wave[] = [
        { number: 1, phase: "individual", title: "Wave 1", features: [makeFeature("F")] },
      ];
      const plan = makePlan(waves, tasks);

      const graph = buildTaskDependencyGraph(plan);

      const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
      expect(nodeMap.get("T-DB")!.layer).toBe("schema");
      expect(nodeMap.get("T-API")!.layer).toBe("api");
      expect(nodeMap.get("T-UI")!.layer).toBe("ui");
      expect(nodeMap.get("T-INT")!.layer).toBe("logic");
      expect(nodeMap.get("T-TEST")!.layer).toBe("test");
      expect(nodeMap.get("T-REV")!.layer).toBe("docs");
    });
  });

  describe("empty task list", () => {
    it("returns empty graph for no tasks", () => {
      const plan = makePlan([], []);

      const graph = buildTaskDependencyGraph(plan);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.criticalPath).toHaveLength(0);
      expect(graph.priorityTasks).toHaveLength(0);
    });
  });

  describe("countTransitiveDependents", () => {
    it("counts all indirect dependents", () => {
      // A → B → C → D
      const nodes: TaskNode[] = [
        { id: "A", name: "A", featureId: "F", layer: "schema", dependencies: [], dependents: ["B"], priority: 0, status: "pending" },
        { id: "B", name: "B", featureId: "F", layer: "api", dependencies: ["A"], dependents: ["C"], priority: 0, status: "pending" },
        { id: "C", name: "C", featureId: "F", layer: "ui", dependencies: ["B"], dependents: ["D"], priority: 0, status: "pending" },
        { id: "D", name: "D", featureId: "F", layer: "test", dependencies: ["C"], dependents: [], priority: 0, status: "pending" },
      ];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      expect(countTransitiveDependents("A", nodeMap)).toBe(3);
      expect(countTransitiveDependents("B", nodeMap)).toBe(2);
      expect(countTransitiveDependents("C", nodeMap)).toBe(1);
      expect(countTransitiveDependents("D", nodeMap)).toBe(0);
    });
  });

  describe("findCriticalPath", () => {
    it("finds longest path in DAG", () => {
      const nodes: TaskNode[] = [
        { id: "A", name: "A", featureId: "F", layer: "schema", dependencies: [], dependents: ["B", "C"], priority: 0, status: "pending" },
        { id: "B", name: "B", featureId: "F", layer: "api", dependencies: ["A"], dependents: ["D"], priority: 0, status: "pending" },
        { id: "C", name: "C", featureId: "F", layer: "ui", dependencies: ["A"], dependents: [], priority: 0, status: "pending" },
        { id: "D", name: "D", featureId: "F", layer: "test", dependencies: ["B"], dependents: [], priority: 0, status: "pending" },
      ];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      const cp = findCriticalPath(nodes, nodeMap);
      // A → B → D is length 3, A → C is length 2
      expect(cp).toEqual(["A", "B", "D"]);
    });

    it("returns empty for empty input", () => {
      expect(findCriticalPath([], new Map())).toEqual([]);
    });
  });

  describe("formatPriorityDisplay", () => {
    it("formats output with critical path markers", () => {
      const graph = {
        nodes: [
          { id: "A-DB", name: "A-DB", featureId: "A", layer: "schema" as const, dependencies: [], dependents: ["A-API"], priority: 20, status: "pending" as const },
          { id: "A-API", name: "A-API", featureId: "A", layer: "api" as const, dependencies: ["A-DB"], dependents: [], priority: 10, status: "pending" as const },
        ],
        criticalPath: ["A-DB", "A-API"],
        priorityTasks: ["A-DB", "A-API"],
      };

      const output = formatPriorityDisplay(graph, 2, { top: 2 });

      expect(output).toContain("Priority Tasks");
      expect(output).toContain("A-DB");
      expect(output).toContain("★");
      expect(output).toContain("Critical Path");
    });
  });
});
