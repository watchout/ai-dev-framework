import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseDocument,
  parseAIResponse,
  runIngest,
  approveIngest,
  printIngestStatus,
  setClaudeRunner,
  type IngestIO,
} from "./ingest-engine.js";
import { saveIngestState, createIngestState, createIngestDocument, updateDocumentStatus } from "./ingest-model.js";

// Mock IO
function createMockIO(): IngestIO & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    print(msg: string) { lines.push(msg); },
    printProgress(step: string, detail: string) { lines.push(`[${step}] ${detail}`); },
  };
}

// Mock AI response
const MOCK_AI_RESPONSE = JSON.stringify({
  features: [
    {
      featureId: "FEAT-101",
      featureName: "AI Concierge Chat",
      priority: "P0",
      size: "L",
      type: "proprietary",
      dependencies: [],
      ssotContent: "# [FEAT-101] AI Concierge Chat - SSOT\n\n## SS1 Document Info\n| Field | Value |\n|-------|-------|\n| Feature ID | FEAT-101 |\n",
      completeness: 65,
      reviewNotes: ["SS3-E/F/G/H needs manual addition"],
      tasks: [
        { kind: "db", name: "DB - Schema definition", references: ["SS4"], size: "M" },
        { kind: "api", name: "API - Chat endpoint", references: ["SS5"], size: "L" },
        { kind: "ui", name: "UI - Chat interface", references: ["SS6"], size: "L" },
        { kind: "test", name: "Test - Chat tests", references: ["SS10"], size: "M" },
      ],
    },
    {
      featureId: "FEAT-102",
      featureName: "Ambient Mode",
      priority: "P1",
      size: "M",
      type: "proprietary",
      dependencies: ["FEAT-101"],
      ssotContent: "# [FEAT-102] Ambient Mode - SSOT\n\n## SS1 Document Info\n",
      completeness: 50,
      reviewNotes: ["Needs UI spec detail"],
      tasks: [
        { kind: "ui", name: "UI - Ambient display", references: ["SS6"], size: "M" },
        { kind: "test", name: "Test - Ambient tests", references: ["SS10"], size: "S" },
      ],
    },
  ],
});

describe("ingest-engine", () => {
  let tmpDir: string;
  let restoreRunner: () => void;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-engine-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    // Mock Claude runner
    restoreRunner = setClaudeRunner(async () => MOCK_AI_RESPONSE);
  });

  afterEach(() => {
    restoreRunner();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parseDocument", () => {
    it("reads markdown files", () => {
      const mdPath = path.join(tmpDir, "test.md");
      fs.writeFileSync(mdPath, "# Hello World\n\nContent here.");
      const content = parseDocument(tmpDir, mdPath);
      expect(content).toContain("# Hello World");
    });

    it("throws for missing file", () => {
      expect(() => parseDocument(tmpDir, "/tmp/nonexistent.md"))
        .toThrow("File not found");
    });

    it("throws for unsupported format", () => {
      const txtPath = path.join(tmpDir, "test.txt");
      fs.writeFileSync(txtPath, "hello");
      expect(() => parseDocument(tmpDir, txtPath))
        .toThrow("Unsupported format");
    });
  });

  describe("parseAIResponse", () => {
    it("parses raw JSON", () => {
      const result = parseAIResponse(MOCK_AI_RESPONSE);
      expect(result.features).toHaveLength(2);
      expect(result.features[0].featureId).toBe("FEAT-101");
    });

    it("extracts JSON from code block", () => {
      const wrapped = "```json\n" + MOCK_AI_RESPONSE + "\n```";
      const result = parseAIResponse(wrapped);
      expect(result.features).toHaveLength(2);
    });

    it("throws on invalid JSON", () => {
      expect(() => parseAIResponse("not json")).toThrow();
    });

    it("throws on missing features array", () => {
      expect(() => parseAIResponse('{"data": []}')).toThrow("missing 'features'");
    });
  });

  describe("runIngest", () => {
    it("ingests markdown files from path", async () => {
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Hotel AI Concierge\n\nDesign document content.");

      const io = createMockIO();
      const result = await runIngest({
        projectDir: tmpDir,
        inputPath: mdPath,
        io,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.processedDocuments).toHaveLength(1);
      expect(result.processedDocuments[0].status).toBe("review");
      expect(result.processedDocuments[0].generatedSSOTs).toHaveLength(2);
      expect(result.processedDocuments[0].generatedFeatures).toHaveLength(2);

      // Check SSOT files were written
      const ssotDir = path.join(tmpDir, "docs/design/features");
      expect(fs.existsSync(ssotDir)).toBe(true);
    });

    it("dry-run does not write files", async () => {
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");

      const io = createMockIO();
      await runIngest({
        projectDir: tmpDir,
        inputPath: mdPath,
        dryRun: true,
        io,
      });

      // No SSOT files written
      expect(fs.existsSync(path.join(tmpDir, "docs/design/features"))).toBe(false);
      // No state saved
      expect(fs.existsSync(path.join(tmpDir, ".framework/ingest.json"))).toBe(false);
    });

    it("skips already-ingested files", async () => {
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");

      const io = createMockIO();
      // First run
      await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });
      // Second run
      const result = await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });

      expect(result.processedDocuments).toHaveLength(0);
    });

    it("scans docs/inbox/ when no path given", async () => {
      const inboxDir = path.join(tmpDir, "docs/inbox");
      fs.mkdirSync(inboxDir, { recursive: true });
      fs.writeFileSync(path.join(inboxDir, "spec.md"), "# Spec");

      const io = createMockIO();
      const result = await runIngest({ projectDir: tmpDir, io });

      expect(result.processedDocuments).toHaveLength(1);
    });

    it("reports error when no files found", async () => {
      const io = createMockIO();
      const result = await runIngest({ projectDir: tmpDir, io });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("No files");
    });

    it("handles AI generation failure gracefully", async () => {
      const restoreFailRunner = setClaudeRunner(async () => {
        throw new Error("Claude unavailable");
      });

      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");

      const io = createMockIO();
      const result = await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });

      expect(result.processedDocuments[0].status).toBe("failed");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("AI generation error");

      restoreFailRunner();
    });
  });

  describe("approveIngest", () => {
    it("approves documents in review status", async () => {
      // Create a plan.json first
      const planState = {
        status: "generated" as const,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waves: [],
        tasks: [],
        circularDependencies: [],
      };
      fs.writeFileSync(
        path.join(tmpDir, ".framework/plan.json"),
        JSON.stringify(planState),
      );

      // Ingest a file first
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");
      const io = createMockIO();
      await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });

      // Approve
      const result = await approveIngest({ projectDir: tmpDir, io });

      expect(result.errors).toHaveLength(0);
      expect(result.approvedDocuments).toHaveLength(1);
      expect(result.featuresAdded).toBe(2);

      // Check plan.json updated
      const plan = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".framework/plan.json"), "utf-8"),
      );
      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0].features).toHaveLength(2);
      expect(plan.tasks).toHaveLength(6); // 4 + 2 tasks
    });

    it("errors when no documents to approve", async () => {
      const io = createMockIO();
      const result = await approveIngest({ projectDir: tmpDir, io });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("No documents in review status");
    });

    it("approves specific document by ID", async () => {
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");

      const planState = {
        status: "generated" as const,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waves: [],
        tasks: [],
        circularDependencies: [],
      };
      fs.writeFileSync(
        path.join(tmpDir, ".framework/plan.json"),
        JSON.stringify(planState),
      );

      const io = createMockIO();
      await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });

      const result = await approveIngest({
        projectDir: tmpDir,
        documentId: "INGEST-001",
        io,
      });

      expect(result.approvedDocuments).toHaveLength(1);
    });
  });

  describe("printIngestStatus", () => {
    it("prints empty state message", () => {
      const io = createMockIO();
      printIngestStatus(tmpDir, io);
      expect(io.lines.some((l) => l.includes("No ingested documents"))).toBe(true);
    });

    it("prints document status", async () => {
      const mdPath = path.join(tmpDir, "design.md");
      fs.writeFileSync(mdPath, "# Test");

      const io = createMockIO();
      await runIngest({ projectDir: tmpDir, inputPath: mdPath, io });

      const statusIO = createMockIO();
      printIngestStatus(tmpDir, statusIO);
      expect(statusIO.lines.some((l) => l.includes("INGEST-001"))).toBe(true);
      expect(statusIO.lines.some((l) => l.includes("review"))).toBe(true);
    });
  });
});
