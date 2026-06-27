import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildConveyorNext,
  buildConveyorOpenPrPlan,
  buildConveyorPlan,
  buildConveyorPostMergeRecord,
  buildConveyorWorkOrderExport,
  type ConveyorCellQueue,
  type ConveyorPostMergeEvidence,
} from "../../src/cli/lib/conveyor-state-machine.js";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/conveyor-state-machine");
const parentSsot = "watchout/misell#197";
const repo = "watchout/misell";
const mergeCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(fixture(name), "utf8")) as T;
}

function next(queueName: string) {
  return buildConveyorNext({
    parentSsot,
    repo,
    afterMergePr: 205,
    mergeCommit,
    cellQueue: readJson<ConveyorCellQueue>(queueName),
    postMergeEvidence: readJson<ConveyorPostMergeEvidence>("post-merge.205.json"),
    generatedAt: "2026-06-27T00:00:00Z",
  });
}

function blockerCodes(report: { blockers: Array<{ code: string }> }): string[] {
  return report.blockers.map((blocker) => blocker.code);
}

describe("Shirube Conveyor state machine", () => {
  it("selects the next ready Cell after #205-like post-merge evidence", () => {
    const report = next("cell-queue.basic.json");

    expect(report.schema).toBe("shirube-conveyor-next/v1");
    expect(report.verdict).toBe("PASS");
    expect(report.completed_pr).toBe(205);
    expect(report.completed_merge_commit).toBe(mergeCommit);
    expect(report.completed_cell_id).toBe("CELL-MISELL-205");
    expect(report.next_action.action).toBe("open_next_cell_pr");
    expect(report.next_cell_id).toBe("CELL-MISELL-206");
  });

  it("reports no next Cell without silently choosing work", () => {
    const report = next("cell-queue.no-next.json");

    expect(report.verdict).toBe("PASS_WITH_WARN");
    expect(report.next_cell_id).toBeNull();
    expect(report.next_action.action).toBe("update_cell_queue");
    expect(report.warnings.map((warning) => warning.code)).toContain("no_next_cell_available");
  });

  it("selects the highest-priority ready Cell when multiple Cells are ready", () => {
    const report = next("cell-queue.multiple-priority.json");

    expect(report.verdict).toBe("PASS");
    expect(report.next_cell_id).toBe("CELL-MISELL-207");
  });

  it("blocks multiple ready Cells without priority and requests owner planning decision", () => {
    const report = next("cell-queue.multiple-no-priority.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.next_action.action).toBe("request_owner_planning_decision");
    expect(blockerCodes(report)).toContain("ambiguous_ready_cells_without_priority");
  });

  it("blocks selection when a dependency is blocked", () => {
    const report = next("cell-queue.blocked-dependency.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.next_action.action).toBe("resolve_blocked_dependency");
    expect(blockerCodes(report)).toContain("blocked_dependency_prevents_selection");
  });

  it("blocks ready Cells whose required inputs are missing", () => {
    const report = next("cell-queue.missing-inputs.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.next_action.action).toBe("complete_cell_inputs");
    expect(report.required_inputs).toEqual(expect.arrayContaining(["allowed_paths", "expected_outputs"]));
  });

  it("generates a handoff plan with review_plan_ref before implementation", () => {
    const report = buildConveyorPlan({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.basic.json"),
      cellId: "CELL-MISELL-206",
      generatedAt: "2026-06-27T00:00:00Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.handoff_draft).toEqual(
      expect.objectContaining({
        cell_id: "CELL-MISELL-206",
        review_plan_ref: ".shirube/work-orders/cell-misell-206/review-plan.yaml",
      }),
    );
    expect(report.review_plan_draft).toEqual(
      expect.objectContaining({
        schema_version: "shirube-review-plan/v1",
      }),
    );
    expect(report.audit_checklist_draft).toEqual(
      expect.objectContaining({
        schema_version: "shirube-audit-checklist/v1",
      }),
    );
  });

  it("exports an AUN-compatible Work Order for the next Cell", () => {
    const report = buildConveyorWorkOrderExport({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.basic.json"),
      cellId: "CELL-MISELL-206",
      generatedAt: "2026-06-27T00:00:00Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.validation?.verdict).toBe("PASS");
    expect(report.work_order?.schema_version).toBe("shirube-work-order/v1");
    expect((report.work_order?.target as { package?: string }).package).toBe("aun");
  });

  it("does not synthesize merge, owner approval, or branch protection changes when planning a PR", () => {
    const plan = buildConveyorPlan({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.basic.json"),
      cellId: "CELL-MISELL-206",
    });
    const report = buildConveyorOpenPrPlan(plan);

    expect(report.verdict).toBe("PASS");
    expect(report.mutation_performed).toBe(false);
    expect(report.owner_approval_synthesized).toBe(false);
    expect(report.merge_performed).toBe(false);
    expect(report.branch_protection_mutated).toBe(false);
    expect(report.required_checks_mutated).toBe(false);
  });

  it("records post-merge evidence without approving or merging anything", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-conveyor-post-merge-"));
    try {
      const out = path.join(dir, "post-merge.json");
      const report = buildConveyorPostMergeRecord({
        repo,
        parentSsot,
        pr: 205,
        mergedHead: "2052052052052052052052052052052052052052",
        mergeCommit,
        mergedAt: "2026-06-27T00:00:00Z",
        postMergeSmokeOrNa: "PASS",
        nextStep: "select_next_cell",
        out,
      });

      expect(report.verdict).toBe("PASS");
      expect(report.written_to).toBe(out);
      expect(JSON.parse(readFileSync(out, "utf8")).merge_commit).toBe(mergeCommit);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes the post-merge selector through the public conveyor CLI", () => {
    const stdout = execFileSync("npx", [
      "tsx",
      "src/cli/index.ts",
      "conveyor",
      "next",
      "--parent-ssot",
      parentSsot,
      "--repo",
      repo,
      "--after-merge-pr",
      "205",
      "--merge-commit",
      mergeCommit,
      "--cell-queue",
      fixture("cell-queue.basic.json"),
      "--post-merge-evidence",
      fixture("post-merge.205.json"),
      "--format",
      "json",
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const report = JSON.parse(stdout);

    expect(report.schema).toBe("shirube-conveyor-next/v1");
    expect(report.next_cell_id).toBe("CELL-MISELL-206");
  });
});
