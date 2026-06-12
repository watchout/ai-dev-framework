import { describe, expect, it } from "vitest";
import {
  WORKFLOW_ACTION_REGISTRY,
  getWorkflowActionRuleIds,
} from "./workflow-action-registry.js";
import {
  createWorkflowCheckReport,
  createWorkflowDoctorReport,
  explainWorkflowQuery,
  formatWorkflowDoctor,
  formatWorkflowExplanation,
  formatWorkflowStatus,
  type WorkflowCheckAction,
  type WorkflowCheckFailOn,
} from "./workflow-observability.js";
import {
  WORKFLOW_STATE_SCHEMA_VERSION,
  type WorkflowAction,
  type WorkflowEvidenceRecord,
  type WorkflowGateDecision,
  type WorkflowGateDecisionValue,
  type WorkflowState,
} from "./workflow-state.js";

const NOW = "2026-02-03T00:00:00.000Z";

function state(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    schema_version: WORKFLOW_STATE_SCHEMA_VERSION,
    project: {
      id: "test-project",
      root: "/tmp/test-project",
      repo: "watchout/test-project",
    },
    profile: "standard",
    phase: "started",
    source: { kind: "local", uri: null },
    roles: { status: "ready", config_ref: ".framework/config.json", findings: [] },
    evidence: [],
    gate_decisions: [],
    allowed_actions: [],
    blocked_actions: [],
    exceptions: [],
    timestamps: { created_at: NOW, updated_at: NOW },
    ...overrides,
  };
}

function decision(
  ruleId: string,
  decisionValue: WorkflowGateDecisionValue,
  overrides: Partial<WorkflowGateDecision> = {},
): WorkflowGateDecision {
  return {
    rule_id: ruleId,
    gate: ruleId.split(".")[0],
    decision: decisionValue,
    severity: decisionValue === "BLOCK" ? "error" : decisionValue === "WARN" ? "warning" : "info",
    profile: "standard",
    message: `${ruleId} ${decisionValue}`,
    evidence_refs: [],
    remediation: decisionValue === "PASS" ? "" : `Fix ${ruleId}`,
    deterministic: true,
    ...overrides,
  };
}

function action(actionName: string, ruleId: string): WorkflowAction {
  return {
    action: actionName,
    rule_id: ruleId,
    reason: `${actionName} allowed by ${ruleId}`,
  };
}

function evidence(id: string): WorkflowEvidenceRecord {
  return {
    id,
    kind: "validator_result",
    source_uri: null,
    artifact_path: ".framework/evidence.json",
    artifact_hash: null,
    actor: { type: "system", id: "workflow" },
    summary: `${id} summary`,
    observed_at: NOW,
    validity: "current",
    privacy_scope: "repo",
    metadata: {},
  };
}

describe("createWorkflowDoctorReport", () => {
  it("reports ready when all gate decisions pass", () => {
    const report = createWorkflowDoctorReport(
      state({
        gate_decisions: [
          decision("G1.roles.required_bindings", "PASS"),
          decision("G2.hearing.required_confirmation", "PASS"),
        ],
        evidence: [evidence("ev-1")],
        allowed_actions: [action("design_draft", "G2.hearing.required_confirmation")],
      }),
    );

    expect(report.status).toBe("ready");
    expect(report.decision_counts).toEqual({ PASS: 2, WARN: 0, BLOCK: 0, OBSERVE: 0 });
    expect(report.evidence_count).toBe(1);
    expect(report.remediation).toEqual([]);
  });

  it("reports attention_required for warn and observe decisions", () => {
    const report = createWorkflowDoctorReport(
      state({
        gate_decisions: [
          decision("G1.roles.required_bindings", "PASS"),
          decision("G18.admin_notice.sink_ready", "WARN"),
          decision("G18.admin_notice.lifecycle_record", "OBSERVE", {
            remediation: "Review lifecycle output",
          }),
        ],
      }),
    );

    expect(report.status).toBe("attention_required");
    expect(report.warning_decisions.map((item) => item.rule_id)).toEqual([
      "G18.admin_notice.sink_ready",
    ]);
    expect(report.observed_decisions.map((item) => item.rule_id)).toEqual([
      "G18.admin_notice.lifecycle_record",
    ]);
    expect(report.remediation).toEqual([
      "Fix G18.admin_notice.sink_ready",
    ]);
  });

  it("reports blocked when any decision blocks", () => {
    const report = createWorkflowDoctorReport(
      state({
        gate_decisions: [
          decision("G1.roles.required_bindings", "PASS"),
          decision("G4.publish.remote", "BLOCK"),
          decision("G18.admin_notice.sink_ready", "WARN"),
        ],
        blocked_actions: [action("remote_publish", "G4.publish.remote")],
      }),
    );

    expect(report.status).toBe("blocked");
    expect(report.decision_counts).toEqual({ PASS: 1, WARN: 1, BLOCK: 1, OBSERVE: 0 });
    expect(report.blocking_decisions.map((item) => item.rule_id)).toEqual([
      "G4.publish.remote",
    ]);
    expect(report.blocked_actions).toHaveLength(1);
  });

  it("handles all-block decision sets", () => {
    const report = createWorkflowDoctorReport(
      state({
        gate_decisions: [
          decision("G10.goal_contract.approved", "BLOCK"),
          decision("G10.phase_plan.present", "BLOCK"),
        ],
      }),
    );

    expect(report.status).toBe("blocked");
    expect(report.decision_counts.BLOCK).toBe(2);
    expect(report.blocking_decisions).toHaveLength(2);
    expect(report.warning_decisions).toEqual([]);
    expect(report.observed_decisions).toEqual([]);
  });

  it("handles an empty decision set", () => {
    const report = createWorkflowDoctorReport(state());

    expect(report.status).toBe("ready");
    expect(report.decision_counts).toEqual({ PASS: 0, WARN: 0, BLOCK: 0, OBSERVE: 0 });
    expect(report.blocking_decisions).toEqual([]);
    expect(report.remediation).toEqual([]);
  });
});

describe("createWorkflowCheckReport", () => {
  it.each(WORKFLOW_ACTION_REGISTRY.map((entry) => entry.action))(
    "covers action-scoped rules for %s",
    (workflowAction) => {
      const actionRuleIds = getWorkflowActionRuleIds(workflowAction);
      const report = createWorkflowCheckReport(
        state({
          gate_decisions: [
            decision(actionRuleIds[0], "PASS"),
            decision("G999.unrelated.rule", "BLOCK"),
          ],
        }),
        workflowAction,
        "block",
      );

      expect(report.check.action).toBe(workflowAction);
      expect(report.check.applicable_rule_ids).toEqual([...actionRuleIds]);
      expect(report.scoped_decisions.map((item) => item.rule_id)).toEqual([
        actionRuleIds[0],
      ]);
      expect(report.check.status).toBe("passed");
    },
  );

  it("fails on scoped BLOCK decisions regardless of threshold", () => {
    const report = checkFor("remote_publish", "block", [
      decision("G4.publish.remote", "BLOCK"),
    ]);

    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(1);
  });

  it("passes scoped WARN decisions when fail_on is block", () => {
    const report = checkFor("remote_publish", "block", [
      decision("G4.publish.remote", "WARN"),
    ]);

    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.WARN).toBe(1);
  });

  it("fails scoped WARN decisions when fail_on is warn", () => {
    const report = checkFor("remote_publish", "warn", [
      decision("G4.publish.remote", "WARN"),
    ]);

    expect(report.check.status).toBe("failed");
  });

  it("passes scoped OBSERVE decisions when fail_on is warn", () => {
    const report = checkFor("remote_publish", "warn", [
      decision("G4.publish.remote", "OBSERVE"),
    ]);

    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.OBSERVE).toBe(1);
  });

  it("fails scoped OBSERVE decisions when fail_on is observe", () => {
    const report = checkFor("remote_publish", "observe", [
      decision("G4.publish.remote", "OBSERVE"),
    ]);

    expect(report.check.status).toBe("failed");
  });

  it("passes when no decisions match the action scope", () => {
    const report = createWorkflowCheckReport(
      state({
        gate_decisions: [
          decision("G4.publish.remote", "BLOCK"),
        ],
      }),
      "audit_ledger",
      "block",
    );

    expect(report.check.status).toBe("passed");
    expect(report.scoped_decisions).toEqual([]);
    expect(report.check.scoped_decision_counts).toEqual({
      PASS: 0,
      WARN: 0,
      BLOCK: 0,
      OBSERVE: 0,
    });
  });
});

describe("workflow explanation and formatting", () => {
  it("explains matching rule ids and includes referenced evidence", () => {
    const report = explainWorkflowQuery(
      state({
        evidence: [evidence("ev-match"), evidence("ev-other")],
        gate_decisions: [
          decision("G4.publish.remote", "BLOCK", {
            evidence_refs: ["ev-match"],
          }),
        ],
      }),
      "G4.publish.remote",
    );

    expect(report.found).toBe(true);
    expect(report.gate_decisions).toHaveLength(1);
    expect(report.evidence.map((item) => item.id)).toEqual(["ev-match"]);
  });

  it("explains matching gates and decision values", () => {
    const report = explainWorkflowQuery(
      state({
        gate_decisions: [
          decision("G4.publish.remote", "BLOCK", { gate: "publish" }),
          decision("G18.admin_notice.sink_ready", "WARN", { gate: "admin_notice" }),
        ],
      }),
      "BLOCK",
    );

    expect(report.found).toBe(true);
    expect(report.gate_decisions.map((item) => item.rule_id)).toEqual([
      "G4.publish.remote",
    ]);
  });

  it("explains allowed and blocked actions by action name", () => {
    const report = explainWorkflowQuery(
      state({
        allowed_actions: [action("design_draft", "G2.hearing.required_confirmation")],
        blocked_actions: [action("remote_publish", "G4.publish.remote")],
      }),
      "remote_publish",
    );

    expect(report.found).toBe(true);
    expect(report.allowed_actions).toEqual([]);
    expect(report.blocked_actions).toHaveLength(1);
  });

  it("returns a not-found explanation for unknown queries", () => {
    const explanation = explainWorkflowQuery(state(), "missing");

    expect(explanation.found).toBe(false);
    expect(formatWorkflowExplanation(explanation)).toBe(
      "No workflow explanation found for: missing",
    );
  });

  it("formats status with none for empty action lists", () => {
    const output = formatWorkflowStatus(state());

    expect(output).toContain("Allowed actions: none");
    expect(output).toContain("Blocked actions: none");
  });

  it("formats doctor reports with decision and remediation lists", () => {
    const output = formatWorkflowDoctor(
      createWorkflowDoctorReport(
        state({
          gate_decisions: [
            decision("G4.publish.remote", "BLOCK"),
            decision("G18.admin_notice.sink_ready", "WARN"),
          ],
        }),
      ),
    );

    expect(output).toContain("Status: blocked");
    expect(output).toContain("G4.publish.remote: BLOCK");
    expect(output).toContain("Fix G18.admin_notice.sink_ready");
  });

  it("formats successful explanations with empty sections", () => {
    const output = formatWorkflowExplanation(
      explainWorkflowQuery(
        state({
          allowed_actions: [action("design_draft", "G2.hearing.required_confirmation")],
        }),
        "design_draft",
      ),
    );

    expect(output).toContain("Workflow Explanation: design_draft");
    expect(output).toContain("Gate decisions:");
    expect(output).toContain("  none");
    expect(output).toContain("design_draft");
  });
});

function checkFor(
  actionName: WorkflowCheckAction,
  failOn: WorkflowCheckFailOn,
  decisions: WorkflowGateDecision[],
) {
  return createWorkflowCheckReport(
    state({ gate_decisions: decisions }),
    actionName,
    failOn,
  );
}
