/**
 * Ingest engine — Design Ingest Pipeline
 *
 * Reads design documents (md/docx), uses Claude to split them into
 * SSOT feature specs, generates plan.json entries, and creates GitHub Issues.
 *
 * Pipeline:
 * 1. Parse documents (md direct read, docx via pandoc)
 * 2. AI analysis: split into feature specs → SSOT format
 * 3. Write SSOT files to docs/design/features/
 * 4. Integrate into plan.json (add wave)
 * 5. Sync to GitHub Issues
 * 6. Review gate (human approval before plan integration)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import {
  type IngestState,
  type IngestDocument,
  type GeneratedSSOT,
  type GeneratedFeature,
  getOrCreateState,
  saveIngestState,
  createIngestDocument,
  updateDocumentStatus,
  resolveIngestPaths,
  scanInbox,
} from "./ingest-model.js";
import {
  type PlanState,
  type Feature,
  type Task,
  loadPlan,
  savePlan,
} from "./plan-model.js";
import { logger } from "./logger.js";

// ─────────────────────────────────────────────
// IO Interface
// ─────────────────────────────────────────────

export interface IngestIO {
  print(message: string): void;
  printProgress(step: string, detail: string): void;
}

export function createIngestTerminalIO(): IngestIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
    printProgress(step: string, detail: string): void {
      process.stdout.write(`  [${step}] ${detail}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Document Parsing
// ─────────────────────────────────────────────

/**
 * Parse a document file to markdown content.
 * - .md files: read directly
 * - .docx files: convert via pandoc
 */
export function parseDocument(
  projectDir: string,
  relativePath: string,
): string {
  const absPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(projectDir, relativePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase();

  if (ext === ".md") {
    return fs.readFileSync(absPath, "utf-8");
  }

  if (ext === ".docx") {
    return convertDocxToMarkdown(absPath);
  }

  throw new Error(`Unsupported format: ${ext}. Use .md or .docx`);
}

/**
 * Convert .docx to markdown using pandoc.
 */
function convertDocxToMarkdown(docxPath: string): string {
  try {
    const result = execFileSync("pandoc", [
      docxPath,
      "-f", "docx",
      "-t", "markdown",
      "--wrap=none",
    ], { encoding: "utf-8", timeout: 30_000 });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error(
        "pandoc is required for .docx conversion. Install: brew install pandoc",
      );
    }
    throw new Error(`Failed to convert docx: ${msg}`);
  }
}

// ─────────────────────────────────────────────
// AI SSOT Generation (Claude via spawn)
// ─────────────────────────────────────────────

/** Runner type for dependency injection in tests */
export type ClaudeRunner = (prompt: string, timeoutMs: number) => Promise<string>;

let _claudeRunner: ClaudeRunner = defaultClaudeRunner;

async function defaultClaudeRunner(
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const { getProvider, loadProviderConfig, spawnProvider } = await import(
    "./llm-provider.js"
  );
  const config = loadProviderConfig(process.cwd());
  const provider = getProvider("ingestion", config);
  const result = await spawnProvider(provider, prompt, {
    outputFormat: "json",
    experimentalAgentTeams: true,
    timeoutMs,
  });
  if (result.code !== 0 && result.stdout.length === 0) {
    throw new Error(
      `Provider "${provider.name}" exited with code ${result.code}: ${result.stderr.slice(0, 500)}`,
    );
  }
  // Claude's --output-format json wraps result in {result: "..."}; codex doesn't.
  if (provider.name === "claude") {
    try {
      const parsed = JSON.parse(result.stdout) as { result?: string };
      return parsed.result ?? result.stdout;
    } catch {
      return result.stdout;
    }
  }
  return result.stdout;
}

export function setClaudeRunner(runner: ClaudeRunner): () => void {
  const prev = _claudeRunner;
  _claudeRunner = runner;
  return () => { _claudeRunner = prev; };
}

// ─────────────────────────────────────────────
// SSOT Generation Prompt
// ─────────────────────────────────────────────

function buildSSOTGenerationPrompt(
  content: string,
  fileName: string,
  existingFeatureIds: string[],
): string {
  const nextIdNum = existingFeatureIds.length > 0
    ? Math.max(...existingFeatureIds.map((id) => {
        const match = id.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })) + 1
    : 101;

  return `あなたは AI Development Framework の SSOT 生成エキスパートです。
以下の設計書を分析し、機能単位に分割して SSOT 形式の機能仕様書を生成してください。

## 入力ファイル
ファイル名: ${fileName}

## 設計書内容
${content.slice(0, 50000)}

## 出力要件

設計書を機能（Feature）単位に分割し、各機能について以下の SSOT 形式で仕様書を生成してください。

### Feature ID の採番
- FEAT-${nextIdNum} から連番で採番
- 既存ID: ${existingFeatureIds.join(", ") || "なし"}

### 各機能仕様書の構成（SSOT テンプレート）
各機能について以下のセクションを含む markdown を生成:

\`\`\`
# [FEAT-XXX] [機能名] - SSOT

> Version: 1.0 | Status: Draft | Updated: ${new Date().toISOString().split("T")[0]}

## SS1 Document Info
| Field | Value |
|-------|-------|
| Feature ID | FEAT-XXX |
| Priority | P0/P1/P2 |
| Size | S/M/L/XL |

## SS2 Overview [CORE]
- 2.1 Purpose
- 2.2 Scope
- 2.3 User Story
- 2.4 User Flow

## SS3 Functional Requirements [CORE]
（RFC 2119 requirement table）

## SS4 Data Spec [CONTRACT]
- 4.1 Data items

## SS5 API Spec [CONTRACT]
（該当する場合のみ）

## SS6 UI Spec [CONTRACT]
（該当する場合のみ）

## SS7 Business Rules [CORE]

## SS8 Non-Functional Requirements [DETAIL]

## SS11 Dependencies
\`\`\`

### 出力形式（JSON）

以下の JSON 形式で出力してください。markdown は文字列として含めます:

\`\`\`json
{
  "features": [
    {
      "featureId": "FEAT-XXX",
      "featureName": "機能名",
      "priority": "P0",
      "size": "L",
      "type": "proprietary",
      "dependencies": [],
      "ssotContent": "# [FEAT-XXX] 機能名 - SSOT\\n...",
      "completeness": 70,
      "reviewNotes": ["SS3-E/F/G/H は手動で追加が必要", "..."],
      "tasks": [
        { "kind": "db", "name": "DB - テーブル定義", "references": ["SS4"], "size": "M" },
        { "kind": "api", "name": "API - エンドポイント実装", "references": ["SS5"], "size": "L" },
        { "kind": "ui", "name": "UI - 画面実装", "references": ["SS6"], "size": "L" },
        { "kind": "integration", "name": "Integration - 外部連携", "references": ["SS5", "SS11"], "size": "M" },
        { "kind": "test", "name": "Test - テスト実装", "references": ["SS10"], "size": "M" }
      ]
    }
  ]
}
\`\`\`

### ルール
1. 設計書の内容を忠実に反映する。推測で情報を追加しない
2. SS3-E（Example Table）, SS3-F（Boundary Values）, SS3-G（Exception Response）, SS3-H（Acceptance Tests）は設計書に十分な情報がなければ TBD とし reviewNotes に記載
3. 機能の粒度は「1つの GitHub Issue で追跡可能な単位」（実装1-3日程度）
4. 依存関係は機能間の技術的依存を正確に記述
5. completeness は SSOT テンプレートのセクション充足率（0-100）

JSON のみ出力してください。説明文は不要です。`;
}

// ─────────────────────────────────────────────
// Parse AI Response
// ─────────────────────────────────────────────

interface AIFeatureOutput {
  featureId: string;
  featureName: string;
  priority: "P0" | "P1" | "P2";
  size: "S" | "M" | "L" | "XL";
  type: "common" | "proprietary";
  dependencies: string[];
  ssotContent: string;
  completeness: number;
  reviewNotes: string[];
  tasks: Array<{
    kind: "db" | "api" | "ui" | "integration" | "test" | "review";
    name: string;
    references: string[];
    size: "S" | "M" | "L" | "XL";
  }>;
}

interface AIResponse {
  features: AIFeatureOutput[];
}

export function parseAIResponse(raw: string): AIResponse {
  // Extract JSON from response (may contain markdown code blocks)
  let jsonStr = raw;

  // Try to extract from code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    // Try to find raw JSON object
    const jsonMatch = raw.match(/\{[\s\S]*"features"[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  const parsed = JSON.parse(jsonStr) as AIResponse;

  if (!Array.isArray(parsed.features)) {
    throw new Error("AI response missing 'features' array");
  }

  return parsed;
}

// ─────────────────────────────────────────────
// Core Pipeline
// ─────────────────────────────────────────────

export interface IngestOptions {
  projectDir: string;
  inputPath?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  io: IngestIO;
}

export interface IngestResult {
  state: IngestState;
  processedDocuments: IngestDocument[];
  errors: string[];
}

/**
 * Run the Design Ingest Pipeline.
 */
export async function runIngest(options: IngestOptions): Promise<IngestResult> {
  const { projectDir, dryRun = false, timeoutMs = 300_000, io } = options;
  const errors: string[] = [];
  const processedDocuments: IngestDocument[] = [];

  // Load or create state
  const state = getOrCreateState(projectDir);

  // Resolve input files
  const inputFiles = options.inputPath
    ? resolveIngestPaths(projectDir, options.inputPath)
    : scanInbox(projectDir);

  if (inputFiles.length === 0) {
    errors.push(
      options.inputPath
        ? `No .md/.docx files found at: ${options.inputPath}`
        : "No files in docs/inbox/. Place design documents there or specify a path.",
    );
    return { state, processedDocuments, errors };
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  DESIGN INGEST PIPELINE");
  io.print("━".repeat(38));
  io.print(`  Files: ${inputFiles.length}`);
  io.print(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  io.print("");

  // Collect existing feature IDs from plan.json
  const existingFeatureIds = collectExistingFeatureIds(projectDir);

  for (const filePath of inputFiles) {
    io.printProgress("PARSE", filePath);

    // Check if already ingested
    const existing = state.documents.find((d) => d.sourcePath === filePath);
    if (existing && existing.status !== "failed") {
      io.printProgress("SKIP", `${filePath} already ingested as ${existing.id}`);
      continue;
    }

    // Create document entry
    const doc = createIngestDocument(state, filePath);
    processedDocuments.push(doc);

    // Step 1: Parse
    try {
      updateDocumentStatus(doc, "parsing");
      doc.content = parseDocument(projectDir, filePath);
      io.printProgress("OK", `Parsed ${doc.content.length} chars`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateDocumentStatus(doc, "failed", msg);
      errors.push(`Parse error (${filePath}): ${msg}`);
      continue;
    }

    // Step 2: AI SSOT Generation
    try {
      updateDocumentStatus(doc, "generating");
      io.printProgress("AI", "Generating SSOT feature specs...");

      const prompt = buildSSOTGenerationPrompt(
        doc.content,
        doc.fileName,
        existingFeatureIds,
      );

      const aiRaw = await _claudeRunner(prompt, timeoutMs);
      const aiResult = parseAIResponse(aiRaw);

      io.printProgress("OK", `Generated ${aiResult.features.length} feature specs`);

      // Convert AI output to model types
      for (const feat of aiResult.features) {
        // Track feature ID to avoid collisions
        existingFeatureIds.push(feat.featureId);

        const ssotPath = `docs/design/features/${feat.featureId.toLowerCase()}_${slugify(feat.featureName)}.md`;

        doc.generatedSSOTs.push({
          featureId: feat.featureId,
          featureName: feat.featureName,
          targetPath: ssotPath,
          content: feat.ssotContent,
          completeness: feat.completeness,
          reviewNotes: feat.reviewNotes,
        });

        doc.generatedFeatures.push({
          featureId: feat.featureId,
          featureName: feat.featureName,
          priority: feat.priority,
          size: feat.size,
          type: feat.type,
          dependencies: feat.dependencies,
          tasks: feat.tasks.map((t, i) => ({
            taskId: `${feat.featureId}-${t.kind.toUpperCase()}`,
            kind: t.kind,
            name: `${feat.featureId} - ${t.name}`,
            references: t.references,
            size: t.size,
          })),
        });
      }

      // Step 3: Write SSOT files (unless dry run)
      if (!dryRun) {
        for (const ssot of doc.generatedSSOTs) {
          const absTarget = path.join(projectDir, ssot.targetPath);
          const targetDir = path.dirname(absTarget);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.writeFileSync(absTarget, ssot.content, "utf-8");
          io.printProgress("WRITE", ssot.targetPath);
        }
      } else {
        for (const ssot of doc.generatedSSOTs) {
          io.printProgress("DRY", `Would write: ${ssot.targetPath}`);
        }
      }

      // Set to review status (human approval needed before plan integration)
      updateDocumentStatus(doc, "review");

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateDocumentStatus(doc, "failed", msg);
      errors.push(`AI generation error (${filePath}): ${msg}`);
    }
  }

  // Save state
  if (!dryRun) {
    saveIngestState(projectDir, state);
  }

  // Print summary
  io.print("");
  io.print("━".repeat(38));
  io.print("  INGEST SUMMARY");
  io.print("━".repeat(38));

  for (const doc of processedDocuments) {
    const icon = doc.status === "review" ? "+" : doc.status === "failed" ? "x" : ">";
    io.print(`  [${icon}] ${doc.id}: ${doc.fileName} (${doc.status})`);
    for (const ssot of doc.generatedSSOTs) {
      io.print(`      ${ssot.featureId}: ${ssot.featureName} (${ssot.completeness}%)`);
    }
  }
  io.print("");

  if (processedDocuments.some((d) => d.status === "review")) {
    io.print("  Next: Review generated SSOTs, then run 'framework ingest --approve'");
  }

  return { state, processedDocuments, errors };
}

// ─────────────────────────────────────────────
// Approve: integrate into plan.json + GitHub Issues
// ─────────────────────────────────────────────

export interface ApproveOptions {
  projectDir: string;
  documentId?: string;
  dryRun?: boolean;
  io: IngestIO;
}

export interface ApproveResult {
  approvedDocuments: IngestDocument[];
  featuresAdded: number;
  issuesCreated: number;
  errors: string[];
}

/**
 * Approve ingested documents and integrate into plan.json.
 * GitHub Issues creation is handled by `framework plan --sync`.
 */
export async function approveIngest(options: ApproveOptions): Promise<ApproveResult> {
  const { projectDir, documentId, dryRun = false, io } = options;
  const errors: string[] = [];

  const state = getOrCreateState(projectDir);

  // Find documents to approve
  const toApprove = documentId
    ? state.documents.filter((d) => d.id === documentId && d.status === "review")
    : state.documents.filter((d) => d.status === "review");

  if (toApprove.length === 0) {
    errors.push(
      documentId
        ? `Document ${documentId} not found or not in review status.`
        : "No documents in review status. Run 'framework ingest' first.",
    );
    return { approvedDocuments: [], featuresAdded: 0, issuesCreated: 0, errors };
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  APPROVE INGESTED DOCUMENTS");
  io.print("━".repeat(38));

  let featuresAdded = 0;

  // Load existing plan
  let plan = loadPlan(projectDir);

  for (const doc of toApprove) {
    io.printProgress("APPROVE", `${doc.id}: ${doc.fileName}`);

    if (!dryRun) {
      // Add features to plan.json
      if (plan && doc.generatedFeatures.length > 0) {
        const newWaveNumber = (plan.waves.length > 0
          ? Math.max(...plan.waves.map((w) => w.number))
          : 0) + 1;

        const newFeatures: Feature[] = doc.generatedFeatures.map((gf) => ({
          id: gf.featureId,
          name: gf.featureName,
          priority: gf.priority,
          size: gf.size,
          type: gf.type,
          dependencies: gf.dependencies,
          dependencyCount: 0,
          ssotFile: doc.generatedSSOTs.find((s) => s.featureId === gf.featureId)?.targetPath,
        }));

        const newTasks: Task[] = doc.generatedFeatures.flatMap((gf) =>
          gf.tasks.map((gt) => ({
            id: gt.taskId,
            featureId: gf.featureId,
            kind: gt.kind,
            name: gt.name,
            references: gt.references,
            blockedBy: [],
            blocks: [],
            size: gt.size,
          })),
        );

        plan.waves.push({
          number: newWaveNumber,
          phase: "individual",
          title: `Ingest: ${doc.fileName}`,
          features: newFeatures,
        });

        // Append tasks
        if (!plan.tasks) plan.tasks = [];
        plan.tasks.push(...newTasks);
        plan.updatedAt = new Date().toISOString();

        featuresAdded += newFeatures.length;

        for (const f of newFeatures) {
          io.printProgress("PLAN", `${f.id}: ${f.name} → Wave ${newWaveNumber}`);
        }
      }

      updateDocumentStatus(doc, "approved");
    } else {
      io.printProgress("DRY", `Would approve: ${doc.id}`);
      for (const gf of doc.generatedFeatures) {
        io.printProgress("DRY", `Would add to plan: ${gf.featureId}: ${gf.featureName}`);
      }
    }
  }

  // Save plan and state
  if (!dryRun) {
    if (plan) {
      savePlan(projectDir, plan);
      io.printProgress("SAVE", "plan.json updated");
    }
    saveIngestState(projectDir, state);
  }

  io.print("");
  io.print(`  Features added to plan: ${featuresAdded}`);
  io.print("  Next: Run 'framework plan --sync' to create GitHub Issues");

  return {
    approvedDocuments: toApprove,
    featuresAdded,
    issuesCreated: 0,
    errors,
  };
}

// ─────────────────────────────────────────────
// Status Display
// ─────────────────────────────────────────────

export function printIngestStatus(projectDir: string, io: IngestIO): void {
  const state = getOrCreateState(projectDir);

  if (state.documents.length === 0) {
    io.print("No ingested documents.");
    io.print("Run 'framework ingest [path]' to start.");
    return;
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  INGEST STATUS");
  io.print("━".repeat(38));
  io.print("");

  const statusCounts: Record<string, number> = {};

  for (const doc of state.documents) {
    statusCounts[doc.status] = (statusCounts[doc.status] ?? 0) + 1;

    const icon = statusIcon(doc.status);
    io.print(`  ${icon} ${doc.id}: ${doc.fileName}`);
    io.print(`     Status: ${doc.status} | SSOTs: ${doc.generatedSSOTs.length} | Features: ${doc.generatedFeatures.length}`);

    if (doc.error) {
      io.print(`     Error: ${doc.error}`);
    }

    for (const ssot of doc.generatedSSOTs) {
      const bar = progressBar(ssot.completeness);
      io.print(`     [${bar}] ${ssot.completeness}%  ${ssot.featureId}: ${ssot.featureName}`);
    }
    io.print("");
  }

  io.print(`  Total: ${state.documents.length} documents`);
  for (const [status, count] of Object.entries(statusCounts)) {
    io.print(`    ${status}: ${count}`);
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function statusIcon(status: string): string {
  switch (status) {
    case "pending": return "○";
    case "parsing": return "◔";
    case "generating": return "◑";
    case "review": return "◕";
    case "approved": return "●";
    case "planned": return "✓";
    case "failed": return "✗";
    default: return "?";
  }
}

function progressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
}

function collectExistingFeatureIds(projectDir: string): string[] {
  const plan = loadPlan(projectDir);
  if (!plan) return [];
  return plan.waves.flatMap((w) => w.features.map((f) => f.id));
}
