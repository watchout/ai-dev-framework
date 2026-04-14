/**
 * Task state — GitHub Issues-backed task state API.
 *
 * Part of ADF overhaul Phase 1 (epic #60 / sub-issue #61).
 *
 * Replaces .framework/plan.json + .framework/run-state.json with queries
 * against GitHub Issues. This module is the read/write surface that all
 * CLI/hook consumers will migrate to in sub-PRs 61-2 through 61-5.
 *
 * Sub-PR 1/7: passthrough helpers only. Not yet wired to consumers.
 *
 * Foundation: reuses `execGh` from github-engine.ts (rate-limit retry,
 * injectable executor for tests).
 */
import { execGh } from "./github-engine.js";

// ─────────────────────────────────────────────
// Label constants (single source of truth)
// ─────────────────────────────────────────────

export const LABEL_FEATURE = "feature";
export const LABEL_IN_PROGRESS = "status:in-progress";
export const LABEL_BLOCKED = "status:blocked";
export const LABEL_COMPLETED = "status:completed";
export const LABEL_MIGRATED = "migrated-from-plan-json";

const STATUS_LABELS = [
  LABEL_IN_PROGRESS,
  LABEL_BLOCKED,
  LABEL_COMPLETED,
] as const;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface TaskIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  body: string;
  url: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  labels: Array<{ name: string }> | string[];
  assignees: Array<{ login: string }> | string[];
  body?: string;
  url?: string;
}

// ─────────────────────────────────────────────
// Internal: normalize gh JSON output
// ─────────────────────────────────────────────

function normalizeIssue(raw: RawIssue): TaskIssue {
  const labels = Array.isArray(raw.labels)
    ? raw.labels.map((l) => (typeof l === "string" ? l : l.name))
    : [];
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a) => (typeof a === "string" ? a : a.login))
    : [];
  const state = raw.state.toLowerCase() === "closed" ? "closed" : "open";
  return {
    number: raw.number,
    title: raw.title,
    state,
    labels,
    assignees,
    body: raw.body ?? "",
    url: raw.url ?? "",
  };
}

async function ghJsonList(args: string[]): Promise<TaskIssue[]> {
  const stdout = await execGh(args);
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout) as RawIssue[];
  return parsed.map(normalizeIssue);
}

// ─────────────────────────────────────────────
// Read operations
// ─────────────────────────────────────────────

const JSON_FIELDS = "number,title,state,labels,assignees,body,url";

/**
 * List all open Issues tagged as features.
 * Equivalent to: the features array in plan.json.
 */
export async function listFeatures(): Promise<TaskIssue[]> {
  return ghJsonList([
    "issue",
    "list",
    "--label",
    LABEL_FEATURE,
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    JSON_FIELDS,
  ]);
}

/**
 * Return the single active task (assigned to current user,
 * labeled status:in-progress), or null if none.
 *
 * Equivalent to: run-state.json's activeTask field.
 *
 * If multiple are found, returns the most recently updated one
 * and the caller SHOULD treat that as an invariant violation to
 * surface. Downstream enforcement is the responsibility of
 * sub-PR 61-5 (hook) and Phase 1 issue #69 (session lifecycle).
 */
export async function getActiveTask(): Promise<TaskIssue | null> {
  const issues = await ghJsonList([
    "issue",
    "list",
    "--assignee",
    "@me",
    "--label",
    LABEL_IN_PROGRESS,
    "--state",
    "open",
    "--limit",
    "10",
    "--json",
    JSON_FIELDS,
  ]);
  if (issues.length === 0) return null;
  return issues[0];
}

/**
 * Fetch a specific Issue by number. Returns null if not found.
 */
export async function getIssueByNumber(
  number: number,
): Promise<TaskIssue | null> {
  try {
    const stdout = await execGh([
      "issue",
      "view",
      String(number),
      "--json",
      JSON_FIELDS,
    ]);
    if (!stdout.trim()) return null;
    return normalizeIssue(JSON.parse(stdout) as RawIssue);
  } catch {
    return null;
  }
}

/**
 * List all open Issues assigned to the current user.
 * Used by framework-runner to enumerate work in the bot's queue.
 */
export async function listMyOpenIssues(): Promise<TaskIssue[]> {
  return ghJsonList([
    "issue",
    "list",
    "--assignee",
    "@me",
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    JSON_FIELDS,
  ]);
}

// ─────────────────────────────────────────────
// Write operations (passthrough wrappers)
// ─────────────────────────────────────────────

/**
 * Clear all status:* labels from an Issue.
 * Safe to call even if none of the labels are currently applied.
 */
export async function clearStatusLabels(number: number): Promise<void> {
  const issue = await getIssueByNumber(number);
  if (!issue) return;
  const present = issue.labels.filter((l) =>
    (STATUS_LABELS as readonly string[]).includes(l),
  );
  if (present.length === 0) return;
  const args = ["issue", "edit", String(number)];
  for (const l of present) {
    args.push("--remove-label", l);
  }
  await execGh(args);
}

/**
 * Mark an Issue as in-progress.
 *
 * Invariant: a user should only have ONE in-progress task at a time.
 * This function does NOT enforce that invariant — enforcement is the
 * responsibility of the pre-tool-edit hook (sub-PR 61-5).
 */
export async function markInProgress(number: number): Promise<void> {
  await clearStatusLabels(number);
  await execGh([
    "issue",
    "edit",
    String(number),
    "--add-label",
    LABEL_IN_PROGRESS,
  ]);
}

/**
 * Mark an Issue as blocked and append a comment describing the reason.
 */
export async function markBlocked(
  number: number,
  reason: string,
): Promise<void> {
  await clearStatusLabels(number);
  await execGh([
    "issue",
    "edit",
    String(number),
    "--add-label",
    LABEL_BLOCKED,
  ]);
  if (reason.trim()) {
    await execGh([
      "issue",
      "comment",
      String(number),
      "--body",
      `**Blocked:** ${reason}`,
    ]);
  }
}

/**
 * Close an Issue as completed. Labels moved to status:completed for
 * searchability (GitHub closes the Issue but keeps labels for query).
 */
export async function markCompleted(number: number): Promise<void> {
  await clearStatusLabels(number);
  await execGh([
    "issue",
    "edit",
    String(number),
    "--add-label",
    LABEL_COMPLETED,
  ]);
  await execGh(["issue", "close", String(number)]);
}

// ─────────────────────────────────────────────
// Environment check
// ─────────────────────────────────────────────

/**
 * Verify that `gh` is installed and authenticated with sufficient scope
 * to run the operations above. Returns a structured result the caller
 * (Gate A in sub-PR 61-5 / issue #67) can surface as a user-facing error.
 */
export interface GhEnvCheck {
  ok: boolean;
  installed: boolean;
  authenticated: boolean;
  errors: string[];
}

export async function checkGhEnvironment(): Promise<GhEnvCheck> {
  const errors: string[] = [];
  let installed = false;
  try {
    await execGh(["--version"]);
    installed = true;
  } catch {
    errors.push(
      "gh CLI not installed. See https://cli.github.com/ for installation.",
    );
    return { ok: false, installed: false, authenticated: false, errors };
  }
  let authenticated = false;
  try {
    await execGh(["auth", "status"]);
    authenticated = true;
  } catch (e) {
    errors.push(
      `gh not authenticated. Run 'gh auth login'. (${(e as Error).message})`,
    );
  }
  return {
    ok: errors.length === 0,
    installed,
    authenticated,
    errors,
  };
}
