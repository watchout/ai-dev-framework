import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pruneTask } from "./prune-engine.js";
import { loadPlan, type Feature, type PlanState, type Task } from "./plan-model.js";

function feature(id: string): Feature {
  return {
    id,
    name: id,
    priority: "P1",
    size: "M",
    type: "proprietary",
    dependencies: [],
    dependencyCount: 0,
  };
}

function task(id: string, featureId = "FEAT-1", seq?: string): Task {
  return {
    id,
    featureId,
    kind: "api",
    name: id,
    references: [],
    blockedBy: [],
    blocks: [],
    size: "S",
    ...(seq ? { seq } : {}),
  };
}

function plan(tasks: Task[], features = [feature("FEAT-1")]): PlanState {
  return {
    status: "generated",
    generatedAt: "2026-02-03T00:00:00.000Z",
    updatedAt: "2026-02-03T00:00:00.000Z",
    waves: [
      {
        number: 1,
        phase: "individual",
        title: "Wave 1",
        features,
      },
    ],
    tasks,
    circularDependencies: [],
  };
}

function writePlan(projectDir: string, state: PlanState): void {
  const frameworkDir = path.join(projectDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });
  fs.writeFileSync(
    path.join(frameworkDir, "plan.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

function readPlan(projectDir: string): PlanState {
  const state = loadPlan(projectDir);
  if (!state) throw new Error("plan was not written");
  return state;
}

describe("pruneTask", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes selected completed task ids from plan.json", async () => {
    writePlan(tmpDir, plan([task("TASK-1"), task("TASK-2"), task("TASK-3")]));

    const result = await pruneTask(tmpDir, ["TASK-2"]);

    expect(result).toMatchObject({ ok: true, removed: ["TASK-2"], notFound: [] });
    expect(readPlan(tmpDir).tasks?.map((t) => t.id)).toEqual(["TASK-1", "TASK-3"]);
  });

  it("preserves pending tasks that were not requested", async () => {
    writePlan(tmpDir, plan([task("DONE"), task("PENDING-A"), task("PENDING-B")]));

    await pruneTask(tmpDir, ["DONE"]);

    expect(readPlan(tmpDir).tasks?.map((t) => t.id)).toEqual([
      "PENDING-A",
      "PENDING-B",
    ]);
  });

  it("is idempotent when the same task is pruned twice", async () => {
    writePlan(tmpDir, plan([task("DONE"), task("PENDING")]));

    const first = await pruneTask(tmpDir, ["DONE"]);
    const second = await pruneTask(tmpDir, ["DONE"]);

    expect(first.removed).toEqual(["DONE"]);
    expect(second).toMatchObject({ ok: true, removed: [], notFound: ["DONE"] });
    expect(readPlan(tmpDir).tasks?.map((t) => t.id)).toEqual(["PENDING"]);
  });

  it("handles an empty plan without mutating waves", async () => {
    writePlan(
      tmpDir,
      plan([], []),
    );

    const result = await pruneTask(tmpDir, ["MISSING"]);

    expect(result).toMatchObject({ ok: true, removed: [], notFound: ["MISSING"] });
    expect(readPlan(tmpDir).tasks).toEqual([]);
    expect(readPlan(tmpDir).waves[0].features).toEqual([]);
  });

  it("removes the only task in a single-task plan and drops the empty feature", async () => {
    writePlan(tmpDir, plan([task("ONLY")]));

    const result = await pruneTask(tmpDir, ["ONLY"]);
    const updated = readPlan(tmpDir);

    expect(result.removed).toEqual(["ONLY"]);
    expect(updated.tasks).toEqual([]);
    expect(updated.waves[0].features).toEqual([]);
  });

  it("handles plans with completed tasks only", async () => {
    writePlan(tmpDir, plan([task("DONE-A"), task("DONE-B")]));

    const result = await pruneTask(tmpDir, ["DONE-A", "DONE-B"]);
    const updated = readPlan(tmpDir);

    expect(result).toMatchObject({
      ok: true,
      removed: ["DONE-A", "DONE-B"],
      notFound: [],
    });
    expect(updated.tasks).toEqual([]);
    expect(updated.waves[0].features).toEqual([]);
  });

  it("does not remove a feature while any task for that feature remains", async () => {
    const features = [feature("FEAT-1"), feature("FEAT-2")];
    writePlan(
      tmpDir,
      plan(
        [
          task("FEAT-1-DONE", "FEAT-1"),
          task("FEAT-1-PENDING", "FEAT-1"),
          task("FEAT-2-DONE", "FEAT-2"),
        ],
        features,
      ),
    );

    await pruneTask(tmpDir, ["FEAT-1-DONE", "FEAT-2-DONE"]);

    expect(readPlan(tmpDir).waves[0].features.map((f) => f.id)).toEqual(["FEAT-1"]);
  });

  it("returns an error when plan.json is missing", async () => {
    const result = await pruneTask(tmpDir, ["TASK-1"]);

    expect(result).toMatchObject({
      ok: false,
      error: "plan.json が見つかりません。",
      removed: [],
      notFound: [],
    });
  });
});
