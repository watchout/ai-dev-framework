import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runResequence } from "./resequence-engine.js";
import { loadPlan, type Feature, type PlanState, type Task } from "./plan-model.js";

function feature(id: string, dependencies: string[] = []): Feature {
  return {
    id,
    name: id,
    priority: "P1",
    size: "M",
    type: "proprietary",
    dependencies,
    dependencyCount: 0,
  };
}

function task(
  id: string,
  featureId: string,
  options: Partial<Pick<Task, "seq" | "blockedBy" | "blocks">> = {},
): Task {
  return {
    id,
    featureId,
    kind: "api",
    name: id,
    references: [],
    blockedBy: options.blockedBy ?? [],
    blocks: options.blocks ?? [],
    size: "S",
    ...(options.seq ? { seq: options.seq } : {}),
  };
}

function plan(tasks: Task[], features: Feature[]): PlanState {
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

describe("runResequence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resequence-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("renumbers remaining tasks after task removal", async () => {
    writePlan(
      tmpDir,
      plan(
        [
          task("TASK-A", "FEAT-1", { seq: "9999999999" }),
          task("TASK-C", "FEAT-1", { seq: "9999999998" }),
        ],
        [feature("FEAT-1")],
      ),
    );

    const result = await runResequence(tmpDir);

    expect(result).toMatchObject({ ok: true, resequenced: 2, migrated: 0 });
    expect(readPlan(tmpDir).tasks?.map((t) => [t.id, t.seq])).toEqual([
      ["TASK-A", "1000100010"],
      ["TASK-C", "1000100020"],
    ]);
  });

  it("preserves task dependency chains while changing only sequence numbers", async () => {
    writePlan(
      tmpDir,
      plan(
        [
          task("TASK-A", "FEAT-1", { seq: "1", blocks: ["TASK-B"] }),
          task("TASK-B", "FEAT-1", {
            seq: "2",
            blockedBy: ["TASK-A"],
            blocks: ["TASK-C"],
          }),
          task("TASK-C", "FEAT-1", { seq: "3", blockedBy: ["TASK-B"] }),
        ],
        [feature("FEAT-1")],
      ),
    );

    await runResequence(tmpDir);

    expect(readPlan(tmpDir).tasks?.map((t) => ({
      id: t.id,
      blockedBy: t.blockedBy,
      blocks: t.blocks,
    }))).toEqual([
      { id: "TASK-A", blockedBy: [], blocks: ["TASK-B"] },
      { id: "TASK-B", blockedBy: ["TASK-A"], blocks: ["TASK-C"] },
      { id: "TASK-C", blockedBy: ["TASK-B"], blocks: [] },
    ]);
  });

  it("is idempotent when sequence numbers are already normalized", async () => {
    writePlan(
      tmpDir,
      plan(
        [
          task("TASK-A", "FEAT-1", { seq: "1000100010" }),
          task("TASK-B", "FEAT-1", { seq: "1000100020" }),
        ],
        [feature("FEAT-1")],
      ),
    );

    const first = await runResequence(tmpDir);
    const afterFirst = readPlan(tmpDir).tasks?.map((t) => t.seq);
    const second = await runResequence(tmpDir);
    const afterSecond = readPlan(tmpDir).tasks?.map((t) => t.seq);

    expect(first.resequenced).toBe(0);
    expect(second.resequenced).toBe(0);
    expect(afterSecond).toEqual(afterFirst);
  });

  it("warns when migration candidates have no seq and --migrate is not used", async () => {
    writePlan(
      tmpDir,
      plan(
        [
          task("TASK-A", "FEAT-1"),
          task("TASK-B", "FEAT-1", { seq: "1000100020" }),
        ],
        [feature("FEAT-1")],
      ),
    );

    const result = await runResequence(tmpDir);

    expect(result.ok).toBe(true);
    expect(result.migrated).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("1 件のタスクに seq がありません");
    expect(readPlan(tmpDir).tasks?.map((t) => t.seq)).toEqual([
      "1000100010",
      "1000100020",
    ]);
  });

  it("counts migrated tasks when --migrate is enabled", async () => {
    writePlan(
      tmpDir,
      plan(
        [
          task("TASK-A", "FEAT-1"),
          task("TASK-B", "FEAT-1"),
        ],
        [feature("FEAT-1")],
      ),
    );

    const result = await runResequence(tmpDir, true);

    expect(result).toMatchObject({
      ok: true,
      resequenced: 2,
      migrated: 2,
      warnings: [],
    });
    expect(readPlan(tmpDir).tasks?.map((t) => t.seq)).toEqual([
      "1000100010",
      "1000100020",
    ]);
  });

  it("handles an empty plan", async () => {
    writePlan(tmpDir, plan([], []));

    const result = await runResequence(tmpDir);

    expect(result).toMatchObject({
      ok: true,
      resequenced: 0,
      migrated: 0,
      warnings: [],
    });
    expect(readPlan(tmpDir).tasks).toEqual([]);
  });

  it("handles a single-task plan", async () => {
    writePlan(tmpDir, plan([task("ONLY", "FEAT-1")], [feature("FEAT-1")]));

    const result = await runResequence(tmpDir, true);

    expect(result).toMatchObject({ ok: true, resequenced: 1, migrated: 1 });
    expect(readPlan(tmpDir).tasks?.map((t) => t.seq)).toEqual(["1000100010"]);
  });

  it("preserves circular dependency references", async () => {
    const state = plan(
      [
        task("TASK-A", "FEAT-A", {
          seq: "1",
          blockedBy: ["TASK-B"],
          blocks: ["TASK-B"],
        }),
        task("TASK-B", "FEAT-B", {
          seq: "2",
          blockedBy: ["TASK-A"],
          blocks: ["TASK-A"],
        }),
      ],
      [feature("FEAT-A", ["FEAT-B"]), feature("FEAT-B", ["FEAT-A"])],
    );
    state.circularDependencies = [["FEAT-A", "FEAT-B"]];
    writePlan(tmpDir, state);

    await runResequence(tmpDir);
    const updated = readPlan(tmpDir);

    expect(updated.circularDependencies).toEqual([["FEAT-A", "FEAT-B"]]);
    expect(updated.waves[0].features.map((f) => [f.id, f.dependencies])).toEqual([
      ["FEAT-A", ["FEAT-B"]],
      ["FEAT-B", ["FEAT-A"]],
    ]);
    expect(updated.tasks?.map((t) => [t.id, t.blockedBy, t.blocks])).toEqual([
      ["TASK-A", ["TASK-B"], ["TASK-B"]],
      ["TASK-B", ["TASK-A"], ["TASK-A"]],
    ]);
  });

  it("returns an error when plan.json is missing", async () => {
    const result = await runResequence(tmpDir);

    expect(result).toMatchObject({
      ok: false,
      error: "plan.json が見つかりません。先に shirube plan を実行してください。",
      resequenced: 0,
      migrated: 0,
      warnings: [],
    });
  });
});
