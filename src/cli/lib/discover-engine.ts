/**
 * Discovery engine - orchestrates the interactive question flow
 * Based on: 08_DISCOVERY_FLOW.md
 *
 * Handles:
 * - Stage-by-stage question presentation
 * - Conditional question logic
 * - Stage summaries with confirmation
 * - Session persistence (pause/resume)
 */
import * as readline from "node:readline";
import {
  type Question,
  type StageDefinition,
  STAGES,
  getStage,
  shouldShowQuestion,
} from "./discover-questions.js";
import {
  type DiscoverSessionData,
  createSession,
  loadSession,
  saveSession,
  recordAnswer,
  confirmStage,
  completeSession,
  pauseSession,
  resumeSession,
} from "./discover-session.js";

/** Abstraction for I/O to allow testing */
export interface DiscoverIO {
  ask(prompt: string): Promise<string>;
  print(message: string): void;
  printBox(title: string, lines: string[]): void;
  printStageHeader(stage: StageDefinition): void;
  printQuestion(question: Question, index: number, total: number): void;
  printFinalSummary(session: DiscoverSessionData): void;
}

export interface DiscoverEngineOptions {
  projectDir: string;
  io: DiscoverIO;
  /** Profile-based stage filtering. Only these stages will run. */
  enabledStages?: number[];
}

export interface DiscoverResult {
  session: DiscoverSessionData;
  completed: boolean;
  paused: boolean;
}

/**
 * Create a readline-based IO implementation for terminal use
 */
export function createTerminalIO(): DiscoverIO {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  const print = (message: string): void => {
    process.stdout.write(`${message}\n`);
  };

  return {
    ask,
    print,

    printBox(title: string, lines: string[]): void {
      const maxLen = Math.max(
        title.length + 4,
        ...lines.map((l) => l.length + 4),
      );
      const border = "─".repeat(maxLen);
      print(`┌─ ${title} ${border.slice(title.length + 3)}┐`);
      print("│" + " ".repeat(maxLen) + "│");
      for (const line of lines) {
        const padded = line + " ".repeat(maxLen - line.length - 2);
        print(`│  ${padded}│`);
      }
      print("│" + " ".repeat(maxLen) + "│");
      print(`└${border}┘`);
    },

    printStageHeader(stage: StageDefinition): void {
      print("");
      print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      print(
        `  Stage ${stage.stage}: ${stage.title} (~${stage.estimatedMinutes} min)`,
      );
      print(`  ${stage.purpose}`);
      print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      print("");
    },

    printQuestion(question: Question, index: number, total: number): void {
      print(`\n[${index}/${total}] ${question.required ? "[Required]" : "[Optional]"}`);
      print("─".repeat(40));
      print(question.text);
      if (question.hint) {
        print(`  Hint: ${question.hint}`);
      }
      if (question.options) {
        print("");
        for (const opt of question.options) {
          print(`  ${opt}`);
        }
      }
      print("");
    },

    printFinalSummary(session: DiscoverSessionData): void {
      print("");
      print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      print("  Project Initial Setup Summary");
      print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      print("");

      for (const stage of session.stages) {
        if (stage.summary) {
          const def = getStage(stage.stageNumber);
          if (def) {
            print(`■ ${def.title}`);
            print(`  ${stage.summary}`);
            print("");
          }
        }
      }

      print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    },
  };
}

/**
 * Run the discovery engine
 */
export async function runDiscoverEngine(
  options: DiscoverEngineOptions,
): Promise<DiscoverResult> {
  const { projectDir, io, enabledStages } = options;

  // Load or create session
  let session = loadSession(projectDir);
  const isResume = session !== null && session.status !== "completed";

  if (isResume && session) {
    resumeSession(session);
    io.print(`\nResuming discovery session from Stage ${session.currentStage}...`);
  } else {
    session = createSession();
    io.print("\nStarting discovery flow...");
    io.print("Answer the questions to define your project.");
    io.print('Type "skip" to skip optional questions, "pause" to save and exit.\n');
  }

  saveSession(projectDir, session);

  // Process stages
  for (
    let stageNum = session.currentStage;
    stageNum <= STAGES.length;
    stageNum++
  ) {
    const stageDef = getStage(stageNum);
    if (!stageDef) break;

    // Skip stages not enabled by the project profile
    if (enabledStages && !enabledStages.includes(stageNum)) {
      confirmStage(session, stageNum, `Skipped (not in profile)`);
      saveSession(projectDir, session);
      continue;
    }

    io.printStageHeader(stageDef);

    // Get active questions for this stage (filter by conditions)
    const activeQuestions = stageDef.questions.filter(
      (q) => q.type !== "confirm" && shouldShowQuestion(q, session.answers),
    );

    let questionIndex = 0;
    for (const question of activeQuestions) {
      // Skip if already answered (for resume)
      if (session.answers[question.id]) {
        questionIndex++;
        continue;
      }

      // Re-check condition (answers may have changed)
      if (!shouldShowQuestion(question, session.answers)) {
        continue;
      }

      questionIndex++;
      io.printQuestion(question, questionIndex, activeQuestions.length);

      const answer = await askQuestion(io, question);

      // Handle pause
      if (answer.toLowerCase() === "pause") {
        pauseSession(session);
        saveSession(projectDir, session);
        io.print("\nSession paused. Run 'framework discover' again to resume.");
        return { session, completed: false, paused: true };
      }

      // Handle skip for optional questions
      if (answer.toLowerCase() === "skip" && !question.required) {
        continue;
      }

      // Validate required questions
      if (question.required && answer === "") {
        io.print("This question is required. Please provide an answer.");
        questionIndex--;
        continue;
      }

      recordAnswer(session, question.id, answer);
      saveSession(projectDir, session);
    }

    // Stage summary and confirmation
    const summary = generateStageSummary(stageDef, session.answers);
    io.printBox(`Stage ${stageNum} Summary`, summary.split("\n"));

    const confirmed = await confirmWithUser(
      io,
      "Is this understanding correct? (yes/no/pause): ",
    );

    if (confirmed === "pause") {
      pauseSession(session);
      saveSession(projectDir, session);
      io.print("\nSession paused. Run 'framework discover' again to resume.");
      return { session, completed: false, paused: true };
    }

    if (confirmed === "no") {
      io.print("Please provide corrections:");
      const correction = await io.ask("> ");
      if (correction && correction.toLowerCase() !== "skip") {
        recordAnswer(
          session,
          `stage${stageNum}_correction`,
          correction,
        );
      }
    }

    confirmStage(session, stageNum, summary);
    saveSession(projectDir, session);
  }

  // Final summary
  io.printFinalSummary(session);

  const finalConfirm = await confirmWithUser(
    io,
    "Create initial documents with this content? (yes/no): ",
  );

  if (finalConfirm === "no") {
    io.print("Discovery completed but document generation skipped.");
    io.print("Run 'framework generate' when ready.");
  }

  completeSession(session);
  saveSession(projectDir, session);

  io.print("\nDiscovery completed!");
  io.print("\nNext steps:");
  io.print("  1. framework generate    <- Generate SSOT documents");
  io.print("  2. framework plan        <- Create implementation plan");
  io.print("");

  return { session, completed: true, paused: false };
}

async function askQuestion(io: DiscoverIO, question: Question): Promise<string> {
  if (question.type === "select" && question.options) {
    const answer = await io.ask("Select (a/b/c/...): ");
    return answer;
  }
  const answer = await io.ask("> ");
  return answer;
}

async function confirmWithUser(
  io: DiscoverIO,
  prompt: string,
): Promise<"yes" | "no" | "pause"> {
  while (true) {
    const answer = await io.ask(prompt);
    const lower = answer.toLowerCase();
    if (lower === "yes" || lower === "y") return "yes";
    if (lower === "no" || lower === "n") return "no";
    if (lower === "pause") return "pause";
    io.print("Please answer yes, no, or pause.");
  }
}

/**
 * Generate a summary for a completed stage based on answers
 */
export function generateStageSummary(
  stage: StageDefinition,
  answers: Record<string, string>,
): string {
  const lines: string[] = [];

  switch (stage.stage) {
    case 1: {
      lines.push(`Idea: ${truncate(answers["Q1-1"] ?? "N/A", 80)}`);
      lines.push(`Origin: ${truncate(answers["Q1-2"] ?? "N/A", 80)}`);
      if (answers["Q1-4"]) {
        lines.push(`References: ${truncate(answers["Q1-4"], 80)}`);
      }
      break;
    }
    case 2: {
      lines.push(`Target Users: ${truncate(answers["Q2-1"] ?? "N/A", 80)}`);
      lines.push(`Core Problem: ${truncate(answers["Q2-2"] ?? "N/A", 80)}`);
      lines.push(`Severity: ${mapSeverity(answers["Q2-3"] ?? "")}`);
      lines.push(
        `Current Workaround: ${truncate(answers["Q2-4"] ?? "N/A", 80)}`,
      );
      if (answers["Q2-5"]) {
        lines.push(`Pain Points: ${truncate(answers["Q2-5"], 80)}`);
      }
      lines.push(
        `Validation: ${mapValidation(answers["Q2-6"] ?? "")}`,
      );
      break;
    }
    case 3: {
      lines.push(
        `Solution: ${truncate(answers["Q3-1"] ?? "N/A", 80)}`,
      );
      lines.push(
        `Key Features: ${truncate(answers["Q3-2"] ?? "N/A", 80)}`,
      );
      lines.push(
        `User Journey: ${truncate(answers["Q3-4"] ?? "N/A", 80)}`,
      );
      if (answers["Q3-5"]) {
        lines.push(`Platform: ${truncate(answers["Q3-5"], 80)}`);
      }
      break;
    }
    case 4: {
      lines.push(
        `Competitors: ${truncate(answers["Q4-1"] ?? "N/A", 80)}`,
      );
      lines.push(
        `Differentiator: ${truncate(answers["Q4-2"] ?? "N/A", 80)}`,
      );
      if (answers["Q4-3"]) {
        lines.push(`Market Trends: ${truncate(answers["Q4-3"], 80)}`);
      }
      break;
    }
    case 5: {
      lines.push(
        `Revenue Model: ${truncate(answers["Q5-1"] ?? "N/A", 80)}`,
      );
      if (answers["Q5-2"]) {
        lines.push(`Pricing: ${truncate(answers["Q5-2"], 80)}`);
      }
      lines.push(
        `6-Month Goal: ${truncate(answers["Q5-3"] ?? "N/A", 80)}`,
      );
      lines.push(`Team: ${truncate(answers["Q5-4"] ?? "N/A", 80)}`);
      lines.push(
        `Tech Level: ${truncate(answers["Q5-5"] ?? "N/A", 80)}`,
      );
      if (answers["Q5-6"]) {
        lines.push(`Preferred Tech: ${truncate(answers["Q5-6"], 80)}`);
      }
      lines.push(
        `Timeline: ${truncate(answers["Q5-7"] ?? "N/A", 80)}`,
      );
      lines.push(
        `Marketing: ${truncate(answers["Q5-8"] ?? "N/A", 80)}`,
      );
      break;
    }
  }

  return lines.join("\n");
}

function truncate(text: string, maxLen: number): string {
  const singleLine = text.replace(/\n/g, " ");
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen - 3) + "...";
}

function mapSeverity(answer: string): string {
  const lower = answer.toLowerCase();
  if (lower.startsWith("a")) return "High (daily pain)";
  if (lower.startsWith("b")) return "Medium (periodic pain)";
  if (lower.startsWith("c")) return "Low (minor inconvenience)";
  if (lower.startsWith("d")) return "Low (nice to have)";
  return answer || "N/A";
}

function mapValidation(answer: string): string {
  const lower = answer.toLowerCase();
  if (lower.startsWith("a")) return "Talked to 5+ people";
  if (lower.startsWith("b")) return "Talked to 1-4 people";
  if (lower.startsWith("c")) return "Own experience only";
  if (lower.startsWith("d")) return "Not validated yet";
  return answer || "N/A";
}
