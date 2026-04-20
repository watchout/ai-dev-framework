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

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).not.toBeNull();
    expect(result.state!.gateA.status).toBe("passed");
    expect(result.state!.gateB.status).toBe("passed");
    expect(result.state!.gateC.status).toBe("passed");
    expect(result.error).toBeUndefined();
  });

  it("returns failed state when a gate fails", async () => {
    restoreGh = setGhExecutor(async () => {
      return [
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.A, status: "completed", conclusion: "success" }),
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.B, status: "completed", conclusion: "failure" }),
        JSON.stringify({ name: GATE_WORKFLOW_NAMES.C, status: "completed", conclusion: "success" }),
      ].join("\n");
    });

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).not.toBeNull();
    expect(result.state!.gateA.status).toBe("passed");
    expect(result.state!.gateB.status).toBe("failed");
    expect(result.state!.gateC.status).toBe("passed");
  });

  it("maps cancelled/timed_out to failed (not pending)", async () => {
    restoreGh = setGhExecutor(async () => {
      return JSON.stringify({
        name: GATE_WORKFLOW_NAMES.A,
        status: "completed",
        conclusion: "cancelled",
      });
    });

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).not.toBeNull();
    expect(result.state!.gateA.status).toBe("failed");
  });

  it("returns pending when check run is in progress", async () => {
    restoreGh = setGhExecutor(async () => {
      return JSON.stringify({
        name: GATE_WORKFLOW_NAMES.A,
        status: "in_progress",
        conclusion: null,
      });
    });

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).not.toBeNull();
    expect(result.state!.gateA.status).toBe("pending");
  });

  it("returns no_check_runs error for empty results", async () => {
    restoreGh = setGhExecutor(async () => "");

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).toBeNull();
    expect(result.error).toBe("no_check_runs");
  });

  it("returns gh_error on gh CLI failure", async () => {
    restoreGh = setGhExecutor(async () => {
      throw new Error("gh: not authenticated");
    });

    const result = await loadGateStatusFromCheckRuns("abc123");
    expect(result.state).toBeNull();
    expect(result.error).toBe("gh_error");
    expect(result.errorMessage).toContain("not authenticated");
  });

  it("maps timed_out to failed", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify({ name: GATE_WORKFLOW_NAMES.A, status: "completed", conclusion: "timed_out" }),
    );
    const result = await loadGateStatusFromCheckRuns("x");
    expect(result.state!.gateA.status).toBe("failed");
  });

  it("maps startup_failure to failed", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify({ name: GATE_WORKFLOW_NAMES.B, status: "completed", conclusion: "startup_failure" }),
    );
    const result = await loadGateStatusFromCheckRuns("x");
    expect(result.state!.gateB.status).toBe("failed");
  });

  it("maps action_required to failed", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify({ name: GATE_WORKFLOW_NAMES.C, status: "completed", conclusion: "action_required" }),
    );
    const result = await loadGateStatusFromCheckRuns("x");
    expect(result.state!.gateC.status).toBe("failed");
  });

  it("maps stale to failed", async () => {
    restoreGh = setGhExecutor(async () =>
      JSON.stringify({ name: GATE_WORKFLOW_NAMES.A, status: "completed", conclusion: "stale" }),
    );
    const result = await loadGateStatusFromCheckRuns("x");
    expect(result.state!.gateA.status).toBe("failed");
  });
});
