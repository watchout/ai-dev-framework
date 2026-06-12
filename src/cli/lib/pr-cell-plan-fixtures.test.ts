import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPrCellLanePlan,
  buildPrCellTemplateBundle,
  validatePrCellPlan,
  type PrCellPlan,
  type PrCellRuntimeState,
} from "./pr-cell-plan.js";

const FIXTURE_DIR = path.join("templates", "work-orders", "pr-cell-plans");
const REQUIRED_PLAN_FIXTURES = [
  "dependency-blocked-stack.pr-cell-plan.json",
  "emergency-hotfix.pr-cell-plan.json",
  "large-batch.pr-cell-plan.json",
  "saas-ui-batch.pr-cell-plan.json",
];

function readPlan(name: string): PrCellPlan {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf-8")) as PrCellPlan;
}

function readRuntime(name: string): PrCellRuntimeState[] {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf-8")) as PrCellRuntimeState[];
}

describe("PR Cell Plan rollout fixtures", () => {
  it("ships the required C5 fixture set", () => {
    const planFixtures = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith(".pr-cell-plan.json"))
      .sort();

    expect(planFixtures).toEqual(REQUIRED_PLAN_FIXTURES);
    expect(readdirSync(FIXTURE_DIR)).toContain("dependency-blocked-stack.runtime.json");
  });

  it.each(REQUIRED_PLAN_FIXTURES)("validates %s and renders templates", (fixtureName) => {
    const plan = readPlan(fixtureName);
    const validation = validatePrCellPlan(plan);
    const firstImplementationCell = plan.cells.find((cell) => cell.owner_role === "implementation");

    expect(validation.valid).toBe(true);
    expect(firstImplementationCell).toBeDefined();

    const lanePlan = buildPrCellLanePlan(plan);
    expect(lanePlan.schema).toBe("shirube-pr-cell-lane-plan/v1");
    expect([
      ...lanePlan.eligible_implementation_cells,
      ...lanePlan.held_cells,
      ...lanePlan.visible_ops_cells,
    ].length).toBeGreaterThan(0);

    const bundle = buildPrCellTemplateBundle(plan, {
      cellId: firstImplementationCell?.id ?? "",
      pr: 999,
      head: "fixture-head",
      base: "main",
    });
    expect(bundle.validation.valid).toBe(true);
    expect(bundle.templates.map((template) => template.kind)).toEqual([
      "implementation_prompt",
      "audit_request",
      "implementation_handoff",
    ]);
    expect(bundle.templates.map((template) => template.body).join("\n")).toContain("<!-- conveyor:audit-result/v1 -->");
  });

  it("demonstrates blocked dependency holds with the stack runtime fixture", () => {
    const plan = readPlan("dependency-blocked-stack.pr-cell-plan.json");
    const runtime = readRuntime("dependency-blocked-stack.runtime.json");
    const lanePlan = buildPrCellLanePlan(plan, runtime);

    expect(lanePlan.eligible_implementation_cells.map((cell) => cell.cell_id)).toEqual(["FOUNDATION"]);
    expect(lanePlan.held_cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cell_id: "STACK_A",
          reason_codes: ["dependency_blocked:FOUNDATION"],
        }),
        expect.objectContaining({
          cell_id: "STACK_B",
          reason_codes: ["dependency_not_ready:STACK_A"],
        }),
      ]),
    );
  });
});
