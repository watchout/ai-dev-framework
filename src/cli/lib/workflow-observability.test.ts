/**
 * Tests for workflow-observability.ts (#335 — zero coverage)
 */
import { describe, it, expect } from "vitest";
import type { WorkflowState, WorkflowGateDecision } from "./workflow-state.js";
import {
  createWorkflowDoctorReport,
  createWorkflowCheckReport,
  explainWorkflowQuery,
  formatWorkflowStatus,
  formatWorkflowDoctor,
  formatWorkflowExplanation,
} from "./workflow-observability.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeDecision(
  id: string,
  decision: WorkflowGateDecision["decision"],
  remediation = "fix it",
): WorkflowGateDecision {
  return {
    rule_id: id,
    gate: "test-gate",
    decision,
    severity: decision === "BLOCK" ? "error" : decision === "WARN" ? "warning" : "info",
    profile: "standard",
    message: `Test: ${id}`,
    evidence_refs: [],
    remediation,
    deterministic: true,
  };
}

function makeAction(action: string): WorkflowState["allowed_actions"][number] {
  return { action, reason: "test", rule_id: `rule-${action}` };
}

function makeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    schema_version: "1.0",
    source: "local",
    profile: "standard",
    phase: null,
    roles: { status: "ok", missing: [], placeholder: [], separationViolations: [] },
    gate_decisions: [],
    allowed_actions: [makeAction("design_draft"), makeAction("implementation_start")],
    blocked_actions: [],
    evidence: [],
    ...overrides,
  } as WorkflowState;
}

// ─── createWorkflowDoctorReport ──────────────────────────────────────────────

describe("createWorkflowDoctorReport", () => {
  it("returns ready status when no blocking decisions", () => {
    const report = createWorkflowDoctorReport(makeState());
    expect(report.status).toBe("ready");
  });

  it("returns blocked when there is a BLOCK decision", () => {
    const state = makeState({ gate_decisions: [makeDecision("r1", "BLOCK")] });
    const report = createWorkflowDoctorReport(state);
    expect(report.status).toBe("blocked");
    expect(report.blocking_decisions).toHaveLength(1);
  });

  it("returns attention_required when only WARN decisions", () => {
    const state = makeState({ gate_decisions: [makeDecision("r2", "WARN")] });
    const report = createWorkflowDoctorReport(state);
    expect(report.status).toBe("attention_required");
    expect(report.warning_decisions).toHaveLength(1);
  });

  it("counts decision types correctly", () => {
    const state = makeState({
      gate_decisions: [
        makeDecision("r1", "PASS"),
        makeDecision("r2", "BLOCK"),
        makeDecision("r3", "WARN"),
        makeDecision("r4", "OBSERVE"),
      ],
    });
    const report = createWorkflowDoctorReport(state);
    expect(report.decision_counts.PASS).toBe(1);
    expect(report.decision_counts.BLOCK).toBe(1);
    expect(report.decision_counts.WARN).toBe(1);
    expect(report.decision_counts.OBSERVE).toBe(1);
  });

  it("collects unique remediation strings", () => {
    const state = makeState({
      gate_decisions: [
        makeDecision("r1", "BLOCK", "do A"),
        makeDecision("r2", "BLOCK", "do A"),
        makeDecision("r3", "WARN", "do B"),
      ],
    });
    const report = createWorkflowDoctorReport(state);
    expect(report.remediation).toContain("do A");
    expect(report.remediation).toContain("do B");
    expect(report.remediation.filter((r) => r === "do A")).toHaveLength(1);
  });

  it("reflects evidence count from state", () => {
    const state = makeState({ evidence: [{ id: "ev1" } as never] });
    expect(createWorkflowDoctorReport(state).evidence_count).toBe(1);
  });
});

// ─── createWorkflowCheckReport ───────────────────────────────────────────────

describe("createWorkflowCheckReport", () => {
  it("passes when no applicable blocking decisions", () => {
    const state = makeState();
    const report = createWorkflowCheckReport(state, "merge", "block");
    expect(report.check.status).toBe("passed");
  });

  it("fails when a BLOCK decision matches an applicable rule_id for the action", () => {
    const state = makeState({
      gate_decisions: [makeDecision("G9.merge_authority.evidence", "BLOCK")],
    });
    const report = createWorkflowCheckReport(state, "merge", "block");
    expect(report.check.status).toBe("failed");
  });

  it("records action and fail_on in check", () => {
    const state = makeState();
    const report = createWorkflowCheckReport(state, "release", "warn");
    expect(report.check.action).toBe("release");
    expect(report.check.fail_on).toBe("warn");
  });
});

// ─── explainWorkflowQuery ─────────────────────────────────────────────────────

describe("explainWorkflowQuery", () => {
  it("returns found:true when query matches a decision rule_id", () => {
    const state = makeState({ gate_decisions: [makeDecision("hearing.check", "PASS")] });
    const result = explainWorkflowQuery(state, "hearing");
    expect(result.found).toBe(true);
    expect(result.gate_decisions.length).toBeGreaterThan(0);
  });

  it("returns found:false for unmatched query", () => {
    const state = makeState();
    const result = explainWorkflowQuery(state, "nonexistent-gate-xyz");
    expect(result.found).toBe(false);
  });

  it("includes allowed actions scoped to query", () => {
    const state = makeState({
      allowed_actions: [makeAction("design_draft")],
      blocked_actions: [makeAction("merge")],
    });
    const result = explainWorkflowQuery(state, "design_draft");
    expect(result.allowed_actions.map((a) => a.action)).toContain("design_draft");
  });
});

// ─── formatWorkflowStatus ────────────────────────────────────────────────────

describe("formatWorkflowStatus", () => {
  it("returns a non-empty string", () => {
    expect(formatWorkflowStatus(makeState()).length).toBeGreaterThan(0);
  });

  it("includes profile in output", () => {
    const out = formatWorkflowStatus(makeState({ profile: "strict" }));
    expect(out).toContain("strict");
  });
});

// ─── formatWorkflowDoctor ────────────────────────────────────────────────────

describe("formatWorkflowDoctor", () => {
  it("returns a non-empty string for ready report", () => {
    const report = createWorkflowDoctorReport(makeState());
    expect(formatWorkflowDoctor(report).length).toBeGreaterThan(0);
  });

  it("includes BLOCK info when blocked", () => {
    const state = makeState({ gate_decisions: [makeDecision("r1", "BLOCK", "fix blocker")] });
    const report = createWorkflowDoctorReport(state);
    const out = formatWorkflowDoctor(report);
    expect(out).toMatch(/block|BLOCK|fix blocker/i);
  });
});

// ─── formatWorkflowExplanation ───────────────────────────────────────────────

describe("formatWorkflowExplanation", () => {
  it("returns a non-empty string", () => {
    const state = makeState();
    const explanation = explainWorkflowQuery(state, "hearing");
    expect(formatWorkflowExplanation(explanation).length).toBeGreaterThan(0);
  });
});
