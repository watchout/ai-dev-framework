/**
 * Bypass audit log — append-only log of framework bypass events.
 *
 * Part of #63/#65 (09_ENFORCEMENT §2).
 *
 * Records bypass events (framework exit, gate reset, --no-verify)
 * to a dedicated `audit-log` GitHub Issue for immutable audit trail.
 */
import { execGh } from "./github-engine.js";

const AUDIT_LOG_LABEL = "audit-log";

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  reason: string;
}

async function getOrCreateAuditIssue(): Promise<number | null> {
  try {
    // Find existing audit-log Issue
    const output = await execGh([
      "issue",
      "list",
      "--label",
      AUDIT_LOG_LABEL,
      "--state",
      "open",
      "--json",
      "number",
      "--limit",
      "1",
    ]);
    const issues = JSON.parse(output) as { number: number }[];
    if (issues.length > 0) return issues[0].number;

    // Create new audit-log Issue
    const createOutput = await execGh([
      "issue",
      "create",
      "--title",
      "[Audit Log] Framework Bypass Records",
      "--body",
      "This Issue is an append-only audit log for framework bypass events.\nDo not close or edit manually.\n\nCreated by: framework CLI (09_ENFORCEMENT §2)",
      "--label",
      AUDIT_LOG_LABEL,
    ]);
    const match = createOutput.trim().match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

export async function appendAuditLog(entry: AuditEntry): Promise<boolean> {
  const issueNumber = await getOrCreateAuditIssue();
  if (!issueNumber) {
    console.warn("[audit-log] Failed to find/create audit-log Issue. Entry not recorded.");
    return false;
  }

  const body = [
    `## Bypass Record`,
    ``,
    `- **Timestamp**: ${entry.timestamp}`,
    `- **Actor**: ${entry.actor}`,
    `- **Action**: ${entry.action}`,
    `- **Reason**: ${entry.reason}`,
  ].join("\n");

  try {
    await execGh([
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      body,
    ]);
    return true;
  } catch {
    console.warn("[audit-log] Failed to append audit entry.");
    return false;
  }
}

function getActor(): string {
  try {
    const { execSync } = require("child_process");
    return execSync("git config user.name", { encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function logFrameworkExit(reason: string): Promise<boolean> {
  return appendAuditLog({
    timestamp: new Date().toISOString(),
    actor: getActor(),
    action: "framework exit",
    reason,
  });
}
