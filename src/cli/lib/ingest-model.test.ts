import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createIngestState,
  loadIngestState,
  saveIngestState,
  getOrCreateState,
  generateIngestId,
  createIngestDocument,
  findDocument,
  updateDocumentStatus,
  scanInbox,
  resolveIngestPaths,
} from "./ingest-model.js";

describe("ingest-model", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-model-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("createIngestState", () => {
    it("creates empty state", () => {
      const state = createIngestState();
      expect(state.documents).toEqual([]);
      expect(state.nextId).toBe(1);
      expect(state.updatedAt).toBeTruthy();
    });
  });

  describe("save/load", () => {
    it("round-trips state", () => {
      const state = createIngestState();
      createIngestDocument(state, "docs/inbox/test.md");
      saveIngestState(tmpDir, state);

      const loaded = loadIngestState(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.documents).toHaveLength(1);
      expect(loaded!.documents[0].id).toBe("INGEST-001");
    });

    it("returns null for missing state", () => {
      expect(loadIngestState(tmpDir)).toBeNull();
    });
  });

  describe("getOrCreateState", () => {
    it("creates new state if none exists", () => {
      const state = getOrCreateState(tmpDir);
      expect(state.documents).toEqual([]);
    });

    it("loads existing state", () => {
      const state = createIngestState();
      createIngestDocument(state, "test.md");
      saveIngestState(tmpDir, state);

      const loaded = getOrCreateState(tmpDir);
      expect(loaded.documents).toHaveLength(1);
    });
  });

  describe("generateIngestId", () => {
    it("generates sequential IDs", () => {
      const state = createIngestState();
      expect(generateIngestId(state)).toBe("INGEST-001");
      expect(generateIngestId(state)).toBe("INGEST-002");
      expect(generateIngestId(state)).toBe("INGEST-003");
    });
  });

  describe("createIngestDocument", () => {
    it("creates md document", () => {
      const state = createIngestState();
      const doc = createIngestDocument(state, "docs/inbox/design.md");
      expect(doc.id).toBe("INGEST-001");
      expect(doc.format).toBe("md");
      expect(doc.status).toBe("pending");
      expect(doc.fileName).toBe("design.md");
    });

    it("creates docx document", () => {
      const state = createIngestState();
      const doc = createIngestDocument(state, "docs/inbox/spec.docx");
      expect(doc.format).toBe("docx");
    });

    it("adds to state", () => {
      const state = createIngestState();
      createIngestDocument(state, "a.md");
      createIngestDocument(state, "b.md");
      expect(state.documents).toHaveLength(2);
      expect(state.nextId).toBe(3);
    });
  });

  describe("findDocument", () => {
    it("finds by ID", () => {
      const state = createIngestState();
      createIngestDocument(state, "test.md");
      const found = findDocument(state, "INGEST-001");
      expect(found).toBeDefined();
      expect(found!.fileName).toBe("test.md");
    });

    it("finds by sourcePath", () => {
      const state = createIngestState();
      createIngestDocument(state, "docs/inbox/test.md");
      const found = findDocument(state, "docs/inbox/test.md");
      expect(found).toBeDefined();
    });

    it("finds by fileName", () => {
      const state = createIngestState();
      createIngestDocument(state, "docs/inbox/test.md");
      const found = findDocument(state, "test.md");
      expect(found).toBeDefined();
    });

    it("returns undefined for no match", () => {
      const state = createIngestState();
      expect(findDocument(state, "nope")).toBeUndefined();
    });
  });

  describe("updateDocumentStatus", () => {
    it("updates status", () => {
      const state = createIngestState();
      const doc = createIngestDocument(state, "test.md");
      updateDocumentStatus(doc, "generating");
      expect(doc.status).toBe("generating");
    });

    it("sets error", () => {
      const state = createIngestState();
      const doc = createIngestDocument(state, "test.md");
      updateDocumentStatus(doc, "failed", "parse error");
      expect(doc.status).toBe("failed");
      expect(doc.error).toBe("parse error");
    });
  });

  describe("scanInbox", () => {
    it("finds md and docx files", () => {
      const inboxDir = path.join(tmpDir, "docs/inbox");
      fs.mkdirSync(inboxDir, { recursive: true });
      fs.writeFileSync(path.join(inboxDir, "design.md"), "# Test");
      fs.writeFileSync(path.join(inboxDir, "spec.docx"), "fake");
      fs.writeFileSync(path.join(inboxDir, "notes.txt"), "skip");

      const files = scanInbox(tmpDir);
      expect(files).toHaveLength(2);
      expect(files).toContain("docs/inbox/design.md");
      expect(files).toContain("docs/inbox/spec.docx");
    });

    it("returns empty for missing inbox", () => {
      expect(scanInbox(tmpDir)).toEqual([]);
    });
  });

  describe("resolveIngestPaths", () => {
    it("resolves single file", () => {
      const filePath = path.join(tmpDir, "design.md");
      fs.writeFileSync(filePath, "# Test");
      const files = resolveIngestPaths(tmpDir, "design.md");
      expect(files).toHaveLength(1);
      expect(files[0]).toBe("design.md");
    });

    it("resolves directory", () => {
      const dir = path.join(tmpDir, "specs");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "a.md"), "A");
      fs.writeFileSync(path.join(dir, "b.md"), "B");
      fs.writeFileSync(path.join(dir, "c.txt"), "C");

      const files = resolveIngestPaths(tmpDir, "specs");
      expect(files).toHaveLength(2);
    });

    it("returns empty for non-existent path", () => {
      expect(resolveIngestPaths(tmpDir, "nope")).toEqual([]);
    });

    it("resolves absolute path", () => {
      const filePath = path.join(tmpDir, "test.md");
      fs.writeFileSync(filePath, "# Test");
      const files = resolveIngestPaths(tmpDir, filePath);
      expect(files).toHaveLength(1);
    });
  });
});
