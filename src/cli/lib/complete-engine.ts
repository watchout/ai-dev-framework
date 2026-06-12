/**
 * Engine for the shirube complete command.
 * Ref: #367 — merge-vs-complete separation
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CompleteCheck,
  CompleteEvidenceRecord,
  CompleteEvidenceStore,
  ShirubeProfile,
} from "./complete-model.js";

const EVIDENCE_FILE = ".framework/complete-evidence.json";
const PROFILE_FILE = ".shirube/profile.json";

export function loadCompleteEvidence(projectDir: string): CompleteEvidenceStore {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CompleteEvidenceStore;
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { records: [] };
  }
}

export function saveCompleteEvidence(
  projectDir: string,
  store: CompleteEvidenceStore,
): void {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

export function loadShirubeProfile(projectDir: string): ShirubeProfile | null {
  const filePath = path.join(projectDir, PROFILE_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ShirubeProfile;
  } catch {
    return null;
  }
}

export function buildRecord(opts: {
  prNumber: string;
  sha: string;
  checks: CompleteCheck[];
  forced: boolean;
}): CompleteEvidenceRecord {
  return {
    prNumber: opts.prNumber,
    sha: opts.sha,
    completedAt: new Date().toISOString(),
    checks: opts.checks,
    forced: opts.forced,
  };
}

export function isCompleted(
  prNumber: string,
  store: CompleteEvidenceStore,
): CompleteEvidenceRecord | null {
  return store.records.find((r) => r.prNumber === prNumber) ?? null;
}

export function renderStatus(
  store: CompleteEvidenceStore,
  profile: ShirubeProfile | null,
): string {
  const lines: string[] = ["Complete Evidence Status", "─".repeat(40)];

  if (profile) {
    const runtimeLabel = profile.runtime ? "runtime (live evidence required)" : "non-runtime";
    lines.push(`Repo:    ${profile.repo_id}`);
    lines.push(`Type:    ${runtimeLabel}`);
    lines.push("");
  }

  if (store.records.length === 0) {
    lines.push("No complete records found.");
    return lines.join("\n");
  }

  for (const record of store.records) {
    const allPassed = record.checks.every((c) => c.passed);
    const icon = record.forced ? "⚠" : allPassed ? "✓" : "✗";
    lines.push(
      `${icon} PR #${record.prNumber}  ${record.sha}  ${record.completedAt.slice(0, 16)}`,
    );
    for (const check of record.checks) {
      const ci = check.passed ? "  ✓" : "  ✗";
      lines.push(`${ci} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
    }
    if (record.forced) {
      lines.push("  ⚠ Marked complete with --force");
    }
    lines.push("");
  }

  return lines.join("\n");
}
