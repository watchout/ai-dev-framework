import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  syncTaskStatusToGitHub,
  resolveIssueNumber,
  batchSyncToGitHub,
  clearIssueNumberCache,
} from "./state-writer.js";
import { setGhExecutor } from "./github-engine.js";

describe("syncTaskStatusToGitHub", () => {
  let ghCalls: string[][] = [];
  let restoreGh: () => void;

  beforeEach(() => {
    ghCalls = [];
    restoreGh = setGhExecutor(async (args: string[]) => {
      ghCalls.push(args);
      return "";
    });
  });

  afterEach(() => {
    restoreGh();
  });

  it("marks issue in-progress on task start", async () => {
    await syncTaskStatusToGitHub({
      taskId: "FEAT-001-DB",
      issueNumber: 100,
      oldStatus: "backlog",
      newStatus: "in_progress",
    });

    expect(ghCalls.length).toBeGreaterThan(0);
    const addCall = ghCalls.find((c) => c.includes("--add-label"));
    expect(addCall).toBeDefined();
    expect(addCall!.join(" ")).toContain("status:in-progress");
  });

  it("closes issue on task completion", async () => {
    await syncTaskStatusToGitHub({
      taskId: "FEAT-001-DB",
      issueNumber: 100,
      oldStatus: "in_progress",
      newStatus: "done",
    });

    const closeCall = ghCalls.find((c) => c.includes("close"));
    expect(closeCall).toBeDefined();
  });

  it("marks blocked on task failure", async () => {
    await syncTaskStatusToGitHub({
      taskId: "FEAT-001-DB",
      issueNumber: 100,
      oldStatus: "in_progress",
      newStatus: "failed",
      reason: "Build error",
    });

    const addCall = ghCalls.find((c) => c.includes("--add-label"));
    expect(addCall).toBeDefined();
    expect(addCall!.join(" ")).toContain("status:blocked");
  });

  it("skips non-meaningful transitions (backlog, auditing, review)", async () => {
    await syncTaskStatusToGitHub({
      taskId: "FEAT-001-DB",
      issueNumber: 100,
      oldStatus: "backlog",
      newStatus: "auditing",
    });

    expect(ghCalls).toHaveLength(0);
  });

  it("skips when issueNumber is null", async () => {
    await syncTaskStatusToGitHub({
      taskId: "FEAT-001-DB",
      issueNumber: null,
      oldStatus: "backlog",
      newStatus: "in_progress",
    });

    expect(ghCalls).toHaveLength(0);
  });

  it("does not throw on gh CLI error (best-effort)", async () => {
    restoreGh();
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: rate limited");
    });

    await expect(
      syncTaskStatusToGitHub({
        taskId: "FEAT-001-DB",
        issueNumber: 100,
        oldStatus: "backlog",
        newStatus: "in_progress",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("resolveIssueNumber", () => {
  let restoreGh: () => void;

  beforeEach(() => {
    clearIssueNumberCache();
  });

  afterEach(() => {
    if (restoreGh) restoreGh();
    clearIssueNumberCache();
  });

  it("resolves taskId to Issue number", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify([{ number: 42 }]),
    );

    const num = await resolveIssueNumber("FEAT-001-DB");
    expect(num).toBe(42);
  });

  it("returns null when no matching Issue", async () => {
    restoreGh = setGhExecutor(async () => "[]");

    const num = await resolveIssueNumber("NONEXISTENT");
    expect(num).toBeNull();
  });

  it("caches resolved numbers", async () => {
    let callCount = 0;
    restoreGh = setGhExecutor(async () => {
      callCount++;
      return JSON.stringify([{ number: 42 }]);
    });

    await resolveIssueNumber("FEAT-001-DB");
    await resolveIssueNumber("FEAT-001-DB");
    expect(callCount).toBe(1);
  });

  it("returns null on gh error", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: error");
    });

    const num = await resolveIssueNumber("FEAT-001-DB");
    expect(num).toBeNull();
  });
});

describe("batchSyncToGitHub", () => {
  let restoreGh: () => void;

  beforeEach(() => {
    clearIssueNumberCache();
  });

  afterEach(() => {
    if (restoreGh) restoreGh();
    clearIssueNumberCache();
  });

  it("syncs multiple tasks", async () => {
    restoreGh = setGhExecutor(async (args: string[]) => {
      if (args.includes("--search")) {
        return JSON.stringify([{ number: 10 }]);
      }
      return "";
    });

    const result = await batchSyncToGitHub([
      { taskId: "T-1", status: "in_progress" },
      { taskId: "T-2", status: "done" },
      { taskId: "T-3", status: "backlog" },
    ]);

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("counts failures when Issues not found", async () => {
    restoreGh = setGhExecutor(async () => "[]");

    const result = await batchSyncToGitHub([
      { taskId: "T-1", status: "in_progress" },
    ]);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
  });
});
