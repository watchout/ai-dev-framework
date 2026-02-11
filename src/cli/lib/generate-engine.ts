/**
 * Generation engine - orchestrates document generation from discover answers
 * Based on: 10_GENERATION_CHAIN.md
 *
 * Pipeline:
 * Step 1: Business (IDEA_CANVAS -> USER_PERSONA -> COMPETITOR_ANALYSIS -> VALUE_PROPOSITION)
 * Step 2: Product (SSOT-0_PRD -> SSOT-1_FEATURE_CATALOG)
 * Step 3: Technical (deferred - requires AI integration)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type DiscoverSessionData, loadSession } from "./discover-session.js";
import {
  type GenerationState,
  createGenerationState,
  loadGenerationState,
  saveGenerationState,
  markDocumentGenerating,
  markDocumentGenerated,
  getStepDocuments,
  isStepComplete,
  completeGeneration,
} from "./generate-state.js";
import {
  TEMPLATE_GENERATORS,
  EXPECTED_COMPLETENESS,
} from "./generate-templates.js";

export interface GenerateIO {
  print(message: string): void;
  printProgress(docPath: string, completeness: number): void;
}

export interface GenerateOptions {
  projectDir: string;
  step?: 1 | 2;
  io: GenerateIO;
}

export interface GenerateResult {
  state: GenerationState;
  generatedDocuments: string[];
  errors: string[];
}

/**
 * Create a terminal IO implementation
 */
export function createGenerateTerminalIO(): GenerateIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    printProgress(docPath: string, completeness: number): void {
      const filled = Math.round(completeness / 10);
      const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
      const name = path.basename(docPath, ".md");
      process.stdout.write(`  [${bar}] ${completeness}%  ${name}\n`);
    },
  };
}

/**
 * Run the generation engine
 */
export async function runGenerateEngine(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { projectDir, io } = options;
  const errors: string[] = [];
  const generatedDocuments: string[] = [];

  // Load discover session
  const session = loadSession(projectDir);
  if (!session) {
    errors.push("No discover session found. Run 'framework discover' first.");
    return {
      state: createGenerationState(),
      generatedDocuments,
      errors,
    };
  }

  if (session.status !== "completed") {
    errors.push(
      `Discover session is ${session.status}. Complete 'framework discover' first.`,
    );
    return {
      state: createGenerationState(),
      generatedDocuments,
      errors,
    };
  }

  // Load or create generation state
  let state = loadGenerationState(projectDir);
  if (!state) {
    state = createGenerationState();
  }
  state.status = "running";
  saveGenerationState(projectDir, state);

  // Determine which steps to run
  const stepsToRun = options.step ? [options.step] : [1, 2];

  for (const step of stepsToRun) {
    // Skip if already complete
    if (isStepComplete(state, step)) {
      io.print(`\nStep ${step} already completed. Skipping.`);
      continue;
    }

    io.print(`\n${"━".repeat(38)}`);
    io.print(`  Step ${step}: ${getStepTitle(step)}`);
    io.print(`${"━".repeat(38)}\n`);

    const docs = getStepDocuments(state, step);

    for (const doc of docs) {
      if (doc.status === "generated" || doc.status === "confirmed") {
        io.print(`  Skipping ${path.basename(doc.path)} (already generated)`);
        continue;
      }

      const generator = TEMPLATE_GENERATORS[doc.path];
      if (!generator) {
        errors.push(`No template generator for ${doc.path}`);
        continue;
      }

      markDocumentGenerating(state, doc.path);
      saveGenerationState(projectDir, state);

      try {
        const content = generator(session.answers);
        const fullPath = path.join(projectDir, doc.path);

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, "utf-8");

        const completeness = EXPECTED_COMPLETENESS[doc.path] ?? 0;
        markDocumentGenerated(state, doc.path, completeness);
        saveGenerationState(projectDir, state);

        io.printProgress(doc.path, completeness);
        generatedDocuments.push(doc.path);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`Failed to generate ${doc.path}: ${msg}`);
      }
    }

    if (isStepComplete(state, step)) {
      io.print(`\n  Step ${step} complete.`);
    }
  }

  // Check overall completion
  const allStepsComplete = stepsToRun.every((s) =>
    isStepComplete(state, s),
  );

  if (allStepsComplete) {
    completeGeneration(state);
  } else {
    state.status = "paused";
  }

  saveGenerationState(projectDir, state);

  return { state, generatedDocuments, errors };
}

function getStepTitle(step: number): string {
  switch (step) {
    case 1:
      return "Business Design";
    case 2:
      return "Product Design";
    case 3:
      return "Technical Design";
    default:
      return `Step ${step}`;
  }
}

/**
 * Get a summary of generation state for display
 */
export function getGenerationSummary(
  state: GenerationState,
): { step: number; documents: { name: string; completeness: number; status: string }[] }[] {
  const steps = [1, 2];
  return steps.map((step) => {
    const docs = getStepDocuments(state, step);
    return {
      step,
      documents: docs.map((d) => ({
        name: path.basename(d.path, ".md"),
        completeness: d.completeness,
        status: d.status,
      })),
    };
  });
}
