import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type DiscoverIO,
  runDiscoverEngine,
  generateStageSummary,
} from "./discover-engine.js";
import { getStage } from "./discover-questions.js";
import { loadSession } from "./discover-session.js";

/** Create a mock IO that provides pre-defined answers */
function createMockIO(answers: string[]): DiscoverIO & {
  output: string[];
  askIndex: number;
} {
  let askIndex = 0;
  const output: string[] = [];

  return {
    output,
    get askIndex() {
      return askIndex;
    },

    ask(_prompt: string): Promise<string> {
      const answer = answers[askIndex] ?? "skip";
      askIndex++;
      return Promise.resolve(answer);
    },

    print(message: string): void {
      output.push(message);
    },

    printBox(_title: string, lines: string[]): void {
      output.push(`[BOX] ${lines.join(" | ")}`);
    },

    printStageHeader(stage): void {
      output.push(`[STAGE ${stage.stage}] ${stage.title}`);
    },

    printQuestion(question, index, total): void {
      output.push(`[Q ${index}/${total}] ${question.id}: ${question.text.slice(0, 50)}`);
    },

    printFinalSummary(): void {
      output.push("[FINAL SUMMARY]");
    },
  };
}

describe("discover-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-discover-engine-"),
    );
    // Create .framework directory (simulating after init)
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new session on first run", async () => {
    // Provide enough answers for all questions + confirmations
    const answers = buildFullAnswers();
    const io = createMockIO(answers);

    await runDiscoverEngine({ projectDir: tmpDir, io });

    const session = loadSession(tmpDir);
    expect(session).not.toBeNull();
    expect(session!.status).toBe("completed");
  });

  it("saves session to .framework directory", async () => {
    const answers = buildFullAnswers();
    const io = createMockIO(answers);

    await runDiscoverEngine({ projectDir: tmpDir, io });

    const sessionPath = path.join(
      tmpDir,
      ".framework/discover-session.json",
    );
    expect(fs.existsSync(sessionPath)).toBe(true);
  });

  it("records answers in session", async () => {
    const answers = buildFullAnswers();
    const io = createMockIO(answers);

    const result = await runDiscoverEngine({ projectDir: tmpDir, io });

    expect(Object.keys(result.session.answers).length).toBeGreaterThan(0);
    expect(result.session.answers["Q1-1"]).toBe("My SaaS idea");
  });

  it("handles pause command", async () => {
    // Answer first question, then pause
    const answers = ["pause"];
    const io = createMockIO(answers);

    const result = await runDiscoverEngine({ projectDir: tmpDir, io });

    expect(result.paused).toBe(true);
    expect(result.completed).toBe(false);

    const session = loadSession(tmpDir);
    expect(session!.status).toBe("paused");
  });

  it("resumes from paused session", async () => {
    // First run: answer Q1-1 then pause on Q1-2
    const firstAnswers = ["My SaaS idea", "pause"];
    const firstIO = createMockIO(firstAnswers);
    await runDiscoverEngine({ projectDir: tmpDir, io: firstIO });

    // Second run: resume and continue
    const resumeAnswers = buildFullAnswers().slice(1); // skip Q1-1 (already answered)
    const resumeIO = createMockIO(resumeAnswers);
    const result = await runDiscoverEngine({
      projectDir: tmpDir,
      io: resumeIO,
    });

    expect(result.session.answers["Q1-1"]).toBe("My SaaS idea");
    expect(
      resumeIO.output.some((o) => o.includes("Resuming")),
    ).toBe(true);
  });

  it("marks all stages as confirmed on completion", async () => {
    const answers = buildFullAnswers();
    const io = createMockIO(answers);

    const result = await runDiscoverEngine({ projectDir: tmpDir, io });

    for (const stage of result.session.stages) {
      expect(stage.status).toBe("confirmed");
    }
  });

  it("handles stage confirmation with pause", async () => {
    // Answer all Stage 1 questions, then pause at confirmation
    const answers = [
      "My SaaS idea",     // Q1-1
      "Own experience",    // Q1-2
      "No references",     // Q1-4
      "pause",             // Stage 1 confirmation -> pause
    ];
    const io = createMockIO(answers);

    const result = await runDiscoverEngine({ projectDir: tmpDir, io });
    expect(result.paused).toBe(true);
  });

  it("prints stage headers in order", async () => {
    const answers = buildFullAnswers();
    const io = createMockIO(answers);

    await runDiscoverEngine({ projectDir: tmpDir, io });

    const stageHeaders = io.output.filter((o) => o.startsWith("[STAGE"));
    expect(stageHeaders[0]).toContain("STAGE 1");
    expect(stageHeaders[1]).toContain("STAGE 2");
  });
});

describe("generateStageSummary", () => {
  it("generates Stage 1 summary", () => {
    const stage = getStage(1)!;
    const answers = {
      "Q1-1": "A task management app",
      "Q1-2": "My own frustration",
      "Q1-4": "Todoist, Notion",
    };

    const summary = generateStageSummary(stage, answers);
    expect(summary).toContain("A task management app");
    expect(summary).toContain("My own frustration");
    expect(summary).toContain("Todoist, Notion");
  });

  it("generates Stage 2 summary with severity mapping", () => {
    const stage = getStage(2)!;
    const answers = {
      "Q2-1": "Small business owners",
      "Q2-2": "Spending hours on reports",
      "Q2-3": "a) Struggling every day",
      "Q2-4": "b) Managing with Excel",
      "Q2-6": "c) Only my own experience",
    };

    const summary = generateStageSummary(stage, answers);
    expect(summary).toContain("Small business owners");
    expect(summary).toContain("High (daily pain)");
    expect(summary).toContain("Own experience only");
  });

  it("handles missing answers gracefully", () => {
    const stage = getStage(1)!;
    const summary = generateStageSummary(stage, {});

    expect(summary).toContain("N/A");
  });

  it("truncates long answers", () => {
    const stage = getStage(1)!;
    const longAnswer = "A".repeat(200);
    const answers = { "Q1-1": longAnswer };

    const summary = generateStageSummary(stage, answers);
    expect(summary.length).toBeLessThan(longAnswer.length + 50);
    expect(summary).toContain("...");
  });
});

/**
 * Build a complete set of answers for all stages + confirmations.
 * This produces enough responses to complete the entire discover flow.
 */
function buildFullAnswers(): string[] {
  return [
    // Stage 1 questions
    "My SaaS idea",        // Q1-1
    "Own experience",      // Q1-2
    "Todoist",             // Q1-4
    "yes",                 // Stage 1 confirmation

    // Stage 2 questions
    "Small business owners",   // Q2-1
    "Manual expense tracking", // Q2-2
    "a",                       // Q2-3 (severity)
    "a",                       // Q2-4 (current solution - using another tool)
    "Too expensive and complex", // Q2-5 (pain points - conditional on Q2-4=a)
    "c",                       // Q2-6 (validation)
    "yes",                     // Stage 2 confirmation

    // Stage 3 questions
    "Automate with AI",        // Q3-1
    "Auto-categorize, Reports, Mobile", // Q3-2
    "Open app -> Snap receipt -> Auto-categorize -> Report", // Q3-4
    "a",                       // Q3-5 (platform)
    "yes",                     // Stage 3 confirmation

    // Stage 4 questions
    "Expensify, Freee",        // Q4-1
    "AI accuracy and simplicity", // Q4-2
    "AI cost reduction",       // Q4-3
    "yes",                     // Stage 4 confirmation

    // Stage 5 questions
    "c",                       // Q5-1 (revenue model - freemium)
    "a",                       // Q5-3 (6-month goal)
    "a",                       // Q5-4 (team)
    "a",                       // Q5-5 (tech level)
    "Next.js, Supabase",       // Q5-6
    "b",                       // Q5-7 (timeline)
    "c",                       // Q5-8 (marketing)
    "yes",                     // Stage 5 confirmation

    "yes",                     // Final confirmation
  ];
}
