/**
 * LLMRuntimeAdapter conformance tests.
 * Any adapter implementation must pass this suite.
 * Ref: #330 — LLMRuntimeAdapter interface contract
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ClaudeCodeAdapter } from "./claude-code-adapter.js";
import type { LLMRuntimeAdapter, AIChangeRecord } from "./llm-adapter-model.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: "",
    stderr: "",
    error: undefined,
    pid: 0,
    output: [null, null, null],
    signal: null,
  })),
}));

// ─────────────────────────────────────────────
// Conformance suite — run against any adapter
// ─────────────────────────────────────────────

function runConformanceSuite(
  adapterName: string,
  createAdapter: () => LLMRuntimeAdapter,
) {
  describe(`${adapterName} conformance`, () => {
    let tmpDir: string;
    let adapter: LLMRuntimeAdapter;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-conform-"));
      adapter = createAdapter();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── identity ──────────────────────────────────────────────────────
    it("has non-empty providerId", () => {
      expect(adapter.providerId).toBeTruthy();
      expect(typeof adapter.providerId).toBe("string");
    });

    it("has non-empty displayName", () => {
      expect(adapter.displayName).toBeTruthy();
      expect(typeof adapter.displayName).toBe("string");
    });

    // ── executeTask ───────────────────────────────────────────────────
    it("executeTask returns ok:true for valid task", async () => {
      const result = await adapter.executeTask({ taskId: "TEST-001", dryRun: true });
      expect(result.ok).toBe(true);
      expect(result.taskId).toBe("TEST-001");
    });

    it("executeTask result has taskId matching input", async () => {
      const result = await adapter.executeTask({ taskId: "TASK-XYZ", dryRun: true });
      expect(result.taskId).toBe("TASK-XYZ");
    });

    // ── checkGate ─────────────────────────────────────────────────────
    it("checkGate returns GateCheckResult with passed boolean", async () => {
      const result = await adapter.checkGate("gate-a", tmpDir);
      expect(typeof result.passed).toBe("boolean");
    });

    it("checkGate returns passed:false when gate file missing", async () => {
      const result = await adapter.checkGate("gate-a", tmpDir);
      expect(result.passed).toBe(false);
      if (!result.passed) {
        expect(result.reason).toBeTruthy();
        expect(typeof result.blocking).toBe("boolean");
      }
    });

    it("checkGate returns passed:true when gate file has status:pass", async () => {
      const gateDir = path.join(tmpDir, ".framework");
      fs.mkdirSync(gateDir, { recursive: true });
      fs.writeFileSync(path.join(gateDir, "gate-a.json"), JSON.stringify({ status: "pass" }), "utf-8");

      const result = await adapter.checkGate("gate-a", tmpDir);
      expect(result.passed).toBe(true);
    });

    // ── getContextPack ────────────────────────────────────────────────
    it("getContextPack returns ContextPack with required fields", async () => {
      const pack = await adapter.getContextPack(tmpDir);
      expect(pack.providerId).toBe(adapter.providerId);
      expect(typeof pack.sessionId).toBe("string");
      expect(pack.workingDirectory).toBe(tmpDir);
      expect(Array.isArray(pack.relevantFiles)).toBe(true);
      expect(["nano", "standard", "full"]).toContain(pack.tier);
      expect(Array.isArray(pack.protectedCategories)).toBe(true);
    });

    // ── reportAIChangeRecord ──────────────────────────────────────────
    it("reportAIChangeRecord does not throw", async () => {
      const record: AIChangeRecord = {
        sessionId: "test-session",
        providerId: adapter.providerId,
        taskId: "TASK-001",
        timestamp: new Date().toISOString(),
        changes: [],
        tierDeclared: "standard",
        tierEffective: "standard",
        protectedCategoriesTriggered: [],
        gateOutcome: "pass",
      };
      await expect(adapter.reportAIChangeRecord(record)).resolves.not.toThrow();
    });
  });
}

// ─────────────────────────────────────────────
// Run suite for ClaudeCodeAdapter
// ─────────────────────────────────────────────

runConformanceSuite("ClaudeCodeAdapter", () => new ClaudeCodeAdapter());

// ─────────────────────────────────────────────
// Additional ClaudeCodeAdapter-specific tests
// ─────────────────────────────────────────────

describe("ClaudeCodeAdapter specific", () => {
  it("providerId is claude-code", () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.providerId).toBe("claude-code");
  });

  it("dry-run executeTask contains dry-run in output", async () => {
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.executeTask({ taskId: "DRY-001", dryRun: true });
    expect(result.output).toContain("dry-run");
  });

  it("non-dry-run executeTask dispatches task", async () => {
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.executeTask({ taskId: "LIVE-001", dryRun: false });
    expect(result.ok).toBe(true);
  });
});
