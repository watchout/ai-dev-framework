/**
 * GitHub engine — gh CLI wrapper and plan-to-Issues sync
 * Based on: specs/05_IMPLEMENTATION.md Part 3
 *
 * Uses `gh` CLI via child_process (no npm dependencies).
 * Graceful degradation: warns but never blocks when gh unavailable.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type GitHubIssue,
  type FeatureIssueMap,
  type SyncResult,
  type StatusSyncResult,
  loadSyncState,
  saveSyncState,
  createSyncState,
  detectRepoSlug,
  findFeatureMapping,
  findTaskIssueNumber,
  updateTaskSyncStatus,
} from "./github-model.js";
import {
  type PlanState,
  type Feature,
  type Task,
  decomposeFeature,
} from "./plan-model.js";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────
// gh CLI Foundation (injectable for testing)
// ─────────────────────────────────────────────

export type GhExecutor = (args: string[]) => Promise<string>;

/** Default executor: calls real gh CLI */
async function defaultExecGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args);
  return stdout.trim();
}

/** Module-level executor (overridable for testing) */
let _execGh: GhExecutor = defaultExecGh;

/**
 * Set a custom gh executor (for testing).
 * Returns a restore function.
 */
export function setGhExecutor(
  executor: GhExecutor,
): () => void {
  const prev = _execGh;
  _execGh = executor;
  return () => {
    _execGh = prev;
  };
}

/**
 * Execute a gh CLI command via the current executor.
 */
export async function execGh(args: string[]): Promise<string> {
  return _execGh(args);
}

/**
 * Check if gh CLI is installed and authenticated.
 */
export async function isGhAvailable(): Promise<boolean> {
  try {
    await _execGh(["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Issue Operations
// ─────────────────────────────────────────────

/**
 * Create a parent Issue for a feature.
 * Returns the created issue number.
 */
export async function createFeatureIssue(
  repo: string,
  feature: Feature,
  waveNumber: number,
  tasks: Task[],
): Promise<number> {
  const taskChecklist = tasks
    .map((t) => `- [ ] ${t.id}: ${t.name.split(" - ")[1] ?? t.name}`)
    .join("\n");

  const body = [
    `## Feature: ${feature.id}`,
    "",
    `**Priority**: ${feature.priority}`,
    `**Size**: ${feature.size}`,
    `**Type**: ${feature.type}`,
    feature.dependencies.length > 0
      ? `**Dependencies**: ${feature.dependencies.join(", ")}`
      : "",
    "",
    "## Tasks",
    "",
    taskChecklist,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const labels = [
    "feature",
    feature.priority.toLowerCase(),
    `wave-${waveNumber}`,
  ];

  const output = await execGh([
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    `[${feature.id}] ${feature.name}`,
    "--body",
    body,
    "--label",
    labels.join(","),
  ]);

  return extractIssueNumber(output);
}

/**
 * Create a task Issue (child of feature Issue).
 * Returns the created issue number.
 */
export async function createTaskIssue(
  repo: string,
  feature: Feature,
  task: Task,
  waveNumber: number,
  parentIssueNumber: number,
): Promise<number> {
  const kindLabel = task.kind;
  const taskName = task.name.split(" - ")[1] ?? task.name;

  const body = [
    `## ${task.id}: ${taskName}`,
    "",
    `**Feature**: ${feature.id} - ${feature.name}`,
    `**SSOT Sections**: ${task.references.join(", ")}`,
    `**Size**: ${task.size}`,
    "",
    "## Definition of Done",
    "",
    generateDefinitionOfDone(task.kind),
    "",
    "## Dependencies",
    "",
    task.blockedBy.length > 0
      ? `Blocked by: ${task.blockedBy.join(", ")}`
      : "None",
    task.blocks.length > 0
      ? `Blocks: ${task.blocks.join(", ")}`
      : "",
    "",
    `Parent: #${parentIssueNumber}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const labels = [
    kindLabel,
    feature.priority.toLowerCase(),
    feature.id,
    `wave-${waveNumber}`,
  ];

  const output = await execGh([
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    `[${task.id}] ${feature.name} - ${taskName}`,
    "--body",
    body,
    "--label",
    labels.join(","),
  ]);

  return extractIssueNumber(output);
}

/**
 * Close an issue by number.
 */
export async function closeIssue(
  repo: string,
  issueNumber: number,
): Promise<void> {
  await execGh([
    "issue",
    "close",
    String(issueNumber),
    "--repo",
    repo,
  ]);
}

/**
 * Get the current state of an issue.
 */
export async function getIssueState(
  repo: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  const output = await execGh([
    "issue",
    "view",
    String(issueNumber),
    "--repo",
    repo,
    "--json",
    "number,title,state,labels",
  ]);

  const data = JSON.parse(output) as {
    number: number;
    title: string;
    state: string;
    labels: { name: string }[];
  };

  return {
    number: data.number,
    title: data.title,
    state: data.state === "CLOSED" ? "closed" : "open",
    labels: data.labels.map((l) => l.name),
  };
}

/**
 * List issues by label.
 */
export async function listIssuesByLabel(
  repo: string,
  label: string,
): Promise<GitHubIssue[]> {
  const output = await execGh([
    "issue",
    "list",
    "--repo",
    repo,
    "--label",
    label,
    "--json",
    "number,title,state,labels",
    "--limit",
    "200",
  ]);

  const data = JSON.parse(output) as {
    number: number;
    title: string;
    state: string;
    labels: { name: string }[];
  }[];

  return data.map((d) => ({
    number: d.number,
    title: d.title,
    state: d.state === "CLOSED" ? "closed" : "open",
    labels: d.labels.map((l) => l.name),
  }));
}

// ─────────────────────────────────────────────
// Sync: Plan → GitHub Issues
// ─────────────────────────────────────────────

export interface SyncPlanOptions {
  /** Override repo slug (for testing) */
  repo?: string;
  /** Callback for progress reporting */
  onProgress?: (message: string) => void;
  /** GitHub Project number to add issues to */
  projectNumber?: number;
}

/**
 * Sync implementation plan to GitHub Issues.
 * Creates parent Issues for features and child Issues for tasks.
 * Idempotent: skips features/tasks that already have mappings.
 */
export async function syncPlanToGitHub(
  projectDir: string,
  plan: PlanState,
  options?: SyncPlanOptions,
): Promise<SyncResult> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;
  const log = options?.onProgress ?? (() => {});

  // Detect or use provided repo
  const repo = options?.repo ?? (await detectRepoSlug(projectDir));
  if (!repo) {
    errors.push(
      "Could not detect GitHub repository. " +
        "Ensure git remote 'origin' points to a GitHub repo.",
    );
    return { created, skipped, errors };
  }

  // Load or create sync state
  const syncState = loadSyncState(projectDir) ?? createSyncState(repo);
  syncState.repo = repo;

  // Track project number for issue-to-project linking
  const projectNumber = options?.projectNumber ?? syncState.projectNumber;

  // Iterate waves → features → tasks
  for (const wave of plan.waves) {
    for (const feature of wave.features) {
      // Check if feature already synced
      const existing = findFeatureMapping(syncState, feature.id);
      if (existing) {
        const existingTaskCount = existing.taskIssues.length;
        const expectedTasks = decomposeFeature(feature);
        if (existingTaskCount >= expectedTasks.length) {
          skipped += 1 + existingTaskCount;
          log(`  [skip] ${feature.id}: already synced`);
          continue;
        }
      }

      try {
        // Decompose feature into tasks
        const tasks = decomposeFeature(feature);

        // Create parent issue (if not exists)
        let parentIssueNumber: number;
        if (existing?.parentIssueNumber) {
          parentIssueNumber = existing.parentIssueNumber;
          log(`  [skip] ${feature.id} parent: #${parentIssueNumber}`);
        } else {
          parentIssueNumber = await createFeatureIssue(
            repo,
            feature,
            wave.number,
            tasks,
          );
          created++;
          log(`  [created] ${feature.id} → #${parentIssueNumber}`);

          // Add to GitHub Project if available
          if (projectNumber) {
            const added = await addIssueToProject(repo, projectNumber, parentIssueNumber);
            if (added) {
              log(`  [project] ${feature.id} → Project #${projectNumber}`);
            }
          }
        }

        // Create task issues
        const featureMap: FeatureIssueMap = existing ?? {
          featureId: feature.id,
          parentIssueNumber,
          taskIssues: [],
        };

        for (const task of tasks) {
          // Skip if task already has mapping
          const existingTask = featureMap.taskIssues.find(
            (t) => t.taskId === task.id,
          );
          if (existingTask) {
            skipped++;
            continue;
          }

          try {
            const taskIssueNumber = await createTaskIssue(
              repo,
              feature,
              task,
              wave.number,
              parentIssueNumber,
            );
            featureMap.taskIssues.push({
              taskId: task.id,
              issueNumber: taskIssueNumber,
              status: "open",
            });
            created++;
            log(`  [created] ${task.id} → #${taskIssueNumber}`);

            // Add task issue to GitHub Project
            if (projectNumber) {
              await addIssueToProject(repo, projectNumber, taskIssueNumber).catch(() => {});
            }
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : String(err);
            errors.push(`Failed to create issue for ${task.id}: ${msg}`);
          }
        }

        // Update or add feature mapping
        if (!existing) {
          syncState.featureIssues.push(featureMap);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(
          `Failed to create issues for ${feature.id}: ${msg}`,
        );
      }
    }
  }

  // Save project number to sync state
  if (projectNumber) {
    syncState.projectNumber = projectNumber;
  }

  // Save sync state
  saveSyncState(projectDir, syncState);

  return { created, skipped, errors };
}

// ─────────────────────────────────────────────
// Sync: GitHub → Local Status
// ─────────────────────────────────────────────

/**
 * Read issue statuses from GitHub and update local sync state.
 * Returns the list of updated tasks.
 */
export async function syncStatusFromGitHub(
  projectDir: string,
): Promise<StatusSyncResult> {
  const errors: string[] = [];
  let updated = 0;
  const issues: StatusSyncResult["issues"] = [];

  const syncState = loadSyncState(projectDir);
  if (!syncState) {
    errors.push(
      "No GitHub sync state found. Run 'framework plan --sync' first.",
    );
    return { updated, issues, errors };
  }

  for (const feature of syncState.featureIssues) {
    for (const task of feature.taskIssues) {
      try {
        const ghIssue = await getIssueState(
          syncState.repo,
          task.issueNumber,
        );
        if (ghIssue.state !== task.status) {
          task.status = ghIssue.state;
          updated++;
          issues.push({
            taskId: task.taskId,
            issueNumber: task.issueNumber,
            status: ghIssue.state,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(
          `Failed to get status for #${task.issueNumber} (${task.taskId}): ${msg}`,
        );
      }
    }
  }

  if (updated > 0) {
    saveSyncState(projectDir, syncState);
  }

  return { updated, issues, errors };
}

// ─────────────────────────────────────────────
// Task Status Update (for run-engine)
// ─────────────────────────────────────────────

/**
 * Close a GitHub Issue when a task is completed.
 * Silently returns on failure (graceful degradation).
 */
export async function closeTaskIssue(
  projectDir: string,
  taskId: string,
): Promise<{ closed: boolean; error?: string }> {
  try {
    const syncState = loadSyncState(projectDir);
    if (!syncState) {
      return { closed: false, error: "No sync state" };
    }

    const issueNumber = findTaskIssueNumber(syncState, taskId);
    if (!issueNumber) {
      return { closed: false, error: `No issue mapping for ${taskId}` };
    }

    await closeIssue(syncState.repo, issueNumber);
    updateTaskSyncStatus(syncState, taskId, "closed");
    saveSyncState(projectDir, syncState);

    return { closed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { closed: false, error: msg };
  }
}

// ─────────────────────────────────────────────
// GitHub Projects Integration
// ─────────────────────────────────────────────

/**
 * Check if the current gh auth token has the `project` scope.
 * Returns false if gh is unavailable or scope is missing.
 */
export async function hasProjectScope(): Promise<boolean> {
  try {
    // gh project list will fail with "missing required scopes [read:project]"
    // if the token lacks the scope
    await _execGh(["project", "list", "--limit", "1"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a GitHub Project board for the repo.
 * Returns the project number, or null if Projects are not available.
 */
export async function createProjectBoard(
  repo: string,
  title: string,
): Promise<number | null> {
  try {
    const owner = repo.split("/")[0];
    const output = await execGh([
      "project",
      "create",
      "--owner",
      owner,
      "--title",
      title,
      "--format",
      "json",
    ]);
    const data = JSON.parse(output) as { number: number };
    return data.number;
  } catch {
    return null;
  }
}

/**
 * Add an issue to a GitHub Project.
 * Graceful: returns false on failure (scope missing, project not found, etc.)
 */
export async function addIssueToProject(
  repo: string,
  projectNumber: number,
  issueNumber: number,
): Promise<boolean> {
  try {
    const owner = repo.split("/")[0];
    const issueUrl = `https://github.com/${repo}/issues/${issueNumber}`;
    await execGh([
      "project",
      "item-add",
      String(projectNumber),
      "--owner",
      owner,
      "--url",
      issueUrl,
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * List existing GitHub Projects for the repo owner.
 * Returns an array of {number, title} or empty array on failure.
 */
export async function listProjects(
  repo: string,
): Promise<{ number: number; title: string }[]> {
  try {
    const owner = repo.split("/")[0];
    const output = await execGh([
      "project",
      "list",
      "--owner",
      owner,
      "--format",
      "json",
    ]);
    const data = JSON.parse(output) as {
      projects: { number: number; title: string }[];
    };
    return data.projects ?? [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Extract issue number from gh CLI output URL.
 * e.g. "https://github.com/owner/repo/issues/42" → 42
 */
export function extractIssueNumber(ghOutput: string): number {
  const match = ghOutput.match(/\/issues\/(\d+)/);
  if (!match) {
    throw new Error(
      `Could not extract issue number from gh output: ${ghOutput}`,
    );
  }
  return parseInt(match[1], 10);
}

/**
 * Generate Definition of Done checklist based on task kind.
 */
function generateDefinitionOfDone(kind: string): string {
  const common = "- [ ] Code review passed\n- [ ] All relevant tests pass";

  switch (kind) {
    case "db":
      return [
        "- [ ] Migration file created",
        "- [ ] Table definition matches SSOT §4",
        "- [ ] Indexes configured",
        "- [ ] Seed data (if needed)",
        "- [ ] Migration tested in dev",
        common,
      ].join("\n");
    case "api":
      return [
        "- [ ] Endpoints implemented per SSOT §5",
        "- [ ] Request validation added",
        "- [ ] Error handling per §9",
        "- [ ] Auth checks per §7",
        common,
      ].join("\n");
    case "ui":
      return [
        "- [ ] Components implemented per SSOT §6",
        "- [ ] State management working",
        "- [ ] Form validation added",
        "- [ ] Loading/error states handled",
        common,
      ].join("\n");
    case "integration":
      return [
        "- [ ] Frontend-backend connected",
        "- [ ] E2E data flow verified",
        "- [ ] State transitions correct",
        common,
      ].join("\n");
    case "test":
      return [
        "- [ ] Unit tests for business logic",
        "- [ ] Integration tests for API",
        "- [ ] Normal/abnormal/boundary cases covered",
        common,
      ].join("\n");
    case "review":
      return [
        "- [ ] Adversarial Review completed",
        "- [ ] SSOT compliance verified",
        "- [ ] All MUST requirements met",
        "- [ ] Edge cases identified",
        common,
      ].join("\n");
    default:
      return common;
  }
}
