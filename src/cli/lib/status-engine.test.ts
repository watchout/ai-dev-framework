import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type StatusIO,
  type StatusResult,
  collectStatus,
  printStatus,
} from "./status-engine.js";
import { saveRunState, createRunState } from "./run-model.js";
import {
  createGenerationState,
  saveGenerationState,
  markDocumentGenerated,
} from "./generate-state.js";
import { savePlan } from "./plan-model.js";
import { saveAuditReport } from "./audit-model.js";

function createMockIO(): StatusIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print(message: string): void {
      output.push(message);
    },
  };
}

describe("status-engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-status-"));
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("collectStatus", () => {
    it("returns zeroed status for fresh project", () => {
      const result = collectStatus(tmpDir);
      expect(result.overallProgress).toBe(0);
      expect(result.documents).toHaveLength(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.audits).toHaveLength(0);
    });

    it("detects discover phase", () => {
      const sessionPath = path.join(
        tmpDir,
        ".framework/discover-session.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({ status: "in_progress" }),
        "utf-8",
      );

      const result = collectStatus(tmpDir);
      const discovery = result.phases.find((p) => p.label === "Discovery");
      expect(discovery?.status).toBe("active");
    });

    it("detects completed discover phase", () => {
      const sessionPath = path.join(
        tmpDir,
        ".framework/discover-session.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({ status: "completed" }),
        "utf-8",
      );

      const result = collectStatus(tmpDir);
      const discovery = result.phases.find((p) => p.label === "Discovery");
      expect(discovery?.status).toBe("completed");
    });

    it("collects document statuses from generation state", () => {
      const genState = createGenerationState();
      markDocumentGenerated(genState, "docs/idea/IDEA_CANVAS.md", 80);
      markDocumentGenerated(genState, "docs/idea/USER_PERSONA.md", 50);
      saveGenerationState(tmpDir, genState);

      const result = collectStatus(tmpDir);
      expect(result.documents.length).toBeGreaterThan(0);
      const canvas = result.documents.find(
        (d) => d.path === "docs/idea/IDEA_CANVAS.md",
      );
      expect(canvas?.completeness).toBe(80);
    });

    it("collects tasks from run state", () => {
      const state = createRunState();
      state.tasks = [
        {
          taskId: "T1", featureId: "F1", taskKind: "db",
          name: "Task 1", status: "done", files: [],
        },
        {
          taskId: "T2", featureId: "F1", taskKind: "api",
          name: "Task 2", status: "backlog", files: [],
        },
      ];
      saveRunState(tmpDir, state);

      const result = collectStatus(tmpDir);
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].status).toBe("done");
      expect(result.tasks[1].status).toBe("backlog");
    });

    it("collects recent audit reports", () => {
      saveAuditReport(tmpDir, {
        mode: "ssot",
        target: {
          id: "T1",
          name: "test.md",
          path: "test.md",
          auditDate: new Date().toISOString(),
          iteration: 1,
        },
        scorecard: [],
        totalScore: 97,
        verdict: "pass",
        absoluteConditions: [],
        findings: [],
      });

      const result = collectStatus(tmpDir);
      expect(result.audits).toHaveLength(1);
      expect(result.audits[0].score).toBe(97);
      expect(result.audits[0].verdict).toBe("pass");
    });

    it("calculates overall progress", () => {
      // Add completed discover
      fs.writeFileSync(
        path.join(tmpDir, ".framework/discover-session.json"),
        JSON.stringify({ status: "completed" }),
        "utf-8",
      );

      // Add generation state with some completeness
      const genState = createGenerationState();
      genState.status = "completed";
      markDocumentGenerated(genState, "docs/idea/IDEA_CANVAS.md", 80);
      saveGenerationState(tmpDir, genState);

      // Add plan
      savePlan(tmpDir, {
        status: "generated",
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waves: [],
        circularDependencies: [],
      });

      const result = collectStatus(tmpDir);
      expect(result.overallProgress).toBeGreaterThan(0);
    });
  });

  describe("printStatus", () => {
    it("prints project status header", () => {
      const io = createMockIO();
      const result: StatusResult = {
        currentPhase: 1,
        phaseLabel: "Discovery",
        overallProgress: 25,
        profile: null,
        phases: [
          { number: 1, label: "Discovery", status: "active" },
          { number: 2, label: "Generation", status: "pending" },
        ],
        documents: [],
        tasks: [],
        audits: [],
      };

      printStatus(io, result);

      expect(io.output.some((o) => o.includes("PROJECT STATUS"))).toBe(true);
      expect(io.output.some((o) => o.includes("Discovery"))).toBe(true);
      expect(io.output.some((o) => o.includes("25%"))).toBe(true);
    });

    it("prints phase statuses", () => {
      const io = createMockIO();
      const result: StatusResult = {
        currentPhase: 2,
        phaseLabel: "Generation",
        overallProgress: 40,
        profile: null,
        phases: [
          { number: 1, label: "Discovery", status: "completed" },
          { number: 2, label: "Generation", status: "active" },
          { number: 3, label: "Planning", status: "pending" },
        ],
        documents: [],
        tasks: [],
        audits: [],
      };

      printStatus(io, result);

      expect(io.output.some((o) => o.includes("[DONE]"))).toBe(true);
      expect(io.output.some((o) => o.includes("[ACTIVE]"))).toBe(true);
      expect(io.output.some((o) => o.includes("[PENDING]"))).toBe(true);
    });

    it("prints document completeness", () => {
      const io = createMockIO();
      const result: StatusResult = {
        currentPhase: 2,
        phaseLabel: "Generation",
        overallProgress: 30,
        profile: null,
        phases: [],
        documents: [
          {
            path: "docs/idea/IDEA_CANVAS.md",
            completeness: 80,
            status: "generated",
          },
        ],
        tasks: [],
        audits: [],
      };

      printStatus(io, result);

      expect(io.output.some((o) => o.includes("80%"))).toBe(true);
      expect(io.output.some((o) => o.includes("IDEA_CANVAS"))).toBe(true);
    });

    it("prints task summary", () => {
      const io = createMockIO();
      const result: StatusResult = {
        currentPhase: 4,
        phaseLabel: "Implementation",
        overallProgress: 50,
        profile: null,
        phases: [],
        documents: [],
        tasks: [
          { id: "T1", featureId: "F1", name: "Task 1", status: "done" },
          { id: "T2", featureId: "F1", name: "Task 2", status: "backlog" },
        ],
        audits: [],
      };

      printStatus(io, result);

      expect(io.output.some((o) => o.includes("2 total"))).toBe(true);
      expect(io.output.some((o) => o.includes("1/2 done"))).toBe(true);
    });

    it("prints audit results", () => {
      const io = createMockIO();
      const result: StatusResult = {
        currentPhase: 5,
        phaseLabel: "Audit & Review",
        overallProgress: 80,
        profile: null,
        phases: [],
        documents: [],
        tasks: [],
        audits: [
          {
            mode: "ssot",
            targetName: "feature.md",
            score: 97,
            verdict: "pass",
            date: "2026-02-03",
          },
        ],
      };

      printStatus(io, result);

      expect(io.output.some((o) => o.includes("SSOT"))).toBe(true);
      expect(io.output.some((o) => o.includes("97/100"))).toBe(true);
      expect(io.output.some((o) => o.includes("PASS"))).toBe(true);
    });
  });
});
