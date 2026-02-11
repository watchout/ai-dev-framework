import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createSession,
  loadSession,
  saveSession,
  recordAnswer,
  confirmStage,
  completeSession,
  pauseSession,
  resumeSession,
} from "./discover-session.js";

describe("discover-session", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-discover-session-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("createSession", () => {
    it("creates session with valid defaults", () => {
      const session = createSession();

      expect(session.id).toBeTruthy();
      expect(session.status).toBe("in_progress");
      expect(session.currentStage).toBe(1);
      expect(session.startedAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
      expect(session.stages).toHaveLength(5);
      expect(session.answers).toEqual({});
    });

    it("initializes stage 1 as in_progress", () => {
      const session = createSession();

      expect(session.stages[0].status).toBe("in_progress");
      expect(session.stages[1].status).toBe("pending");
    });

    it("generates unique IDs", () => {
      const s1 = createSession();
      const s2 = createSession();
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe("saveSession / loadSession", () => {
    it("persists session to disk", () => {
      const session = createSession();
      saveSession(tmpDir, session);

      const filePath = path.join(
        tmpDir,
        ".framework/discover-session.json",
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("loads saved session", () => {
      const session = createSession();
      recordAnswer(session, "Q1-1", "test answer");
      saveSession(tmpDir, session);

      const loaded = loadSession(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.answers["Q1-1"]).toBe("test answer");
    });

    it("returns null when no session file exists", () => {
      expect(loadSession(tmpDir)).toBeNull();
    });

    it("creates .framework directory if missing", () => {
      const session = createSession();
      saveSession(tmpDir, session);

      expect(
        fs.existsSync(path.join(tmpDir, ".framework")),
      ).toBe(true);
    });

    it("updates updatedAt on save", () => {
      const session = createSession();
      const originalUpdated = session.updatedAt;

      // Small delay to ensure different timestamp
      saveSession(tmpDir, session);
      const loaded = loadSession(tmpDir);

      expect(loaded!.updatedAt).toBeDefined();
    });
  });

  describe("recordAnswer", () => {
    it("records answer for question", () => {
      const session = createSession();
      recordAnswer(session, "Q1-1", "My SaaS idea");

      expect(session.answers["Q1-1"]).toBe("My SaaS idea");
    });

    it("overwrites existing answer", () => {
      const session = createSession();
      recordAnswer(session, "Q1-1", "First answer");
      recordAnswer(session, "Q1-1", "Updated answer");

      expect(session.answers["Q1-1"]).toBe("Updated answer");
    });
  });

  describe("confirmStage", () => {
    it("marks stage as confirmed", () => {
      const session = createSession();
      confirmStage(session, 1, "Stage 1 summary");

      expect(session.stages[0].status).toBe("confirmed");
      expect(session.stages[0].summary).toBe("Stage 1 summary");
      expect(session.stages[0].confirmedAt).toBeTruthy();
    });

    it("advances to next stage", () => {
      const session = createSession();
      confirmStage(session, 1, "Summary");

      expect(session.currentStage).toBe(2);
      expect(session.stages[1].status).toBe("in_progress");
    });

    it("does not advance past stage 5", () => {
      const session = createSession();
      // Confirm all stages
      for (let i = 1; i <= 5; i++) {
        confirmStage(session, i, `Summary ${i}`);
      }

      expect(session.currentStage).toBe(5);
      expect(session.stages[4].status).toBe("confirmed");
    });
  });

  describe("session lifecycle", () => {
    it("pauses session", () => {
      const session = createSession();
      pauseSession(session);

      expect(session.status).toBe("paused");
    });

    it("resumes session", () => {
      const session = createSession();
      pauseSession(session);
      resumeSession(session);

      expect(session.status).toBe("in_progress");
    });

    it("completes session", () => {
      const session = createSession();
      completeSession(session);

      expect(session.status).toBe("completed");
      expect(session.completedAt).toBeTruthy();
    });

    it("full lifecycle: create -> pause -> resume -> complete", () => {
      const session = createSession();
      expect(session.status).toBe("in_progress");

      pauseSession(session);
      expect(session.status).toBe("paused");

      resumeSession(session);
      expect(session.status).toBe("in_progress");

      completeSession(session);
      expect(session.status).toBe("completed");
      expect(session.completedAt).toBeTruthy();
    });

    it("persists through save/load cycle", () => {
      const session = createSession();
      recordAnswer(session, "Q1-1", "idea");
      recordAnswer(session, "Q1-2", "motivation");
      confirmStage(session, 1, "Stage 1 done");
      saveSession(tmpDir, session);

      const loaded = loadSession(tmpDir)!;
      expect(loaded.currentStage).toBe(2);
      expect(loaded.answers["Q1-1"]).toBe("idea");
      expect(loaded.stages[0].status).toBe("confirmed");
      expect(loaded.stages[1].status).toBe("in_progress");
    });
  });
});
