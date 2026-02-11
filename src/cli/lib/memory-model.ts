/**
 * Memory model - Types and utilities for compact and session commands
 * Based on: 21_AI_ESCALATION.md Memory Persistence + Strategic Compact
 *
 * Manages session state, decisions, patterns, and open issues
 * stored under .claude/memory/.
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Priority = "P1" | "P2" | "P3" | "P4";

export interface SessionState {
  lastUpdated: string;
  currentTask?: string;
  currentPhase: number;
  activeFiles: string[];
  pendingActions: string[];
}

export interface Decision {
  date: string;
  context: string;
  decision: string;
  rationale: string;
}

export interface PatternEntry {
  id: string;
  trigger: string;
  action: string;
  confidence: number;
  source: string;
  createdAt: string;
  lastUsed?: string;
  useCount: number;
}

export interface OpenIssue {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  priority: "high" | "medium" | "low";
}

export interface CompactStatus {
  p1Items: number;
  p2Items: number;
  p3Items: number;
  p4Items: number;
  totalSize: number;
  recommendation: "compact_now" | "compact_soon" | "ok";
}

export interface ContextItem {
  priority: Priority;
  category: string;
  description: string;
  size: number;
}

// ─────────────────────────────────────────────
// Directory Helpers
// ─────────────────────────────────────────────

const MEMORY_DIR = ".claude/memory";

function ensureMemoryDir(projectDir: string): string {
  const dir = path.join(projectDir, MEMORY_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─────────────────────────────────────────────
// Session State
// ─────────────────────────────────────────────

export function saveSessionState(
  projectDir: string,
  state: SessionState,
): void {
  const dir = ensureMemoryDir(projectDir);
  const filePath = path.join(dir, "session_state.json");
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function loadSessionState(
  projectDir: string,
): SessionState | null {
  const filePath = path.join(projectDir, MEMORY_DIR, "session_state.json");
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as SessionState;
}

// ─────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────

export function appendDecision(
  projectDir: string,
  decision: Decision,
): void {
  const dir = ensureMemoryDir(projectDir);
  const filePath = path.join(dir, "decisions.md");

  const entry = [
    `### ${decision.date}`,
    "",
    `**Context:** ${decision.context}`,
    "",
    `**Decision:** ${decision.decision}`,
    "",
    `**Rationale:** ${decision.rationale}`,
    "",
    "---",
    "",
  ].join("\n");

  let existing = "";
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, "utf-8");
  } else {
    existing = "# Decisions Log\n\n";
  }

  fs.writeFileSync(filePath, existing + entry, "utf-8");
}

export function loadDecisions(
  projectDir: string,
  limit?: number,
): Decision[] {
  const filePath = path.join(projectDir, MEMORY_DIR, "decisions.md");
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const blocks = content.split("---").filter((b) => b.trim());
  const decisions: Decision[] = [];

  for (const block of blocks) {
    const dateMatch = block.match(/###\s+(.+)/);
    const contextMatch = block.match(/\*\*Context:\*\*\s+(.+)/);
    const decisionMatch = block.match(/\*\*Decision:\*\*\s+(.+)/);
    const rationaleMatch = block.match(/\*\*Rationale:\*\*\s+(.+)/);

    if (dateMatch && contextMatch && decisionMatch && rationaleMatch) {
      decisions.push({
        date: dateMatch[1].trim(),
        context: contextMatch[1].trim(),
        decision: decisionMatch[1].trim(),
        rationale: rationaleMatch[1].trim(),
      });
    }
  }

  // Return latest first
  decisions.reverse();

  if (limit !== undefined && limit > 0) {
    return decisions.slice(0, limit);
  }
  return decisions;
}

// ─────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────

export function savePatterns(
  projectDir: string,
  patterns: PatternEntry[],
): void {
  const dir = ensureMemoryDir(projectDir);
  const filePath = path.join(dir, "patterns.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify(patterns, null, 2),
    "utf-8",
  );
}

export function loadPatterns(projectDir: string): PatternEntry[] {
  const filePath = path.join(projectDir, MEMORY_DIR, "patterns.json");
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as PatternEntry[];
}

// ─────────────────────────────────────────────
// Open Issues
// ─────────────────────────────────────────────

export function appendOpenIssue(
  projectDir: string,
  issue: OpenIssue,
): void {
  const dir = ensureMemoryDir(projectDir);
  const filePath = path.join(dir, "open_issues.md");

  const entry = [
    `### ${issue.id}: ${issue.title}`,
    "",
    `**Priority:** ${issue.priority}`,
    "",
    `**Created:** ${issue.createdAt}`,
    "",
    issue.description,
    "",
    "---",
    "",
  ].join("\n");

  let existing = "";
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, "utf-8");
  } else {
    existing = "# Open Issues\n\n";
  }

  fs.writeFileSync(filePath, existing + entry, "utf-8");
}

export function loadOpenIssues(projectDir: string): OpenIssue[] {
  const filePath = path.join(projectDir, MEMORY_DIR, "open_issues.md");
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const blocks = content.split("---").filter((b) => b.trim());
  const issues: OpenIssue[] = [];

  for (const block of blocks) {
    const titleMatch = block.match(/###\s+([^:]+):\s+(.+)/);
    const priorityMatch = block.match(/\*\*Priority:\*\*\s+(.+)/);
    const createdMatch = block.match(/\*\*Created:\*\*\s+(.+)/);

    if (titleMatch && priorityMatch && createdMatch) {
      const descLines = block
        .split("\n")
        .filter(
          (l) =>
            l.trim() &&
            !l.startsWith("###") &&
            !l.startsWith("**") &&
            !l.startsWith("# "),
        );
      issues.push({
        id: titleMatch[1].trim(),
        title: titleMatch[2].trim(),
        priority: priorityMatch[1].trim() as "high" | "medium" | "low",
        createdAt: createdMatch[1].trim(),
        description: descLines.join("\n").trim(),
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────
// Context Analysis
// ─────────────────────────────────────────────

export function analyzeContextPriority(
  projectDir: string,
): ContextItem[] {
  const items: ContextItem[] = [];

  // P1: Active session state
  const sessionState = loadSessionState(projectDir);
  if (sessionState) {
    items.push({
      priority: "P1",
      category: "session",
      description: "Current session state",
      size: JSON.stringify(sessionState).length,
    });
  }

  // P1: Recent decisions
  const decisions = loadDecisions(projectDir, 5);
  for (const d of decisions) {
    items.push({
      priority: "P1",
      category: "decision",
      description: `Decision: ${d.decision.slice(0, 50)}`,
      size: JSON.stringify(d).length,
    });
  }

  // P2: Open issues
  const issues = loadOpenIssues(projectDir);
  for (const issue of issues) {
    const priority: Priority = issue.priority === "high" ? "P1" : "P2";
    items.push({
      priority,
      category: "issue",
      description: `Issue: ${issue.title}`,
      size: JSON.stringify(issue).length,
    });
  }

  // P2: Patterns
  const patterns = loadPatterns(projectDir);
  for (const p of patterns) {
    items.push({
      priority: "P2",
      category: "pattern",
      description: `Pattern: ${p.trigger.slice(0, 50)}`,
      size: JSON.stringify(p).length,
    });
  }

  // P3: Older decisions
  const olderDecisions = loadDecisions(projectDir);
  for (const d of olderDecisions.slice(5)) {
    items.push({
      priority: "P3",
      category: "decision_old",
      description: `Old decision: ${d.decision.slice(0, 50)}`,
      size: JSON.stringify(d).length,
    });
  }

  // P4: Skills index (reference only)
  const skillsIndexPath = path.join(
    projectDir,
    ".claude",
    "skills",
    "_index.json",
  );
  if (fs.existsSync(skillsIndexPath)) {
    const raw = fs.readFileSync(skillsIndexPath, "utf-8");
    items.push({
      priority: "P4",
      category: "skills_index",
      description: "Skills index reference",
      size: raw.length,
    });
  }

  return items;
}

// ─────────────────────────────────────────────
// Compact Status Calculation
// ─────────────────────────────────────────────

const COMPACT_THRESHOLD_NOW = 10000;
const COMPACT_THRESHOLD_SOON = 5000;

export function calculateCompactStatus(
  items: ContextItem[],
): CompactStatus {
  let p1Items = 0;
  let p2Items = 0;
  let p3Items = 0;
  let p4Items = 0;
  let totalSize = 0;

  for (const item of items) {
    totalSize += item.size;
    switch (item.priority) {
      case "P1":
        p1Items++;
        break;
      case "P2":
        p2Items++;
        break;
      case "P3":
        p3Items++;
        break;
      case "P4":
        p4Items++;
        break;
    }
  }

  let recommendation: CompactStatus["recommendation"] = "ok";
  if (totalSize >= COMPACT_THRESHOLD_NOW || p3Items + p4Items > 20) {
    recommendation = "compact_now";
  } else if (totalSize >= COMPACT_THRESHOLD_SOON || p3Items + p4Items > 10) {
    recommendation = "compact_soon";
  }

  return { p1Items, p2Items, p3Items, p4Items, totalSize, recommendation };
}
