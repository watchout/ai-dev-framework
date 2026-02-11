import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type SessionIO,
  runSessionSave,
  runSessionLoad,
} from "./session-engine.js";
import {
  loadSessionState,
  saveSessionState,
  appendDecision,
  appendOpenIssue,
} from "./memory-model.js";

function createMockIO(): SessionIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("session-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-session-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runSessionSave", () => {
    it("creates session state file", () => {
      const io = createMockIO();
      runSessionSave(tmpDir, io);
      const state = loadSessionState(tmpDir);
      expect(state).not.toBeNull();
      expect(state!.lastUpdated).toBeTruthy();
    });

    it("prints confirmation output", () => {
      const io = createMockIO();
      runSessionSave(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("Session Save")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("session_state.json")),
      ).toBe(true);
    });

    it("reads project config when available", () => {
      const frameworkDir = path.join(tmpDir, ".framework");
      fs.mkdirSync(frameworkDir, { recursive: true });
      fs.writeFileSync(
        path.join(frameworkDir, "project.json"),
        JSON.stringify({
          name: "test-project",
          currentPhase: 4,
        }),
      );

      const io = createMockIO();
      runSessionSave(tmpDir, io);
      const state = loadSessionState(tmpDir);
      expect(state!.currentPhase).toBe(4);
      expect(state!.currentTask).toContain("test-project");
    });

    it("preserves pending actions from existing state", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-03T00:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: ["Review PR", "Update docs"],
      });

      const io = createMockIO();
      runSessionSave(tmpDir, io);
      const state = loadSessionState(tmpDir);
      expect(state!.pendingActions).toContain("Review PR");
      expect(state!.pendingActions).toContain("Update docs");
    });

    it("detects active files from src directory", () => {
      // Create src with some files
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "index.ts"), "export {};");
      fs.writeFileSync(path.join(srcDir, "app.ts"), "export {};");
      // Also need .git for detection
      fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

      const io = createMockIO();
      runSessionSave(tmpDir, io);
      const state = loadSessionState(tmpDir);
      expect(state!.activeFiles.length).toBeGreaterThan(0);
    });

    it("handles missing project config gracefully", () => {
      const io = createMockIO();
      runSessionSave(tmpDir, io);
      const state = loadSessionState(tmpDir);
      expect(state!.currentPhase).toBe(0);
      expect(state!.currentTask).toBeUndefined();
    });
  });

  describe("runSessionLoad", () => {
    it("returns null when no session exists", () => {
      const io = createMockIO();
      const state = runSessionLoad(tmpDir, io);
      expect(state).toBeNull();
      expect(
        io.output.some((o) => o.includes("No saved session")),
      ).toBe(true);
    });

    it("loads and prints saved session", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentTask: "Building CLI",
        currentPhase: 3,
        activeFiles: ["src/index.ts", "src/app.ts"],
        pendingActions: ["Fix tests"],
      });

      const io = createMockIO();
      const state = runSessionLoad(tmpDir, io);
      expect(state).not.toBeNull();
      expect(state!.currentPhase).toBe(3);
      expect(
        io.output.some((o) => o.includes("Phase: 3")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("Building CLI")),
      ).toBe(true);
    });

    it("shows active files", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentPhase: 1,
        activeFiles: ["src/a.ts", "src/b.ts"],
        pendingActions: [],
      });

      const io = createMockIO();
      runSessionLoad(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("Active Files")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("src/a.ts")),
      ).toBe(true);
    });

    it("shows recent decisions", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: [],
      });
      appendDecision(tmpDir, {
        date: "2026-02-04",
        context: "test",
        decision: "Use Vitest",
        rationale: "Better ESM",
      });

      const io = createMockIO();
      runSessionLoad(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("Recent Decisions")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("Use Vitest")),
      ).toBe(true);
    });

    it("shows open issues", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: [],
      });
      appendOpenIssue(tmpDir, {
        id: "ISS-001",
        title: "Test Flake",
        description: "Intermittent failure",
        createdAt: "2026-02-04T00:00:00Z",
        priority: "high",
      });

      const io = createMockIO();
      runSessionLoad(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("Open Issues")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("Test Flake")),
      ).toBe(true);
    });

    it("shows pending actions", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: ["Deploy to staging", "Review PR #42"],
      });

      const io = createMockIO();
      runSessionLoad(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("Pending Actions")),
      ).toBe(true);
      expect(
        io.output.some((o) => o.includes("Deploy to staging")),
      ).toBe(true);
    });

    it("truncates long active file lists", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T10:00:00Z",
        currentPhase: 1,
        activeFiles: Array.from({ length: 8 }, (_, i) => `src/file${i}.ts`),
        pendingActions: [],
      });

      const io = createMockIO();
      runSessionLoad(tmpDir, io);
      expect(
        io.output.some((o) => o.includes("and 3 more")),
      ).toBe(true);
    });
  });
});
