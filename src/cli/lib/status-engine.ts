/**
 * Status engine - aggregates project progress from all pipeline stages
 * Based on: SSOT-3 §2.7, SSOT-2 §4.1-4.2
 *
 * Collects state from:
 * - Discovery session (.framework/discover-session.json)
 * - Generation state (.framework/generation-state.json)
 * - Plan state (.framework/plan.json)
 * - Run state (.framework/run-state.json)
 * - Audit reports (.framework/audits/)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadGenerationState } from "./generate-state.js";
import { loadPlan } from "./plan-model.js";
import {
  loadRunState,
  calculateProgress as calcRunProgress,
} from "./run-model.js";
import { loadAuditReports } from "./audit-model.js";
import { loadProjectProfile } from "./profile-model.js";
import {
  loadGateState,
  type GateStatus,
} from "./gate-model.js";
import {
  loadSyncState,
} from "./github-model.js";
import {
  isGhAvailable,
  syncStatusFromGitHub,
} from "./github-engine.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface DocumentStatus {
  path: string;
  completeness: number;
  status: string;
  lastModified?: string;
}

export interface TaskStatusItem {
  id: string;
  featureId: string;
  name: string;
  status: string;
}

export interface AuditSummary {
  mode: string;
  targetName: string;
  score: number;
  verdict: string;
  date: string;
}

export interface PhaseInfo {
  number: number;
  label: string;
  status: "pending" | "active" | "completed";
}

export interface ProfileSummary {
  type: string;
  name: string;
  enabledSsot: string[];
  enabledAudit: string[];
  discoveryStages: number[];
}

export interface GateStatusInfo {
  gateA: GateStatus;
  gateB: GateStatus;
  gateC: GateStatus;
  allPassed: boolean;
  updatedAt: string;
}

export interface StatusResult {
  currentPhase: number;
  phaseLabel: string;
  overallProgress: number;
  profile: ProfileSummary | null;
  gates: GateStatusInfo | null;
  phases: PhaseInfo[];
  documents: DocumentStatus[];
  tasks: TaskStatusItem[];
  audits: AuditSummary[];
}

export interface StatusIO {
  print(message: string): void;
}

export function createStatusTerminalIO(): StatusIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Phase Definitions
// ─────────────────────────────────────────────

const PHASES: { number: number; label: string }[] = [
  { number: 1, label: "Discovery" },
  { number: 2, label: "Generation" },
  { number: 3, label: "Planning" },
  { number: 4, label: "Implementation" },
  { number: 5, label: "Audit & Review" },
];

// ─────────────────────────────────────────────
// Status Aggregation
// ─────────────────────────────────────────────

export function collectStatus(projectDir: string): StatusResult {
  const phases = detectPhases(projectDir);
  const currentPhase = phases.find((p) => p.status === "active");
  const documents = collectDocuments(projectDir);
  const tasks = collectTasks(projectDir);
  const audits = collectAudits(projectDir);
  const overallProgress = calculateOverallProgress(
    phases,
    documents,
    tasks,
  );

  // Load project profile
  const projectProfile = loadProjectProfile(projectDir);
  const profile: ProfileSummary | null = projectProfile
    ? {
        type: projectProfile.id,
        name: projectProfile.name,
        enabledSsot: projectProfile.enabledSsot,
        enabledAudit: projectProfile.enabledAudit,
        discoveryStages: projectProfile.discoveryStages,
      }
    : null;

  // Load gate state
  const gateState = loadGateState(projectDir);
  const gates: GateStatusInfo | null = gateState
    ? {
        gateA: gateState.gateA.status,
        gateB: gateState.gateB.status,
        gateC: gateState.gateC.status,
        allPassed:
          gateState.gateA.status === "passed" &&
          gateState.gateB.status === "passed" &&
          gateState.gateC.status === "passed",
        updatedAt: gateState.updatedAt,
      }
    : null;

  return {
    currentPhase: currentPhase?.number ?? 0,
    phaseLabel: currentPhase?.label ?? "Not started",
    overallProgress,
    profile,
    gates,
    phases,
    documents,
    tasks,
    audits,
  };
}

function detectPhases(projectDir: string): PhaseInfo[] {
  const discoverPath = path.join(
    projectDir,
    ".framework/discover-session.json",
  );
  const genPath = path.join(
    projectDir,
    ".framework/generation-state.json",
  );
  const planPath = path.join(projectDir, ".framework/plan.json");
  const runPath = path.join(projectDir, ".framework/run-state.json");
  const auditsPath = path.join(projectDir, ".framework/audits");

  const hasDiscover = fs.existsSync(discoverPath);
  const hasGen = fs.existsSync(genPath);
  const hasPlan = fs.existsSync(planPath);
  const hasRun = fs.existsSync(runPath);
  const hasAudits =
    fs.existsSync(auditsPath) &&
    fs.readdirSync(auditsPath).length > 0;

  // Determine phase statuses
  return PHASES.map((phase) => {
    let status: PhaseInfo["status"] = "pending";

    switch (phase.number) {
      case 1: // Discovery
        if (hasDiscover) {
          const raw = fs.readFileSync(discoverPath, "utf-8");
          const session = JSON.parse(raw);
          status =
            session.status === "completed" ? "completed" : "active";
        }
        break;
      case 2: // Generation
        if (hasGen) {
          const gen = loadGenerationState(projectDir);
          status =
            gen?.status === "completed" ? "completed" : "active";
        } else if (hasDiscover) {
          status = "pending";
        }
        break;
      case 3: // Planning
        if (hasPlan) {
          const plan = loadPlan(projectDir);
          status =
            plan?.status === "generated" || plan?.status === "active"
              ? "completed"
              : "active";
        }
        break;
      case 4: // Implementation
        if (hasRun) {
          const run = loadRunState(projectDir);
          status =
            run?.status === "completed" ? "completed" : "active";
        }
        break;
      case 5: // Audit & Review
        if (hasAudits) {
          status = "active";
        }
        break;
    }

    return { ...phase, status };
  });
}

function collectDocuments(projectDir: string): DocumentStatus[] {
  const genState = loadGenerationState(projectDir);
  if (!genState) return [];

  return genState.documents.map((doc) => ({
    path: doc.path,
    completeness: doc.completeness,
    status: doc.status,
    lastModified: doc.generatedAt,
  }));
}

function collectTasks(projectDir: string): TaskStatusItem[] {
  const runState = loadRunState(projectDir);
  if (!runState) return [];

  return runState.tasks.map((t) => ({
    id: t.taskId,
    featureId: t.featureId,
    name: t.name,
    status: t.status,
  }));
}

/**
 * Enrich task statuses from GitHub Issues (async).
 * Reads github-sync.json and optionally fetches live status from GitHub.
 *
 * @param tasks Local task statuses
 * @param projectDir Project directory
 * @param fetchLive If true, calls gh CLI to get live status (requires gh auth)
 */
export async function enrichTasksFromGitHub(
  tasks: TaskStatusItem[],
  projectDir: string,
  fetchLive = false,
): Promise<{ tasks: TaskStatusItem[]; ghSynced: boolean }> {
  const syncState = loadSyncState(projectDir);
  if (!syncState) {
    return { tasks, ghSynced: false };
  }

  // If fetchLive, sync from GitHub first
  if (fetchLive) {
    try {
      const ghOk = await isGhAvailable();
      if (ghOk) {
        await syncStatusFromGitHub(projectDir);
      }
    } catch {
      // Graceful degradation: fall through to local sync state
    }
  }

  // Reload sync state (may have been updated by syncStatusFromGitHub)
  const freshState = loadSyncState(projectDir);
  if (!freshState) {
    return { tasks, ghSynced: false };
  }

  // Build issue status map: taskId → "open" | "closed"
  const issueStatusMap = new Map<string, "open" | "closed">();
  for (const feature of freshState.featureIssues) {
    for (const task of feature.taskIssues) {
      issueStatusMap.set(task.taskId, task.status);
    }
  }

  // Enrich: if local task is "backlog" but GitHub shows "closed", mark "done"
  const enriched = tasks.map((t) => {
    const ghStatus = issueStatusMap.get(t.id);
    if (ghStatus === "closed" && t.status !== "done") {
      return { ...t, status: "done" };
    }
    return t;
  });

  return { tasks: enriched, ghSynced: true };
}

function collectAudits(projectDir: string): AuditSummary[] {
  const reports = loadAuditReports(projectDir);
  return reports.slice(0, 10).map((r) => ({
    mode: r.mode,
    targetName: r.target.name,
    score: r.totalScore,
    verdict: r.verdict,
    date: r.target.auditDate,
  }));
}

function calculateOverallProgress(
  phases: PhaseInfo[],
  documents: DocumentStatus[],
  tasks: TaskStatusItem[],
): number {
  // Weight: phases 40%, documents 30%, tasks 30%
  const phaseProgress = calculatePhaseProgress(phases);
  const docProgress = calculateDocProgress(documents);
  const taskProgress = calculateTaskProgress(tasks);

  return Math.round(
    phaseProgress * 0.4 + docProgress * 0.3 + taskProgress * 0.3,
  );
}

function calculatePhaseProgress(phases: PhaseInfo[]): number {
  if (phases.length === 0) return 0;
  const completed = phases.filter(
    (p) => p.status === "completed",
  ).length;
  return (completed / phases.length) * 100;
}

function calculateDocProgress(documents: DocumentStatus[]): number {
  if (documents.length === 0) return 0;
  const total = documents.reduce(
    (sum, d) => sum + d.completeness,
    0,
  );
  return total / documents.length;
}

function calculateTaskProgress(tasks: TaskStatusItem[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "done").length;
  return (done / tasks.length) * 100;
}

// ─────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────

export function printStatus(
  io: StatusIO,
  result: StatusResult,
): void {
  io.print(`\n${"━".repeat(38)}`);
  io.print("  PROJECT STATUS");
  io.print(`${"━".repeat(38)}`);
  io.print("");

  // Project type
  if (result.profile) {
    io.print(`  Type: ${result.profile.name} (${result.profile.type})`);
    io.print(`  Enabled SSOTs: ${result.profile.enabledSsot.join(", ")}`);
    io.print(`  Enabled Audits: ${result.profile.enabledAudit.join(", ")}`);
    io.print(
      `  Discovery Stages: ${result.profile.discoveryStages.join(", ")}`,
    );
    io.print("");
  }

  // Pre-Code Gate status
  if (result.gates) {
    io.print("  Pre-Code Gate:");
    const iconA = gateIcon(result.gates.gateA);
    const iconB = gateIcon(result.gates.gateB);
    const iconC = gateIcon(result.gates.gateC);
    io.print(`    ${iconA} Gate A (Environment)       ${result.gates.gateA.toUpperCase()}`);
    io.print(`    ${iconB} Gate B (Planning)          ${result.gates.gateB.toUpperCase()}`);
    io.print(`    ${iconC} Gate C (SSOT Completeness) ${result.gates.gateC.toUpperCase()}`);
    if (result.gates.allPassed) {
      io.print("    → 'framework run' is allowed");
    } else {
      io.print("    → 'framework run' is BLOCKED. Run 'framework gate check'.");
    }
    io.print("");
  }

  // Overall progress
  io.print(`  Phase: ${result.phaseLabel}`);
  io.print(
    `  Progress: ${renderProgressBar(result.overallProgress)} ${result.overallProgress}%`,
  );
  io.print("");

  // Phase breakdown
  io.print("  Phases:");
  for (const phase of result.phases) {
    const icon =
      phase.status === "completed"
        ? "[DONE]"
        : phase.status === "active"
          ? "[ACTIVE]"
          : "[PENDING]";
    io.print(`    ${icon} ${phase.number}. ${phase.label}`);
  }
  io.print("");

  // Documents
  if (result.documents.length > 0) {
    io.print("  Documents:");
    for (const doc of result.documents) {
      const bar = renderProgressBar(doc.completeness);
      const name = path.basename(doc.path);
      io.print(`    ${bar} ${doc.completeness}% ${name}`);
    }
    io.print("");
  }

  // Tasks summary
  if (result.tasks.length > 0) {
    const backlog = result.tasks.filter(
      (t) => t.status === "backlog",
    ).length;
    const inProgress = result.tasks.filter(
      (t) => t.status === "in_progress",
    ).length;
    const done = result.tasks.filter(
      (t) => t.status === "done",
    ).length;

    io.print(`  Tasks: ${result.tasks.length} total`);
    io.print(
      `    ${renderProgressBar((done / result.tasks.length) * 100)} ${done}/${result.tasks.length} done`,
    );
    if (inProgress > 0) {
      io.print(`    In progress: ${inProgress}`);
    }
    io.print(`    Backlog: ${backlog}`);
    io.print("");
  }

  // Recent audits
  if (result.audits.length > 0) {
    io.print("  Recent Audits:");
    for (const audit of result.audits.slice(0, 5)) {
      const verdict =
        audit.verdict === "pass"
          ? "PASS"
          : audit.verdict === "conditional"
            ? "COND"
            : "FAIL";
      io.print(
        `    [${audit.mode.toUpperCase()}] ${audit.targetName} ${audit.score}/100 ${verdict}`,
      );
    }
    io.print("");
  }
}

function gateIcon(status: GateStatus): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    default:
      return "⏳";
  }
}

function renderProgressBar(percent: number): string {
  const width = 10;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
}
