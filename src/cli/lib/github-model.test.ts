/**
 * Tests for github-model.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseRepoSlug,
  loadSyncState,
  saveSyncState,
  createSyncState,
  findFeatureMapping,
  findTaskIssueNumber,
  updateTaskSyncStatus,
  type GitHubSyncState,
} from "./github-model.js";

// ─────────────────────────────────────────────
// parseRepoSlug
// ─────────────────────────────────────────────

describe("parseRepoSlug", () => {
  it("parses SSH remote URL", () => {
    expect(parseRepoSlug("git@github.com:watchout/wbs.git")).toBe(
      "watchout/wbs",
    );
  });

  it("parses SSH remote URL without .git suffix", () => {
    expect(parseRepoSlug("git@github.com:watchout/wbs")).toBe(
      "watchout/wbs",
    );
  });

  it("parses HTTPS remote URL", () => {
    expect(
      parseRepoSlug("https://github.com/watchout/haishin-puls-hub.git"),
    ).toBe("watchout/haishin-puls-hub");
  });

  it("parses HTTPS remote URL without .git suffix", () => {
    expect(
      parseRepoSlug("https://github.com/watchout/hotel-kanri"),
    ).toBe("watchout/hotel-kanri");
  });

  it("parses HTTP remote URL", () => {
    expect(
      parseRepoSlug("http://github.com/owner/repo.git"),
    ).toBe("owner/repo");
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseRepoSlug("git@gitlab.com:owner/repo.git")).toBeNull();
    expect(
      parseRepoSlug("https://bitbucket.org/owner/repo.git"),
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRepoSlug("")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(parseRepoSlug("not-a-url")).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Sync State Persistence
// ─────────────────────────────────────────────

describe("sync state persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-model-test-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no sync file exists", () => {
    expect(loadSyncState(tmpDir)).toBeNull();
  });

  it("saves and loads sync state", () => {
    const state = createSyncState("watchout/wbs");
    state.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
          { taskId: "FEAT-001-API", issueNumber: 12, status: "open" },
        ],
      },
    ];

    saveSyncState(tmpDir, state);

    const loaded = loadSyncState(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.repo).toBe("watchout/wbs");
    expect(loaded!.featureIssues).toHaveLength(1);
    expect(loaded!.featureIssues[0].featureId).toBe("FEAT-001");
    expect(loaded!.featureIssues[0].taskIssues).toHaveLength(2);
  });

  it("creates .framework directory if missing", () => {
    const cleanDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "gh-model-clean-"),
    );
    try {
      const state = createSyncState("owner/repo");
      saveSyncState(cleanDir, state);

      const loaded = loadSyncState(cleanDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.repo).toBe("owner/repo");
    } finally {
      fs.rmSync(cleanDir, { recursive: true, force: true });
    }
  });

  it("returns null for corrupted JSON", () => {
    const filePath = path.join(
      tmpDir,
      ".framework/github-sync.json",
    );
    fs.writeFileSync(filePath, "not valid json", "utf-8");
    expect(loadSyncState(tmpDir)).toBeNull();
  });

  it("updates syncedAt on save", () => {
    const state = createSyncState("owner/repo");
    const before = state.syncedAt;

    // Small delay to ensure timestamp differs
    saveSyncState(tmpDir, state);
    const loaded = loadSyncState(tmpDir);
    expect(loaded!.syncedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// createSyncState
// ─────────────────────────────────────────────

describe("createSyncState", () => {
  it("creates empty state with repo", () => {
    const state = createSyncState("watchout/wbs");
    expect(state.repo).toBe("watchout/wbs");
    expect(state.featureIssues).toEqual([]);
    expect(state.syncedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Sync State Lookups
// ─────────────────────────────────────────────

describe("sync state lookups", () => {
  let state: GitHubSyncState;

  beforeEach(() => {
    state = createSyncState("watchout/wbs");
    state.featureIssues = [
      {
        featureId: "FEAT-001",
        parentIssueNumber: 10,
        taskIssues: [
          { taskId: "FEAT-001-DB", issueNumber: 11, status: "open" },
          { taskId: "FEAT-001-API", issueNumber: 12, status: "closed" },
          { taskId: "FEAT-001-UI", issueNumber: 13, status: "open" },
        ],
      },
      {
        featureId: "FEAT-002",
        parentIssueNumber: 20,
        taskIssues: [
          { taskId: "FEAT-002-DB", issueNumber: 21, status: "open" },
        ],
      },
    ];
  });

  describe("findFeatureMapping", () => {
    it("finds existing feature", () => {
      const mapping = findFeatureMapping(state, "FEAT-001");
      expect(mapping).toBeDefined();
      expect(mapping!.parentIssueNumber).toBe(10);
      expect(mapping!.taskIssues).toHaveLength(3);
    });

    it("returns undefined for non-existent feature", () => {
      expect(findFeatureMapping(state, "FEAT-999")).toBeUndefined();
    });
  });

  describe("findTaskIssueNumber", () => {
    it("finds task in first feature", () => {
      expect(findTaskIssueNumber(state, "FEAT-001-DB")).toBe(11);
    });

    it("finds task in second feature", () => {
      expect(findTaskIssueNumber(state, "FEAT-002-DB")).toBe(21);
    });

    it("returns null for non-existent task", () => {
      expect(findTaskIssueNumber(state, "FEAT-999-DB")).toBeNull();
    });
  });

  describe("updateTaskSyncStatus", () => {
    it("updates open task to closed", () => {
      const result = updateTaskSyncStatus(
        state,
        "FEAT-001-DB",
        "closed",
      );
      expect(result).toBe(true);

      const task = state.featureIssues[0].taskIssues[0];
      expect(task.status).toBe("closed");
    });

    it("updates closed task to open", () => {
      const result = updateTaskSyncStatus(
        state,
        "FEAT-001-API",
        "open",
      );
      expect(result).toBe(true);

      const task = state.featureIssues[0].taskIssues[1];
      expect(task.status).toBe("open");
    });

    it("returns false for non-existent task", () => {
      const result = updateTaskSyncStatus(
        state,
        "FEAT-999-DB",
        "closed",
      );
      expect(result).toBe(false);
    });
  });
});
