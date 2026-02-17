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

/** Sleep utility for rate limiting delays (injectable for testing) */
let _sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Override the sleep function (for testing).
 * Returns a restore function.
 */
export function setSleepFn(fn: (ms: number) => Promise<void>): () => void {
  const prev = _sleep;
  _sleep = fn;
  return () => { _sleep = prev; };
}

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
 * Retries on secondary rate limit (HTTP 403) with exponential backoff.
 * Max 4 retries: 30s → 60s → 120s → 240s (total ~7.5min worst case).
 */
export async function execGh(args: string[]): Promise<string> {
  const MAX_RETRIES = 4;
  const BASE_DELAY_MS = 30_000; // 30 seconds

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await _execGh(args);
      // gh CLI sometimes returns empty stdout on rate limit instead of throwing
      // Detect this for content-creation commands (issue create, label create)
      if (
        result === "" &&
        args.includes("create") &&
        attempt < MAX_RETRIES
      ) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        _rateLimitCallback?.(
          `  [rate-limit] Empty response detected, retrying in ${Math.round(delayMs / 1000)}s... (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await _sleep(delayMs);
        continue;
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        msg.includes("secondary rate limit") ||
        msg.includes("abuse detection") ||
        msg.includes("HTTP 403");

      if (isRateLimit && attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        _rateLimitCallback?.(
          `  [rate-limit] Hit secondary rate limit, retrying in ${Math.round(delayMs / 1000)}s... (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await _sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  // Should not reach here, but satisfy TypeScript
  return _execGh(args);
}

/**
 * Optional callback for rate-limit log messages.
 * Set via setRateLimitCallback().
 */
let _rateLimitCallback: ((msg: string) => void) | undefined;

/**
 * Set a callback to receive rate-limit retry messages.
 * Used by syncPlanToGitHub to forward messages to the logger.
 */
export function setRateLimitCallback(
  cb: ((msg: string) => void) | undefined,
): void {
  _rateLimitCallback = cb;
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
// Label Management
// ─────────────────────────────────────────────

/** Cache of confirmed-existing labels per repo to avoid repeated API calls */
const _confirmedLabels = new Map<string, Set<string>>();

/**
 * Ensure labels exist in the repo, creating any missing ones.
 * Uses a per-repo cache so each label is checked at most once per session.
 */
async function ensureLabels(repo: string, labels: string[]): Promise<void> {
  let confirmed = _confirmedLabels.get(repo);
  if (!confirmed) {
    confirmed = new Set<string>();
    _confirmedLabels.set(repo, confirmed);
  }

  for (const label of labels) {
    if (confirmed.has(label)) continue;
    try {
      // gh label create --force is idempotent (creates or updates)
      await _execGh([
        "label", "create", label,
        "--repo", repo,
        "--force",
      ]);
      confirmed.add(label);
    } catch {
      // If label creation fails, still proceed (Issue creation will warn)
      confirmed.add(label);
    }
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

  const ssotPath = constructSsotPath(feature);

  const body = [
    `## Feature: ${feature.id}`,
    "",
    "### SSOT Reference",
    `  ${ssotPath}`,
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

  await ensureLabels(repo, labels);

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
 *
 * Body structure per specs/05_IMPLEMENTATION.md Part 3 Issue Template:
 * - SSOT Reference (full path + section)
 * - Summary
 * - Definition of Done
 * - Branch (feature/FEAT-XXX-{layer})
 * - Dependencies (Blocked by / Blocks)
 * - Parent reference
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
  const ssotPath = constructSsotPath(feature);
  const sectionLabel = task.references.join(", ");
  const branchName = `feature/${task.id.toLowerCase()}`;

  const body = [
    `## ${task.id}: ${taskName}`,
    "",
    "### SSOT Reference",
    `  ${ssotPath}`,
    `  Section: ${sectionLabel}`,
    "",
    "### Summary",
    `${taskName} implementation for ${feature.name} per SSOT ${sectionLabel}.`,
    "",
    `**Feature**: ${feature.id} - ${feature.name}`,
    `**Size**: ${task.size}`,
    "",
    "### Definition of Done",
    "",
    generateDefinitionOfDone(task.kind),
    "",
    "### Branch",
    `\`${branchName}\``,
    "",
    "### Dependencies",
    `- Blocked by: ${task.blockedBy.length > 0 ? task.blockedBy.join(", ") : "(none)"}`,
    `- Blocks: ${task.blocks.length > 0 ? task.blocks.join(", ") : "(none)"}`,
    "",
    `Parent: #${parentIssueNumber}`,
  ]
    .join("\n");

  const labels = [
    kindLabel,
    feature.priority.toLowerCase(),
    feature.id,
    `wave-${waveNumber}`,
  ];

  await ensureLabels(repo, labels);

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

  // Set rate-limit callback for retry logging
  setRateLimitCallback(log);

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

          // Throttle to avoid rate limits (1s between creations)
          await _sleep(1000);

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

            // Throttle to avoid rate limits (1s between creations)
            await _sleep(1000);

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

  // Clear rate-limit callback
  setRateLimitCallback(undefined);

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

/**
 * Configure a GitHub Project board's Status field with standard columns.
 * Uses GraphQL API via `gh api graphql`.
 *
 * Columns per specs/05_IMPLEMENTATION.md Part 3:
 *   Backlog → Todo → In Progress → In Review → Done
 *
 * @returns object with configured: true if successful, error message otherwise
 */
export async function configureProjectBoard(
  repo: string,
  projectNumber: number,
): Promise<{ configured: boolean; error?: string }> {
  try {
    const owner = repo.split("/")[0];

    // Step 1: Get the Project node ID via GraphQL
    const projectIdQuery = `query {
  user(login: "${owner}") {
    projectV2(number: ${projectNumber}) {
      id
    }
  }
}`;

    let projectNodeId: string;
    try {
      const output = await execGh([
        "api", "graphql", "-f", `query=${projectIdQuery}`,
      ]);
      const data = JSON.parse(output) as {
        data: { user?: { projectV2?: { id: string } }; organization?: { projectV2?: { id: string } } };
      };
      projectNodeId = data.data.user?.projectV2?.id ?? "";
    } catch {
      // Try as organization
      const orgQuery = `query {
  organization(login: "${owner}") {
    projectV2(number: ${projectNumber}) {
      id
    }
  }
}`;
      const output = await execGh([
        "api", "graphql", "-f", `query=${orgQuery}`,
      ]);
      const data = JSON.parse(output) as {
        data: { organization?: { projectV2?: { id: string } } };
      };
      projectNodeId = data.data.organization?.projectV2?.id ?? "";
    }

    if (!projectNodeId) {
      return { configured: false, error: "Could not find Project node ID" };
    }

    // Step 2: Get the Status field ID
    const fieldsQuery = `query {
  node(id: "${projectNodeId}") {
    ... on ProjectV2 {
      fields(first: 30) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
          }
        }
      }
    }
  }
}`;

    const fieldsOutput = await execGh([
      "api", "graphql", "-f", `query=${fieldsQuery}`,
    ]);
    const fieldsData = JSON.parse(fieldsOutput) as {
      data: {
        node: {
          fields: {
            nodes: ({ id: string; name: string } | Record<string, never>)[];
          };
        };
      };
    };

    const statusField = fieldsData.data.node.fields.nodes.find(
      (n) => "name" in n && n.name === "Status",
    ) as { id: string; name: string } | undefined;

    if (!statusField) {
      return { configured: false, error: "Status field not found in project" };
    }

    // Step 3: Update Status field options
    const updateMutation = `mutation {
  updateProjectV2Field(
    input: {
      fieldId: "${statusField.id}"
      singleSelectOptions: [
        { name: "Backlog", color: GRAY, description: "" }
        { name: "Todo", color: BLUE, description: "" }
        { name: "In Progress", color: YELLOW, description: "" }
        { name: "In Review", color: ORANGE, description: "" }
        { name: "Done", color: GREEN, description: "" }
      ]
    }
  ) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          id
          name
        }
      }
    }
  }
}`;

    await execGh([
      "api", "graphql", "-f", `query=${updateMutation}`,
    ]);

    return { configured: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { configured: false, error: msg };
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
 * Construct SSOT document path for a feature.
 * Format: docs/design/features/{common|project}/FEAT-XXX_{name-slug}.md
 * Per specs/05_IMPLEMENTATION.md Part 3 Issue Template.
 */
function constructSsotPath(feature: Feature): string {
  const typeDir = feature.type === "common" ? "common" : "project";
  const slug = feature.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `docs/design/features/${typeDir}/${feature.id}_${slug}.md`;
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
