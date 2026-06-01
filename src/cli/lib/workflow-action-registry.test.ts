import { describe, expect, it } from "vitest";
import {
  WORKFLOW_ACTION_REGISTRY,
  WORKFLOW_WRAPPER_REGISTRY,
  formatWorkflowActionRegistryList,
  getWorkflowActionRuleIds,
  parseWorkflowCheckAction,
} from "./workflow-action-registry.js";

describe("workflow-action-registry", () => {
  it("keeps action names and rule ids unique in the canonical registry", () => {
    const actions = WORKFLOW_ACTION_REGISTRY.map((entry) => entry.action);

    expect(new Set(actions).size).toBe(actions.length);
    for (const entry of WORKFLOW_ACTION_REGISTRY) {
      expect(entry.rule_ids.length).toBeGreaterThan(0);
      expect(new Set(entry.rule_ids).size).toBe(entry.rule_ids.length);
    }
  });

  it("parses workflow actions only from the registry", () => {
    for (const entry of WORKFLOW_ACTION_REGISTRY) {
      expect(parseWorkflowCheckAction(entry.action)).toBe(entry.action);
      expect(getWorkflowActionRuleIds(entry.action)).toEqual(entry.rule_ids);
    }

    expect(parseWorkflowCheckAction(undefined)).toBeNull();
    expect(parseWorkflowCheckAction("not_a_workflow_action")).toBeNull();
    expect(formatWorkflowActionRegistryList()).toBe(
      WORKFLOW_ACTION_REGISTRY.map((entry) => entry.action).join("|"),
    );
  });

  it("separates diagnostic wrappers from enforcement wrappers", () => {
    const doctor = WORKFLOW_WRAPPER_REGISTRY.find(
      (entry) => entry.command === "workflow doctor",
    );
    const check = WORKFLOW_WRAPPER_REGISTRY.find(
      (entry) => entry.command === "workflow check",
    );

    expect(doctor).toEqual(
      expect.objectContaining({
        kind: "diagnostic",
        exits_non_zero_on: [],
      }),
    );
    expect(doctor?.must_not_be_used_for).toContain("enforcement");
    expect(check).toEqual(
      expect.objectContaining({
        kind: "enforcement",
        exits_non_zero_on: expect.arrayContaining(["scoped BLOCK"]),
      }),
    );
  });
});
