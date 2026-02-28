/**
 * GitHub sync data model — Types and state management for GitHub Issues integration
 * Based on: specs/05_IMPLEMENTATION.md Part 3
 *
 * Manages the mapping between local plan features/tasks and GitHub Issues.
 * State is persisted in .framework/github-sync.json (shared via git).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TaskIssueMap {
  taskId: string;
  issueNumber: number;
}

export interface FeatureIssueMap {
  featureId: string;
  parentIssueNumber: number;
  taskIssues: TaskIssueMap[];
}

export interface GitHubSyncState {
  /** Repository slug: "owner/repo" */
  repo: string;
  /** Last sync timestamp */
  syncedAt: string;
  /** Feature-to-issue mappings */
  featureIssues: FeatureIssueMap[];
  /** GitHub Project number (if linked) */
  projectNumber?: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
}

export interface SyncResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface StatusSyncResult {
  updated: number;
  issues: { taskId: string; issueNumber: number; status: "open" | "closed"; labels: string[] }[];
  errors: string[];
}

// ─────────────────────────────────────────────
// Repo Detection
// ─────────────────────────────────────────────

/**
 * Parse a git remote URL into "owner/repo" format.
 * Supports SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git).
 */
export function parseRepoSlug(remoteUrl: string): string | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(
    /git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/,
  );
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}

/**
 * Detect the GitHub repository slug from git remote origin.
 * Returns "owner/repo" or null if not a GitHub repo.
 */
export async function detectRepoSlug(
  projectDir: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      projectDir,
      "remote",
      "get-url",
      "origin",
    ]);
    return parseRepoSlug(stdout.trim());
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Sync State Persistence
// ─────────────────────────────────────────────

const SYNC_STATE_FILE = ".framework/github-sync.json";

export function loadSyncState(
  projectDir: string,
): GitHubSyncState | null {
  const filePath = path.join(projectDir, SYNC_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as GitHubSyncState;
  } catch {
    return null;
  }
}

export function saveSyncState(
  projectDir: string,
  state: GitHubSyncState,
): void {
  const filePath = path.join(projectDir, SYNC_STATE_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.syncedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function createSyncState(repo: string): GitHubSyncState {
  return {
    repo,
    syncedAt: new Date().toISOString(),
    featureIssues: [],
  };
}

// ─────────────────────────────────────────────
// Sync State Lookups
// ─────────────────────────────────────────────

/**
 * Find a feature's issue mapping by feature ID.
 */
export function findFeatureMapping(
  state: GitHubSyncState,
  featureId: string,
): FeatureIssueMap | undefined {
  return state.featureIssues.find((f) => f.featureId === featureId);
}

/**
 * Find a task's issue number from the sync state.
 */
export function findTaskIssueNumber(
  state: GitHubSyncState,
  taskId: string,
): number | null {
  for (const feature of state.featureIssues) {
    const task = feature.taskIssues.find((t) => t.taskId === taskId);
    if (task) return task.issueNumber;
  }
  return null;
}

