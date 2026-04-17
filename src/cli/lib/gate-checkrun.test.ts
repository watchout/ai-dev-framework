import { describe, it, expect, afterEach } from "vitest";
import { loadGateStatusFromCheckRuns, GATE_WORKFLOW_NAMES } from "./gate-model.js";
import { setGhExecutor } from "./github-engine.js";

describe("loadGateStatusFromCheckRuns", () => {
  let restoreGh: () => void;

  afterEach(() => {
    if (restoreGh) restoreGh();
  });

  it("returns passed state when all gates succeed", async () => {
    restoreGh = setGhExecutor(async () => {
      const runs = Object.values(GATE_WORKFLOW_NAMES).map((name) =>
        JSON.stringify({ name, status: "completed", conclusion: "success" }),
      );
      return runs.join("\n");
    });

    const state = await loadGateStatusFromCheckRuns("abc123");
    expect(state).not.toBeNull();
    expect(state!.gateA.status).toBe("passed");
    expect(state!.gateB.status).toBe("passed");
    expect(state!.gateC.status).toBe("passed");
  });

  it("returns failed state when a gate fails", async () => {
    restoreGh = setGhExecutor(async () => {
      return [
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.A, status: "completed", conclusion: "success" }),
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.B, status: "completed", conclusion: "failure" }),
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.C, status: "completed", conclusion: "success" }),
      ].join("\n");
    });

    const state = await loadGateStatusFromCheckRuns("abc123");
    expect(state).not.toBeNull();
    expect(state!.gateA.status).toBe("passed");
    expect(state!.gateB.status).toBe("failed");
    expect(state!.gateC.status).toBe("passed");
  });

  it("returns pending when check run is in progress", async () => {
    restoreGh = setGhExecutor(async () => {
      return JSON.stringify({
        name: GATE_WORKFLOW_NAMES.A,
        status: "in_progress",
        conclusion: null,
      });
    });

    const state = await loadGateStatusFromCheckRuns("abc123");
    expect(state).not.toBeNull();
    expect(state!.gateA.status).toBe("pending");
    expect(state!.gateB.status).toBe("pending");
    expect(state!.gateC.status).toBe("pending");
  });

  it("returns pending for gates without check runs", async () => {
    restoreGh = setGhExecutor(async () => "");

    const state = await loadGateStatusFromCheckRuns("abc123");
    expect(state).not.toBeNull();
    expect(state!.gateA.status).toBe("pending");
    expect(state!.gateB.status).toBe("pending");
    expect(state!.gateC.status).toBe("pending");
  });

  it("returns null on gh CLI error", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: not authenticated");
    });

    const state = await loadGateStatusFromCheckRuns("abc123");
    expect(state).toBeNull();
  });
});
