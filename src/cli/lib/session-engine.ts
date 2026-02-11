/**
 * Session engine - Save and load session state
 * Based on: 21_AI_ESCALATION.md Memory Persistence
 *
 * Persists session state including current task, phase,
 * active files, and pending actions for continuity between sessions.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type SessionState,
  saveSessionState,
  loadSessionState,
  loadDecisions,
  loadOpenIssues,
} from "./memory-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface SessionIO {
  print(message: string): void;
}

export function createSessionTerminalIO(): SessionIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Session Save
// ─────────────────────────────────────────────

interface ProjectConfig {
  name?: string;
  currentPhase?: number;
}

function readProjectConfig(projectDir: string): ProjectConfig {
  const configPath = path.join(projectDir, ".framework", "project.json");
  if (!fs.existsSync(configPath)) return {};

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return {};
  }
}

function detectActiveFiles(projectDir: string): string[] {
  const gitStatusPath = path.join(projectDir, ".git");
  if (!fs.existsSync(gitStatusPath)) return [];

  // Check for recently modified files in src/
  const srcDir = path.join(projectDir, "src");
  if (!fs.existsSync(srcDir)) return [];

  const recentFiles: Array<{ file: string; mtime: number }> = [];
  collectRecentFiles(srcDir, projectDir, recentFiles);

  // Sort by modification time and take top 10
  recentFiles.sort((a, b) => b.mtime - a.mtime);
  return recentFiles.slice(0, 10).map((f) => f.file);
}

function collectRecentFiles(
  dir: string,
  rootDir: string,
  results: Array<{ file: string; mtime: number }>,
): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectRecentFiles(fullPath, rootDir, results);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          file: path.relative(rootDir, fullPath),
          mtime: stat.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
}

export function runSessionSave(
  projectDir: string,
  io: SessionIO,
): void {
  io.print("\n  Session Save");
  io.print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const config = readProjectConfig(projectDir);
  const activeFiles = detectActiveFiles(projectDir);

  const state: SessionState = {
    lastUpdated: new Date().toISOString(),
    currentTask: config.name
      ? `Working on ${config.name}`
      : undefined,
    currentPhase: config.currentPhase ?? 0,
    activeFiles,
    pendingActions: [],
  };

  // Check for existing state and preserve pending actions
  const existing = loadSessionState(projectDir);
  if (existing?.pendingActions && existing.pendingActions.length > 0) {
    state.pendingActions = existing.pendingActions;
  }

  saveSessionState(projectDir, state);

  io.print("");
  io.print(`  Phase: ${state.currentPhase}`);
  if (state.currentTask) {
    io.print(`  Task: ${state.currentTask}`);
  }
  io.print(`  Active files: ${state.activeFiles.length}`);
  io.print(`  Pending actions: ${state.pendingActions.length}`);
  io.print("");
  io.print("  Session state saved to .claude/memory/session_state.json");
  io.print("");
}

// ─────────────────────────────────────────────
// Session Load
// ─────────────────────────────────────────────

export function runSessionLoad(
  projectDir: string,
  io: SessionIO,
): SessionState | null {
  io.print("\n  Session Load");
  io.print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const state = loadSessionState(projectDir);
  if (!state) {
    io.print("");
    io.print("  No saved session found.");
    io.print("  Run 'framework session-save' to save current state.");
    io.print("");
    return null;
  }

  // Print session state
  io.print("");
  io.print("  Session State:");
  io.print(`    Last Updated: ${state.lastUpdated}`);
  io.print(`    Phase: ${state.currentPhase}`);
  if (state.currentTask) {
    io.print(`    Task: ${state.currentTask}`);
  }

  if (state.activeFiles.length > 0) {
    io.print("");
    io.print("  Active Files:");
    for (const file of state.activeFiles.slice(0, 5)) {
      io.print(`    - ${file}`);
    }
    if (state.activeFiles.length > 5) {
      io.print(`    ... and ${state.activeFiles.length - 5} more`);
    }
  }

  if (state.pendingActions.length > 0) {
    io.print("");
    io.print("  Pending Actions:");
    for (const action of state.pendingActions) {
      io.print(`    - ${action}`);
    }
  }

  // Load recent decisions
  const decisions = loadDecisions(projectDir, 5);
  if (decisions.length > 0) {
    io.print("");
    io.print("  Recent Decisions:");
    for (const d of decisions) {
      io.print(`    [${d.date}] ${d.decision}`);
    }
  }

  // Load open issues
  const issues = loadOpenIssues(projectDir);
  if (issues.length > 0) {
    io.print("");
    io.print("  Open Issues:");
    for (const issue of issues) {
      io.print(`    [${issue.priority.toUpperCase()}] ${issue.id}: ${issue.title}`);
    }
  }

  io.print("");
  return state;
}
