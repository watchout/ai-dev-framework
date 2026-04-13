/**
 * Tests for task-state.ts (sub-PR 61-1).
 *
 * Strategy: inject a mock gh executor via `setGhExecutor` from
 * github-engine and assert both the arguments passed to `gh` and
 * the return value normalization.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setGhExecutor, type GhExecutor } from "./github-engine.js";
import {
  LABEL_FEATURE,
  LABEL_IN_PROGRESS,
  LABEL_BLOCKED,
  LABEL_COMPLETED,
  listFeatures,
  getActiveTask,
  getIssueByNumber,
  listMyOpenIssues,
  markInProgress,
  markBlocked,
  markCompleted,
  clearStatusLabels,
  checkGhEnvironment,
} from "./task-state.js";

type Call = { args: string[]; reply: string };

function makeMock(replies: Record<string, string>) {
  const calls: string[][] = [];
  const executor: GhExecutor = async (args) => {
    calls.push([...args]);
    const key = args.join(" ");
    for (const [pattern, reply] of Object.entries(replies)) {
      if (key.includes(pattern)) return reply;
    }
    return "";
  };
  return { executor, calls };
}

describe("task-state: read operations", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("listFeatures queries feature-labeled open issues and normalizes labels", async () => {
    const raw = JSON.stringify([
      {
        number: 100,
        title: "FEAT-001 auth",
        state: "OPEN",
        labels: [{ name: "feature" }, { name: "layer:core" }],
        assignees: [{ login: "alice" }],
        body: "body text",
        url: "https://github.com/x/y/issues/100",
      },
    ]);
    const { executor, calls } = makeMock({ "issue list": raw });
    restore = setGhExecutor(executor);

    const result = await listFeatures();

    expect(calls[0]).toContain("--label");
    expect(calls[0]).toContain(LABEL_FEATURE);
    expect(calls[0]).toContain("--state");
    expect(calls[0]).toContain("open");
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(100);
    expect(result[0].state).toBe("open");
    expect(result[0].labels).toEqual(["feature", "layer:core"]);
    expect(result[0].assignees).toEqual(["alice"]);
  });

  it("listFeatures returns [] for empty stdout", async () => {
    const { executor } = makeMock({ "issue list": "" });
    restore = setGhExecutor(executor);
    expect(await listFeatures()).toEqual([]);
  });

  it("getActiveTask returns null when no matching issue", async () => {
    const { executor, calls } = makeMock({ "issue list": "[]" });
    restore = setGhExecutor(executor);

    const result = await getActiveTask();

    expect(calls[0]).toContain("--assignee");
    expect(calls[0]).toContain("@me");
    expect(calls[0]).toContain("--label");
    expect(calls[0]).toContain(LABEL_IN_PROGRESS);
    expect(result).toBeNull();
  });

  it("getActiveTask returns the first issue when multiple match", async () => {
    const raw = JSON.stringify([
      { number: 61, title: "a", state: "open", labels: [], assignees: [] },
      { number: 62, title: "b", state: "open", labels: [], assignees: [] },
    ]);
    const { executor } = makeMock({ "issue list": raw });
    restore = setGhExecutor(executor);

    const result = await getActiveTask();
    expect(result?.number).toBe(61);
  });

  it("getIssueByNumber returns null on error", async () => {
    const executor: GhExecutor = async () => {
      throw new Error("not found");
    };
    restore = setGhExecutor(executor);
    expect(await getIssueByNumber(999)).toBeNull();
  });

  it("getIssueByNumber parses single-issue JSON response", async () => {
    const raw = JSON.stringify({
      number: 42,
      title: "test",
      state: "open",
      labels: [{ name: "bug" }],
      assignees: [],
      body: "",
      url: "",
    });
    const { executor } = makeMock({ "issue view 42": raw });
    restore = setGhExecutor(executor);

    const result = await getIssueByNumber(42);
    expect(result?.number).toBe(42);
    expect(result?.labels).toEqual(["bug"]);
  });

  it("listMyOpenIssues queries with assignee=@me and no label filter", async () => {
    const { executor, calls } = makeMock({ "issue list": "[]" });
    restore = setGhExecutor(executor);

    await listMyOpenIssues();

    expect(calls[0]).toContain("--assignee");
    expect(calls[0]).toContain("@me");
    expect(calls[0]).not.toContain("--label");
  });
});

describe("task-state: write operations", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("clearStatusLabels skips when no status labels are present", async () => {
    const viewRaw = JSON.stringify({
      number: 10,
      title: "t",
      state: "open",
      labels: [{ name: "feature" }],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 10": viewRaw });
    restore = setGhExecutor(executor);

    await clearStatusLabels(10);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("issue");
    expect(calls[0][1]).toBe("view");
  });

  it("clearStatusLabels removes all present status labels in one call", async () => {
    const viewRaw = JSON.stringify({
      number: 10,
      title: "t",
      state: "open",
      labels: [{ name: LABEL_IN_PROGRESS }, { name: LABEL_BLOCKED }],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 10": viewRaw });
    restore = setGhExecutor(executor);

    await clearStatusLabels(10);

    expect(calls).toHaveLength(2);
    const editCall = calls[1];
    expect(editCall).toContain("--remove-label");
    expect(editCall).toContain(LABEL_IN_PROGRESS);
    expect(editCall).toContain(LABEL_BLOCKED);
  });

  it("markInProgress clears other status labels then adds in-progress", async () => {
    const viewRaw = JSON.stringify({
      number: 7,
      title: "t",
      state: "open",
      labels: [{ name: LABEL_BLOCKED }],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 7": viewRaw });
    restore = setGhExecutor(executor);

    await markInProgress(7);

    // calls: view (clearStatusLabels), edit --remove-label, edit --add-label
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const addCall = calls[calls.length - 1];
    expect(addCall).toContain("--add-label");
    expect(addCall).toContain(LABEL_IN_PROGRESS);
  });

  it("markBlocked adds label and comments when reason is provided", async () => {
    const viewRaw = JSON.stringify({
      number: 8,
      title: "t",
      state: "open",
      labels: [],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 8": viewRaw });
    restore = setGhExecutor(executor);

    await markBlocked(8, "waiting for CEO");

    const commentCall = calls.find((c) => c[1] === "comment");
    expect(commentCall).toBeDefined();
    expect(commentCall).toContain("--body");
    const bodyIdx = commentCall!.indexOf("--body");
    expect(commentCall![bodyIdx + 1]).toMatch(/waiting for CEO/);
  });

  it("markBlocked skips comment when reason is empty", async () => {
    const viewRaw = JSON.stringify({
      number: 8,
      title: "t",
      state: "open",
      labels: [],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 8": viewRaw });
    restore = setGhExecutor(executor);

    await markBlocked(8, "   ");

    expect(calls.find((c) => c[1] === "comment")).toBeUndefined();
  });

  it("markCompleted adds completed label then closes issue", async () => {
    const viewRaw = JSON.stringify({
      number: 9,
      title: "t",
      state: "open",
      labels: [{ name: LABEL_IN_PROGRESS }],
      assignees: [],
    });
    const { executor, calls } = makeMock({ "issue view 9": viewRaw });
    restore = setGhExecutor(executor);

    await markCompleted(9);

    const closeCall = calls.find((c) => c[1] === "close");
    const addCompletedCall = calls.find(
      (c) => c.includes("--add-label") && c.includes(LABEL_COMPLETED),
    );
    expect(addCompletedCall).toBeDefined();
    expect(closeCall).toBeDefined();
    // completed label must be added BEFORE close
    const addIdx = calls.indexOf(addCompletedCall!);
    const closeIdx = calls.indexOf(closeCall!);
    expect(addIdx).toBeLessThan(closeIdx);
  });
});

describe("task-state: checkGhEnvironment", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("reports installed=false when gh not available", async () => {
    // execGh will fail — use an executor that simulates unavailable
    const executor: GhExecutor = async () => {
      throw new Error("command not found: gh");
    };
    restore = setGhExecutor(executor);

    const result = await checkGhEnvironment();
    expect(result.ok).toBe(false);
    expect(result.installed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/not installed/);
  });

  it("reports authenticated=true when gh auth status succeeds", async () => {
    const executor: GhExecutor = async (args) => {
      if (args[0] === "--version" || args.join(" ") === "--version") {
        return "gh version 2.0.0";
      }
      if (args[0] === "auth") return "Logged in";
      return "";
    };
    restore = setGhExecutor(executor);

    const result = await checkGhEnvironment();
    expect(result.ok).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports authenticated=false when gh auth status throws", async () => {
    const executor: GhExecutor = async (args) => {
      if (args[0] === "--version") return "gh version 2.0.0";
      if (args[0] === "auth") throw new Error("not logged in");
      return "";
    };
    restore = setGhExecutor(executor);

    const result = await checkGhEnvironment();
    expect(result.ok).toBe(false);
    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.errors[0]).toMatch(/not authenticated/);
  });
});
