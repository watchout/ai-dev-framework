/**
 * Compact engine - Strategic context compaction
 * Based on: 21_AI_ESCALATION.md Strategic Compact
 *
 * Analyzes context priority and performs compaction by
 * archiving lower-priority items to .claude/memory/.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CompactStatus,
  type ContextItem,
  analyzeContextPriority,
  calculateCompactStatus,
} from "./memory-model.js";

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface CompactIO {
  print(message: string): void;
}

export function createCompactTerminalIO(): CompactIO {
  return {
    print(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

// ─────────────────────────────────────────────
// Compact Execution
// ─────────────────────────────────────────────

export function runCompact(
  projectDir: string,
  options: { auto?: boolean; status?: boolean },
  io: CompactIO,
): CompactStatus {
  io.print("\n  Context Compact");
  io.print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const items = analyzeContextPriority(projectDir);
  const status = calculateCompactStatus(items);

  if (options.status) {
    printStatus(io, items, status);
    return status;
  }

  printStatus(io, items, status);

  if (options.auto) {
    runAutoCompact(projectDir, items, io);
  }

  printRecommendation(io, status);
  return status;
}

// ─────────────────────────────────────────────
// Status Display
// ─────────────────────────────────────────────

function printStatus(
  io: CompactIO,
  items: ContextItem[],
  status: CompactStatus,
): void {
  io.print("");
  io.print("  Priority Breakdown:");
  io.print(`    P1 (Critical):    ${status.p1Items} items`);
  io.print(`    P2 (Important):   ${status.p2Items} items`);
  io.print(`    P3 (Archivable):  ${status.p3Items} items`);
  io.print(`    P4 (Discardable): ${status.p4Items} items`);
  io.print("");
  io.print(`  Total context size: ${formatSize(status.totalSize)}`);
  io.print("");

  if (items.length > 0) {
    io.print("  Items by category:");
    const byCategory = groupByCategory(items);
    for (const [cat, catItems] of Object.entries(byCategory)) {
      const size = catItems.reduce((s, i) => s + i.size, 0);
      io.print(`    ${cat}: ${catItems.length} items (${formatSize(size)})`);
    }
    io.print("");
  }
}

function printRecommendation(
  io: CompactIO,
  status: CompactStatus,
): void {
  switch (status.recommendation) {
    case "compact_now":
      io.print("  Recommendation: COMPACT NOW");
      io.print("  Context is large. Run with --auto to compact.");
      break;
    case "compact_soon":
      io.print("  Recommendation: COMPACT SOON");
      io.print("  Context is growing. Consider compacting.");
      break;
    case "ok":
      io.print("  Recommendation: OK");
      io.print("  Context size is within acceptable range.");
      break;
  }
  io.print("");
}

// ─────────────────────────────────────────────
// Auto Compact
// ─────────────────────────────────────────────

function runAutoCompact(
  projectDir: string,
  items: ContextItem[],
  io: CompactIO,
): void {
  const archiveDir = path.join(projectDir, ".claude", "memory", "archive");
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const p3Items = items.filter((i) => i.priority === "P3");
  const p4Items = items.filter((i) => i.priority === "P4");

  if (p3Items.length === 0 && p4Items.length === 0) {
    io.print("  No items to compact.");
    return;
  }

  // Archive P3 items
  if (p3Items.length > 0) {
    const archivePath = path.join(
      archiveDir,
      `archive_${Date.now()}.json`,
    );
    fs.writeFileSync(
      archivePath,
      JSON.stringify(p3Items, null, 2),
      "utf-8",
    );
    io.print(`  Archived ${p3Items.length} P3 item(s)`);
  }

  // Mark P4 items as discardable
  if (p4Items.length > 0) {
    const discardPath = path.join(
      archiveDir,
      `discard_${Date.now()}.json`,
    );
    fs.writeFileSync(
      discardPath,
      JSON.stringify(p4Items, null, 2),
      "utf-8",
    );
    io.print(`  Marked ${p4Items.length} P4 item(s) as discardable`);
  }

  io.print("  Compaction complete.");
  io.print("");
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = Math.round(bytes / 1024);
  return `${kb} KB`;
}

function groupByCategory(
  items: ContextItem[],
): Record<string, ContextItem[]> {
  const groups: Record<string, ContextItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}
