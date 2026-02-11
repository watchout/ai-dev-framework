import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createGenerationState,
  loadGenerationState,
  saveGenerationState,
  markDocumentGenerating,
  markDocumentGenerated,
  markDocumentConfirmed,
  getStepDocuments,
  isStepComplete,
  completeGeneration,
  GENERATION_DOCUMENTS,
} from "./generate-state.js";

describe("generate-state", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fw-gen-state-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("GENERATION_DOCUMENTS", () => {
    it("defines documents for step 1 and step 2", () => {
      const step1 = GENERATION_DOCUMENTS.filter((d) => d.step === 1);
      const step2 = GENERATION_DOCUMENTS.filter((d) => d.step === 2);
      expect(step1.length).toBe(4);
      expect(step2.length).toBe(2);
    });
  });

  describe("createGenerationState", () => {
    it("creates state with valid defaults", () => {
      const state = createGenerationState();
      expect(state.currentStep).toBe(1);
      expect(state.status).toBe("idle");
      expect(state.documents).toHaveLength(6);
    });

    it("all documents start as pending", () => {
      const state = createGenerationState();
      for (const doc of state.documents) {
        expect(doc.status).toBe("pending");
      }
    });
  });

  describe("saveGenerationState / loadGenerationState", () => {
    it("persists state to disk", () => {
      const state = createGenerationState();
      saveGenerationState(tmpDir, state);

      const filePath = path.join(
        tmpDir,
        ".framework/generation-state.json",
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("loads saved state", () => {
      const state = createGenerationState();
      markDocumentGenerated(state, "docs/idea/IDEA_CANVAS.md", 80);
      saveGenerationState(tmpDir, state);

      const loaded = loadGenerationState(tmpDir);
      expect(loaded).not.toBeNull();
      const doc = loaded!.documents.find(
        (d) => d.path === "docs/idea/IDEA_CANVAS.md",
      );
      expect(doc?.status).toBe("generated");
      expect(doc?.completeness).toBe(80);
    });

    it("returns null when no state file exists", () => {
      expect(loadGenerationState(tmpDir)).toBeNull();
    });

    it("creates .framework directory if missing", () => {
      const state = createGenerationState();
      saveGenerationState(tmpDir, state);
      expect(
        fs.existsSync(path.join(tmpDir, ".framework")),
      ).toBe(true);
    });
  });

  describe("document state transitions", () => {
    it("marks document as generating", () => {
      const state = createGenerationState();
      markDocumentGenerating(state, "docs/idea/IDEA_CANVAS.md");

      const doc = state.documents.find(
        (d) => d.path === "docs/idea/IDEA_CANVAS.md",
      );
      expect(doc?.status).toBe("generating");
    });

    it("marks document as generated with completeness", () => {
      const state = createGenerationState();
      markDocumentGenerated(state, "docs/idea/IDEA_CANVAS.md", 80);

      const doc = state.documents.find(
        (d) => d.path === "docs/idea/IDEA_CANVAS.md",
      );
      expect(doc?.status).toBe("generated");
      expect(doc?.completeness).toBe(80);
      expect(doc?.generatedAt).toBeTruthy();
    });

    it("marks document as confirmed", () => {
      const state = createGenerationState();
      markDocumentGenerated(state, "docs/idea/IDEA_CANVAS.md", 80);
      markDocumentConfirmed(state, "docs/idea/IDEA_CANVAS.md");

      const doc = state.documents.find(
        (d) => d.path === "docs/idea/IDEA_CANVAS.md",
      );
      expect(doc?.status).toBe("confirmed");
      expect(doc?.confirmedAt).toBeTruthy();
    });
  });

  describe("getStepDocuments", () => {
    it("returns only step 1 documents", () => {
      const state = createGenerationState();
      const docs = getStepDocuments(state, 1);
      expect(docs).toHaveLength(4);
      for (const doc of docs) {
        expect(doc.step).toBe(1);
      }
    });

    it("returns only step 2 documents", () => {
      const state = createGenerationState();
      const docs = getStepDocuments(state, 2);
      expect(docs).toHaveLength(2);
      for (const doc of docs) {
        expect(doc.step).toBe(2);
      }
    });
  });

  describe("isStepComplete", () => {
    it("returns false when documents are pending", () => {
      const state = createGenerationState();
      expect(isStepComplete(state, 1)).toBe(false);
    });

    it("returns true when all step documents are generated", () => {
      const state = createGenerationState();
      const step1Docs = getStepDocuments(state, 1);
      for (const doc of step1Docs) {
        markDocumentGenerated(state, doc.path, 80);
      }
      expect(isStepComplete(state, 1)).toBe(true);
    });

    it("returns true when all step documents are confirmed", () => {
      const state = createGenerationState();
      const step1Docs = getStepDocuments(state, 1);
      for (const doc of step1Docs) {
        markDocumentGenerated(state, doc.path, 80);
        markDocumentConfirmed(state, doc.path);
      }
      expect(isStepComplete(state, 1)).toBe(true);
    });

    it("returns false when some documents are still pending", () => {
      const state = createGenerationState();
      markDocumentGenerated(state, "docs/idea/IDEA_CANVAS.md", 80);
      expect(isStepComplete(state, 1)).toBe(false);
    });
  });

  describe("completeGeneration", () => {
    it("marks generation as completed", () => {
      const state = createGenerationState();
      completeGeneration(state);
      expect(state.status).toBe("completed");
      expect(state.completedAt).toBeTruthy();
    });
  });
});
