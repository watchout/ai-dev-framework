import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type GenerateIO,
  runGenerateEngine,
  getGenerationSummary,
} from "./generate-engine.js";
import { loadGenerationState } from "./generate-state.js";
import { type DiscoverSessionData, saveSession } from "./discover-session.js";

/** Create a mock IO for testing */
function createMockIO(): GenerateIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
    printProgress(docPath: string, completeness: number): void {
      output.push(`[PROGRESS] ${docPath} ${completeness}%`);
    },
  };
}

/** Create a completed discover session with sample answers */
function createCompletedSession(): DiscoverSessionData {
  return {
    id: "test-session-id",
    status: "completed",
    currentStage: 5,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stages: [
      { stageNumber: 1, status: "confirmed", summary: "Stage 1 done" },
      { stageNumber: 2, status: "confirmed", summary: "Stage 2 done" },
      { stageNumber: 3, status: "confirmed", summary: "Stage 3 done" },
      { stageNumber: 4, status: "confirmed", summary: "Stage 4 done" },
      { stageNumber: 5, status: "confirmed", summary: "Stage 5 done" },
    ],
    answers: {
      "Q1-1": "An AI-powered expense tracker",
      "Q1-2": "Own frustration with expense tracking",
      "Q1-4": "Expensify",
      "Q2-1": "Small business owners",
      "Q2-2": "Manual expense tracking takes hours",
      "Q2-3": "a) Struggling every day",
      "Q2-4": "a) Using another tool/service",
      "Q2-5": "Too expensive",
      "Q2-6": "c) Only my own experience",
      "Q3-1": "AI auto-categorize from photos",
      "Q3-2": "Receipt scan, Auto-categorize, Reports",
      "Q3-4": "Open -> Snap -> Categorize -> Report",
      "Q3-5": "a) Web app",
      "Q4-1": "Expensify, Freee",
      "Q4-2": "AI accuracy and simplicity",
      "Q4-3": "AI cost reduction",
      "Q5-1": "c) Freemium",
      "Q5-3": "b) About 100 users",
      "Q5-4": "a) Myself",
      "Q5-5": "a) Professional engineer",
      "Q5-6": "Next.js, Supabase",
      "Q5-7": "b) 1-3 months",
      "Q5-8": "c) Focus on development",
    },
  };
}

describe("generate-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-gen-engine-"),
    );
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails when no discover session exists", async () => {
    const io = createMockIO();
    const result = await runGenerateEngine({ projectDir: tmpDir, io });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No discover session");
  });

  it("fails when discover session is not completed", async () => {
    const session = createCompletedSession();
    session.status = "in_progress";
    saveSession(tmpDir, session);

    const io = createMockIO();
    const result = await runGenerateEngine({ projectDir: tmpDir, io });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("in_progress");
  });

  it("generates all 6 documents from completed session", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    const result = await runGenerateEngine({ projectDir: tmpDir, io });

    expect(result.errors).toHaveLength(0);
    expect(result.generatedDocuments).toHaveLength(6);
  });

  it("creates document files on disk", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    expect(
      fs.existsSync(path.join(tmpDir, "docs/idea/IDEA_CANVAS.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "docs/idea/USER_PERSONA.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, "docs/idea/COMPETITOR_ANALYSIS.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, "docs/idea/VALUE_PROPOSITION.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, "docs/requirements/SSOT-0_PRD.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          "docs/requirements/SSOT-1_FEATURE_CATALOG.md",
        ),
      ),
    ).toBe(true);
  });

  it("populates documents with discover answers", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    const ideaCanvas = fs.readFileSync(
      path.join(tmpDir, "docs/idea/IDEA_CANVAS.md"),
      "utf-8",
    );
    expect(ideaCanvas).toContain("An AI-powered expense tracker");
    expect(ideaCanvas).toContain("Small business owners");
    expect(ideaCanvas).toContain("High (daily pain)");
  });

  it("saves generation state", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    const state = loadGenerationState(tmpDir);
    expect(state).not.toBeNull();
    expect(state!.status).toBe("completed");
  });

  it("marks all documents as generated", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    const state = loadGenerationState(tmpDir);
    for (const doc of state!.documents) {
      expect(doc.status).toBe("generated");
      expect(doc.completeness).toBeGreaterThan(0);
    }
  });

  it("generates only step 1 when --step 1", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    const result = await runGenerateEngine({
      projectDir: tmpDir,
      step: 1,
      io,
    });

    expect(result.generatedDocuments).toHaveLength(4);
    for (const doc of result.generatedDocuments) {
      expect(doc).toContain("docs/idea/");
    }
  });

  it("generates only step 2 when --step 2", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    const result = await runGenerateEngine({
      projectDir: tmpDir,
      step: 2,
      io,
    });

    expect(result.generatedDocuments).toHaveLength(2);
    for (const doc of result.generatedDocuments) {
      expect(doc).toContain("docs/requirements/");
    }
  });

  it("skips already generated documents", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io1 = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io: io1 });

    // Run again
    const io2 = createMockIO();
    const result = await runGenerateEngine({
      projectDir: tmpDir,
      io: io2,
    });

    expect(result.generatedDocuments).toHaveLength(0);
    expect(
      io2.output.some((o) => o.includes("already completed")),
    ).toBe(true);
  });

  it("prints progress for each document", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    const progressLines = io.output.filter((o) =>
      o.startsWith("[PROGRESS]"),
    );
    expect(progressLines).toHaveLength(6);
  });

  it("prints step headers", async () => {
    const session = createCompletedSession();
    saveSession(tmpDir, session);

    const io = createMockIO();
    await runGenerateEngine({ projectDir: tmpDir, io });

    expect(
      io.output.some((o) => o.includes("Business Design")),
    ).toBe(true);
    expect(
      io.output.some((o) => o.includes("Product Design")),
    ).toBe(true);
  });
});

describe("getGenerationSummary", () => {
  it("returns summary for all steps", async () => {
    const { createGenerationState, markDocumentGenerated } = await import("./generate-state.js");
    const state = createGenerationState();
    markDocumentGenerated(state, "docs/idea/IDEA_CANVAS.md", 80);

    const summary = getGenerationSummary(state);
    expect(summary).toHaveLength(2);
    expect(summary[0].step).toBe(1);
    expect(summary[1].step).toBe(2);

    const ideaDoc = summary[0].documents.find(
      (d) => d.name === "IDEA_CANVAS",
    );
    expect(ideaDoc?.completeness).toBe(80);
    expect(ideaDoc?.status).toBe("generated");
  });
});
