import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type Feature,
  decomposeFeature,
  determineTaskOrderMode,
  buildDependencyGraph,
  detectCircularDependencies,
  topologicalSort,
  sortFeaturesInWave,
  loadPlan,
  savePlan,
} from "./plan-model.js";

function makeFeature(overrides: Partial<Feature> & { id: string }): Feature {
  return {
    name: overrides.id,
    priority: "P0",
    size: "M",
    type: "proprietary",
    dependencies: [],
    dependencyCount: 0,
    ...overrides,
  };
}

describe("plan-model", () => {
  describe("decomposeFeature", () => {
    it("creates 6 standard tasks", () => {
      const feature = makeFeature({ id: "FEAT-001", name: "Login" });
      const tasks = decomposeFeature(feature);
      expect(tasks).toHaveLength(6);
    });

    it("normal mode: task IDs follow impl-first order (DB → API → UI → Integration → Review → Test)", () => {
      const feature = makeFeature({ id: "FEAT-001" });
      const tasks = decomposeFeature(feature, "normal");
      expect(tasks[0].id).toBe("FEAT-001-DB");
      expect(tasks[1].id).toBe("FEAT-001-API");
      expect(tasks[2].id).toBe("FEAT-001-UI");
      expect(tasks[3].id).toBe("FEAT-001-INTEGRATION");
      expect(tasks[4].id).toBe("FEAT-001-REVIEW");
      expect(tasks[5].id).toBe("FEAT-001-TEST");
    });

    it("TDD mode: task IDs follow test-first order (Test → DB → API → UI → Integration → Review)", () => {
      const feature = makeFeature({ id: "FEAT-001" });
      const tasks = decomposeFeature(feature, "tdd");
      expect(tasks[0].id).toBe("FEAT-001-TEST");
      expect(tasks[1].id).toBe("FEAT-001-DB");
      expect(tasks[2].id).toBe("FEAT-001-API");
      expect(tasks[3].id).toBe("FEAT-001-UI");
      expect(tasks[4].id).toBe("FEAT-001-INTEGRATION");
      expect(tasks[5].id).toBe("FEAT-001-REVIEW");
    });

    it("tasks are chained: each blocks the next", () => {
      const feature = makeFeature({ id: "FEAT-001" });
      const tasks = decomposeFeature(feature, "normal");

      // First task has no blockedBy
      expect(tasks[0].blockedBy).toHaveLength(0);
      // Each subsequent task is blocked by the previous
      expect(tasks[1].blockedBy).toEqual(["FEAT-001-DB"]);
      expect(tasks[2].blockedBy).toEqual(["FEAT-001-API"]);
      // Last task blocks nothing
      expect(tasks[5].blocks).toHaveLength(0);
    });

    it("tasks have correct references", () => {
      const feature = makeFeature({ id: "FEAT-001" });
      const tasks = decomposeFeature(feature);

      expect(tasks[0].references).toEqual(["§4"]);
      expect(tasks[1].references).toEqual(["§5", "§7", "§9"]);
      expect(tasks[2].references).toEqual(["§6"]);
    });
  });

  describe("determineTaskOrderMode", () => {
    it("returns tdd for api profile", () => {
      expect(determineTaskOrderMode("api")).toBe("tdd");
    });

    it("returns tdd for cli profile", () => {
      expect(determineTaskOrderMode("cli")).toBe("tdd");
    });

    it("returns tdd for app profile with common features", () => {
      expect(determineTaskOrderMode("app", "common")).toBe("tdd");
    });

    it("returns normal for app profile with proprietary features", () => {
      expect(determineTaskOrderMode("app", "proprietary")).toBe("normal");
    });

    it("returns normal for lp profile", () => {
      expect(determineTaskOrderMode("lp")).toBe("normal");
    });

    it("returns normal for hp profile", () => {
      expect(determineTaskOrderMode("hp")).toBe("normal");
    });
  });

  describe("buildDependencyGraph", () => {
    it("builds graph from features", () => {
      const features = [
        makeFeature({ id: "A", dependencies: ["B"] }),
        makeFeature({ id: "B", dependencies: [] }),
        makeFeature({ id: "C", dependencies: ["A", "B"] }),
      ];

      const graph = buildDependencyGraph(features);
      expect(graph.get("A")).toEqual(["B"]);
      expect(graph.get("B")).toEqual([]);
      expect(graph.get("C")).toEqual(["A", "B"]);
    });

    it("filters out unknown dependency references", () => {
      const features = [
        makeFeature({ id: "A", dependencies: ["B", "UNKNOWN"] }),
        makeFeature({ id: "B", dependencies: [] }),
      ];

      const graph = buildDependencyGraph(features);
      expect(graph.get("A")).toEqual(["B"]);
    });
  });

  describe("detectCircularDependencies", () => {
    it("returns empty for acyclic graph", () => {
      const graph = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", []],
      ]);
      expect(detectCircularDependencies(graph)).toHaveLength(0);
    });

    it("detects simple cycle", () => {
      const graph = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["A"]],
      ]);
      const cycles = detectCircularDependencies(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it("detects longer cycle", () => {
      const graph = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]],
      ]);
      const cycles = detectCircularDependencies(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it("returns empty for disconnected acyclic nodes", () => {
      const graph = new Map<string, string[]>([
        ["A", []],
        ["B", []],
        ["C", []],
      ]);
      expect(detectCircularDependencies(graph)).toHaveLength(0);
    });
  });

  describe("topologicalSort", () => {
    it("assigns wave 1 to features with no dependencies", () => {
      const features = [
        makeFeature({ id: "A" }),
        makeFeature({ id: "B" }),
      ];
      const graph = buildDependencyGraph(features);
      const waves = topologicalSort(features, graph);

      expect(waves.get("A")).toBe(1);
      expect(waves.get("B")).toBe(1);
    });

    it("assigns higher waves to dependent features", () => {
      const features = [
        makeFeature({ id: "A" }),
        makeFeature({ id: "B", dependencies: ["A"] }),
        makeFeature({ id: "C", dependencies: ["B"] }),
      ];
      const graph = buildDependencyGraph(features);
      const waves = topologicalSort(features, graph);

      expect(waves.get("A")).toBe(1);
      expect(waves.get("B")).toBe(2);
      expect(waves.get("C")).toBe(3);
    });

    it("groups parallel features in same wave", () => {
      const features = [
        makeFeature({ id: "A" }),
        makeFeature({ id: "B", dependencies: ["A"] }),
        makeFeature({ id: "C", dependencies: ["A"] }),
      ];
      const graph = buildDependencyGraph(features);
      const waves = topologicalSort(features, graph);

      expect(waves.get("B")).toBe(2);
      expect(waves.get("C")).toBe(2);
    });

    it("takes max dependency wave for multiple deps", () => {
      const features = [
        makeFeature({ id: "A" }),
        makeFeature({ id: "B", dependencies: ["A"] }),
        makeFeature({ id: "C", dependencies: ["A", "B"] }),
      ];
      const graph = buildDependencyGraph(features);
      const waves = topologicalSort(features, graph);

      expect(waves.get("C")).toBe(3); // max(wave(A)=1, wave(B)=2) + 1
    });
  });

  describe("sortFeaturesInWave", () => {
    it("sorts by priority (P0 > P1 > P2)", () => {
      const features = [
        makeFeature({ id: "C", priority: "P2" }),
        makeFeature({ id: "A", priority: "P0" }),
        makeFeature({ id: "B", priority: "P1" }),
      ];
      const sorted = sortFeaturesInWave(features);
      expect(sorted.map((f) => f.id)).toEqual(["A", "B", "C"]);
    });

    it("breaks tie by dependency count (higher first)", () => {
      const features = [
        makeFeature({ id: "A", priority: "P0", dependencyCount: 1 }),
        makeFeature({ id: "B", priority: "P0", dependencyCount: 5 }),
      ];
      const sorted = sortFeaturesInWave(features);
      expect(sorted.map((f) => f.id)).toEqual(["B", "A"]);
    });

    it("breaks tie by size (S > M > L > XL)", () => {
      const features = [
        makeFeature({ id: "A", priority: "P0", dependencyCount: 0, size: "L" }),
        makeFeature({ id: "B", priority: "P0", dependencyCount: 0, size: "S" }),
      ];
      const sorted = sortFeaturesInWave(features);
      expect(sorted.map((f) => f.id)).toEqual(["B", "A"]);
    });

    it("breaks final tie by ID (alphabetical)", () => {
      const features = [
        makeFeature({ id: "C", priority: "P0", dependencyCount: 0, size: "M" }),
        makeFeature({ id: "A", priority: "P0", dependencyCount: 0, size: "M" }),
      ];
      const sorted = sortFeaturesInWave(features);
      expect(sorted.map((f) => f.id)).toEqual(["A", "C"]);
    });

    it("does not mutate original array", () => {
      const features = [
        makeFeature({ id: "B", priority: "P1" }),
        makeFeature({ id: "A", priority: "P0" }),
      ];
      sortFeaturesInWave(features);
      expect(features[0].id).toBe("B"); // unchanged
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-plan-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads plan", () => {
      const plan = {
        status: "generated" as const,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waves: [],
        circularDependencies: [],
      };
      savePlan(tmpDir, plan);

      const loaded = loadPlan(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe("generated");
    });

    it("returns null when no plan exists", () => {
      expect(loadPlan(tmpDir)).toBeNull();
    });

    it("creates .framework directory if missing", () => {
      const plan = {
        status: "generated" as const,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waves: [],
        circularDependencies: [],
      };
      savePlan(tmpDir, plan);
      expect(fs.existsSync(path.join(tmpDir, ".framework"))).toBe(true);
    });
  });
});
