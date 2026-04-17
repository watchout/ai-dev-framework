import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  analyzeMigration,
  executeMigration,
  formatDryRunReport,
  formatApplyResult,
  type MigrationReport,
  type MigrationResult,
} from "./migrate-engine.js";
// findAlreadyMigrated is tested implicitly through command integration
import type { PlanState } from "./plan-model.js";
import { setGhExecutor } from "./github-engine.js";

// ─────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────

function makePlan(overrides?: Partial<PlanState>): PlanState {
  return {
    status: "generated",
    generatedAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    waves: [
      {
        number: 1,
        phase: "individual",
        title: "Wave 1",
        features: [
          {
            id: "FEAT-001",
            name: "User Login",
            priority: "P0",
            size: "M",
            type: "common",
            dependencies: [],
            dependencyCount: 0,
            ssotFile: "docs/design/features/common/AUTH-001_login.md",
          },
          {
            id: "FEAT-002",
            name: "Dashboard",
            priority: "P1",
            size: "L",
            type: "proprietary",
            dependencies: ["FEAT-001"],
            dependencyCount: 0,
          },
        ],
      },
    ],
    tasks: [
      {
        id: "FEAT-001-DB",
        featureId: "FEAT-001",
        kind: "db",
        name: "User Login - Database",
        references: ["§4"],
        blockedBy: [],
        blocks: ["FEAT-001-API"],
        size: "S",
        seq: "1000100010",
      },
      {
        id: "FEAT-001-API",
        featureId: "FEAT-001",
        kind: "api",
        name: "User Login - API",
        references: ["§5", "§7"],
        blockedBy: ["FEAT-001-DB"],
        blocks: [],
        size: "M",
        seq: "1000100020",
      },
    ],
    circularDependencies: [],
    ...overrides,
  };
}

function makeRunState() {
  return {
    status: "idle",
    currentTaskId: null,
    tasks: [
      { taskId: "FEAT-001-DB", status: "done" },
    ],
    startedAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  };
}

function makeBoilerplatePlan(): PlanState {
  return {
    ...makePlan(),
    waves: [
      {
        number: 1,
        phase: "individual",
        title: "Wave 1",
        features: [
          {
            id: "FEAT-EXAMPLE",
            name: "Example Feature (template placeholder)",
            priority: "P2",
            size: "S",
            type: "proprietary",
            dependencies: [],
            dependencyCount: 0,
          },
        ],
      },
    ],
    tasks: [
      {
        id: "FEAT-EXAMPLE-DB",
        featureId: "FEAT-EXAMPLE",
        kind: "db",
        name: "Example Feature - Database",
        references: ["§4"],
        blockedBy: [],
        blocks: [],
        size: "S",
      },
    ],
  };
}

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

let tmpDir: string;

function setupProjectDir(plan?: PlanState | null, runState?: unknown | null) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-migrate-"));
  const frameworkDir = path.join(tmpDir, ".framework");
  fs.mkdirSync(frameworkDir, { recursive: true });

  if (plan !== null && plan !== undefined) {
    fs.writeFileSync(
      path.join(frameworkDir, "plan.json"),
      JSON.stringify(plan, null, 2),
    );
  }

  if (runState !== null && runState !== undefined) {
    fs.writeFileSync(
      path.join(frameworkDir, "run-state.json"),
      JSON.stringify(runState, null, 2),
    );
  }

  return tmpDir;
}

function cleanupTmpDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────
// Tests: analyzeMigration
// ─────────────────────────────────────────────

describe("analyzeMigration", () => {
  afterEach(cleanupTmpDir);

  it("detects no files when directory is empty", () => {
    const dir = setupProjectDir(null, null);
    const report = analyzeMigration(dir);

    expect(report.planFile.exists).toBe(false);
    expect(report.runStateFile.exists).toBe(false);
    expect(report.toCreate).toHaveLength(0);
    expect(report.toSkip).toHaveLength(0);
  });

  it("counts features and tasks from plan.json", () => {
    const dir = setupProjectDir(makePlan());
    const report = analyzeMigration(dir);

    expect(report.planFile.exists).toBe(true);
    expect(report.planFile.featureCount).toBe(2);
    expect(report.planFile.taskCount).toBe(2);
    expect(report.planFile.isEmpty).toBe(false);
    expect(report.toCreate).toHaveLength(4);
  });

  it("detects run-state.json", () => {
    const dir = setupProjectDir(makePlan(), makeRunState());
    const report = analyzeMigration(dir);

    expect(report.runStateFile.exists).toBe(true);
    expect(report.runStateFile.taskCount).toBe(1);
  });

  it("skips boilerplate features and their tasks", () => {
    const dir = setupProjectDir(makeBoilerplatePlan());
    const report = analyzeMigration(dir);

    expect(report.toSkip).toHaveLength(2);
    expect(report.toCreate).toHaveLength(0);
    expect(report.toSkip[0].reason).toBe("scaffold boilerplate");
    expect(report.toSkip[1].reason).toBe("parent feature is boilerplate");
  });

  it("marks empty plan as isEmpty", () => {
    const emptyPlan = makePlan({
      waves: [],
      tasks: [],
    });
    const dir = setupProjectDir(emptyPlan);
    const report = analyzeMigration(dir);

    expect(report.planFile.isEmpty).toBe(true);
    expect(report.toCreate).toHaveLength(0);
  });

  it("detects already-migrated Issues and skips them", () => {
    const dir = setupProjectDir(makePlan());
    const alreadyMigrated = ["[FEAT-001] User Login"];
    const report = analyzeMigration(dir, alreadyMigrated);

    expect(report.alreadyMigrated).toHaveLength(1);
    expect(report.alreadyMigrated[0]).toBe("[FEAT-001] User Login");
    // FEAT-001 skipped, FEAT-002 + 2 tasks created
    expect(report.toCreate).toHaveLength(3);
  });

  it("handles malformed plan.json gracefully", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adf-migrate-"));
    const frameworkDir = path.join(tmpDir, ".framework");
    fs.mkdirSync(frameworkDir, { recursive: true });
    fs.writeFileSync(
      path.join(frameworkDir, "plan.json"),
      "{ invalid json }",
    );

    const report = analyzeMigration(tmpDir);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]).toContain("Failed to parse plan.json");
  });
});

// ─────────────────────────────────────────────
// Tests: executeMigration
// ─────────────────────────────────────────────

describe("executeMigration", () => {
  let ghCalls: string[][] = [];
  let restoreGh: () => void;

  beforeEach(() => {
    ghCalls = [];
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      if (args[0] === "issue" && args[1] === "create") {
        const num = ghCalls.length;
        return `https://github.com/test/repo/issues/${num}`;
      }
      return "";
    });
  });

  afterEach(() => {
    restoreGh();
    cleanupTmpDir();
  });

  it("creates Issues for features and tasks", async () => {
    const dir = setupProjectDir(makePlan(), makeRunState());
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.created).toHaveLength(4);
    expect(result.errors).toHaveLength(0);

    expect(result.created[0].title).toContain("FEAT-001");
    expect(result.created[0].title).toContain("User Login");

    const firstCall = ghCalls[0];
    expect(firstCall).toContain("issue");
    expect(firstCall).toContain("create");

    const bodyIdx = firstCall.indexOf("--body") + 1;
    const body = firstCall[bodyIdx];
    expect(body).toContain("adf-meta:begin");
    expect(body).toContain("adf-meta:end");
    expect(body).toContain('"type": "feature"');
    expect(body).toContain('"migratedFrom": "plan.json"');

    const labelIdx = firstCall.indexOf("--label") + 1;
    expect(firstCall[labelIdx]).toContain("migrated-from-plan-json");
  });

  it("backs up local files to .bak", async () => {
    const dir = setupProjectDir(makePlan(), makeRunState());
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.backedUp).toContain(".framework/plan.json");
    expect(result.backedUp).toContain(".framework/run-state.json");

    expect(
      fs.existsSync(path.join(dir, ".framework/plan.json")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(dir, ".framework/plan.json.bak")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(dir, ".framework/run-state.json.bak")),
    ).toBe(true);
  });

  it("skips boilerplate features", async () => {
    const dir = setupProjectDir(makeBoilerplatePlan());
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(ghCalls).toHaveLength(0);
  });

  it("handles gh CLI errors: aborts on first error", async () => {
    restoreGh();
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: not authenticated");
    });

    const dir = setupProjectDir(makePlan());
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("not authenticated");
    // Should not have created any Issues after the error
    expect(result.created).toHaveLength(0);
  });

  it("does NOT backup files when errors occur (retryable)", async () => {
    restoreGh();
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: rate limited");
    });

    const dir = setupProjectDir(makePlan(), makeRunState());
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.backedUp).toHaveLength(0);
    // Original files still exist (not renamed)
    expect(
      fs.existsSync(path.join(dir, ".framework/plan.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(dir, ".framework/run-state.json")),
    ).toBe(true);
  });

  it("does nothing when plan.json does not exist", async () => {
    const dir = setupProjectDir(null);
    const report = analyzeMigration(dir);
    const result = await executeMigration(dir, report);

    expect(result.created).toHaveLength(0);
    expect(result.backedUp).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// Tests: formatters
// ─────────────────────────────────────────────

describe("formatDryRunReport", () => {
  it("formats report with features and tasks", () => {
    const report: MigrationReport = {
      planFile: { exists: true, isEmpty: false, featureCount: 2, taskCount: 3 },
      runStateFile: { exists: true, isEmpty: false, taskCount: 1 },
      toCreate: [
        { type: "feature", id: "FEAT-001", title: "Login" },
        { type: "task", id: "FEAT-001-DB", title: "DB" },
      ],
      toSkip: [
        { type: "feature", id: "FEAT-EX", title: "Example", reason: "scaffold boilerplate" },
      ],
      alreadyMigrated: [],
      errors: [],
    };

    const output = formatDryRunReport(report);
    expect(output).toContain("Will create 2 Issues");
    expect(output).toContain("Will skip 1 items");
    expect(output).toContain("FEAT-001");
    expect(output).toContain("scaffold boilerplate");
  });

  it("formats empty migration report", () => {
    const report: MigrationReport = {
      planFile: { exists: false, isEmpty: true, featureCount: 0, taskCount: 0 },
      runStateFile: { exists: false, isEmpty: true, taskCount: 0 },
      toCreate: [],
      toSkip: [],
      alreadyMigrated: [],
      errors: [],
    };

    const output = formatDryRunReport(report);
    expect(output).toContain("not found");
    expect(output).toContain("No features or tasks to migrate");
  });
});

describe("formatApplyResult", () => {
  it("formats successful migration", () => {
    const result: MigrationResult = {
      created: [
        { number: 100, title: "[FEAT-001] Login", url: "https://github.com/test/issues/100" },
      ],
      skipped: [],
      backedUp: [".framework/plan.json"],
      errors: [],
    };

    const output = formatApplyResult(result);
    expect(output).toContain("Created 1 Issues");
    expect(output).toContain("#100");
    expect(output).toContain("Backed up 1 files");
    expect(output).toContain("Migration complete");
  });
});
