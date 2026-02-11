import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type PlanIO,
  runPlanEngine,
  parseFeaturesFromMarkdown,
  calculateDependencyCounts,
  generatePlanMarkdown,
} from "./plan-engine.js";
import { type Feature, loadPlan } from "./plan-model.js";

function createMockIO(): PlanIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

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

describe("plan-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-plan-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when no features are provided", async () => {
    const io = createMockIO();
    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features: [],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No features found");
  });

  it("generates plan from provided features", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "FEAT-001", name: "Login", type: "common" }),
      makeFeature({ id: "FEAT-002", name: "Dashboard", dependencies: ["FEAT-001"] }),
      makeFeature({ id: "FEAT-003", name: "Profile" }),
    ];

    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.plan.waves.length).toBeGreaterThan(0);
  });

  it("separates common features into Phase 1", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "AUTH-001", name: "Login", type: "common" }),
      makeFeature({ id: "FEAT-001", name: "Dashboard" }),
    ];

    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features,
    });

    const commonWave = result.plan.waves.find((w) => w.phase === "common");
    expect(commonWave).toBeDefined();
    expect(commonWave!.features[0].id).toBe("AUTH-001");
  });

  it("puts auth features in Layer 1", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "AUTH-001", name: "Login", type: "common" }),
      makeFeature({ id: "ACCT-001", name: "Signup", type: "common" }),
      makeFeature({ id: "NOTIF-001", name: "Notifications", type: "common" }),
    ];

    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features,
    });

    const authWave = result.plan.waves.find((w) => w.layer === 1);
    expect(authWave).toBeDefined();
    expect(authWave!.features).toHaveLength(2);

    const otherWave = result.plan.waves.find((w) => w.layer === 3);
    expect(otherWave).toBeDefined();
    expect(otherWave!.features[0].id).toBe("NOTIF-001");
  });

  it("creates waves based on dependencies", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "A", name: "Base Feature" }),
      makeFeature({ id: "B", name: "Depends on A", dependencies: ["A"] }),
      makeFeature({ id: "C", name: "Depends on B", dependencies: ["B"] }),
    ];

    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features,
    });

    const individualWaves = result.plan.waves.filter(
      (w) => w.phase === "individual",
    );
    expect(individualWaves.length).toBe(3);
  });

  it("detects circular dependencies", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "A", name: "Feature A", dependencies: ["B"] }),
      makeFeature({ id: "B", name: "Feature B", dependencies: ["A"] }),
    ];

    const result = await runPlanEngine({
      projectDir: tmpDir,
      io,
      features,
    });

    expect(result.plan.circularDependencies.length).toBeGreaterThan(0);
    expect(
      io.output.some((o) => o.includes("Circular")),
    ).toBe(true);
  });

  it("saves plan to .framework/plan.json", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "FEAT-001", name: "Login" }),
    ];

    await runPlanEngine({ projectDir: tmpDir, io, features });

    const plan = loadPlan(tmpDir);
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe("generated");
  });

  it("prints total features and tasks", async () => {
    const io = createMockIO();
    const features = [
      makeFeature({ id: "A", name: "Feature A" }),
      makeFeature({ id: "B", name: "Feature B" }),
    ];

    await runPlanEngine({ projectDir: tmpDir, io, features });

    expect(io.output.some((o) => o.includes("2 features"))).toBe(true);
    expect(io.output.some((o) => o.includes("~12"))).toBe(true);
  });
});

describe("parseFeaturesFromMarkdown", () => {
  it("parses feature table from markdown", () => {
    const markdown = `# Feature Catalog

| ID | Feature Name | Priority | Type | Size | Dependencies |
|----|-------------|----------|------|------|-------------|
| FEAT-001 | Login | P0 | common | M | None |
| FEAT-002 | Dashboard | P0 | proprietary | L | FEAT-001 |
| FEAT-003 | Profile | P1 | proprietary | S | FEAT-001 |
`;

    const features = parseFeaturesFromMarkdown(markdown);
    expect(features).toHaveLength(3);
    expect(features[0].id).toBe("FEAT-001");
    expect(features[0].priority).toBe("P0");
    expect(features[0].type).toBe("common");
    expect(features[0].size).toBe("M");
    expect(features[0].dependencies).toHaveLength(0);

    expect(features[1].dependencies).toEqual(["FEAT-001"]);
  });

  it("skips TBD rows", () => {
    const markdown = `
| ID | Feature Name | Priority | Type | Size | Dependencies |
|----|-------------|----------|------|------|-------------|
| TBD | TBD | P0 | TBD | TBD | None |
| FEAT-001 | Login | P0 | common | M | None |
`;
    const features = parseFeaturesFromMarkdown(markdown);
    expect(features).toHaveLength(1);
  });

  it("skips header rows", () => {
    const markdown = `
| ID | Feature Name | Priority | Type | Size | Dependencies |
|---|---|---|---|---|---|
| FEAT-001 | Login | P0 | common | M | None |
`;
    const features = parseFeaturesFromMarkdown(markdown);
    expect(features).toHaveLength(1);
  });

  it("handles multiple dependencies", () => {
    const markdown = `
| ID | Feature Name | Priority | Type | Size | Dependencies |
|----|-------------|----------|------|------|-------------|
| FEAT-003 | Reports | P0 | proprietary | L | FEAT-001, FEAT-002 |
`;
    const features = parseFeaturesFromMarkdown(markdown);
    expect(features[0].dependencies).toEqual(["FEAT-001", "FEAT-002"]);
  });

  it("returns empty for no table", () => {
    const features = parseFeaturesFromMarkdown("No table here");
    expect(features).toHaveLength(0);
  });
});

describe("calculateDependencyCounts", () => {
  it("counts how many features depend on each feature", () => {
    const features = [
      makeFeature({ id: "A" }),
      makeFeature({ id: "B", dependencies: ["A"] }),
      makeFeature({ id: "C", dependencies: ["A"] }),
      makeFeature({ id: "D", dependencies: ["B"] }),
    ];

    calculateDependencyCounts(features);

    expect(features[0].dependencyCount).toBe(2); // A: B and C depend on it
    expect(features[1].dependencyCount).toBe(1); // B: D depends on it
    expect(features[2].dependencyCount).toBe(0); // C: nothing depends on it
    expect(features[3].dependencyCount).toBe(0); // D: nothing depends on it
  });
});

describe("generatePlanMarkdown", () => {
  it("generates markdown with wave tables", () => {
    const plan = {
      status: "generated" as const,
      generatedAt: "2026-02-03T00:00:00Z",
      updatedAt: "2026-02-03T00:00:00Z",
      waves: [
        {
          number: 1,
          phase: "individual" as const,
          title: "Wave 1: Independent Features",
          features: [
            makeFeature({ id: "FEAT-001", name: "Login", priority: "P0", size: "M" }),
          ],
        },
      ],
      circularDependencies: [],
    };

    const md = generatePlanMarkdown(plan);
    expect(md).toContain("# Implementation Plan");
    expect(md).toContain("FEAT-001");
    expect(md).toContain("Login");
    expect(md).toContain("FEAT-001-DB");
    expect(md).toContain("FEAT-001-API");
  });

  it("includes circular dependency warnings", () => {
    const plan = {
      status: "generated" as const,
      generatedAt: "2026-02-03T00:00:00Z",
      updatedAt: "2026-02-03T00:00:00Z",
      waves: [],
      circularDependencies: [["A", "B", "C"]],
    };

    const md = generatePlanMarkdown(plan);
    expect(md).toContain("Circular Dependencies");
    expect(md).toContain("A -> B -> C -> A");
  });
});
