/**
 * Tests for github-engine.ts
 *
 * Uses setGhExecutor() to inject mock gh CLI responses.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  extractIssueNumber,
  syncPlanToGitHub,
  closeTaskIssue,
  labelTaskIssue,
  syncStatusFromGitHub,
  listAllIssues,
  isGhAvailable,
  configureProjectBoard,
  setGhExecutor,
  setSleepFn,
  type GhExecutor,
} from "./github-engine.js";
import {
  createSyncState,
  saveSyncState,
  loadSyncState,
} from "./github-model.js";
import { type PlanState, type Feature, type Wave, decomposeFeature } from "./plan-model.js";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

let tmpDir: string;
let restoreExecutor: () => void;

function createTestPlan(): PlanState {
  const features: Feature[] = [
    {
      id: "FEAT-001",
      name: "User Login",
      priority: "P0",
      size: "M",
      type: "common",
      dependencies: [],
      dependencyCount: 3,
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
  ];

  const waves: Wave[] = [
    {
      number: 1,
      phase: "common",
      layer: 1,
      title: "Auth Foundation",
      features: [features[0]],
    },
    {
      number: 2,
      phase: "individual",
      title: "Wave 1",
      features: [features[1]],
    },
  ];

  const tasks = features.flatMap((f) => decomposeFeature(f));

  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves,
    tasks,
    circularDependencies: [],
  };
}

function mockGh(
  handler: (args: string[]) => string,
): () => void {
  const executor: GhExecutor = async (args) => handler(args);
  return setGhExecutor(executor);
}

function mockGhWithErrors(
  handler: (args: string[]) => string | Error,
): () => void {
  const executor: GhExecutor = async (args) => {
    const result = handler(args);
    if (result instanceof Error) throw result;
    return result;
  };
  return setGhExecutor(executor);
}

// ─────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────

let restoreSleep: () => void;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-engine-test-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  // Disable sleep in tests to avoid timeouts
  restoreSleep = setSleepFn(async () => {});
});

afterEach(() => {
  if (restoreExecutor) restoreExecutor();
  restoreSleep();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// extractIssueNumber
// ─────────────────────────────────────────────

describe("extractIssueNumber", () => {
  it("extracts number from GitHub URL", () => {
    expect(
      extractIssueNumber(
        "https://github.com/watchout/wbs/issues/42",
      ),
    ).toBe(42);
  });

  it("extracts number from URL with trailing newline", () => {
    expect(
      extractIssueNumber(
        "https://github.com/owner/repo/issues/123\n",
      ),
    ).toBe(123);
  });

  it("throws for invalid output", () => {
    expect(() => extractIssueNumber("no url here")).toThrow(
      "Could not extract issue number",
    );
  });
});

// ─────────────────────────────────────────────
// isGhAvailable
// ─────────────────────────────────────────────

describe("isGhAvailable", () => {
  it("returns true when gh responds", async () => {
    restoreExecutor = mockGh(() => "");
    expect(await isGhAvailable()).toBe(true);
  });

  it("returns false when gh throws", async () => {
    restoreExecutor = mockGhWithErrors(() => new Error("not found"));
    expect(await isGhAvailable()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// syncPlanToGitHub
// ─────────────────────────────────────────────

describe("syncPlanToGitHub", () => {
  it("creates parent and task issues for each feature", async () => {
    let issueCounter = 0;
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCounter++;
        return `https://github.com/owner/repo/issues/${issueCounter}`;
      }
      return "";
    });

    const plan = createTestPlan();
    const result = await syncPlanToGitHub(tmpDir, plan, {
      repo: "owner/repo",
    });

    // 2 features → 2 parent issues + 6 tasks each = 14 issues
    expect(result.created).toBe(14);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify sync state was saved
    const syncState = loadSyncState(tmpDir);
    expect(syncState).not.toBeNull();
    expect(syncState!.repo).toBe("owner/repo");
    expect(syncState!.featureIssues).toHaveLength(2);
    expect(syncState!.featureIssues[0].featureId).toBe("FEAT-001");
    expect(syncState!.featureIssues[0].parentIssueNumber).toBe(1);
    expect(syncState!.featureIssues[0].taskIssues).toHaveLength(6);
  });

  it("skips already synced features (idempotent)", async () => {
    // Pre-populate sync state
    const existingState = createSyncState("owner/repo");
    existingState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
          { taskId: "FEAT-001-API", issueNumber: 12 },
          { taskId: "FEAT-001-UI", issueNumber: 13 },
          { taskId: "FEAT-001-INTEGRATION", issueNumber: 14 },
          { taskId: "FEAT-001-REVIEW", issueNumber: 15 },
          { taskId: "FEAT-001-TEST", issueNumber: 16 },
        ],
      },
    ];
    saveSyncState(tmpDir, existingState);

    let issueCounter = 100;
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCounter++;
        return `https://github.com/owner/repo/issues/${issueCounter}`;
      }
      return "";
    });

    const plan = createTestPlan();
    const result = await syncPlanToGitHub(tmpDir, plan, {
      repo: "owner/repo",
    });

    // FEAT-001 skipped (1 parent + 6 tasks = 7), FEAT-002 created (1 parent + 6 tasks = 7)
    expect(result.skipped).toBe(7);
    expect(result.created).toBe(7);
    expect(result.errors).toHaveLength(0);
  });

  it("reports error when repo cannot be detected", async () => {
    // No repo option and no git remote → detectRepoSlug fails
    // setGhExecutor doesn't affect git commands, but detectRepoSlug uses execFileAsync directly
    // So we just don't provide repo option and work in a non-git tmpDir
    const plan = createTestPlan();
    const result = await syncPlanToGitHub(tmpDir, plan);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Could not detect GitHub repository");
  });

  it("handles gh CLI errors gracefully per feature", async () => {
    let callCount = 0;
    restoreExecutor = mockGhWithErrors((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        callCount++;
        if (callCount === 1) {
          return new Error("rate limited");
        }
        return `https://github.com/owner/repo/issues/${callCount}`;
      }
      return "";
    });

    const feature: Feature = {
      id: "FEAT-001",
      name: "Test",
      priority: "P0",
      size: "S",
      type: "common",
      dependencies: [],
      dependencyCount: 0,
    };
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          layer: 1,
          title: "Wave 1",
          features: [feature],
        },
      ],
      tasks: decomposeFeature(feature),
      circularDependencies: [],
    };

    const result = await syncPlanToGitHub(tmpDir, plan, {
      repo: "owner/repo",
    });

    // First feature parent creation fails, error logged
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("records progress callback", async () => {
    let issueCounter = 0;
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCounter++;
        return `https://github.com/owner/repo/issues/${issueCounter}`;
      }
      return "";
    });

    const messages: string[] = [];
    const feature: Feature = {
      id: "F-001",
      name: "X",
      priority: "P0",
      size: "S",
      type: "common",
      dependencies: [],
      dependencyCount: 0,
    };
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "Wave 1",
          features: [feature],
        },
      ],
      tasks: decomposeFeature(feature),
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, {
      repo: "owner/repo",
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("[created]");
  });

  it("parent issue body contains SSOT path reference", async () => {
    const capturedBodies: string[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        const bodyIdx = args.indexOf("--body");
        if (bodyIdx >= 0) {
          capturedBodies.push(args[bodyIdx + 1]);
        }
        return `https://github.com/owner/repo/issues/${capturedBodies.length}`;
      }
      return "";
    });

    const feature: Feature = {
      id: "FEAT-100",
      name: "User Login",
      priority: "P0",
      size: "S",
      type: "common",
      dependencies: [],
      dependencyCount: 0,
    };
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [feature],
        },
      ],
      tasks: decomposeFeature(feature),
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, { repo: "o/r" });

    // First body = parent issue
    expect(capturedBodies[0]).toContain("### SSOT Reference");
    expect(capturedBodies[0]).toContain(
      "docs/design/features/common/FEAT-100_user_login.md",
    );
  });

  it("task issue body contains SSOT path, branch, and dependencies per spec", async () => {
    const capturedBodies: string[] = [];
    const capturedTitles: string[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        const bodyIdx = args.indexOf("--body");
        if (bodyIdx >= 0) {
          capturedBodies.push(args[bodyIdx + 1]);
        }
        const titleIdx = args.indexOf("--title");
        if (titleIdx >= 0) {
          capturedTitles.push(args[titleIdx + 1]);
        }
        return `https://github.com/owner/repo/issues/${capturedBodies.length}`;
      }
      return "";
    });

    const feature: Feature = {
      id: "FEAT-050",
      name: "Payment Processing",
      priority: "P0",
      size: "M",
      type: "proprietary",
      dependencies: [],
      dependencyCount: 0,
    };
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [feature],
        },
      ],
      tasks: decomposeFeature(feature),
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, { repo: "o/r" });

    // capturedBodies[0] = parent issue, [1] = DB task, [2] = API task, etc.
    const dbBody = capturedBodies[1];
    expect(dbBody).toBeDefined();

    // SSOT Reference section (per spec: full path + section)
    expect(dbBody).toContain("### SSOT Reference");
    expect(dbBody).toContain(
      "docs/design/features/project/FEAT-050_payment_processing.md",
    );
    expect(dbBody).toContain("Section: §4");

    // Summary section (per spec)
    expect(dbBody).toContain("### Summary");

    // Definition of Done (per spec)
    expect(dbBody).toContain("### Definition of Done");
    expect(dbBody).toContain("Migration file created");

    // Branch section (per spec: feature/FEAT-XXX-db)
    expect(dbBody).toContain("### Branch");
    expect(dbBody).toContain("`feature/feat-050-db`");

    // Dependencies section (per spec: Blocked by / Blocks)
    expect(dbBody).toContain("### Dependencies");
    expect(dbBody).toContain("- Blocked by:");
    expect(dbBody).toContain("- Blocks:");
  });

  it("verifies issue body contains feature checklist", async () => {
    const capturedBodies: string[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        // Capture --body argument
        const bodyIdx = args.indexOf("--body");
        if (bodyIdx >= 0) {
          capturedBodies.push(args[bodyIdx + 1]);
        }
        return `https://github.com/owner/repo/issues/${capturedBodies.length}`;
      }
      return "";
    });

    const feature: Feature = {
      id: "FEAT-X",
      name: "Test Feature",
      priority: "P0",
      size: "S",
      type: "common",
      dependencies: [],
      dependencyCount: 0,
    };
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [feature],
        },
      ],
      tasks: decomposeFeature(feature),
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, { repo: "o/r" });

    // First body is the parent issue — should contain task checklist
    expect(capturedBodies.length).toBeGreaterThan(0);
    expect(capturedBodies[0]).toContain("## Tasks");
    expect(capturedBodies[0]).toContain("FEAT-X-DB");
  });

  it("recovers from partial failure: re-run creates only missing task issues", async () => {
    // Simulate partial failure: parent + 2 tasks were created, then process crashed.
    // Sync state was saved incrementally, so it has parent + 2 task mappings.
    const existingState = createSyncState("owner/repo");
    existingState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
          { taskId: "FEAT-001-API", issueNumber: 12 },
        ],
      },
    ];
    saveSyncState(tmpDir, existingState);

    let issueCounter = 20;
    const createdTitles: string[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCounter++;
        const titleIdx = args.indexOf("--title");
        if (titleIdx >= 0) createdTitles.push(args[titleIdx + 1]);
        return `https://github.com/owner/repo/issues/${issueCounter}`;
      }
      return "";
    });

    const plan = createTestPlan();
    const result = await syncPlanToGitHub(tmpDir, plan, {
      repo: "owner/repo",
    });

    // FEAT-001: parent reused (not counted), DB skipped, API skipped, 4 remaining tasks created
    // FEAT-002: parent + 6 tasks created = 7
    expect(result.skipped).toBe(2); // DB + API
    expect(result.created).toBe(11); // 4 remaining FEAT-001 tasks + 7 FEAT-002

    // Verify DB and API were NOT re-created
    expect(createdTitles).not.toContain(expect.stringContaining("FEAT-001-DB"));
    expect(createdTitles).not.toContain(expect.stringContaining("FEAT-001-API"));

    // Verify sync state is complete
    const syncState = loadSyncState(tmpDir);
    const feat001 = syncState!.featureIssues.find((f) => f.featureId === "FEAT-001");
    expect(feat001!.taskIssues).toHaveLength(6);
    expect(feat001!.parentIssueNumber).toBe(10);
  });

  it("saves sync state incrementally after each issue creation", async () => {
    let issueCounter = 0;
    let saveCount = 0;
    const originalLoadSyncState = loadSyncState;

    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCounter++;
        // Check that sync state has been saved after previous creation
        if (issueCounter > 1) {
          const state = originalLoadSyncState(tmpDir);
          if (state && state.featureIssues.length > 0) {
            saveCount++;
          }
        }
        return `https://github.com/owner/repo/issues/${issueCounter}`;
      }
      return "";
    });

    const features: Feature[] = [
      {
        id: "FEAT-010",
        name: "Test",
        priority: "P0",
        size: "S",
        type: "common",
        dependencies: [],
        dependencyCount: 0,
      },
    ];
    const tasks = features.flatMap((f) => decomposeFeature(f));
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        { number: 1, phase: "common", title: "W1", features },
      ],
      tasks,
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, { repo: "o/r" });

    // After parent creation (issue #1), sync state should be saved.
    // Then after each of the 6 task creations, sync state is saved again.
    // So when issue #2 is created, we should see the parent already in sync state.
    expect(saveCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// closeTaskIssue
// ─────────────────────────────────────────────

describe("closeTaskIssue", () => {
  it("closes issue via gh CLI", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    const closedIssues: number[] = [];
    restoreExecutor = mockGh((args) => {
      if (args.includes("close")) {
        closedIssues.push(parseInt(args[args.indexOf("close") + 1], 10));
      }
      return "";
    });

    const result = await closeTaskIssue(tmpDir, "FEAT-001-DB");
    expect(result.closed).toBe(true);
    expect(closedIssues).toContain(11);
  });

  it("returns error when no sync state exists", async () => {
    const result = await closeTaskIssue(tmpDir, "FEAT-001-DB");
    expect(result.closed).toBe(false);
    expect(result.error).toBe("No sync state");
  });

  it("returns error when task has no mapping", async () => {
    const syncState = createSyncState("owner/repo");
    saveSyncState(tmpDir, syncState);

    const result = await closeTaskIssue(tmpDir, "FEAT-999-DB");
    expect(result.closed).toBe(false);
    expect(result.error).toContain("No issue mapping");
  });

  it("handles gh CLI failure gracefully", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGhWithErrors(() => new Error("network error"));

    const result = await closeTaskIssue(tmpDir, "FEAT-001-DB");
    expect(result.closed).toBe(false);
    expect(result.error).toContain("network error");
  });
});

// ─────────────────────────────────────────────
// labelTaskIssue
// ─────────────────────────────────────────────

describe("labelTaskIssue", () => {
  it("adds label to issue via gh CLI", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    const editedIssues: { number: number; label: string }[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "edit") {
        const num = parseInt(args[2], 10);
        const labelIdx = args.indexOf("--add-label");
        const label = labelIdx >= 0 ? args[labelIdx + 1] : "";
        editedIssues.push({ number: num, label });
      }
      return "";
    });

    const result = await labelTaskIssue(tmpDir, "FEAT-001-DB", "failed");
    expect(result.labeled).toBe(true);
    expect(editedIssues).toContainEqual({ number: 11, label: "failed" });
  });

  it("returns error when no sync state exists", async () => {
    const result = await labelTaskIssue(tmpDir, "FEAT-001-DB", "failed");
    expect(result.labeled).toBe(false);
    expect(result.error).toBe("No sync state");
  });

  it("returns error when task has no mapping", async () => {
    const syncState = createSyncState("owner/repo");
    saveSyncState(tmpDir, syncState);

    const result = await labelTaskIssue(tmpDir, "FEAT-999-DB", "failed");
    expect(result.labeled).toBe(false);
    expect(result.error).toContain("No issue mapping");
  });

  it("handles gh CLI failure gracefully", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGhWithErrors((args) => {
      if (args[0] === "issue" && args[1] === "edit") {
        return new Error("network error");
      }
      return "";
    });

    const result = await labelTaskIssue(tmpDir, "FEAT-001-DB", "failed");
    expect(result.labeled).toBe(false);
    expect(result.error).toContain("network error");
  });
});

// ─────────────────────────────────────────────
// syncStatusFromGitHub
// ─────────────────────────────────────────────

describe("listAllIssues", () => {
  it("fetches all issues in a single batch call", async () => {
    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "list" && args.includes("--state")) {
        return JSON.stringify([
          { number: 1, title: "Issue 1", state: "OPEN", labels: [{ name: "bug" }] },
          { number: 2, title: "Issue 2", state: "CLOSED", labels: [] },
        ]);
      }
      return "";
    });

    const issues = await listAllIssues("owner/repo");
    expect(issues).toHaveLength(2);
    expect(issues[0].state).toBe("open");
    expect(issues[1].state).toBe("closed");
    expect(issues[0].labels).toEqual(["bug"]);
  });

  it("throws on gh CLI failure", async () => {
    restoreExecutor = mockGhWithErrors(() => new Error("network error"));
    await expect(listAllIssues("owner/repo")).rejects.toThrow("network error");
  });
});

describe("syncStatusFromGitHub", () => {
  it("returns error when no sync state", async () => {
    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No GitHub sync state");
  });

  it("returns live task statuses with labels from GitHub via batch fetch", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
          { taskId: "FEAT-001-API", issueNumber: 12 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "list" && args.includes("--state")) {
        return JSON.stringify([
          { number: 10, title: "Feature", state: "OPEN", labels: [] },
          { number: 11, title: "DB Task", state: "CLOSED", labels: [] },
          { number: 12, title: "API Task", state: "OPEN", labels: [{ name: "failed" }] },
        ]);
      }
      return "";
    });

    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.updated).toBe(2);
    expect(result.issues).toHaveLength(2);

    const dbIssue = result.issues.find(i => i.taskId === "FEAT-001-DB");
    expect(dbIssue?.status).toBe("closed");
    expect(dbIssue?.labels).toEqual([]);

    const apiIssue = result.issues.find(i => i.taskId === "FEAT-001-API");
    expect(apiIssue?.status).toBe("open");
    expect(apiIssue?.labels).toEqual(["failed"]);
  });

  it("reports error for issues not found in batch results", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
          { taskId: "FEAT-001-API", issueNumber: 99 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "list" && args.includes("--state")) {
        return JSON.stringify([
          { number: 11, title: "DB Task", state: "CLOSED", labels: [] },
        ]);
      }
      return "";
    });

    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("#99");
    expect(result.errors[0]).toContain("not found in GitHub");
  });

  it("handles batch fetch failure gracefully", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11 },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGhWithErrors(() => new Error("network error"));

    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to fetch issues");
    expect(result.updated).toBe(0);
  });
});

// ─────────────────────────────────────────────
// configureProjectBoard
// ─────────────────────────────────────────────

describe("configureProjectBoard", () => {
  it("configures board columns via GraphQL", async () => {
    const graphqlCalls: string[] = [];
    restoreExecutor = mockGh((args) => {
      if (args[0] === "api" && args[1] === "graphql") {
        const query = args[3] ?? "";
        graphqlCalls.push(query);

        // Step 1: user query → project node ID
        if (query.includes("user(login:") && query.includes("projectV2(number:")) {
          return JSON.stringify({
            data: { user: { projectV2: { id: "PVT_abc123" } } },
          });
        }
        // Step 2: fields query → Status field ID
        if (query.includes("fields(first:")) {
          return JSON.stringify({
            data: {
              node: {
                fields: {
                  nodes: [
                    { id: "PVTSSF_status1", name: "Status" },
                    { id: "PVTF_title", name: "Title" },
                  ],
                },
              },
            },
          });
        }
        // Step 3: update mutation
        if (query.includes("updateProjectV2Field")) {
          return JSON.stringify({
            data: {
              updateProjectV2Field: {
                projectV2Field: {
                  id: "PVTSSF_status1",
                  name: "Status",
                  options: [
                    { id: "1", name: "Backlog" },
                    { id: "2", name: "Todo" },
                    { id: "3", name: "In Progress" },
                    { id: "4", name: "In Review" },
                    { id: "5", name: "Done" },
                  ],
                },
              },
            },
          });
        }
      }
      return "";
    });

    const result = await configureProjectBoard("owner/repo", 1);
    expect(result.configured).toBe(true);
    expect(graphqlCalls).toHaveLength(3);

    // Verify the update mutation includes all 5 columns
    const updateCall = graphqlCalls[2];
    expect(updateCall).toContain("Backlog");
    expect(updateCall).toContain("Todo");
    expect(updateCall).toContain("In Progress");
    expect(updateCall).toContain("In Review");
    expect(updateCall).toContain("Done");
  });

  it("falls back to organization query", async () => {
    let callCount = 0;
    restoreExecutor = mockGhWithErrors((args) => {
      if (args[0] === "api" && args[1] === "graphql") {
        const query = args[3] ?? "";
        callCount++;

        // First call (user query) fails
        if (callCount === 1 && query.includes("user(login:")) {
          return new Error("user not found");
        }
        // Second call (org query) succeeds
        if (query.includes("organization(login:")) {
          return JSON.stringify({
            data: { organization: { projectV2: { id: "PVT_org456" } } },
          });
        }
        // Fields query
        if (query.includes("fields(first:")) {
          return JSON.stringify({
            data: {
              node: {
                fields: {
                  nodes: [{ id: "PVTSSF_s2", name: "Status" }],
                },
              },
            },
          });
        }
        // Update mutation
        if (query.includes("updateProjectV2Field")) {
          return JSON.stringify({
            data: { updateProjectV2Field: { projectV2Field: { id: "PVTSSF_s2" } } },
          });
        }
      }
      return "";
    });

    const result = await configureProjectBoard("orgname/repo", 5);
    expect(result.configured).toBe(true);
  });

  it("returns error when Status field not found", async () => {
    restoreExecutor = mockGh((args) => {
      if (args[0] === "api" && args[1] === "graphql") {
        const query = args[3] ?? "";
        if (query.includes("user(login:")) {
          return JSON.stringify({
            data: { user: { projectV2: { id: "PVT_123" } } },
          });
        }
        if (query.includes("fields(first:")) {
          return JSON.stringify({
            data: {
              node: {
                fields: {
                  nodes: [{ id: "PVTF_title", name: "Title" }],
                },
              },
            },
          });
        }
      }
      return "";
    });

    const result = await configureProjectBoard("owner/repo", 1);
    expect(result.configured).toBe(false);
    expect(result.error).toContain("Status field not found");
  });

  it("handles GraphQL errors gracefully", async () => {
    restoreExecutor = mockGhWithErrors(() => new Error("GraphQL error"));

    const result = await configureProjectBoard("owner/repo", 1);
    expect(result.configured).toBe(false);
    expect(result.error).toContain("GraphQL error");
  });
});
