/**
 * Feedback engine - Business logic for framework feedback proposals
 *
 * Manages proposal lifecycle: create, list, approve (with diff apply + git commit),
 * reject, and notify via openclaw system event.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { Proposal, ProposalStore } from "./feedback-model.js";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PROPOSALS_FILE = ".framework/feedback/proposals.json";

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

export function loadProposals(dir: string): ProposalStore {
  const filePath = path.join(dir, PROPOSALS_FILE);
  if (!fs.existsSync(filePath)) {
    return { proposals: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ProposalStore;
  } catch {
    return { proposals: [] };
  }
}

export function saveProposals(dir: string, store: ProposalStore): void {
  const filePath = path.join(dir, PROPOSALS_FILE);
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export function listPendingProposals(dir: string): Proposal[] {
  const store = loadProposals(dir);
  return store.proposals.filter((p) => p.status === "pending");
}

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

export function approveProposal(
  dir: string,
  id: string,
): { ok: boolean; error?: string } {
  const store = loadProposals(dir);
  const proposal = store.proposals.find((p) => p.id === id);

  if (!proposal) {
    return { ok: false, error: `Proposal not found: ${id}` };
  }
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal is already ${proposal.status}` };
  }

  // Apply diff to target file
  try {
    const targetPath = path.resolve(dir, proposal.proposedChange.target);
    // S-R3-2: パストラバーサル防御
    if (!targetPath.startsWith(path.resolve(dir) + path.sep)) {
      return { ok: false, error: "Target path is outside project directory" };
    }
    applyDiff(targetPath, proposal.proposedChange.diff);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to apply diff: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Update status
  proposal.status = "approved";
  proposal.approvedAt = new Date().toISOString();
  saveProposals(dir, store);

  // Git commit (best effort) — spawnSync to avoid shell injection
  try {
    spawnSync("git", ["add", proposal.proposedChange.target, PROPOSALS_FILE], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 10000,
    });
    spawnSync(
      "git",
      ["commit", "-m", `feedback: apply proposal ${proposal.id} - ${proposal.title}`],
      { cwd: dir, encoding: "utf-8", timeout: 10000 },
    );
  } catch {
    // Diff applied and store saved, but git commit failed — non-fatal
  }

  return { ok: true };
}

export function rejectProposal(
  dir: string,
  id: string,
  reason?: string,
): { ok: boolean; error?: string } {
  const store = loadProposals(dir);
  const proposal = store.proposals.find((p) => p.id === id);

  if (!proposal) {
    return { ok: false, error: `Proposal not found: ${id}` };
  }
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal is already ${proposal.status}` };
  }

  proposal.status = "rejected";
  proposal.rejectedReason = reason ?? null;
  saveProposals(dir, store);
  return { ok: true };
}

// ─────────────────────────────────────────────
// Diff Application (simple)
// ─────────────────────────────────────────────

/**
 * Apply a diff string to a target file.
 * Simple implementation: if file doesn't exist, create it with diff content.
 * If file exists, append the diff content.
 */
export function applyDiff(targetFile: string, diff: string): void {
  const dirPath = path.dirname(targetFile);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(targetFile)) {
    fs.writeFileSync(targetFile, diff, "utf-8");
    return;
  }

  const current = fs.readFileSync(targetFile, "utf-8");
  fs.writeFileSync(targetFile, current + "\n" + diff, "utf-8");
}

// ─────────────────────────────────────────────
// Notification
// ─────────────────────────────────────────────

/**
 * Send a notification via openclaw system event.
 */
export function notifyProposal(proposal: Proposal): void {
  const text = `【ai-dev-framework】新しい改善提案: ${proposal.title} [id: ${proposal.id}]`;
  spawnSync("openclaw", ["system", "event", "--text", text, "--mode", "now"], {
    encoding: "utf-8",
    timeout: 10000,
  });
}
