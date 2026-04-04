/**
 * Modify engine — Modification Instruction → Differential SSOT Update
 *
 * Handles the unified flow:
 * 1. Read modification instruction text
 * 2. Match against existing SSOTs (AI-powered)
 * 3. Generate differential SSOT updates (affected sections only)
 * 4. Save as ModificationRecord for review
 * 5. Apply approved modifications
 *
 * FEAT-201: Auto-ingest on modification
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type IngestState,
  getOrCreateState,
  saveIngestState,
} from "./ingest-model.js";
import {
  parseDocument,
  type ClaudeRunner,
} from "./ingest-engine.js";
import { logger } from "./logger.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ModificationStatus =
  | "pending"
  | "analyzing"
  | "review"
  | "approved"
  | "applied"
  | "failed";

export interface SSOTDiff {
  featureId: string;
  section: string;
  before: string;
  after: string;
  reason: string;
}

export interface ModificationRecord {
  id: string;
  sourcePath: string;
  targetSSOTs: string[];
  affectedSections: string[];
  status: ModificationStatus;
  diffs: SSOTDiff[];
  coreLayerChanged: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModifyState {
  modifications: ModificationRecord[];
  nextId: number;
  updatedAt: string;
}

export interface ModifyIO {
  print(message: string): void;
  printProgress(step: string, detail: string): void;
}

export function createModifyTerminalIO(): ModifyIO {
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
// State Management
// ─────────────────────────────────────────────

const MODIFY_STATE_FILE = ".framework/modify.json";

export function createModifyState(): ModifyState {
  return {
    modifications: [],
    nextId: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function loadModifyState(projectDir: string): ModifyState | null {
  const filePath = path.join(projectDir, MODIFY_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ModifyState;
  } catch {
    return null;
  }
}

export function saveModifyState(projectDir: string, state: ModifyState): void {
  const filePath = path.join(projectDir, MODIFY_STATE_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}

function getOrCreateModifyState(projectDir: string): ModifyState {
  return loadModifyState(projectDir) ?? createModifyState();
}

function generateModifyId(state: ModifyState): string {
  const id = `MOD-${String(state.nextId).padStart(3, "0")}`;
  state.nextId++;
  return id;
}

// ─────────────────────────────────────────────
// SSOT Discovery
// ─────────────────────────────────────────────

interface SSOTFile {
  featureId: string;
  filePath: string;
  content: string;
  sections: Map<string, string>;
}

const CORE_SECTIONS = ["§2", "§7"];

/**
 * Scan docs/design/features/ for SSOT files and parse their sections.
 */
export function discoverSSOTs(projectDir: string): SSOTFile[] {
  const featuresDir = path.join(projectDir, "docs/design/features");
  if (!fs.existsSync(featuresDir)) return [];

  const files = fs.readdirSync(featuresDir).filter((f) => f.endsWith(".md"));
  const ssots: SSOTFile[] = [];

  for (const file of files) {
    const filePath = path.join("docs/design/features", file);
    const absPath = path.join(projectDir, filePath);
    const content = fs.readFileSync(absPath, "utf-8");

    const featureIdMatch = content.match(/FEAT-\d+/);
    if (!featureIdMatch) continue;

    const sections = parseSSOTSections(content);

    ssots.push({
      featureId: featureIdMatch[0],
      filePath,
      content,
      sections,
    });
  }

  return ssots;
}

/**
 * Parse SSOT markdown into section map.
 * Keys: "§1", "§2", "§3", "§3-E", "§3-F", "§3-G", "§3-H", "§4", etc.
 */
export function parseSSOTSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split("\n");

  let currentSection = "";
  let currentContent: string[] = [];

  const sectionPattern = /^##\s+§(\d+(?:-[A-Z])?)/;
  const subSectionPattern = /^###\s+§?(\d+-[A-Z])/;

  for (const line of lines) {
    const mainMatch = line.match(sectionPattern);
    const subMatch = line.match(subSectionPattern);

    if (mainMatch || subMatch) {
      if (currentSection) {
        sections.set(currentSection, currentContent.join("\n").trim());
      }
      const sectionId = mainMatch ? `§${mainMatch[1]}` : `§${subMatch![1]}`;
      currentSection = sectionId;
      currentContent = [line];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections.set(currentSection, currentContent.join("\n").trim());
  }

  return sections;
}

// ─────────────────────────────────────────────
// AI Prompt for Modification Analysis
// ─────────────────────────────────────────────

function buildModifyPrompt(
  instruction: string,
  ssots: SSOTFile[],
): string {
  const ssotSummaries = ssots.map((s) => {
    const sectionKeys = Array.from(s.sections.keys()).join(", ");
    return `- ${s.featureId}: ${s.filePath} [sections: ${sectionKeys}]`;
  }).join("\n");

  const ssotContents = ssots.map((s) => {
    return `### ${s.featureId} (${s.filePath})\n\n${s.content.slice(0, 8000)}`;
  }).join("\n\n---\n\n");

  return `あなたは AI Development Framework の SSOT 差分更新エキスパートです。
以下の修正指示を分析し、既存SSOTの該当セクションのみを更新する差分を生成してください。

## 修正指示
${instruction}

## 既存SSOT一覧
${ssotSummaries}

## 既存SSOT内容
${ssotContents}

## 出力要件

### 分析ステップ
1. 修正指示の内容を理解する
2. 影響を受けるSSOTを特定する（featureId）
3. 影響を受けるセクションを特定する（§N形式）
4. 該当セクションの更新後の内容を生成する

### 重要ルール
- **影響を受けるセクションのみ**を出力する。変更のないセクションは含めない
- CORE層（§2 機能概要、§7 ビジネスルール）への変更がある場合、coreLayerChanged: true にする
- 既存の内容を尊重し、追加・変更部分のみを反映する
- 推測で情報を追加しない

### 出力形式（JSON）

\`\`\`json
{
  "matches": [
    {
      "featureId": "FEAT-XXX",
      "confidence": 0.95,
      "affectedSections": ["§5"],
      "coreLayerChanged": false,
      "diffs": [
        {
          "section": "§5",
          "reason": "APIレスポンスにrefresh_tokenフィールドを追加",
          "updatedContent": "## §5 API仕様 [CONTRACT]\\n\\n..."
        }
      ]
    }
  ]
}
\`\`\`

JSON のみ出力してください。説明文は不要です。`;
}

interface AIModifyMatch {
  featureId: string;
  confidence: number;
  affectedSections: string[];
  coreLayerChanged: boolean;
  diffs: Array<{
    section: string;
    reason: string;
    updatedContent: string;
  }>;
}

interface AIModifyResponse {
  matches: AIModifyMatch[];
}

function parseModifyAIResponse(raw: string): AIModifyResponse {
  let jsonStr = raw;

  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    const jsonMatch = raw.match(/\{[\s\S]*"matches"[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  const parsed = JSON.parse(jsonStr) as AIModifyResponse;

  if (!Array.isArray(parsed.matches)) {
    throw new Error("AI response missing 'matches' array");
  }

  return parsed;
}

// ─────────────────────────────────────────────
// Core Pipeline
// ─────────────────────────────────────────────

export interface ModifyOptions {
  projectDir: string;
  inputPath?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  io: ModifyIO;
}

export interface ModifyResult {
  modifications: ModificationRecord[];
  errors: string[];
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Run the modification pipeline:
 * instruction → match SSOTs → generate diffs → save for review
 */
export async function runModify(options: ModifyOptions): Promise<ModifyResult> {
  const { projectDir, dryRun = false, timeoutMs = 300_000, io } = options;
  const errors: string[] = [];
  const modifications: ModificationRecord[] = [];

  // Validate .framework exists
  if (!fs.existsSync(path.join(projectDir, ".framework"))) {
    errors.push("Not a framework project (.framework not found)");
    return { modifications, errors };
  }

  // Discover existing SSOTs
  const ssots = discoverSSOTs(projectDir);
  if (ssots.length === 0) {
    errors.push("No SSOTs found in docs/design/features/. Run 'framework ingest' first.");
    return { modifications, errors };
  }

  // Resolve input files
  const inputFiles = resolveModifyInputs(projectDir, options.inputPath);
  if (inputFiles.length === 0) {
    errors.push(
      options.inputPath
        ? `No .md/.docx files found at: ${options.inputPath}`
        : "No files in docs/inbox/. Place modification instructions there or specify a path.",
    );
    return { modifications, errors };
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  MODIFY — DIFFERENTIAL SSOT UPDATE");
  io.print("━".repeat(38));
  io.print(`  Files: ${inputFiles.length}`);
  io.print(`  Existing SSOTs: ${ssots.length}`);
  io.print(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  io.print("");

  const state = getOrCreateModifyState(projectDir);

  for (const filePath of inputFiles) {
    io.printProgress("PARSE", filePath);

    // Read instruction file
    let instruction: string;
    try {
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectDir, filePath);

      const stat = fs.statSync(absPath);
      if (stat.size > MAX_FILE_SIZE) {
        errors.push(`File too large (max 10MB): ${filePath}`);
        continue;
      }

      instruction = parseDocument(projectDir, filePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Parse error (${filePath}): ${msg}`);
      continue;
    }

    if (!instruction.trim()) {
      errors.push(`Modification instruction is empty or unparseable: ${filePath}`);
      continue;
    }

    io.printProgress("OK", `Parsed ${instruction.length} chars`);

    // AI Analysis
    io.printProgress("AI", "Analyzing modification and matching SSOTs...");

    let aiResult: AIModifyResponse;
    try {
      const prompt = buildModifyPrompt(instruction, ssots);
      const aiRaw = await _modifyClaudeRunner(prompt, timeoutMs);
      aiResult = parseModifyAIResponse(aiRaw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`AI analysis failed: ${msg}`);
      continue;
    }

    if (aiResult.matches.length === 0) {
      errors.push(
        "No matching SSOT found for this instruction. Consider using 'framework ingest' for new features.",
      );
      continue;
    }

    // Create modification record
    const record: ModificationRecord = {
      id: generateModifyId(state),
      sourcePath: filePath,
      targetSSOTs: aiResult.matches.map((m) => m.featureId),
      affectedSections: aiResult.matches.flatMap((m) => m.affectedSections),
      status: "review",
      diffs: [],
      coreLayerChanged: aiResult.matches.some((m) => m.coreLayerChanged),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Build diffs
    for (const match of aiResult.matches) {
      io.printProgress("MATCH", `${match.featureId} — confidence: ${match.confidence.toFixed(2)}`);
      io.printProgress("SECTIONS", match.affectedSections.join(", "));

      const ssot = ssots.find((s) => s.featureId === match.featureId);
      if (!ssot) continue;

      for (const diff of match.diffs) {
        const beforeContent = ssot.sections.get(diff.section) ?? "";

        record.diffs.push({
          featureId: match.featureId,
          section: diff.section,
          before: beforeContent,
          after: diff.updatedContent,
          reason: diff.reason,
        });

        // Print diff preview
        io.print("");
        io.print(`  --- ${ssot.filePath} ${diff.section} (before)`);
        io.print(`  +++ ${ssot.filePath} ${diff.section} (after)`);
        io.print(`  Reason: ${diff.reason}`);

        const beforeLines = beforeContent.split("\n").slice(0, 5);
        const afterLines = diff.updatedContent.split("\n").slice(0, 5);
        for (const line of beforeLines) {
          io.print(`  - ${line}`);
        }
        for (const line of afterLines) {
          io.print(`  + ${line}`);
        }
        if (afterLines.length === 5) {
          io.print("  ... (truncated)");
        }
        io.print("");
      }
    }

    // CORE layer warning
    if (record.coreLayerChanged) {
      io.print("  ⚠ CORE layer (§2, §7) change detected. Requires manual review.");
    }

    state.modifications.push(record);
    modifications.push(record);

    io.printProgress("SAVE", `${record.id} saved (status: review)`);
  }

  // Save state
  if (!dryRun) {
    saveModifyState(projectDir, state);
  }

  // Summary
  io.print("");
  io.print("━".repeat(38));
  io.print("  MODIFY SUMMARY");
  io.print("━".repeat(38));
  for (const mod of modifications) {
    io.print(`  ${mod.id}: ${mod.sourcePath}`);
    io.print(`    Targets: ${mod.targetSSOTs.join(", ")}`);
    io.print(`    Sections: ${mod.affectedSections.join(", ")}`);
    io.print(`    Status: ${mod.status}${mod.coreLayerChanged ? " (CORE layer changed)" : ""}`);
  }
  io.print("");

  if (modifications.length > 0) {
    io.print("  Review the diffs, then: framework modify --approve <id>");
  }

  return { modifications, errors };
}

// ─────────────────────────────────────────────
// Approve: Apply diffs to SSOT files
// ─────────────────────────────────────────────

export interface ApproveModifyOptions {
  projectDir: string;
  modificationId?: string;
  dryRun?: boolean;
  io: ModifyIO;
}

export interface ApproveModifyResult {
  approved: ModificationRecord[];
  errors: string[];
}

export async function approveModify(options: ApproveModifyOptions): Promise<ApproveModifyResult> {
  const { projectDir, modificationId, dryRun = false, io } = options;
  const errors: string[] = [];

  const state = getOrCreateModifyState(projectDir);

  const toApprove = modificationId
    ? state.modifications.filter((m) => m.id === modificationId && m.status === "review")
    : state.modifications.filter((m) => m.status === "review");

  if (toApprove.length === 0) {
    errors.push(
      modificationId
        ? `Modification ${modificationId} not found or not in review status.`
        : "No modifications in review status. Run 'framework modify' first.",
    );
    return { approved: [], errors };
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  APPROVE MODIFICATIONS");
  io.print("━".repeat(38));

  for (const mod of toApprove) {
    io.printProgress("APPROVE", `${mod.id}: ${mod.sourcePath}`);

    if (!dryRun) {
      // Apply diffs to SSOT files
      for (const diff of mod.diffs) {
        const ssotPath = findSSOTPathByFeatureId(projectDir, diff.featureId);
        if (!ssotPath) {
          errors.push(`SSOT file not found for ${diff.featureId}`);
          continue;
        }

        const absPath = path.join(projectDir, ssotPath);
        const content = fs.readFileSync(absPath, "utf-8");

        // Replace the section content
        const updated = replaceSSOTSection(content, diff.section, diff.after);
        fs.writeFileSync(absPath, updated, "utf-8");

        io.printProgress("APPLY", `${diff.featureId} ${diff.section} updated`);
      }

      mod.status = "approved";
      mod.updatedAt = new Date().toISOString();
    } else {
      io.printProgress("DRY", `Would apply ${mod.diffs.length} diffs`);
    }
  }

  if (!dryRun) {
    saveModifyState(projectDir, state);
  }

  io.print("");
  io.print(`  Approved: ${toApprove.length} modifications`);

  return { approved: toApprove, errors };
}

// ─────────────────────────────────────────────
// Status Display
// ─────────────────────────────────────────────

export function printModifyStatus(projectDir: string, io: ModifyIO): void {
  const state = loadModifyState(projectDir);

  if (!state || state.modifications.length === 0) {
    io.print("No modification records.");
    io.print("Run 'framework modify <path>' to start.");
    return;
  }

  io.print("");
  io.print("━".repeat(38));
  io.print("  MODIFY STATUS");
  io.print("━".repeat(38));
  io.print("");

  for (const mod of state.modifications) {
    const icon = mod.status === "review" ? "◕" : mod.status === "approved" ? "●" : mod.status === "failed" ? "✗" : "○";
    io.print(`  ${icon} ${mod.id}: ${mod.sourcePath}`);
    io.print(`     Status: ${mod.status} | Targets: ${mod.targetSSOTs.join(", ")} | Sections: ${mod.affectedSections.join(", ")}`);
    if (mod.coreLayerChanged) {
      io.print("     ⚠ CORE layer change");
    }
    io.print("");
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function resolveModifyInputs(projectDir: string, inputPath?: string): string[] {
  if (inputPath) {
    const absPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.join(projectDir, inputPath);

    if (!fs.existsSync(absPath)) return [];

    const stat = fs.statSync(absPath);
    if (stat.isFile() && /\.(md|docx)$/i.test(absPath)) {
      return [path.relative(projectDir, absPath)];
    }

    if (stat.isDirectory()) {
      return fs.readdirSync(absPath)
        .filter((f) => /\.(md|docx)$/i.test(f))
        .map((f) => path.relative(projectDir, path.join(absPath, f)));
    }

    return [];
  }

  // Default: scan docs/inbox/
  const inboxDir = path.join(projectDir, "docs/inbox");
  if (!fs.existsSync(inboxDir)) return [];

  return fs.readdirSync(inboxDir)
    .filter((f) => /\.(md|docx)$/i.test(f))
    .map((f) => path.join("docs/inbox", f));
}

function findSSOTPathByFeatureId(projectDir: string, featureId: string): string | null {
  const featuresDir = path.join(projectDir, "docs/design/features");
  if (!fs.existsSync(featuresDir)) return null;

  const files = fs.readdirSync(featuresDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const absPath = path.join(featuresDir, file);
    const content = fs.readFileSync(absPath, "utf-8");
    if (content.includes(featureId)) {
      return path.join("docs/design/features", file);
    }
  }
  return null;
}

/**
 * Replace a section in SSOT markdown content.
 * Finds the section header and replaces everything until the next same-level or higher section.
 */
export function replaceSSOTSection(
  content: string,
  sectionId: string,
  newContent: string,
): string {
  const lines = content.split("\n");
  const sectionNum = sectionId.replace("§", "");

  // Find section start (## §N or ### §N-X)
  const isSubSection = sectionNum.includes("-");
  const headerPrefix = isSubSection ? "###" : "##";
  const sectionPattern = new RegExp(
    `^${headerPrefix}\\s+§?${escapeRegex(sectionNum)}`,
  );

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1) {
      if (sectionPattern.test(lines[i])) {
        startIdx = i;
      }
    } else {
      // Find end: next section at same or higher level
      const nextMainSection = /^##\s+§\d/;
      const nextSubSection = /^###\s+§?\d+-[A-Z]/;

      if (isSubSection) {
        if (nextMainSection.test(lines[i]) || nextSubSection.test(lines[i])) {
          endIdx = i;
          break;
        }
      } else {
        if (nextMainSection.test(lines[i])) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (startIdx === -1) {
    // Section not found, append before ---\n## next section or at end
    return content + "\n\n" + newContent + "\n";
  }

  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);

  return [...before, newContent, ...after].join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─────────────────────────────────────────────
// Claude Runner (Modify-specific, reuses pattern from ingest-engine)
// ─────────────────────────────────────────────

let _modifyClaudeRunner: ClaudeRunner = defaultModifyClaudeRunner;

async function defaultModifyClaudeRunner(
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", prompt, "--output-format", "json"], {
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0 || stdout.length > 0) {
        try {
          const parsed = JSON.parse(stdout) as { result?: string };
          resolve(parsed.result ?? stdout);
        } catch {
          resolve(stdout);
        }
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on("error", reject);
  });
}

export function setModifyClaudeRunner(runner: ClaudeRunner): () => void {
  const prev = _modifyClaudeRunner;
  _modifyClaudeRunner = runner;
  return () => { _modifyClaudeRunner = prev; };
}
