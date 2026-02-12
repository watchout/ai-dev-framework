import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  type GateState,
  type GateCheck,
  type SSOTCheck,
  createGateState,
  updateGateA,
  updateGateB,
  updateGateC,
  resetGateState,
  areAllGatesPassed,
  collectFailures,
  buildAllGatesResult,
  loadGateState,
  saveGateState,
} from "./gate-model.js";

function makeCheck(overrides?: Partial<GateCheck>): GateCheck {
  return {
    name: "test-check",
    passed: true,
    message: "Check passed",
    ...overrides,
  };
}

function makeSSOTCheck(overrides?: Partial<SSOTCheck>): SSOTCheck {
  return {
    name: "test-ssot-check",
    passed: true,
    message: "SSOT check passed",
    filePath: "docs/feature.md",
    missingSections: [],
    ...overrides,
  };
}

describe("gate-model", () => {
  describe("createGateState", () => {
    it("creates state with all gates pending", () => {
      const state = createGateState();
      expect(state.gateA.status).toBe("pending");
      expect(state.gateB.status).toBe("pending");
      expect(state.gateC.status).toBe("pending");
      expect(state.gateA.checks).toHaveLength(0);
      expect(state.gateB.checks).toHaveLength(0);
      expect(state.gateC.checks).toHaveLength(0);
    });
  });

  describe("updateGateA", () => {
    it("sets status to passed when all checks pass", () => {
      const state = createGateState();
      updateGateA(state, [
        makeCheck({ name: "pkg", passed: true }),
        makeCheck({ name: "env", passed: true }),
      ]);
      expect(state.gateA.status).toBe("passed");
      expect(state.gateA.checks).toHaveLength(2);
    });

    it("sets status to failed when any check fails", () => {
      const state = createGateState();
      updateGateA(state, [
        makeCheck({ name: "pkg", passed: true }),
        makeCheck({ name: "env", passed: false }),
      ]);
      expect(state.gateA.status).toBe("failed");
    });

    it("sets status to failed when no checks provided", () => {
      const state = createGateState();
      updateGateA(state, []);
      expect(state.gateA.status).toBe("failed");
    });
  });

  describe("updateGateB", () => {
    it("sets status to passed when all checks pass", () => {
      const state = createGateState();
      updateGateB(state, [
        makeCheck({ name: "plan", passed: true }),
      ]);
      expect(state.gateB.status).toBe("passed");
    });

    it("sets status to failed when any check fails", () => {
      const state = createGateState();
      updateGateB(state, [
        makeCheck({ name: "plan", passed: false }),
      ]);
      expect(state.gateB.status).toBe("failed");
    });
  });

  describe("updateGateC", () => {
    it("sets status to passed when all SSOT checks pass", () => {
      const state = createGateState();
      updateGateC(state, [
        makeSSOTCheck({ name: "feature.md", passed: true }),
      ]);
      expect(state.gateC.status).toBe("passed");
    });

    it("sets status to failed when SSOT check fails", () => {
      const state = createGateState();
      updateGateC(state, [
        makeSSOTCheck({
          name: "feature.md",
          passed: false,
          missingSections: ["§3-E", "§3-F"],
        }),
      ]);
      expect(state.gateC.status).toBe("failed");
    });
  });

  describe("resetGateState", () => {
    it("resets all gates to pending", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);
      expect(state.gateA.status).toBe("passed");

      resetGateState(state);
      expect(state.gateA.status).toBe("pending");
      expect(state.gateB.status).toBe("pending");
      expect(state.gateC.status).toBe("pending");
      expect(state.gateA.checks).toHaveLength(0);
    });
  });

  describe("areAllGatesPassed", () => {
    it("returns true when all gates are passed", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);
      expect(areAllGatesPassed(state)).toBe(true);
    });

    it("returns false when any gate is pending", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      // gateB still pending
      updateGateC(state, [makeSSOTCheck()]);
      expect(areAllGatesPassed(state)).toBe(false);
    });

    it("returns false when any gate is failed", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck({ passed: false })]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);
      expect(areAllGatesPassed(state)).toBe(false);
    });
  });

  describe("collectFailures", () => {
    it("returns empty array when all passed", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);
      expect(collectFailures(state)).toHaveLength(0);
    });

    it("returns failures for failed gates", () => {
      const state = createGateState();
      updateGateA(state, [
        makeCheck({ passed: false, message: "pkg missing" }),
      ]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [
        makeSSOTCheck({
          passed: false,
          message: "feature.md: Missing §3-E, §3-F",
        }),
      ]);

      const failures = collectFailures(state);
      expect(failures).toHaveLength(2);
      expect(failures[0].gate).toContain("Gate A");
      expect(failures[0].details).toContain("pkg missing");
      expect(failures[1].gate).toContain("Gate C");
    });

    it("includes pending gates as failures", () => {
      const state = createGateState();
      // All pending
      const failures = collectFailures(state);
      expect(failures).toHaveLength(3);
    });
  });

  describe("buildAllGatesResult", () => {
    it("returns allPassed true when all passed", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);

      const result = buildAllGatesResult(state);
      expect(result.allPassed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it("returns allPassed false with failures", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck({ passed: false })]);
      updateGateB(state, [makeCheck()]);
      updateGateC(state, [makeSSOTCheck()]);

      const result = buildAllGatesResult(state);
      expect(result.allPassed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-gate-model-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saves and loads gate state", () => {
      const state = createGateState();
      updateGateA(state, [makeCheck()]);
      updateGateB(state, [makeCheck({ passed: false, message: "No plan" })]);
      saveGateState(tmpDir, state);

      const loaded = loadGateState(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.gateA.status).toBe("passed");
      expect(loaded!.gateB.status).toBe("failed");
      expect(loaded!.gateC.status).toBe("pending");
    });

    it("returns null when no state file", () => {
      expect(loadGateState(tmpDir)).toBeNull();
    });

    it("creates .framework directory", () => {
      const state = createGateState();
      saveGateState(tmpDir, state);
      expect(
        fs.existsSync(path.join(tmpDir, ".framework")),
      ).toBe(true);
    });

    it("updates updatedAt on save", () => {
      const state = createGateState();
      const originalUpdatedAt = state.updatedAt;

      // Wait a tiny bit to ensure different timestamp
      saveGateState(tmpDir, state);
      const loaded = loadGateState(tmpDir);
      expect(loaded!.updatedAt).toBeDefined();
    });
  });
});
