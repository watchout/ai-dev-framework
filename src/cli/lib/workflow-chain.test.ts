import { describe, expect, it } from "vitest";
import {
  WORKFLOW_CHAIN_TRANSITIONS,
  formatWorkflowChainActionList,
  resolveWorkflowChainAction,
} from "./workflow-chain.js";

describe("workflow-chain", () => {
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
});
