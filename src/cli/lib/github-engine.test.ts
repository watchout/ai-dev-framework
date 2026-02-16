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
  syncStatusFromGitHub,
  isGhAvailable,
  setGhExecutor,
  type GhExecutor,
} from "./github-engine.js";
import {
  createSyncState,
  saveSyncState,
  loadSyncState,
} from "./github-model.js";
import type { PlanState, Feature, Wave } from "./plan-model.js";

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

  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    waves,
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-engine-test-"));
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
});

afterEach(() => {
  if (restoreExecutor) restoreExecutor();
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
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
          { taskId: "FEAT-001-API", issueNumber: 12, status: "open" },
          { taskId: "FEAT-001-UI", issueNumber: 13, status: "open" },
          { taskId: "FEAT-001-INTEGRATION", issueNumber: 14, status: "open" },
          { taskId: "FEAT-001-REVIEW", issueNumber: 15, status: "open" },
          { taskId: "FEAT-001-TEST", issueNumber: 16, status: "open" },
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
          features: [
            {
              id: "FEAT-001",
              name: "Test",
              priority: "P0",
              size: "S",
              type: "common",
              dependencies: [],
              dependencyCount: 0,
            },
          ],
        },
      ],
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
    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "Wave 1",
          features: [
            {
              id: "F-001",
              name: "X",
              priority: "P0",
              size: "S",
              type: "common",
              dependencies: [],
              dependencyCount: 0,
            },
          ],
        },
      ],
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

    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [
            {
              id: "FEAT-100",
              name: "User Login",
              priority: "P0",
              size: "S",
              type: "common",
              dependencies: [],
              dependencyCount: 0,
            },
          ],
        },
      ],
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

    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [
            {
              id: "FEAT-050",
              name: "Payment Processing",
              priority: "P0",
              size: "M",
              type: "proprietary",
              dependencies: [],
              dependencyCount: 0,
            },
          ],
        },
      ],
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

    const plan: PlanState = {
      status: "generated",
      generatedAt: "",
      updatedAt: "",
      waves: [
        {
          number: 1,
          phase: "common",
          title: "W1",
          features: [
            {
              id: "FEAT-X",
              name: "Test Feature",
              priority: "P0",
              size: "S",
              type: "common",
              dependencies: [],
              dependencyCount: 0,
            },
          ],
        },
      ],
      circularDependencies: [],
    };

    await syncPlanToGitHub(tmpDir, plan, { repo: "o/r" });

    // First body is the parent issue — should contain task checklist
    expect(capturedBodies.length).toBeGreaterThan(0);
    expect(capturedBodies[0]).toContain("## Tasks");
    expect(capturedBodies[0]).toContain("FEAT-X-DB");
  });
});

// ─────────────────────────────────────────────
// closeTaskIssue
// ─────────────────────────────────────────────

describe("closeTaskIssue", () => {
  it("closes issue and updates sync state", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGh(() => "");

    const result = await closeTaskIssue(tmpDir, "FEAT-001-DB");
    expect(result.closed).toBe(true);

    // Verify sync state updated
    const updated = loadSyncState(tmpDir);
    expect(updated!.featureIssues[0].taskIssues[0].status).toBe(
      "closed",
    );
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
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
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
// syncStatusFromGitHub
// ─────────────────────────────────────────────

describe("syncStatusFromGitHub", () => {
  it("returns error when no sync state", async () => {
    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No GitHub sync state");
  });

  it("updates task statuses from GitHub", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
          { taskId: "FEAT-001-API", issueNumber: 12, status: "open" },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    restoreExecutor = mockGh((args) => {
      if (args[0] === "issue" && args[1] === "view") {
        const issueNum = parseInt(args[2], 10);
        // Issue #11 is now closed, #12 still open
        const state = issueNum === 11 ? "CLOSED" : "OPEN";
        return JSON.stringify({
          number: issueNum,
          title: `Task ${issueNum}`,
          state,
          labels: [],
        });
      }
      return "";
    });

    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.updated).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].taskId).toBe("FEAT-001-DB");
    expect(result.issues[0].status).toBe("closed");

    // Verify state was saved
    const updated = loadSyncState(tmpDir);
    expect(updated!.featureIssues[0].taskIssues[0].status).toBe("closed");
    expect(updated!.featureIssues[0].taskIssues[1].status).toBe("open");
  });

  it("handles per-issue errors without stopping", async () => {
    const syncState = createSyncState("owner/repo");
    syncState.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
          { taskId: "FEAT-001-API", issueNumber: 12, status: "open" },
        ],
      },
    ];
    saveSyncState(tmpDir, syncState);

    let callCount = 0;
    restoreExecutor = mockGhWithErrors((args) => {
      if (args[0] === "issue" && args[1] === "view") {
        callCount++;
        if (callCount === 1) {
          return new Error("not found");
        }
        return JSON.stringify({
          number: 12,
          title: "Task",
          state: "CLOSED",
          labels: [],
        });
      }
      return "";
    });

    const result = await syncStatusFromGitHub(tmpDir);
    expect(result.errors).toHaveLength(1);
    expect(result.updated).toBe(1);
  });
});
