/**
 * Verification model - Shared types and pure functions for checkpoint/verify
 * Reference: 25_VERIFICATION_LOOPS.md
 *
 * Provides types, scoring logic, and persistence for quality checkpoints
 * and verification results.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

export type VerifyTarget = "ssot" | "code" | "tests" | "types" | "all";
export type GraderType = "auto" | "ai" | "human";
export type ScoreLevel = "pass" | "warning" | "fail";

export interface CheckpointScores {
  ssotAlignment: number;
  codeQuality: number;
  testCoverage: number;
  typeSafety: number;
  lint: number;
  total: number;
}

export interface CheckpointIssue {
  category: string;
  file: string;
  line?: number;
  message: string;
  severity: "error" | "warning";
}

export interface CheckpointData {
  id: string;
  name: string;
  timestamp: string;
  task?: string;
  filesChanged: string[];
  scores: CheckpointScores;
  issues: CheckpointIssue[];
  recommendations: string[];
}

export interface CheckpointIndex {
  checkpoints: Array<{
    id: string;
    name: string;
    timestamp: string;
    task?: string;
    totalScore: number;
  }>;
  stats: {
    totalCheckpoints: number;
    averageScore: number;
    trend: "improving" | "stable" | "declining";
  };
}

export interface VerifyResult {
  target: VerifyTarget;
  grader: GraderType;
  scores: Partial<CheckpointScores>;
  issues: CheckpointIssue[];
  passAtK?: { k: number; passed: boolean; attempts: number };
  verdict: "pass" | "warning" | "fail";
}

export interface CheckpointComparison {
  from: CheckpointData;
  to: CheckpointData;
  scoreDiffs: Record<string, number>;
  newFiles: number;
  changedFiles: number;
  resolvedIssues: number;
  newIssues: number;
}

// ─────────────────────────────────────────────
// Score Weights
// ─────────────────────────────────────────────

const SCORE_WEIGHTS = {
  ssotAlignment: 25,
  codeQuality: 25,
  testCoverage: 20,
  typeSafety: 15,
  lint: 15,
} as const;

// ─────────────────────────────────────────────
// Pure Functions
// ─────────────────────────────────────────────

export function calculateTotalScore(
  scores: Omit<CheckpointScores, "total">,
): number {
  const weighted =
    scores.ssotAlignment * SCORE_WEIGHTS.ssotAlignment +
    scores.codeQuality * SCORE_WEIGHTS.codeQuality +
    scores.testCoverage * SCORE_WEIGHTS.testCoverage +
    scores.typeSafety * SCORE_WEIGHTS.typeSafety +
    scores.lint * SCORE_WEIGHTS.lint;
  return Math.round(weighted / 100);
}

export function scoreLevel(score: number): ScoreLevel {
  if (score >= 90) return "pass";
  if (score >= 70) return "warning";
  return "fail";
}

export function generateCheckpointId(
  index: CheckpointIndex,
): string {
  const nextNum = index.checkpoints.length + 1;
  return `CP-${String(nextNum).padStart(3, "0")}`;
}

export function compareCheckpoints(
  from: CheckpointData,
  to: CheckpointData,
): CheckpointComparison {
  const scoreDiffs: Record<string, number> = {
    ssotAlignment: to.scores.ssotAlignment - from.scores.ssotAlignment,
    codeQuality: to.scores.codeQuality - from.scores.codeQuality,
    testCoverage: to.scores.testCoverage - from.scores.testCoverage,
    typeSafety: to.scores.typeSafety - from.scores.typeSafety,
    lint: to.scores.lint - from.scores.lint,
    total: to.scores.total - from.scores.total,
  };

  const fromFiles = new Set(from.filesChanged);
  const toFiles = new Set(to.filesChanged);
  const newFiles = Array.from(toFiles).filter(
    (f) => !fromFiles.has(f),
  ).length;
  const changedFiles = Array.from(toFiles).filter(
    (f) => fromFiles.has(f),
  ).length;

  const fromIssueKeys = new Set(
    from.issues.map((i) => `${i.category}:${i.file}:${i.message}`),
  );
  const toIssueKeys = new Set(
    to.issues.map((i) => `${i.category}:${i.file}:${i.message}`),
  );
  const resolvedIssues = Array.from(fromIssueKeys).filter(
    (k) => !toIssueKeys.has(k),
  ).length;
  const newIssues = Array.from(toIssueKeys).filter(
    (k) => !fromIssueKeys.has(k),
  ).length;

  return {
    from, to, scoreDiffs,
    newFiles, changedFiles, resolvedIssues, newIssues,
  };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const CHECKPOINT_DIR = ".claude/checkpoints";
const VERIFY_DIR = ".claude/verify";
const INDEX_FILE = "_index.json";

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

export function saveCheckpoint(
  projectDir: string,
  data: CheckpointData,
): void {
  const dir = path.join(projectDir, CHECKPOINT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ts = data.timestamp.replace(/[:.]/g, "-");
  const safeName = sanitizeName(data.name);
  const filename = `${data.id}_${ts}_${safeName}.json`;
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify(data, null, 2),
    "utf-8",
  );

  const index = loadCheckpointIndex(projectDir);
  index.checkpoints.push({
    id: data.id,
    name: data.name,
    timestamp: data.timestamp,
    task: data.task,
    totalScore: data.scores.total,
  });
  index.stats = computeIndexStats(index.checkpoints);
  fs.writeFileSync(
    path.join(dir, INDEX_FILE),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

export function loadCheckpoint(
  projectDir: string,
  id: string,
): CheckpointData | null {
  const dir = path.join(projectDir, CHECKPOINT_DIR);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith(id) && f.endsWith(".json") && f !== INDEX_FILE,
  );
  if (files.length === 0) return null;

  const raw = fs.readFileSync(path.join(dir, files[0]), "utf-8");
  return JSON.parse(raw) as CheckpointData;
}

export function loadCheckpointIndex(
  projectDir: string,
): CheckpointIndex {
  const indexPath = path.join(
    projectDir, CHECKPOINT_DIR, INDEX_FILE,
  );
  if (!fs.existsSync(indexPath)) {
    return {
      checkpoints: [],
      stats: { totalCheckpoints: 0, averageScore: 0, trend: "stable" },
    };
  }
  const raw = fs.readFileSync(indexPath, "utf-8");
  return JSON.parse(raw) as CheckpointIndex;
}

export function saveVerifyResult(
  projectDir: string,
  result: VerifyResult,
): void {
  const dir = path.join(projectDir, VERIFY_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${ts}.json`;
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify(result, null, 2),
    "utf-8",
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function computeIndexStats(
  checkpoints: CheckpointIndex["checkpoints"],
): CheckpointIndex["stats"] {
  const total = checkpoints.length;
  if (total === 0) {
    return { totalCheckpoints: 0, averageScore: 0, trend: "stable" };
  }

  const avg = Math.round(
    checkpoints.reduce((sum, cp) => sum + cp.totalScore, 0) / total,
  );

  let trend: "improving" | "stable" | "declining" = "stable";
  if (total >= 3) {
    const recent = checkpoints.slice(-3).map((c) => c.totalScore);
    if (recent[2] > recent[0] + 2) trend = "improving";
    else if (recent[2] < recent[0] - 2) trend = "declining";
  }

  return { totalCheckpoints: total, averageScore: avg, trend };
}
