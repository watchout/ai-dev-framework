/**
 * Discovery session management - persistence and state tracking
 * Based on: SSOT-4 Data Model (discover-session.json)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export interface DiscoverSessionData {
  id: string;
  status: "in_progress" | "paused" | "completed";
  currentStage: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  stages: StageSessionData[];
  answers: Record<string, string>;
}

export interface StageSessionData {
  stageNumber: number;
  status: "pending" | "in_progress" | "confirmed";
  confirmedAt?: string;
  summary?: string;
}

const SESSION_FILE = ".framework/discover-session.json";

function sessionPath(projectDir: string): string {
  return path.join(projectDir, SESSION_FILE);
}

export function createSession(): DiscoverSessionData {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    status: "in_progress",
    currentStage: 1,
    startedAt: now,
    updatedAt: now,
    stages: [
      { stageNumber: 1, status: "in_progress" },
      { stageNumber: 2, status: "pending" },
      { stageNumber: 3, status: "pending" },
      { stageNumber: 4, status: "pending" },
      { stageNumber: 5, status: "pending" },
    ],
    answers: {},
  };
}

export function loadSession(
  projectDir: string,
): DiscoverSessionData | null {
  const filePath = sessionPath(projectDir);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as DiscoverSessionData;
}

export function saveSession(
  projectDir: string,
  session: DiscoverSessionData,
): void {
  const filePath = sessionPath(projectDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
}

export function recordAnswer(
  session: DiscoverSessionData,
  questionId: string,
  answer: string,
): void {
  session.answers[questionId] = answer;
}

export function confirmStage(
  session: DiscoverSessionData,
  stageNumber: number,
  summary: string,
): void {
  const stage = session.stages.find((s) => s.stageNumber === stageNumber);
  if (stage) {
    stage.status = "confirmed";
    stage.confirmedAt = new Date().toISOString();
    stage.summary = summary;
  }

  // Advance to next stage
  const nextStage = session.stages.find(
    (s) => s.stageNumber === stageNumber + 1,
  );
  if (nextStage) {
    nextStage.status = "in_progress";
    session.currentStage = stageNumber + 1;
  }
}

export function completeSession(session: DiscoverSessionData): void {
  session.status = "completed";
  session.completedAt = new Date().toISOString();
}

export function pauseSession(session: DiscoverSessionData): void {
  session.status = "paused";
}

export function resumeSession(session: DiscoverSessionData): void {
  session.status = "in_progress";
}
