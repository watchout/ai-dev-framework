import { describe, expect, it } from "vitest";
import {
  buildShirubePhaseCheck,
  type ShirubePhaseCheckInput,
} from "./phase-conveyor.js";

const baseInput: ShirubePhaseCheckInput = {
  schema: "shirube-phase-check-fixture/v1",
  repo: "watchout/ai-dev-framework",
  pr: 445,
  head_sha: "head-sha",
  changed_files: [],
  repo_files: [".shirube/repo-spec.yaml"],
};

describe("buildShirubePhaseCheck", () => {
  it("reports repo-spec drafted when owner confirmation is required but missing", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      artifacts: [
        {
          path: ".shirube/repo-spec.yaml",
          body: "planning_hierarchy:\n  owner_confirmation_required: true\n",
        },
      ],
    });

    expect(report.current_phase).toBe("REPO_SPEC_DRAFTED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("missing_owner_confirmation");
  });

  it("blocks when a required premise spec has no structured premise_ref", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: "planning_hierarchy:\n  premise_required: true\n",
        },
      ],
    });

    expect(report.current_phase).toBe("PREMISE_SPEC_REQUIRED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("missing_premise_ref");
  });

  it("keeps a referenced but unconfirmed premise in drafted state", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
          ].join("\n"),
        },
      ],
    });

    expect(report.current_phase).toBe("PREMISE_SPEC_DRAFTED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("missing_premise_confirmation");
  });

  it("blocks when required inventory has no structured inventory evidence", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: "planning_hierarchy:\n  inventory_required: true\n",
        },
      ],
    });

    expect(report.current_phase).toBe("INVENTORY_REQUIRED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("missing_inventory_ref");
  });

  it("blocks when Cell and Impl artifacts exist before required parent premise confirmation", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      changed_files: [
        ".shirube/cells/CELL-ADF-PHASE-001.yaml",
        ".shirube/impls/IMPL-ADF-PHASE-001.md",
      ],
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
          ].join("\n"),
        },
      ],
    });

    expect(report.current_phase).toBe("PREMISE_SPEC_DRAFTED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("cell_or_impl_before_premise_confirmation");
  });

  it("allows Cell drafting after required premise and inventory evidence are confirmed", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      changed_files: [".shirube/cells/CELL-ADF-PHASE-001.yaml"],
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
            "  premise_confirmed: true",
            "  inventory_required: true",
            "  inventory_ref: .shirube/evidence/EVIDENCE-ADF-INVENTORY-001.yaml",
            "  inventory_confirmed: true",
          ].join("\n"),
        },
      ],
    });

    expect(report.current_phase).toBe("CELL_DRAFTED");
    expect(report.verdict).toBe("PASS");
    expect(report.allowed_next_phases).toContain("IMPL_DRAFTED");
  });

  it("does not let LLM narrative confirmation satisfy structured evidence", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      body: "Premise confirmed by domain designer.",
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
          ].join("\n"),
        },
      ],
    });

    expect(report.current_phase).toBe("PREMISE_SPEC_DRAFTED");
    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("narrative_confirmation_without_structured_evidence");
    expect(report.required_evidence.find((item) => item.code === "premise_confirmation")?.status).toBe("missing");
  });

  it("distinguishes audited Impl from execution readiness", () => {
    const report = buildShirubePhaseCheck({
      ...baseInput,
      changed_files: [
        ".shirube/cells/CELL-ADF-PHASE-001.yaml",
        ".shirube/impls/IMPL-ADF-PHASE-001.md",
        ".shirube/audits/AUDIT-ADF-PHASE-IMPL-001.yaml",
      ],
      artifacts: [
        {
          path: ".shirube/cells/CELL-ADF-PHASE-001.yaml",
          body: [
            "planning_hierarchy:",
            "  premise_required: true",
            "  premise_ref: .shirube/specs/SPEC-ADF-PREMISE-001.md",
            "  premise_confirmed: true",
          ].join("\n"),
        },
        {
          path: ".shirube/audits/AUDIT-ADF-PHASE-IMPL-001.yaml",
          body: "audit_type: impl-audit\nverdict: PASS\n",
        },
      ],
    });

    expect(report.current_phase).toBe("EXECUTION_READY");
    expect(report.verdict).toBe("PASS");
    expect(report.allowed_next_phases).toEqual(["IMPLEMENTED"]);
  });
});
