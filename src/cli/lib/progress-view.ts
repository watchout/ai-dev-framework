import type { StatusResult, TaskStatusItem } from "./status-engine.js";

export type ProgressTaskStatus =
  | "done"
  | "current"
  | "in_progress"
  | "pending"
  | "blocked"
  | "review"
  | "failed";

export type ProgressPhaseStatus = "done" | "current" | "planned" | "blocked";

export type ProgressGateId =
  | "spec"
  | "impl"
  | "local_verify"
  | "ci"
  | "l1"
  | "l2"
  | "l3"
  | "merge"
  | "post_merge";

export type ProgressGateState =
  | "pass"
  | "pending"
  | "blocked"
  | "warn"
  | "not_applicable";

export interface ProgressGateSnapshot {
  id: ProgressGateId;
  label: string;
  state: ProgressGateState;
  summary?: string;
}

export interface ProgressTaskLink {
  label: string;
  url: string;
}

export interface ProgressTask {
  id: string;
  name: string;
  status: ProgressTaskStatus;
  issue?: number | string;
  issueUrl?: string;
  pr?: number | string;
  prUrl?: string;
  currentGate?: string;
  implementationSummary?: string;
  links?: ProgressTaskLink[];
  progressCredit?: number;
}

export interface ProgressPhase {
  id: string;
  name: string;
  shortName?: string;
  intent?: string;
  status: ProgressPhaseStatus;
  tasks: ProgressTask[];
}

export interface ProgressStream {
  id: string;
  name: string;
  activePhaseId: string;
  activeTaskId?: string;
  phases: ProgressPhase[];
  gates?: ProgressGateSnapshot[];
  currentStep?: string;
  nextAction: string;
  blockers?: string[];
  openAuditRequirements?: string[];
  lastUpdatedAt: string;
  evidenceSource: string;
}

export interface ProgressSnapshot {
  schemaVersion: "progress-snapshot/v1";
  projectId: string;
  generatedAt: string;
  streams: ProgressStream[];
}

export interface PhaseProgress {
  percent: number;
  completedUnits: number;
  totalTasks: number;
  approximate: boolean;
}

export interface DerivedProgressStream {
  stream: ProgressStream;
  activePhase: ProgressPhase;
  currentTask: ProgressTask | null;
  previousTask: ProgressTask | null;
  nextTask: ProgressTask | null;
  phaseProgress: PhaseProgress;
  currentGate: string;
}

export interface ProgressRenderOptions {
  maxLineLength?: number;
}

export interface JapaneseAdminProgressOptions extends ProgressRenderOptions {
  mode?: "compact" | "long";
}

const DEFAULT_MAX_LINE_LENGTH = 96;

export function createProgressSnapshot(input: {
  projectId: string;
  streams: ProgressStream[];
  generatedAt?: string;
}): ProgressSnapshot {
  return {
    schemaVersion: "progress-snapshot/v1",
    projectId: input.projectId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    streams: input.streams,
  };
}

export function deriveProgressStream(
  stream: ProgressStream,
): DerivedProgressStream {
  const activePhase =
    stream.phases.find((phase) => phase.id === stream.activePhaseId) ??
    stream.phases.find((phase) => phase.status === "current") ??
    stream.phases[0];

  if (!activePhase) {
    throw new Error(`Progress stream ${stream.id} has no phases.`);
  }

  const currentTask =
    (stream.activeTaskId
      ? activePhase.tasks.find((task) => task.id === stream.activeTaskId)
      : undefined) ??
    activePhase.tasks.find((task) => isCurrentTaskStatus(task.status)) ??
    activePhase.tasks.find((task) => task.status !== "done") ??
    activePhase.tasks.at(-1) ??
    null;

  const currentIndex = currentTask
    ? activePhase.tasks.findIndex((task) => task.id === currentTask.id)
    : -1;

  return {
    stream,
    activePhase,
    currentTask,
    previousTask: currentIndex > 0 ? activePhase.tasks[currentIndex - 1] : null,
    nextTask:
      currentIndex >= 0 && currentIndex < activePhase.tasks.length - 1
        ? activePhase.tasks[currentIndex + 1]
        : null,
    phaseProgress: calculatePhaseProgress(activePhase),
    currentGate: resolveCurrentGate(stream, currentTask),
  };
}

export function calculatePhaseProgress(phase: ProgressPhase): PhaseProgress {
  const totalTasks = phase.tasks.length;
  if (totalTasks === 0) {
    return {
      percent: 0,
      completedUnits: 0,
      totalTasks: 0,
      approximate: false,
    };
  }

  let approximate = false;
  const completedUnits = phase.tasks.reduce((total, task) => {
    const credit =
      typeof task.progressCredit === "number"
        ? clamp(task.progressCredit, 0, 1)
        : task.status === "done"
          ? 1
          : 0;
    if (credit > 0 && credit < 1) {
      approximate = true;
    }
    return total + credit;
  }, 0);

  return {
    percent: Math.round((completedUnits / totalTasks) * 100),
    completedUnits,
    totalTasks,
    approximate,
  };
}

export function renderProgressSnapshotJson(snapshot: ProgressSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function renderProgressSnapshotMarkdown(
  snapshot: ProgressSnapshot,
): string {
  const lines = [
    "## Progress Snapshot",
    "",
    "| Stream | Phase | Current task | Gate | Status | Next |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const derived of snapshot.streams.map(deriveProgressStream)) {
    const currentTask = derived.currentTask
      ? formatTaskReference(derived.currentTask)
      : "-";
    lines.push(
      [
        escapeMarkdownTable(derived.stream.name),
        escapeMarkdownTable(derived.activePhase.name),
        escapeMarkdownTable(currentTask),
        escapeMarkdownTable(derived.currentGate),
        escapeMarkdownTable(derived.stream.currentStep ?? statusLabel(derived.currentTask?.status)),
        escapeMarkdownTable(derived.stream.nextAction),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  for (const derived of snapshot.streams.map(deriveProgressStream)) {
    lines.push("", `### Nearby: ${derived.stream.name}`, "");
    lines.push("| Position | Task | Status | Implementation summary |");
    lines.push("| --- | --- | --- | --- |");
    for (const [position, task] of nearbyTasks(derived)) {
      lines.push(
        [
          position,
          task ? formatTaskReference(task) : "-",
          task ? statusLabel(task.status) : "-",
          task?.implementationSummary ?? "-",
        ]
          .map(escapeMarkdownTable)
          .join(" | ")
          .replace(/^/, "| ")
          .replace(/$/, " |"),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderProgressSnapshotCompactText(
  snapshot: ProgressSnapshot,
  options: ProgressRenderOptions = {},
): string {
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const blocks = snapshot.streams.map((stream) => {
    const derived = deriveProgressStream(stream);
    const task = derived.currentTask;
    const progress = formatProgress(derived.phaseProgress);
    const taskRef = task ? formatTaskReference(task) : "No active task";
    const lines = [
      "Progress Snapshot",
      `${stream.name} / ${derived.activePhase.name}`,
      `${renderAsciiProgressBar(derived.phaseProgress.percent)} ${taskRef} ${progress}`,
      `Gate: ${derived.currentGate}`,
      `Now : ${stream.currentStep ?? task?.implementationSummary ?? statusLabel(task?.status)}`,
      `Next: ${stream.nextAction}`,
      "",
      "Nearby",
      ...nearbyTasks(derived).map(([position, nearbyTask]) =>
        formatNearbyLine(position, nearbyTask),
      ),
    ];
    return lines.map((line) => truncateLine(line, maxLineLength)).join("\n");
  });

  return `${blocks.join("\n\n")}\n`;
}

export function renderProgressSnapshotJapaneseAdmin(
  snapshot: ProgressSnapshot,
  options: JapaneseAdminProgressOptions = {},
): string {
  const mode = options.mode ?? "compact";
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const blocks = snapshot.streams.map((stream) => {
    const derived = deriveProgressStream(stream);
    return mode === "long"
      ? renderJapaneseLongBlock(derived, snapshot.streams.length > 1, maxLineLength)
      : renderJapaneseCompactBlock(derived, snapshot.streams.length > 1, maxLineLength);
  });

  return `${blocks.join("\n\n")}\n`;
}

export function buildProgressSnapshotFromStatusResult(
  projectId: string,
  result: StatusResult,
  options: { generatedAt?: string; evidenceSource?: string } = {},
): ProgressSnapshot {
  const activePhaseId = `phase-${result.currentPhase || 0}`;
  const activeTask = selectCurrentStatusTask(result.tasks);
  const phases: ProgressPhase[] = result.phases.map((phase) => ({
    id: `phase-${phase.number}`,
    name: phase.label,
    shortName: `P${phase.number}`,
    status:
      phase.status === "completed"
        ? "done"
        : phase.status === "active"
          ? "current"
          : "planned",
    tasks:
      phase.number === result.currentPhase
        ? result.tasks.map(progressTaskFromStatusItem)
        : [],
  }));

  return createProgressSnapshot({
    projectId,
    generatedAt: options.generatedAt,
    streams: [
      {
        id: projectId,
        name: projectId,
        activePhaseId,
        activeTaskId: activeTask?.id,
        phases,
        currentStep: result.execution?.expired
          ? `Execution attention required: ${result.execution.reason ?? "expired"}`
          : result.phaseLabel,
        nextAction: deriveNextActionFromStatus(result),
        lastUpdatedAt: options.generatedAt ?? new Date().toISOString(),
        evidenceSource: options.evidenceSource ?? "status-engine",
      },
    ],
  });
}

function renderJapaneseCompactBlock(
  derived: DerivedProgressStream,
  includeStreamName: boolean,
  maxLineLength: number,
): string {
  const { stream, activePhase, currentTask, phaseProgress } = derived;
  const current = currentTask ? formatTaskReference(currentTask) : "未設定";
  const lines = [
    ...(includeStreamName ? [`[${stream.name}]`] : []),
    `進捗: ${formatPhaseTaskShort(activePhase, currentTask)} ${formatProgress(phaseProgress)}`,
    `目的: ${activePhase.intent ?? activePhase.name}`,
    `状態: ${stream.currentStep ?? currentTask?.implementationSummary ?? statusLabel(currentTask?.status)}`,
    `次: ${stream.nextAction}`,
    `Phase: ${activePhaseOverview(stream.phases)}`,
    "",
    `${activePhase.name}（現在: ${current}）`,
    ...activePhase.tasks.map(formatJapaneseTaskLine),
  ];

  return lines.map((line) => truncateLine(line, maxLineLength)).join("\n");
}

function renderJapaneseLongBlock(
  derived: DerivedProgressStream,
  includeStreamName: boolean,
  maxLineLength: number,
): string {
  const { stream, activePhase, currentTask, phaseProgress } = derived;
  const current = currentTask ? formatTaskReference(currentTask) : "未設定";
  const lines = [
    includeStreamName ? `${stream.name} 開発進捗` : "Shirube 開発進捗",
    `現在地: ${activePhase.name} / ${current}`,
    `${activePhase.name}進捗: ${formatProgress(phaseProgress)}`,
    "",
    "Phase一覧",
    ...stream.phases.map((phase) => `${phaseMarker(phase.status)} ${phase.name}: ${phase.intent ?? phase.shortName ?? phase.id}`),
    "",
    `${activePhase.name} タスク一覧`,
    ...activePhase.tasks.map(formatJapaneseTaskLine),
    "",
    "Nearby",
    ...nearbyTasks(derived).map(([position, task]) =>
      formatJapaneseNearbyLine(position, task),
    ),
  ];

  return lines.map((line) => truncateLine(line, maxLineLength)).join("\n");
}

function progressTaskFromStatusItem(task: TaskStatusItem): ProgressTask {
  return {
    id: task.id,
    name: task.name,
    status: progressStatusFromTaskStatus(task.status),
    implementationSummary: task.stopReason
      ? `Stop reason: ${task.stopReason}`
      : undefined,
  };
}

function progressStatusFromTaskStatus(status: string): ProgressTaskStatus {
  switch (status) {
    case "done":
      return "done";
    case "in_progress":
    case "auditing":
    case "review":
      return "current";
    case "waiting_input":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function selectCurrentStatusTask(tasks: TaskStatusItem[]): TaskStatusItem | undefined {
  return (
    tasks.find((task) => ["in_progress", "auditing", "review", "waiting_input"].includes(task.status)) ??
    tasks.find((task) => task.status !== "done") ??
    tasks.at(-1)
  );
}

function deriveNextActionFromStatus(result: StatusResult): string {
  if (result.execution?.expired) {
    return "Inspect execution lease and recover or stop the task.";
  }
  const nextTask = result.tasks.find((task) => task.status !== "done");
  return nextTask ? `Continue ${nextTask.id}.` : "No pending task detected.";
}

function isCurrentTaskStatus(status: ProgressTaskStatus): boolean {
  return ["current", "in_progress", "blocked", "review"].includes(status);
}

function resolveCurrentGate(
  stream: ProgressStream,
  task: ProgressTask | null,
): string {
  if (task?.currentGate) {
    return task.currentGate;
  }
  const blockingGate = stream.gates?.find((gate) => gate.state === "blocked");
  if (blockingGate) {
    return blockingGate.label;
  }
  const pendingGate = stream.gates?.find((gate) => gate.state === "pending");
  if (pendingGate) {
    return pendingGate.label;
  }
  return "-";
}

function nearbyTasks(
  derived: DerivedProgressStream,
): Array<[string, ProgressTask | null]> {
  return [
    ["Previous", derived.previousTask],
    ["Current", derived.currentTask],
    ["Next", derived.nextTask],
  ];
}

function formatNearbyLine(position: string, task: ProgressTask | null): string {
  if (!task) {
    return `${position}: -`;
  }
  return `${position}: ${formatTaskReference(task)} ${statusLabel(task.status)} - ${task.implementationSummary ?? task.name}`;
}

function formatJapaneseNearbyLine(
  position: string,
  task: ProgressTask | null,
): string {
  const label =
    position === "Previous" ? "前" : position === "Current" ? "今" : "次";
  if (!task) {
    return `${label}: -`;
  }
  return `${label}: ${formatTaskReference(task)} ${task.implementationSummary ?? task.name}`;
}

function formatJapaneseTaskLine(task: ProgressTask): string {
  const marker =
    task.status === "done"
      ? "☑︎"
      : isCurrentTaskStatus(task.status)
        ? "→"
        : " ";
  const summary = task.implementationSummary ?? task.name;
  return `${marker} ${formatTaskReference(task)} ${summary}`;
}

function formatPhaseTaskShort(
  phase: ProgressPhase,
  task: ProgressTask | null,
): string {
  const phaseShort = phase.shortName ?? phase.id;
  if (!task) {
    return phaseShort;
  }
  return `${phaseShort}/${task.id}${task.issue ? ` #${task.issue}` : ""}`;
}

function activePhaseOverview(phases: ProgressPhase[]): string {
  return phases
    .map((phase) => {
      const label = phase.shortName ?? phase.id;
      if (phase.status === "done") return `${label}完了`;
      if (phase.status === "current") return `${label}現在`;
      if (phase.status === "blocked") return `${label}停止`;
      return label;
    })
    .join(" / ");
}

function phaseMarker(status: ProgressPhaseStatus): string {
  if (status === "done") return "[done]";
  if (status === "current") return "[current]";
  if (status === "blocked") return "[blocked]";
  return "[planned]";
}

function formatTaskReference(task: ProgressTask): string {
  const issue = task.issue ? ` #${task.issue}` : "";
  return `${task.id}${issue} ${task.name}`.trim();
}

function formatProgress(progress: PhaseProgress): string {
  const prefix = progress.approximate ? "約" : "";
  return `${prefix}${progress.percent}% (${formatProgressUnits(progress.completedUnits)}/${progress.totalTasks})`;
}

function formatProgressUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}

function renderAsciiProgressBar(percent: number, width = 8): string {
  const filled = Math.round((clamp(percent, 0, 100) / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function statusLabel(status: ProgressTaskStatus | undefined): string {
  if (!status) return "-";
  return status.replace(/_/g, " ");
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncateLine(line: string, maxLineLength: number): string {
  const chars = Array.from(line);
  if (chars.length <= maxLineLength) {
    return line;
  }
  if (maxLineLength <= 3) {
    return chars.slice(0, maxLineLength).join("");
  }
  return `${chars.slice(0, maxLineLength - 3).join("")}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
