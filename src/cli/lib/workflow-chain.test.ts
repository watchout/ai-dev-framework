import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  WORKFLOW_CHAIN_TRANSITIONS,
  createWorkflowChainCheckReport,
  createWorkflowChainReport,
  formatWorkflowChainActionList,
  formatWorkflowChainCheck,
  formatWorkflowChainStatus,
  resolveWorkflowChainAction,
} from "./workflow-chain.js";
import type {
  WorkflowGateDecision,
  WorkflowGateDecisionValue,
  WorkflowProfile,
  WorkflowState,
} from "./workflow-state.js";

let tmpDir: string;

describe("workflow-chain", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-chain-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps the target workflow chain ordered and versioned", () => {
    const ids = WORKFLOW_CHAIN_TRANSITIONS.map((transition) => transition.id);
    const orders = WORKFLOW_CHAIN_TRANSITIONS.map((transition) => transition.order);

    expect(WORKFLOW_CHAIN_TRANSITIONS).toHaveLength(19);
    expect(new Set(ids).size).toBe(ids.length);
    expect(orders).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
    expect(ids).toEqual([
      "intake_hearing",
      "goal_contract_approval",
      "sufficient_conditions",
      "phase_plan",
      "carryover_ledger",
      "feature_catalog",
      "task_issue",
      "doc4l_readiness",
      "pre_impl_audit",
      "implementation_start",
      "implementation_evidence",
      "implementation_audit",
      "pr_publish",
      "merge_authority",
      "merge",
      "postmerge_verify",
      "goal_progress_update",
      "phase_closure_audit",
      "carryover_assignment",
    ]);
  });

  it("resolves exact transition ids and unique workflow action aliases", () => {
    expect(resolveWorkflowChainAction("phase_closure_audit")?.id).toBe(
      "phase_closure_audit",
    );
    expect(resolveWorkflowChainAction("implementation_start")?.id).toBe(
      "implementation_start",
    );
    expect(resolveWorkflowChainAction("remote_publish")?.id).toBe("pr_publish");
    expect(resolveWorkflowChainAction("merge")?.id).toBe("merge");
    expect(resolveWorkflowChainAction("unknown_transition")).toBeNull();
    expect(formatWorkflowChainActionList()).toContain("phase_closure_audit");
    expect(formatWorkflowChainActionList()).toContain("remote_publish");
  });

  it("creates a complete chain when required rules and artifacts are present", () => {
    writeChainArtifacts(
      "goal-sufficient-conditions.json",
      "carryover-ledger.json",
      "feature-catalog.json",
      "implementation-evidence.json",
      "implementation-audit.json",
      "postmerge-001.json",
      "goal-progress.json",
      "carryover-assignment.json",
    );

    const report = createWorkflowChainReport(
      tmpDir,
      workflowState({
        gate_decisions: requiredRuleDecisions("strict", "PASS"),
      }),
    );

    expect(report.schema_version).toBe("workflow-chain/v1");
    expect(report.status).toBe("complete");
    expect(report.current_transition).toBeNull();
    expect(report.allowed_next_actions).toEqual([]);
    expect(report.blocked_actions).toEqual([]);
    expect(report.decision_counts.PASS).toBeGreaterThan(0);
    expect(report.transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "implementation_evidence",
          status: "PASS",
          decisions: expect.arrayContaining([
            expect.objectContaining({
              rule_id: "G22.workflow_chain.implementation_evidence.present",
              source: "chain_artifact",
              decision: "PASS",
              evidence_refs: [
                expect.stringMatching(
                  /^chain:\.framework\/implementation-evidence\.json:[a-f0-9]{12}$/,
                ),
              ],
            }),
          ]),
        }),
      ]),
    );

    expect(formatWorkflowChainStatus(report)).toContain("Status: complete");
  });

  it("warns for missing artifact requirements in standard profile", () => {
    const report = createWorkflowChainReport(
      tmpDir,
      workflowState({
        profile: "standard",
        gate_decisions: requiredRuleDecisions("standard", "PASS"),
      }),
    );

    expect(report.status).toBe("attention_required");
    expect(report.current_transition).toEqual(
      expect.objectContaining({
        transition_id: "sufficient_conditions",
        workflow_action: null,
        reason: expect.stringContaining("next incomplete transition"),
      }),
    );
    expect(report.allowed_next_actions).toEqual([
      expect.objectContaining({
        transition_id: "sufficient_conditions",
        reason: "requires WARN",
      }),
    ]);
    expect(report.blocked_actions).toEqual([]);
    expect(report.decision_counts.WARN).toBeGreaterThan(0);
  });

  it("blocks missing rules and artifacts in strict profile", () => {
    const report = createWorkflowChainReport(
      tmpDir,
      workflowState({ profile: "strict", gate_decisions: [] }),
    );

    expect(report.status).toBe("blocked");
    expect(report.current_transition).toEqual(
      expect.objectContaining({
        transition_id: "intake_hearing",
        workflow_action: "design_draft",
      }),
    );
    expect(report.allowed_next_actions).toEqual([]);
    expect(report.blocked_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transition_id: "intake_hearing",
          reason: "blocked at intake / hearing",
        }),
        expect.objectContaining({
          transition_id: "implementation_start",
          reason: "blocked at implementation start",
        }),
      ]),
    );
    expect(report.transitions[0].decisions[0]).toEqual(
      expect.objectContaining({
        rule_id: "G22.workflow_chain.required_rule.intake_hearing",
        source: "chain_model",
        decision: "BLOCK",
        severity: "error",
        message: expect.stringContaining("G2.hearing.required_confirmation"),
      }),
    );
  });

  it("scopes chain checks to the requested transition and fail threshold", () => {
    const report = createWorkflowChainReport(
      tmpDir,
      workflowState({
        profile: "standard",
        gate_decisions: requiredRuleDecisions("standard", "PASS"),
      }),
    );

    const blockOnly = createWorkflowChainCheckReport(
      report,
      "implementation_start",
      "block",
    );
    expect(blockOnly.check.status).toBe("passed");
    expect(blockOnly.check.target_transition).toBe("implementation_start");
    expect(blockOnly.check.evaluated_transitions).toContain("carryover_ledger");
    expect(blockOnly.check.evaluated_transitions).not.toContain(
      "implementation_evidence",
    );
    expect(blockOnly.check.scoped_decision_counts.WARN).toBeGreaterThan(0);

    const failOnWarn = createWorkflowChainCheckReport(
      report,
      "implementation_start",
      "warn",
    );
    expect(failOnWarn.check.status).toBe("failed");
    expect(formatWorkflowChainCheck(failOnWarn)).toContain(
      "Shirube Workflow Chain Check: failed",
    );
    expect(formatWorkflowChainCheck(blockOnly)).toBe(
      "Shirube Workflow Chain Check: passed (implementation_start)",
    );
  });

  it("fails observe-threshold checks when only observe decisions remain", () => {
    writeChainArtifacts(
      "goal-sufficient-conditions.json",
      "carryover-ledger.json",
      "feature-catalog.json",
      "implementation-evidence.json",
      "implementation-audit.json",
      "postmerge-001.json",
      "goal-progress.json",
      "carryover-assignment.json",
    );
    const decisions = requiredRuleDecisions("standard", "PASS");
    decisions.push(
      gateDecision({
        rule_id: "G10.phase_plan.present",
        decision: "OBSERVE",
        profile: "standard",
      }),
    );

    const check = createWorkflowChainCheckReport(
      createWorkflowChainReport(tmpDir, workflowState({ gate_decisions: decisions })),
      "phase_plan",
      "observe",
    );

    expect(check.check.status).toBe("failed");
    expect(check.check.scoped_decision_counts.OBSERVE).toBe(1);
    expect(check.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.phase_plan.present",
          decision: "OBSERVE",
        }),
      ]),
    );
  });

  it("reports invalid, ambiguous, and missing chain actions deterministically", () => {
    expect(resolveWorkflowChainAction(undefined)).toBeNull();
    expect(resolveWorkflowChainAction("merge")?.id).toBe("merge");

    const report = createWorkflowChainReport(tmpDir, workflowState());
    expect(() => createWorkflowChainCheckReport(report, "", "block")).toThrow(
      "Invalid or missing workflow chain action",
    );
    expect(() =>
      createWorkflowChainCheckReport(report, "unknown_transition", "block"),
    ).toThrow("Invalid or missing workflow chain action");
  });
});

function workflowState(
  overrides: Partial<WorkflowState> = {},
): WorkflowState {
  const profile = overrides.profile ?? "standard";
  return {
    schema_version: "workflow-state/v1",
    project: {
      id: "workflow-chain-test",
      root: tmpDir,
      repo: null,
    },
    profile,
    phase: "hearing_complete",
    source: {
      kind: "local",
      uri: null,
    },
    roles: {
      status: "ready",
      config_ref: null,
      findings: [],
    },
    evidence: [],
    gate_decisions: requiredRuleDecisions(profile, "PASS"),
    allowed_actions: [],
    blocked_actions: [],
    exceptions: [],
    timestamps: {
      created_at: "2026-06-12T00:00:00.000Z",
      updated_at: "2026-06-12T00:00:00.000Z",
    },
    ...overrides,
  };
}

function requiredRuleDecisions(
  profile: WorkflowProfile,
  decisionValue: WorkflowGateDecisionValue,
): WorkflowGateDecision[] {
  const ruleIds = new Set(
    WORKFLOW_CHAIN_TRANSITIONS.flatMap((transition) =>
      [...transition.required_rule_ids],
    ),
  );
  return [...ruleIds].map((rule_id) =>
    gateDecision({ rule_id, decision: decisionValue, profile }),
  );
}

function gateDecision(input: {
  rule_id: string;
  decision: WorkflowGateDecisionValue;
  profile: WorkflowProfile;
}): WorkflowGateDecision {
  return {
    rule_id: input.rule_id,
    gate: "workflow-chain-test",
    decision: input.decision,
    severity: input.decision === "BLOCK" ? "error" : input.decision === "PASS" ? "info" : "warning",
    profile: input.profile,
    message: `${input.rule_id} ${input.decision}`,
    evidence_refs: input.decision === "PASS" ? [`evidence:${input.rule_id}`] : [],
    remediation: input.decision === "PASS" ? "No action required." : "Provide evidence.",
    deterministic: true,
  };
}

function writeChainArtifacts(...names: string[]): void {
  fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
  for (const name of names) {
    fs.writeFileSync(
      path.join(tmpDir, ".framework", name),
      JSON.stringify({ artifact: name, status: "present" }),
      "utf-8",
    );
  }
}
