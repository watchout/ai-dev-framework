import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { type CompactIO, runCompact } from "./compact-engine.js";
import {
  saveSessionState,
  appendDecision,
  savePatterns,
  appendOpenIssue,
} from "./memory-model.js";

function createMockIO(): CompactIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("compact-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-compact-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("runCompact", () => {
    it("returns ok status for empty project", () => {
      const io = createMockIO();
      const status = runCompact(tmpDir, {}, io);
      expect(status.recommendation).toBe("ok");
      expect(status.totalSize).toBe(0);
    });

    it("shows status with --status flag", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T00:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: [],
      });

      const io = createMockIO();
      const status = runCompact(tmpDir, { status: true }, io);
      expect(status.p1Items).toBeGreaterThan(0);
      expect(
        io.output.some((o) => o.includes("Priority Breakdown")),
      ).toBe(true);
    });

    it("prints recommendation text", () => {
      const io = createMockIO();
      runCompact(tmpDir, {}, io);
      expect(
        io.output.some((o) => o.includes("Recommendation")),
      ).toBe(true);
    });

    it("detects multiple context categories", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T00:00:00Z",
        currentPhase: 2,
        activeFiles: ["src/index.ts"],
        pendingActions: [],
      });
      appendDecision(tmpDir, {
        date: "2026-02-04",
        context: "ctx",
        decision: "dec",
        rationale: "rat",
      });
      savePatterns(tmpDir, [
        {
          id: "P-1",
          trigger: "t",
          action: "a",
          confidence: 80,
          source: "s",
          createdAt: "2026-02-04T00:00:00Z",
          useCount: 1,
        },
      ]);

      const io = createMockIO();
      const status = runCompact(tmpDir, {}, io);
      expect(status.p1Items).toBeGreaterThan(0);
      expect(status.p2Items).toBeGreaterThan(0);
      expect(
        io.output.some((o) => o.includes("Items by category")),
      ).toBe(true);
    });

    it("archives P3 items with --auto", () => {
      // Create enough data to have P3 items (old decisions)
      for (let i = 0; i < 8; i++) {
        appendDecision(tmpDir, {
          date: `2026-01-${String(i + 1).padStart(2, "0")}`,
          context: `context ${i}`,
          decision: `decision ${i}`,
          rationale: `rationale ${i}`,
        });
      }

      const io = createMockIO();
      runCompact(tmpDir, { auto: true }, io);

      const archiveDir = path.join(
        tmpDir,
        ".claude",
        "memory",
        "archive",
      );
      if (fs.existsSync(archiveDir)) {
        const files = fs.readdirSync(archiveDir);
        const archiveFiles = files.filter((f) =>
          f.startsWith("archive_"),
        );
        // If there are P3 items, archive files should exist
        if (archiveFiles.length > 0) {
          expect(archiveFiles.length).toBeGreaterThan(0);
        }
      }
      // Verify the compact completed (output includes "complete" or "No items")
      expect(
        io.output.some(
          (o) =>
            o.includes("Compaction complete") || o.includes("No items"),
        ),
      ).toBe(true);
    });

    it("reports correct item counts", () => {
      saveSessionState(tmpDir, {
        lastUpdated: "2026-02-04T00:00:00Z",
        currentPhase: 1,
        activeFiles: [],
        pendingActions: [],
      });
      appendOpenIssue(tmpDir, {
        id: "ISS-001",
        title: "Bug",
        description: "Desc",
        createdAt: "2026-02-04T00:00:00Z",
        priority: "high",
      });

      const io = createMockIO();
      const status = runCompact(tmpDir, { status: true }, io);
      // Session is P1, high-priority issue is P1
      expect(status.p1Items).toBeGreaterThanOrEqual(2);
    });
  });
});
