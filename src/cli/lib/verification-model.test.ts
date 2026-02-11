import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type CheckpointData,
  type CheckpointIndex,
  type CheckpointScores,
  type VerifyResult,
  calculateTotalScore,
  scoreLevel,
  generateCheckpointId,
  compareCheckpoints,
  saveCheckpoint,
  loadCheckpoint,
  loadCheckpointIndex,
  saveVerifyResult,
} from "./verification-model.js";

function makeScores(
  overrides?: Partial<Omit<CheckpointScores, "total">>,
): Omit<CheckpointScores, "total"> {
  return {
    ssotAlignment: 100,
    codeQuality: 100,
    testCoverage: 100,
    typeSafety: 100,
    lint: 100,
    ...overrides,
  };
}

function makeCheckpoint(
  overrides?: Partial<CheckpointData>,
): CheckpointData {
  const scores = makeScores();
  return {
    id: "CP-001",
    name: "test-checkpoint",
    timestamp: "2026-02-04T00:00:00.000Z",
    filesChanged: ["src/index.ts"],
    scores: { ...scores, total: calculateTotalScore(scores) },
    issues: [],
    recommendations: [],
    ...overrides,
  };
}

function makeIndex(
  overrides?: Partial<CheckpointIndex>,
): CheckpointIndex {
  return {
    checkpoints: [],
    stats: { totalCheckpoints: 0, averageScore: 0, trend: "stable" },
    ...overrides,
  };
}

describe("verification-model", () => {
  describe("calculateTotalScore", () => {
    it("returns 100 for all perfect scores", () => {
      const scores = makeScores();
      expect(calculateTotalScore(scores)).toBe(100);
    });

    it("applies correct weights (SSOT:25, code:25, test:20, type:15, lint:15)", () => {
      // Only ssotAlignment at 0, rest at 100
      // Expected: (0*25 + 100*25 + 100*20 + 100*15 + 100*15) / 100 = 75
      const scores = makeScores({ ssotAlignment: 0 });
      expect(calculateTotalScore(scores)).toBe(75);
    });

    it("applies test coverage weight correctly", () => {
      // Only testCoverage at 0, rest at 100
      // Expected: (100*25 + 100*25 + 0*20 + 100*15 + 100*15) / 100 = 80
      const scores = makeScores({ testCoverage: 0 });
      expect(calculateTotalScore(scores)).toBe(80);
    });

    it("returns 0 when all scores are 0", () => {
      const scores = makeScores({
        ssotAlignment: 0,
        codeQuality: 0,
        testCoverage: 0,
        typeSafety: 0,
        lint: 0,
      });
      expect(calculateTotalScore(scores)).toBe(0);
    });

    it("rounds to nearest integer", () => {
      // 90*25 + 85*25 + 80*20 + 75*15 + 70*15 = 2250+2125+1600+1125+1050 = 8150
      // 8150/100 = 81.5 -> 82
      const scores = makeScores({
        ssotAlignment: 90,
        codeQuality: 85,
        testCoverage: 80,
        typeSafety: 75,
        lint: 70,
      });
      expect(calculateTotalScore(scores)).toBe(82);
    });
  });

  describe("scoreLevel", () => {
    it("returns pass for 90+", () => {
      expect(scoreLevel(90)).toBe("pass");
      expect(scoreLevel(100)).toBe("pass");
      expect(scoreLevel(95)).toBe("pass");
    });

    it("returns warning for 70-89", () => {
      expect(scoreLevel(70)).toBe("warning");
      expect(scoreLevel(89)).toBe("warning");
      expect(scoreLevel(80)).toBe("warning");
    });

    it("returns fail for below 70", () => {
      expect(scoreLevel(69)).toBe("fail");
      expect(scoreLevel(0)).toBe("fail");
      expect(scoreLevel(50)).toBe("fail");
    });
  });

  describe("generateCheckpointId", () => {
    it("generates CP-001 for empty index", () => {
      const index = makeIndex();
      expect(generateCheckpointId(index)).toBe("CP-001");
    });

    it("increments from existing checkpoints", () => {
      const index = makeIndex({
        checkpoints: [
          {
            id: "CP-001",
            name: "first",
            timestamp: "2026-01-01T00:00:00Z",
            totalScore: 85,
          },
        ],
      });
      expect(generateCheckpointId(index)).toBe("CP-002");
    });

    it("pads to 3 digits", () => {
      const checkpoints = Array.from({ length: 99 }, (_, i) => ({
        id: `CP-${String(i + 1).padStart(3, "0")}`,
        name: `cp-${i + 1}`,
        timestamp: "2026-01-01T00:00:00Z",
        totalScore: 80,
      }));
      const index = makeIndex({ checkpoints });
      expect(generateCheckpointId(index)).toBe("CP-100");
    });
  });

  describe("compareCheckpoints", () => {
    it("calculates score differences", () => {
      const from = makeCheckpoint({
        id: "CP-001",
        scores: {
          ssotAlignment: 70,
          codeQuality: 80,
          testCoverage: 60,
          typeSafety: 90,
          lint: 85,
          total: 76,
        },
      });
      const to = makeCheckpoint({
        id: "CP-002",
        scores: {
          ssotAlignment: 85,
          codeQuality: 85,
          testCoverage: 70,
          typeSafety: 95,
          lint: 90,
          total: 85,
        },
      });

      const comp = compareCheckpoints(from, to);
      expect(comp.scoreDiffs["ssotAlignment"]).toBe(15);
      expect(comp.scoreDiffs["codeQuality"]).toBe(5);
      expect(comp.scoreDiffs["testCoverage"]).toBe(10);
      expect(comp.scoreDiffs["total"]).toBe(9);
    });

    it("detects new files", () => {
      const from = makeCheckpoint({
        filesChanged: ["src/a.ts"],
      });
      const to = makeCheckpoint({
        filesChanged: ["src/a.ts", "src/b.ts"],
      });

      const comp = compareCheckpoints(from, to);
      expect(comp.newFiles).toBe(1);
      expect(comp.changedFiles).toBe(1);
    });

    it("counts resolved and new issues", () => {
      const from = makeCheckpoint({
        issues: [
          {
            category: "lint",
            file: "a.ts",
            message: "console.log",
            severity: "warning",
          },
          {
            category: "types",
            file: "b.ts",
            message: "any usage",
            severity: "error",
          },
        ],
      });
      const to = makeCheckpoint({
        issues: [
          {
            category: "types",
            file: "b.ts",
            message: "any usage",
            severity: "error",
          },
          {
            category: "code",
            file: "c.ts",
            message: "too long",
            severity: "warning",
          },
        ],
      });

      const comp = compareCheckpoints(from, to);
      expect(comp.resolvedIssues).toBe(1);
      expect(comp.newIssues).toBe(1);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "fw-verify-model-"),
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saveCheckpoint + loadCheckpoint round-trip", () => {
      const data = makeCheckpoint();
      saveCheckpoint(tmpDir, data);

      const loaded = loadCheckpoint(tmpDir, "CP-001");
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("CP-001");
      expect(loaded!.name).toBe("test-checkpoint");
      expect(loaded!.scores.total).toBe(100);
    });

    it("creates .claude/checkpoints directory", () => {
      saveCheckpoint(tmpDir, makeCheckpoint());
      expect(
        fs.existsSync(path.join(tmpDir, ".claude", "checkpoints")),
      ).toBe(true);
    });

    it("loadCheckpoint returns null for missing id", () => {
      expect(loadCheckpoint(tmpDir, "CP-999")).toBeNull();
    });

    it("loadCheckpointIndex returns empty for fresh project", () => {
      const index = loadCheckpointIndex(tmpDir);
      expect(index.checkpoints).toHaveLength(0);
      expect(index.stats.totalCheckpoints).toBe(0);
      expect(index.stats.trend).toBe("stable");
    });

    it("loadCheckpointIndex reflects saved checkpoints", () => {
      saveCheckpoint(tmpDir, makeCheckpoint({ id: "CP-001" }));
      saveCheckpoint(
        tmpDir,
        makeCheckpoint({
          id: "CP-002",
          name: "second",
          timestamp: "2026-02-04T01:00:00.000Z",
        }),
      );

      const index = loadCheckpointIndex(tmpDir);
      expect(index.checkpoints).toHaveLength(2);
      expect(index.stats.totalCheckpoints).toBe(2);
      expect(index.stats.averageScore).toBe(100);
    });

    it("index trend is stable with fewer than 3 checkpoints", () => {
      saveCheckpoint(tmpDir, makeCheckpoint());
      const index = loadCheckpointIndex(tmpDir);
      expect(index.stats.trend).toBe("stable");
    });

    it("saveVerifyResult persists to .claude/verify/", () => {
      const result: VerifyResult = {
        target: "code",
        grader: "auto",
        scores: { codeQuality: 85 },
        issues: [],
        verdict: "warning",
      };

      saveVerifyResult(tmpDir, result);

      const dir = path.join(tmpDir, ".claude", "verify");
      expect(fs.existsSync(dir)).toBe(true);
      const files = fs.readdirSync(dir);
      expect(files).toHaveLength(1);

      const raw = fs.readFileSync(
        path.join(dir, files[0]),
        "utf-8",
      );
      const loaded = JSON.parse(raw) as VerifyResult;
      expect(loaded.target).toBe("code");
      expect(loaded.verdict).toBe("warning");
    });
  });
});
