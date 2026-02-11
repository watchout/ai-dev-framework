import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type SessionState,
  type Decision,
  type PatternEntry,
  type OpenIssue,
  type ContextItem,
  saveSessionState,
  loadSessionState,
  appendDecision,
  loadDecisions,
  savePatterns,
  loadPatterns,
  appendOpenIssue,
  loadOpenIssues,
  analyzeContextPriority,
  calculateCompactStatus,
} from "./memory-model.js";

function makeSessionState(
  overrides?: Partial<SessionState>,
): SessionState {
  return {
    lastUpdated: "2026-02-04T00:00:00Z",
    currentTask: "Building CLI",
    currentPhase: 3,
    activeFiles: ["src/cli/index.ts"],
    pendingActions: ["Run tests"],
    ...overrides,
  };
}

function makeDecision(overrides?: Partial<Decision>): Decision {
  return {
    date: "2026-02-04",
    context: "Choosing test framework",
    decision: "Use Vitest over Jest",
    rationale: "Better ESM support and faster execution",
    ...overrides,
  };
}

function makePattern(
  overrides?: Partial<PatternEntry>,
): PatternEntry {
  return {
    id: "PAT-001",
    trigger: "Creating a new model file",
    action: "Use types + pure functions pattern",
    confidence: 85,
    source: "audit-model.ts",
    createdAt: "2026-02-04T00:00:00Z",
    useCount: 3,
    ...overrides,
  };
}

function makeIssue(overrides?: Partial<OpenIssue>): OpenIssue {
  return {
    id: "ISS-001",
    title: "Fix test flake",
    description: "Tests intermittently fail on CI",
    createdAt: "2026-02-04T00:00:00Z",
    priority: "high",
    ...overrides,
  };
}

describe("memory-model", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-memory-model-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("saveSessionState + loadSessionState", () => {
    it("saves and loads session state", () => {
      const state = makeSessionState();
      saveSessionState(tmpDir, state);
      const loaded = loadSessionState(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.currentPhase).toBe(3);
      expect(loaded!.currentTask).toBe("Building CLI");
      expect(loaded!.activeFiles).toEqual(["src/cli/index.ts"]);
    });

    it("creates .claude/memory directory", () => {
      saveSessionState(tmpDir, makeSessionState());
      expect(
        fs.existsSync(path.join(tmpDir, ".claude", "memory")),
      ).toBe(true);
    });

    it("returns null when no state saved", () => {
      expect(loadSessionState(tmpDir)).toBeNull();
    });

    it("overwrites existing state on save", () => {
      saveSessionState(tmpDir, makeSessionState({ currentPhase: 1 }));
      saveSessionState(tmpDir, makeSessionState({ currentPhase: 5 }));
      const loaded = loadSessionState(tmpDir);
      expect(loaded!.currentPhase).toBe(5);
    });

    it("preserves optional currentTask as undefined", () => {
      saveSessionState(
        tmpDir,
        makeSessionState({ currentTask: undefined }),
      );
      const loaded = loadSessionState(tmpDir);
      expect(loaded!.currentTask).toBeUndefined();
    });
  });

  describe("appendDecision + loadDecisions", () => {
    it("appends and loads a single decision", () => {
      appendDecision(tmpDir, makeDecision());
      const decisions = loadDecisions(tmpDir);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision).toBe("Use Vitest over Jest");
    });

    it("appends multiple decisions in order", () => {
      appendDecision(tmpDir, makeDecision({ date: "2026-02-01" }));
      appendDecision(tmpDir, makeDecision({ date: "2026-02-02" }));
      appendDecision(tmpDir, makeDecision({ date: "2026-02-03" }));

      const decisions = loadDecisions(tmpDir);
      expect(decisions).toHaveLength(3);
      // Latest first
      expect(decisions[0].date).toBe("2026-02-03");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        appendDecision(
          tmpDir,
          makeDecision({ date: `2026-02-${String(i + 1).padStart(2, "0")}` }),
        );
      }
      const limited = loadDecisions(tmpDir, 3);
      expect(limited).toHaveLength(3);
    });

    it("returns empty for no decisions", () => {
      expect(loadDecisions(tmpDir)).toHaveLength(0);
    });

    it("creates decisions.md with header", () => {
      appendDecision(tmpDir, makeDecision());
      const content = fs.readFileSync(
        path.join(tmpDir, ".claude", "memory", "decisions.md"),
        "utf-8",
      );
      expect(content).toContain("# Decisions Log");
    });
  });

  describe("savePatterns + loadPatterns", () => {
    it("saves and loads patterns", () => {
      const patterns = [makePattern(), makePattern({ id: "PAT-002" })];
      savePatterns(tmpDir, patterns);
      const loaded = loadPatterns(tmpDir);
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("PAT-001");
      expect(loaded[1].id).toBe("PAT-002");
    });

    it("returns empty when no patterns file", () => {
      expect(loadPatterns(tmpDir)).toHaveLength(0);
    });

    it("overwrites patterns on save", () => {
      savePatterns(tmpDir, [makePattern()]);
      savePatterns(tmpDir, [makePattern({ id: "PAT-NEW" })]);
      const loaded = loadPatterns(tmpDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("PAT-NEW");
    });
  });

  describe("appendOpenIssue + loadOpenIssues", () => {
    it("appends and loads an issue", () => {
      appendOpenIssue(tmpDir, makeIssue());
      const issues = loadOpenIssues(tmpDir);
      expect(issues).toHaveLength(1);
      expect(issues[0].id).toBe("ISS-001");
      expect(issues[0].title).toBe("Fix test flake");
    });

    it("appends multiple issues", () => {
      appendOpenIssue(tmpDir, makeIssue({ id: "ISS-001" }));
      appendOpenIssue(tmpDir, makeIssue({ id: "ISS-002", title: "Second" }));
      const issues = loadOpenIssues(tmpDir);
      expect(issues).toHaveLength(2);
    });

    it("returns empty when no issues", () => {
      expect(loadOpenIssues(tmpDir)).toHaveLength(0);
    });

    it("preserves priority field", () => {
      appendOpenIssue(tmpDir, makeIssue({ priority: "low" }));
      const issues = loadOpenIssues(tmpDir);
      expect(issues[0].priority).toBe("low");
    });
  });

  describe("analyzeContextPriority", () => {
    it("returns empty for project with no memory", () => {
      const items = analyzeContextPriority(tmpDir);
      expect(items).toHaveLength(0);
    });

    it("classifies session state as P1", () => {
      saveSessionState(tmpDir, makeSessionState());
      const items = analyzeContextPriority(tmpDir);
      const sessionItems = items.filter(
        (i) => i.category === "session",
      );
      expect(sessionItems.length).toBeGreaterThan(0);
      expect(sessionItems[0].priority).toBe("P1");
    });

    it("classifies recent decisions as P1", () => {
      appendDecision(tmpDir, makeDecision());
      const items = analyzeContextPriority(tmpDir);
      const decisionItems = items.filter(
        (i) => i.category === "decision",
      );
      expect(decisionItems.length).toBeGreaterThan(0);
      expect(decisionItems[0].priority).toBe("P1");
    });

    it("classifies patterns as P2", () => {
      savePatterns(tmpDir, [makePattern()]);
      const items = analyzeContextPriority(tmpDir);
      const patternItems = items.filter(
        (i) => i.category === "pattern",
      );
      expect(patternItems.length).toBeGreaterThan(0);
      expect(patternItems[0].priority).toBe("P2");
    });
  });

  describe("calculateCompactStatus", () => {
    it("returns ok for empty context", () => {
      const status = calculateCompactStatus([]);
      expect(status.recommendation).toBe("ok");
      expect(status.totalSize).toBe(0);
    });

    it("counts items by priority", () => {
      const items: ContextItem[] = [
        { priority: "P1", category: "a", description: "x", size: 100 },
        { priority: "P1", category: "b", description: "y", size: 100 },
        { priority: "P2", category: "c", description: "z", size: 100 },
        { priority: "P3", category: "d", description: "w", size: 100 },
        { priority: "P4", category: "e", description: "v", size: 100 },
      ];
      const status = calculateCompactStatus(items);
      expect(status.p1Items).toBe(2);
      expect(status.p2Items).toBe(1);
      expect(status.p3Items).toBe(1);
      expect(status.p4Items).toBe(1);
      expect(status.totalSize).toBe(500);
    });

    it("recommends compact_now for large context", () => {
      const items: ContextItem[] = Array.from({ length: 5 }, (_, i) => ({
        priority: "P1" as const,
        category: `cat-${i}`,
        description: `item-${i}`,
        size: 3000,
      }));
      const status = calculateCompactStatus(items);
      expect(status.recommendation).toBe("compact_now");
    });

    it("recommends compact_soon for medium context", () => {
      const items: ContextItem[] = Array.from({ length: 3 }, (_, i) => ({
        priority: "P2" as const,
        category: `cat-${i}`,
        description: `item-${i}`,
        size: 2000,
      }));
      const status = calculateCompactStatus(items);
      expect(status.recommendation).toBe("compact_soon");
    });

    it("recommends compact_now when many P3+P4 items", () => {
      const items: ContextItem[] = Array.from(
        { length: 25 },
        (_, i) => ({
          priority: (i % 2 === 0 ? "P3" : "P4") as "P3" | "P4",
          category: `cat-${i}`,
          description: `item-${i}`,
          size: 10,
        }),
      );
      const status = calculateCompactStatus(items);
      expect(status.recommendation).toBe("compact_now");
    });

    it("sums total size correctly", () => {
      const items: ContextItem[] = [
        { priority: "P1", category: "a", description: "x", size: 250 },
        { priority: "P2", category: "b", description: "y", size: 750 },
      ];
      const status = calculateCompactStatus(items);
      expect(status.totalSize).toBe(1000);
    });
  });
});
