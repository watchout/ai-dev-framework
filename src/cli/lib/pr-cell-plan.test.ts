import { describe, expect, it } from "vitest";
import {
  buildPrCellLanePlan,
  parsePrCellPlanFromText,
  validatePrCellPlan,
  type PrCell,
  type PrCellPlan,
} from "./pr-cell-plan.js";

const baseCell = (overrides: Partial<PrCell> = {}): PrCell => ({
  id: "A",
  title: "audit evidence parser",
  repo: "watchout/ai-dev-framework",
  issue: 304,
  kind: "implementation",
  expected_pr_count: 1,
  depends_on: [],
  parallel_group: "alpha",
  risk_route: "R2",
  audit_route: "l2",
  owner_role: "implementation",
  required_labels: ["state:impl-l1", "audit:l1-pending", "needs:l1-audit", "evidence-ready"],
  l2_required: true,
  forbidden: ["merge", "approve", "live_aun_dispatch", "production_db_mutation", "ceo_approval_bypass"],
  evidence_required: ["exact_head", "validation_commands", "non_goals", "dependency_notes"],
  stop_conditions: ["direct_dependency_blocked", "merge_required", "ceo_approval_required"],
  ...overrides,
});

const plan = (cells: PrCell[] = [baseCell()]): PrCellPlan => ({
  schema: "shirube-pr-cell-plan/v1",
  cell_plan_id: "pr-cell-plan-304",
  issue: { repo: "watchout/ai-dev-framework", number: 304 },
  objective: "Make PR cell plans first-class",
  continuation_policy: {
    continue_after: "pr_evidence_posted_and_state_impl_l1",
    stop_on: [
      "direct_dependency_blocked",
      "merge_required",
      "ceo_approval_required",
      "live_operation_required",
      "production_db_or_secret_mutation",
    ],
  },
  cells,
});

describe("PR Cell Plan", () => {
  it("parses a marked issue comment JSON cell plan", () => {
    const parsed = parsePrCellPlanFromText([
      "<!-- codex-goal-cell-plan/v1 -->",
      "```json",
      JSON.stringify(plan()),
      "```",
    ].join("\n"));

    expect(parsed?.cell_plan_id).toBe("pr-cell-plan-304");
    expect(validatePrCellPlan(parsed as PrCellPlan).valid).toBe(true);
  });

  it("rejects missing required schema fields", () => {
    const report = validatePrCellPlan({
      ...plan(),
      cell_plan_id: "",
      continuation_policy: undefined as unknown as PrCellPlan["continuation_policy"],
      cells: [baseCell({ id: "", depends_on: undefined as unknown as string[] })],
    });

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_cell_plan_id", "missing_continuation_policy", "missing_cell_id", "missing_dependency_information"]),
    );
  });

  it("fails closed when cells are missing or not an array", () => {
    const missingCells = { ...plan() } as unknown as PrCellPlan;
    delete (missingCells as { cells?: unknown }).cells;

    const missingReport = validatePrCellPlan(missingCells);
    const missingLanePlan = buildPrCellLanePlan(missingCells);

    expect(missingReport.valid).toBe(false);
    expect(missingReport.findings.map((finding) => finding.code)).toContain("missing_cells");
    expect(missingLanePlan).toEqual({
      schema: "shirube-pr-cell-lane-plan/v1",
      eligible_implementation_cells: [],
      held_cells: [],
      visible_ops_cells: [],
    });

    const nonArrayCells = { ...plan(), cells: "not-an-array" as unknown as PrCell[] };
    const nonArrayReport = validatePrCellPlan(nonArrayCells);
    const nonArrayLanePlan = buildPrCellLanePlan(nonArrayCells);

    expect(nonArrayReport.valid).toBe(false);
    expect(nonArrayReport.findings.map((finding) => finding.code)).toContain("missing_cells");
    expect(nonArrayLanePlan.eligible_implementation_cells).toEqual([]);
    expect(nonArrayLanePlan.held_cells).toEqual([]);
    expect(nonArrayLanePlan.visible_ops_cells).toEqual([]);
  });

  it("fails closed when cell entries are not objects", () => {
    const malformedCells = {
      ...plan(),
      cells: [null, "not-a-cell", []] as unknown as PrCell[],
    };

    const report = validatePrCellPlan(malformedCells);
    const lanePlan = buildPrCellLanePlan(malformedCells);

    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_cell_shape", path: "cells[0]" }),
        expect.objectContaining({ code: "invalid_cell_shape", path: "cells[1]" }),
        expect.objectContaining({ code: "invalid_cell_shape", path: "cells[2]" }),
      ]),
    );
    expect(lanePlan).toEqual({
      schema: "shirube-pr-cell-lane-plan/v1",
      eligible_implementation_cells: [],
      held_cells: [],
      visible_ops_cells: [],
    });
  });

  it("rejects implementation cells with forbidden-op or evidence gaps", () => {
    const report = validatePrCellPlan(plan([
      baseCell({
        forbidden: ["merge", "approve"],
        evidence_required: ["exact_head"],
      }),
    ]));

    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_forbidden_operation", "missing_evidence_requirement", "missing_ceo_bypass_guard"]),
    );
  });

  it("rejects R4 cells assigned as ordinary implementation work", () => {
    const report = validatePrCellPlan(plan([baseCell({ risk_route: "R4" })]));

    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "r4_not_implementation_assignable" })]),
    );
  });

  it("rejects invalid enum values and keeps invalid cells out of implementation lanes", () => {
    const cellPlan = {
      ...plan([
        baseCell({
          kind: "worker" as PrCell["kind"],
          risk_route: "R5" as PrCell["risk_route"],
          audit_route: "root" as PrCell["audit_route"],
          owner_role: "unknown" as PrCell["owner_role"],
        }),
      ]),
      continuation_policy: {
        ...plan().continuation_policy,
        continue_after: "run_now" as PrCellPlan["continuation_policy"]["continue_after"],
      },
    };

    const report = validatePrCellPlan(cellPlan);
    expect(report.valid).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "invalid_continue_after",
        "invalid_cell_kind",
        "invalid_risk_route",
        "invalid_audit_route",
        "invalid_owner_role",
      ]),
    );

    const lanePlan = buildPrCellLanePlan(cellPlan);
    expect(lanePlan.eligible_implementation_cells).toEqual([]);
    expect(lanePlan.held_cells).toEqual([
      expect.objectContaining({
        cell_id: "A",
        reason_codes: expect.arrayContaining([
          "invalid_cell_plan:invalid_continue_after",
          "invalid_cell_plan:invalid_cell_kind",
          "invalid_cell_plan:invalid_risk_route",
          "invalid_cell_plan:invalid_audit_route",
          "invalid_cell_plan:invalid_owner_role",
        ]),
      }),
    ]);
  });

  it("returns independent parallel implementation cells together", () => {
    const lanePlan = buildPrCellLanePlan(plan([
      baseCell({ id: "A", title: "schema", parallel_group: "alpha" }),
      baseCell({ id: "C", title: "docs", parallel_group: "alpha" }),
    ]));

    expect(lanePlan.eligible_implementation_cells.map((cell) => cell.cell_id)).toEqual(["A", "C"]);
    expect(lanePlan.held_cells).toEqual([]);
  });

  it("holds dependent cells until predecessor PR evidence reaches state impl-l1", () => {
    const cellPlan = plan([
      baseCell({ id: "A", title: "schema" }),
      baseCell({ id: "B", title: "dependency rules", depends_on: ["A"] }),
    ]);

    const held = buildPrCellLanePlan(cellPlan);
    expect(held.held_cells).toEqual([
      expect.objectContaining({ cell_id: "B", reason_codes: ["dependency_not_ready:A"] }),
    ]);

    const released = buildPrCellLanePlan(cellPlan, [
      {
        cell_id: "A",
        pr: {
          repo: "watchout/ai-dev-framework",
          number: 308,
          labels: ["state:impl-l1", "evidence-ready"],
        },
      },
    ]);
    expect(released.eligible_implementation_cells.map((cell) => cell.cell_id)).toEqual(["A", "B"]);
  });

  it("holds cells with blocked predecessors", () => {
    const lanePlan = buildPrCellLanePlan(plan([
      baseCell({ id: "A", title: "schema" }),
      baseCell({ id: "B", title: "dependency rules", depends_on: ["A"] }),
    ]), [{ cell_id: "A", blocked: true, block_reason: "audit blocked" }]);

    expect(lanePlan.held_cells).toEqual([
      expect.objectContaining({ cell_id: "B", reason_codes: ["dependency_blocked:A"] }),
    ]);
  });

  it("shows ops and approval cells without assigning them to implementation", () => {
    const lanePlan = buildPrCellLanePlan(plan([
      baseCell({ id: "A", title: "schema" }),
      baseCell({
        id: "OPS",
        title: "state daemon restart approval",
        kind: "human_approval",
        owner_role: "human_approval",
        risk_route: "R4",
        audit_route: "ceo",
        expected_pr_count: 0,
      }),
    ]));

    expect(lanePlan.eligible_implementation_cells.map((cell) => cell.cell_id)).toEqual(["A"]);
    expect(lanePlan.visible_ops_cells.map((cell) => cell.cell_id)).toEqual(["OPS"]);
  });
});
