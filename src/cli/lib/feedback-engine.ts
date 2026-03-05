/**
 * Feedback engine - Business logic for framework feedback proposals
 *
 * Manages proposal lifecycle: create, list, approve (with diff apply + git commit),
 * reject, and notify via openclaw system event.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  Proposal,
  ProposalStore,
  ApprovalStore,
  LessonEntry,
} from "./feedback-model.js";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PROPOSALS_FILE = ".framework/feedback/proposals.json";
const APPROVALS_FILE = ".framework/feedback/approvals-pending.json";
const LESSONS_FILE = "docs/knowledge/lessons-learned.md";

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

// ─────────────────────────────────────────────
// Telegram Notification (via openclaw message)
// ─────────────────────────────────────────────

/**
 * Send a Telegram notification for approval request.
 * Uses `openclaw message` command for Telegram delivery.
 */
export function sendTelegramApproval(proposal: Proposal): void {
  const text = [
    `【承認依頼】改善提案`,
    ``,
    `ID: ${proposal.id}`,
    `タイトル: ${proposal.title}`,
    `カテゴリ: ${proposal.category}`,
    `問題: ${proposal.problem}`,
    `影響: ${proposal.impact}`,
    `対象: ${proposal.proposedChange.target}`,
    ``,
    `承認: framework feedback approve ${proposal.id}`,
    `却下: framework feedback reject ${proposal.id}`,
  ].join("\n");

  spawnSync(
    "openclaw",
    ["message", "--text", text, "--channel", "telegram"],
    { encoding: "utf-8", timeout: 15000 },
  );
}

// ─────────────────────────────────────────────
// Approval State Management
// ─────────────────────────────────────────────

export function loadApprovals(dir: string): ApprovalStore {
  const filePath = path.join(dir, APPROVALS_FILE);
  if (!fs.existsSync(filePath)) {
    return { pending: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ApprovalStore;
  } catch {
    return { pending: [] };
  }
}

export function saveApprovals(dir: string, store: ApprovalStore): void {
  const filePath = path.join(dir, APPROVALS_FILE);
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Request approval for a proposal via Telegram.
 * Creates an approval request record and sends notification.
 */
export function requestApproval(
  dir: string,
  proposalId: string,
): { ok: boolean; error?: string } {
  const proposalStore = loadProposals(dir);
  const proposal = proposalStore.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return { ok: false, error: `Proposal not found: ${proposalId}` };
  }
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal is already ${proposal.status}` };
  }

  const approvals = loadApprovals(dir);

  // Check if already awaiting
  const existing = approvals.pending.find(
    (a) => a.proposalId === proposalId && a.status === "awaiting",
  );
  if (existing) {
    return { ok: false, error: "Approval already requested" };
  }

  approvals.pending.push({
    proposalId,
    requestedAt: new Date().toISOString(),
    status: "awaiting",
    respondedAt: null,
    channel: "telegram",
  });
  saveApprovals(dir, approvals);

  // Send Telegram notification
  sendTelegramApproval(proposal);

  // Also send openclaw system event
  notifyProposal(proposal);

  return { ok: true };
}

// ─────────────────────────────────────────────
// Upstream PR (Central Repository)
// ─────────────────────────────────────────────

/**
 * Create a PR in the ai-dev-framework repository with an approved proposal.
 * Uses `gh pr create` via the gh CLI.
 */
export function pushToUpstream(
  dir: string,
  proposalId: string,
  upstreamRepo: string = "yuji/ai-dev-framework",
): { ok: boolean; prUrl?: string; error?: string } {
  const store = loadProposals(dir);
  const proposal = store.proposals.find((p) => p.id === proposalId);

  if (!proposal) {
    return { ok: false, error: `Proposal not found: ${proposalId}` };
  }
  if (proposal.status !== "approved") {
    return { ok: false, error: "Only approved proposals can be pushed upstream" };
  }

  const branchName = `feedback/${proposal.id.toLowerCase()}`;
  const commitMessage = `feedback: ${proposal.title} (from ${proposal.sourceProject})`;

  try {
    // Create a branch, apply the diff, commit, push, and create PR
    spawnSync("git", ["checkout", "-b", branchName], {
      cwd: dir, encoding: "utf-8", timeout: 10000,
    });

    applyDiff(
      path.resolve(dir, proposal.proposedChange.target),
      proposal.proposedChange.diff,
    );

    spawnSync("git", ["add", proposal.proposedChange.target], {
      cwd: dir, encoding: "utf-8", timeout: 10000,
    });

    spawnSync("git", ["commit", "-m", commitMessage], {
      cwd: dir, encoding: "utf-8", timeout: 10000,
    });

    spawnSync("git", ["push", "origin", branchName], {
      cwd: dir, encoding: "utf-8", timeout: 30000,
    });

    // Create PR
    const prBody = [
      `## Feedback Proposal: ${proposal.id}`,
      "",
      `**Source**: ${proposal.sourceProject}`,
      `**Category**: ${proposal.category}`,
      "",
      "### Problem",
      proposal.problem,
      "",
      "### Impact",
      proposal.impact,
      "",
      "### Changes",
      `Target: \`${proposal.proposedChange.target}\``,
      "```diff",
      proposal.proposedChange.diff,
      "```",
    ].join("\n");

    const prResult = spawnSync(
      "gh",
      [
        "pr", "create",
        "--repo", upstreamRepo,
        "--title", `[Feedback] ${proposal.title}`,
        "--body", prBody,
        "--head", branchName,
      ],
      { cwd: dir, encoding: "utf-8", timeout: 30000 },
    );

    const prUrl = prResult.stdout?.trim() ?? "";

    // Return to previous branch
    spawnSync("git", ["checkout", "-"], {
      cwd: dir, encoding: "utf-8", timeout: 10000,
    });

    return { ok: true, prUrl };
  } catch (err) {
    // Try to return to previous branch on error
    spawnSync("git", ["checkout", "-"], {
      cwd: dir, encoding: "utf-8", timeout: 10000,
    });

    return {
      ok: false,
      error: `Failed to push upstream: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─────────────────────────────────────────────
// Knowledge Layer (Lessons Learned)
// ─────────────────────────────────────────────

/**
 * Append an approved proposal to docs/knowledge/lessons-learned.md.
 * Categorized and timestamped for future reference.
 */
export function appendLessonLearned(dir: string, proposal: Proposal): void {
  const filePath = path.join(dir, LESSONS_FILE);
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const entry: LessonEntry = {
    date: new Date().toISOString().split("T")[0],
    proposalId: proposal.id,
    category: proposal.category,
    title: proposal.title,
    problem: proposal.problem,
    solution: proposal.proposedChange.diff,
    sourceProject: proposal.sourceProject,
  };

  const markdown = [
    "",
    `### ${entry.date} - ${entry.title}`,
    "",
    `- **Proposal**: ${entry.proposalId}`,
    `- **Category**: ${entry.category}`,
    `- **Source**: ${entry.sourceProject}`,
    `- **Problem**: ${entry.problem}`,
    `- **Solution**:`,
    "```",
    entry.solution,
    "```",
    "",
  ].join("\n");

  if (!fs.existsSync(filePath)) {
    const header = [
      "# Lessons Learned",
      "",
      "> Auto-generated from approved feedback proposals.",
      "> Categories: coding-rule, ssot-template, skill, gate, workflow",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, header + markdown, "utf-8");
  } else {
    fs.appendFileSync(filePath, markdown, "utf-8");
  }
}
