/**
 * Generation state management - persistence and progress tracking
 * Based on: SSOT-4 Data Model (generation-state.json)
 *
 * Tracks which documents have been generated across the 3-step pipeline:
 * Step 1: Business (IDEA_CANVAS, USER_PERSONA, COMPETITOR_ANALYSIS, VALUE_PROPOSITION)
 * Step 2: Product (SSOT-0_PRD, SSOT-1_FEATURE_CATALOG)
 * Step 3: Technical (deferred - requires AI integration)
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface DocumentGenState {
  path: string;
  step: number;
  status: "pending" | "generating" | "generated" | "confirmed";
  completeness: number;
  generatedAt?: string;
  confirmedAt?: string;
}

export interface GenerationState {
  currentStep: number;
  status: "idle" | "running" | "paused" | "completed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  documents: DocumentGenState[];
}

const STATE_FILE = ".framework/generation-state.json";

/** Document definitions for each generation step */
export const GENERATION_DOCUMENTS: Omit<DocumentGenState, "status" | "generatedAt" | "confirmedAt">[] = [
  // Step 1: Business Design
  { path: "docs/idea/IDEA_CANVAS.md", step: 1, completeness: 0 },
  { path: "docs/idea/USER_PERSONA.md", step: 1, completeness: 0 },
  { path: "docs/idea/COMPETITOR_ANALYSIS.md", step: 1, completeness: 0 },
  { path: "docs/idea/VALUE_PROPOSITION.md", step: 1, completeness: 0 },
  // Step 2: Product Design
  { path: "docs/requirements/SSOT-0_PRD.md", step: 2, completeness: 0 },
  { path: "docs/requirements/SSOT-1_FEATURE_CATALOG.md", step: 2, completeness: 0 },
];

function statePath(projectDir: string): string {
  return path.join(projectDir, STATE_FILE);
}

export function createGenerationState(): GenerationState {
  const now = new Date().toISOString();
  return {
    currentStep: 1,
    status: "idle",
    startedAt: now,
    updatedAt: now,
    documents: GENERATION_DOCUMENTS.map((doc) => ({
      ...doc,
      status: "pending" as const,
    })),
  };
}

export function loadGenerationState(
  projectDir: string,
): GenerationState | null {
  const filePath = statePath(projectDir);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GenerationState;
}

export function saveGenerationState(
  projectDir: string,
  state: GenerationState,
): void {
  const filePath = statePath(projectDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function markDocumentGenerating(
  state: GenerationState,
  docPath: string,
): void {
  const doc = state.documents.find((d) => d.path === docPath);
  if (doc) {
    doc.status = "generating";
  }
}

export function markDocumentGenerated(
  state: GenerationState,
  docPath: string,
  completeness: number,
): void {
  const doc = state.documents.find((d) => d.path === docPath);
  if (doc) {
    doc.status = "generated";
    doc.completeness = completeness;
    doc.generatedAt = new Date().toISOString();
  }
}

export function markDocumentConfirmed(
  state: GenerationState,
  docPath: string,
): void {
  const doc = state.documents.find((d) => d.path === docPath);
  if (doc) {
    doc.status = "confirmed";
    doc.confirmedAt = new Date().toISOString();
  }
}

export function getStepDocuments(
  state: GenerationState,
  step: number,
): DocumentGenState[] {
  return state.documents.filter((d) => d.step === step);
}

export function isStepComplete(
  state: GenerationState,
  step: number,
): boolean {
  const docs = getStepDocuments(state, step);
  return docs.every((d) => d.status === "generated" || d.status === "confirmed");
}

export function completeGeneration(state: GenerationState): void {
  state.status = "completed";
  state.completedAt = new Date().toISOString();
}
