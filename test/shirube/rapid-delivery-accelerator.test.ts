import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuditUnit,
  buildCellBatchPolicy,
  buildConveyorDeliveryPlan,
  classifyReauditHeadChange,
  type CellBatchPolicyReport,
} from "../../src/cli/lib/rapid-delivery-accelerator.js";
import {
  buildConveyorNext,
  type ConveyorCellQueue,
  type ConveyorPostMergeEvidence,
} from "../../src/cli/lib/conveyor-state-machine.js";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/rapid-delivery-accelerator");
const baseFixtures = path.join(root, "test/fixtures/shirube/conveyor-state-machine");
const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const previousHead = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(fixture(name), "utf8")) as T;
}

function policy(name: string, changedFiles: string[] = []): CellBatchPolicyReport {
  return buildCellBatchPolicy({
    cellQueue: readJson<ConveyorCellQueue>(name),
    changedFiles,
    generatedAt: "2026-07-01T00:00:00Z",
  });
}

function blockerCodes(report: { blockers: Array<{ code: string }> }): string[] {
  return report.blockers.map((blocker) => blocker.code);
}

describe("Rapid Delivery Accelerator", () => {
  it("batches R1 docs-only Cells with the same parent SSOT into one PR", () => {
    const report = policy("cell-queue.r1-docs.json");

    expect(report.verdict).toBe("PASS");
    expect(report.batch_allowed).toBe(true);
    expect(report.covered_cells).toEqual(["CELL-DOCS-001", "CELL-DOCS-002"]);
    expect(report.required_pr_count).toBe(1);
    expect(report.required_audit_count).toBe(1);
    expect(report.review_plan_profile).toBe("docs_light");
  });

  it("batches R1 docs-only plus metadata evidence completion into one PR", () => {
    const report = policy("cell-queue.r1-docs-metadata.json");

    expect(report.verdict).toBe("PASS");
    expect(report.batch_allowed).toBe(true);
    expect(report.covered_cells).toEqual(["CELL-DOCS-001", "CELL-EVIDENCE-001"]);
  });

  it("does not batch R1 docs-only with R2 runtime foundation by default", () => {
    const report = policy("cell-queue.r1-r2-runtime.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.batch_allowed).toBe(false);
    expect(blockerCodes(report)).toEqual(expect.arrayContaining(["risk_not_batchable", "cell_type_not_batchable", "protected_surface_not_batchable"]));
  });

  it("blocks DB or migration changed files from batching", () => {
    const report = policy("cell-queue.r1-docs.json", ["db/schema.sql"]);

    expect(report.verdict).toBe("BLOCKED");
    expect(blockerCodes(report)).toContain("protected_path_changed");
  });

  it("blocks workflow changed files from batching unless a later protected route explicitly handles them", () => {
    const report = policy("cell-queue.r1-docs.json", [".github/workflows/test.yml"]);

    expect(report.verdict).toBe("BLOCKED");
    expect(blockerCodes(report)).toContain("protected_path_changed");
  });

  it("builds one PR audit unit that covers multiple Cells", () => {
    const report = buildAuditUnit({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.r1-docs.json"),
      targetPr: 10,
      exactHeadSha: head,
      cellIds: ["CELL-DOCS-001", "CELL-DOCS-002"],
      reviewPlanRef: ".shirube/pr-units/PR-UNIT-001/review-plan.yaml",
      generatedAt: "2026-07-01T00:00:00Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.covered_cells).toEqual(["CELL-DOCS-001", "CELL-DOCS-002"]);
    expect(report.owner_decision_scope).toBe("pr_exact_head");
    expect(report.audit_item_sets).toEqual(expect.arrayContaining(["common_exact_head_scope_validation", "cell_specific_items:CELL-DOCS-001", "cell_specific_items:CELL-DOCS-002"]));
  });

  it("allows scoped re-audit when functional diff is unchanged and metadata delta is classified", () => {
    const report = classifyReauditHeadChange({
      previousAuditedHead: previousHead,
      currentHead: head,
      prBodyExactHead: head,
      deltaChangedFiles: [".shirube/work-orders/123/control-handoff.yaml"],
      previousAuditVerdict: "PASS_WITH_WARN",
      validationRerun: true,
      metadataOnlyConflictResolution: true,
      functionalDiffChanged: false,
    });

    expect(report.head_change.classification).toBe("scoped_reaudit_allowed");
    expect(report.current_phase).toBe("SCOPED_REAUDIT_REQUIRED");
    expect(report.next_action.action).toBe("request_scoped_reaudit");
    expect(report.would_block).toBe(true);
    expect(report.owner_approval_allowed).toBe(false);
  });

  it("allows scoped re-audit when conflict resolution restores active handoff only", () => {
    const report = classifyReauditHeadChange({
      previousAuditedHead: previousHead,
      currentHead: head,
      prBodyExactHead: head,
      deltaChangedFiles: readFileSync(fixture("delta.handoff.txt"), "utf8").trim().split(/\r?\n/),
      previousAuditVerdict: "PASS",
      validationRerun: true,
      metadataOnlyConflictResolution: true,
    });

    expect(report.head_change.classification).toBe("scoped_reaudit_allowed");
  });

  it("requires full re-audit when rebase introduces runtime/API changes", () => {
    const report = classifyReauditHeadChange({
      previousAuditedHead: previousHead,
      currentHead: head,
      prBodyExactHead: head,
      deltaChangedFiles: readFileSync(fixture("delta.runtime.txt"), "utf8").trim().split(/\r?\n/),
      previousAuditVerdict: "PASS",
      validationRerun: true,
      functionalDiffChanged: true,
    });

    expect(report.head_change.classification).toBe("full_reaudit_required");
    expect(report.current_phase).toBe("AUDIT_REQUIRED");
    expect(report.next_action.action).toBe("request_independent_audit");
  });

  it("requires metadata refresh when PR body exact_head is stale", () => {
    const report = classifyReauditHeadChange({
      previousAuditedHead: previousHead,
      currentHead: head,
      prBodyExactHead: previousHead,
      deltaChangedFiles: readFileSync(fixture("delta.metadata.txt"), "utf8").trim().split(/\r?\n/),
      previousAuditVerdict: "PASS",
      validationRerun: true,
      metadataOnlyConflictResolution: true,
    });

    expect(report.head_change.classification).toBe("metadata_refresh_required");
    expect(report.current_phase).toBe("METADATA_REFRESH_REQUIRED");
    expect(report.next_action.action).toBe("refresh_exact_head_metadata");
  });

  it("emits PR units and audit units from conveyor plan without assuming one PR per Cell", () => {
    const report = buildConveyorDeliveryPlan({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.r1-docs.json"),
      generatedAt: "2026-07-01T00:00:00Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.pr_units).toHaveLength(1);
    expect(report.pr_units[0].covered_cells).toEqual(["CELL-DOCS-001", "CELL-DOCS-002"]);
    expect(report.audit_units).toHaveLength(1);
  });

  it("blocks ambiguous batch ordering with an owner planning decision", () => {
    const report = buildConveyorDeliveryPlan({
      cellQueue: readJson<ConveyorCellQueue>("cell-queue.ambiguous.json"),
      generatedAt: "2026-07-01T00:00:00Z",
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.next_action.action).toBe("request_owner_planning_decision");
  });

  it("conveyor next chooses a PR unit, not just a single Cell, when batching is safe", () => {
    const queue = readJson<ConveyorCellQueue>("cell-queue.r1-docs.json");
    queue.cells?.unshift({
      cell_id: "CELL-DONE-001",
      status: "merged",
      risk_class: "R1",
      cell_type: "docs_only",
      allowed_paths: ["docs/**"],
      forbidden_paths: ["src/**"],
      expected_outputs: ["done"],
      pr_number: 9,
      merge_commit: head,
    });
    const report = buildConveyorNext({
      parentSsot: "watchout/example#100",
      repo: "watchout/example",
      afterMergePr: 9,
      mergeCommit: head,
      cellQueue: queue,
      postMergeEvidence: {
        schema_version: "shirube-post-merge-evidence/v1",
        repo: "watchout/example",
        parent_ssot: "watchout/example#100",
        merged_pr: 9,
        merge_commit: head,
        post_merge_smoke_or_NA: "PASS",
      } satisfies ConveyorPostMergeEvidence,
      generatedAt: "2026-07-01T00:00:00Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.next_action.action).toBe("open_next_pr_unit");
    expect(report.next_pr_unit_cells).toEqual(["CELL-DOCS-001", "CELL-DOCS-002"]);
  });

  it("open-pr emits a draft PR unit plan without audit, owner, or merge synthesis", () => {
    const stdout = execFileSync("npx", [
      "tsx",
      "src/cli/index.ts",
      "conveyor",
      "open-pr",
      "--cell-queue",
      fixture("cell-queue.r1-docs.json"),
      "--format",
      "json",
    ], { cwd: root, encoding: "utf8" });
    const report = JSON.parse(stdout);

    expect(report.mutation_performed).toBe(false);
    expect(report.owner_approval_synthesized).toBe(false);
    expect(report.merge_performed).toBe(false);
    expect(report.pr_unit_id).toBe("PR-UNIT-001");
  });

  it("audit-unit build CLI creates one audit unit for multiple Cells", () => {
    const stdout = execFileSync("npx", [
      "tsx",
      "src/cli/index.ts",
      "audit-unit",
      "build",
      "--cell-queue",
      fixture("cell-queue.r1-docs.json"),
      "--target-pr",
      "10",
      "--exact-head",
      head,
      "--cell-ids",
      "CELL-DOCS-001,CELL-DOCS-002",
      "--format",
      "json",
    ], { cwd: root, encoding: "utf8" });
    const report = JSON.parse(stdout);

    expect(report.schema).toBe("shirube-audit-unit/v1");
    expect(report.covered_cells).toEqual(["CELL-DOCS-001", "CELL-DOCS-002"]);
  });

  it("re-audit classify CLI preserves exact-head discipline", () => {
    const stdout = execFileSync("npx", [
      "tsx",
      "src/cli/index.ts",
      "re-audit",
      "classify",
      "--previous-audited-head",
      previousHead,
      "--current-head",
      head,
      "--pr-body-exact-head",
      head,
      "--delta-changed-files",
      fixture("delta.metadata.txt"),
      "--previous-audit-verdict",
      "PASS_WITH_WARN",
      "--validation-rerun",
      "--metadata-only-conflict-resolution",
      "--format",
      "json",
    ], { cwd: root, encoding: "utf8" });
    const report = JSON.parse(stdout);

    expect(report.head_change.classification).toBe("scoped_reaudit_allowed");
    expect(report.owner_approval_allowed).toBe(false);
    expect(report.merge_ready_allowed).toBe(false);
    expect(report.would_block).toBe(true);
  });
});
