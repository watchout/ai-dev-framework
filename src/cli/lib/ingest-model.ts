/**
 * Ingest data model — types and state management for Design Ingest Pipeline
 *
 * Manages the lifecycle of ingested design documents:
 * inbox → parsed → SSOT generated → reviewed → approved → planned
 *
 * State persisted to .framework/ingest.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type IngestStatus =
  | "pending"      // Document queued, not yet processed
  | "parsing"      // Reading and extracting content
  | "generating"   // AI generating SSOT feature specs
  | "review"       // SSOT generated, awaiting human review
  | "approved"     // Reviewed and approved
  | "planned"      // Integrated into plan.json + GitHub Issues
  | "failed";      // Error during processing

export interface IngestDocument {
  /** Unique ID for this ingestion (e.g. INGEST-001) */
  id: string;
  /** Original file path (relative to project root) */
  sourcePath: string;
  /** Original file name */
  fileName: string;
  /** File format */
  format: "md" | "docx";
  /** Extracted markdown content (after parsing) */
  content?: string;
  /** Current status */
  status: IngestStatus;
  /** Generated SSOT feature specs */
  generatedSSOTs: GeneratedSSOT[];
  /** Generated plan features */
  generatedFeatures: GeneratedFeature[];
  /** Error message if failed */
  error?: string;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedSSOT {
  /** Feature ID (e.g. FEAT-101) */
  featureId: string;
  /** Feature name */
  featureName: string;
  /** Target file path (relative to project root, e.g. docs/design/features/...) */
  targetPath: string;
  /** Generated SSOT content (markdown) */
  content: string;
  /** SSOT completeness estimate (0-100) */
  completeness: number;
  /** Sections that need manual review */
  reviewNotes: string[];
}

export interface GeneratedFeature {
  /** Feature ID */
  featureId: string;
  /** Feature name */
  featureName: string;
  /** Priority */
  priority: "P0" | "P1" | "P2";
  /** Size estimate */
  size: "S" | "M" | "L" | "XL";
  /** Feature type */
  type: "common" | "proprietary";
  /** Dependencies on other features */
  dependencies: string[];
  /** Task decomposition */
  tasks: GeneratedTask[];
}

export interface GeneratedTask {
  /** Task ID */
  taskId: string;
  /** Task kind */
  kind: "db" | "api" | "ui" | "integration" | "test" | "review";
  /** Task name */
  name: string;
  /** SSOT section references */
  references: string[];
  /** Size */
  size: "S" | "M" | "L" | "XL";
}

export interface IngestState {
  /** All ingested documents */
  documents: IngestDocument[];
  /** Auto-increment counter for IDs */
  nextId: number;
  /** Last updated */
  updatedAt: string;
}

// ─────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────

const INGEST_STATE_FILE = ".framework/ingest.json";

export function createIngestState(): IngestState {
  return {
    documents: [],
    nextId: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function loadIngestState(projectDir: string): IngestState | null {
  const filePath = path.join(projectDir, INGEST_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IngestState;
  } catch {
    return null;
  }
}

export function saveIngestState(projectDir: string, state: IngestState): void {
  const filePath = path.join(projectDir, INGEST_STATE_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}

export function getOrCreateState(projectDir: string): IngestState {
  return loadIngestState(projectDir) ?? createIngestState();
}

// ─────────────────────────────────────────────
// Document Operations
// ─────────────────────────────────────────────

export function generateIngestId(state: IngestState): string {
  const id = `INGEST-${String(state.nextId).padStart(3, "0")}`;
  state.nextId++;
  return id;
}

export function createIngestDocument(
  state: IngestState,
  sourcePath: string,
): IngestDocument {
  const id = generateIngestId(state);
  const ext = path.extname(sourcePath).toLowerCase();
  const format = ext === ".docx" ? "docx" : "md";

  const doc: IngestDocument = {
    id,
    sourcePath,
    fileName: path.basename(sourcePath),
    format,
    status: "pending",
    generatedSSOTs: [],
    generatedFeatures: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.documents.push(doc);
  return doc;
}

export function findDocument(
  state: IngestState,
  idOrPath: string,
): IngestDocument | undefined {
  return state.documents.find(
    (d) => d.id === idOrPath || d.sourcePath === idOrPath || d.fileName === idOrPath,
  );
}

export function updateDocumentStatus(
  doc: IngestDocument,
  status: IngestStatus,
  error?: string,
): void {
  doc.status = status;
  doc.updatedAt = new Date().toISOString();
  if (error) doc.error = error;
}

/**
 * Detect ingestable files in docs/inbox/ directory.
 */
export function scanInbox(projectDir: string): string[] {
  const inboxDir = path.join(projectDir, "docs/inbox");
  if (!fs.existsSync(inboxDir)) return [];

  const files = fs.readdirSync(inboxDir);
  return files
    .filter((f) => /\.(md|docx)$/i.test(f))
    .map((f) => path.join("docs/inbox", f));
}

/**
 * Detect ingestable files from a given path (file or directory).
 */
export function resolveIngestPaths(
  projectDir: string,
  inputPath: string,
): string[] {
  const absPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(projectDir, inputPath);

  if (!fs.existsSync(absPath)) return [];

  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (/\.(md|docx)$/i.test(absPath)) {
      return [path.relative(projectDir, absPath)];
    }
    return [];
  }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(absPath);
    return files
      .filter((f) => /\.(md|docx)$/i.test(f))
      .map((f) => path.relative(projectDir, path.join(absPath, f)));
  }

  return [];
}
