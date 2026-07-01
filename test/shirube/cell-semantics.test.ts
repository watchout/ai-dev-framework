import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/cell-semantics");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function run(script: string, args: string[]): { exitCode: number; json: any; stdout: string } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout), stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout), stdout };
  }
}

function ids(result: { json: any }): string[] {
  return (result.json.blockers ?? []).map((finding: { item_id: string }) => finding.item_id);
}

describe("Shirube Cell Semantics Gate MVP", () => {
  it("blocks placeholder structured_audit_comment_ref and owner_decision_ref before resolver execution", () => {
    const result = run("scripts/shirube/check-pr-body-metadata.mjs", [
      "--pr-body",
      fixture("pr-body.placeholder.md"),
      "--actual-repo",
      "watchout/agent-comms-mcp",
      "--actual-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(result.json.report_failed).toBe(false);
    expect(result.json.current_phase).toBe("METADATA_REFRESH_REQUIRED");
    expect(result.json.next_action.action).toBe("remove_placeholder_machine_refs");
    expect(ids(result)).toEqual(["METADATA-REF-001"]);
  });

  it("allows prose pending state outside machine ref fields", () => {
    const result = run("scripts/shirube/check-pr-body-metadata.mjs", [
      "--pr-body",
      fixture("pr-body.prose-pending.md"),
      "--actual-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("PASS");
    expect(result.json.blockers).toEqual([]);
  });

  it("blocks item-level PASS_WITH_WARN with AUDIT-ITEM-ENUM-001", () => {
    const result = run("scripts/shirube/check-audit-checklist.mjs", [
      "--checklist",
      fixture("audit-checklist.yaml"),
      "--audit",
      fixture("audit.pass-with-warn-item.yaml"),
      "--machine-evidence",
      fixture("machine-evidence.yaml"),
      "--expected-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toContain("AUDIT-ITEM-ENUM-001");
  });

  it("accepts item-level PASS with warning details in notes", () => {
    const result = run("scripts/shirube/check-audit-checklist.mjs", [
      "--checklist",
      fixture("audit-checklist.yaml"),
      "--audit",
      fixture("audit.pass.yaml"),
      "--machine-evidence",
      fixture("machine-evidence.yaml"),
      "--expected-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("PASS");
    expect(result.json.blockers).toEqual([]);
  });

  it("reports one legacy-format blocker instead of many unanswered-item blockers", () => {
    const result = run("scripts/shirube/check-audit-checklist.mjs", [
      "--checklist",
      fixture("audit-checklist.yaml"),
      "--audit",
      fixture("audit.legacy-bad.yaml"),
      "--machine-evidence",
      fixture("machine-evidence.yaml"),
      "--expected-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toEqual(["AUDIT-FORMAT-001"]);
  });

  it("normalizes safe legacy checklist_results to items[]", () => {
    const result = run("scripts/shirube/check-audit-checklist.mjs", [
      "--checklist",
      fixture("audit-checklist.yaml"),
      "--audit",
      fixture("audit.legacy-safe.yaml"),
      "--machine-evidence",
      fixture("machine-evidence.yaml"),
      "--expected-head",
      "1111111111111111111111111111111111111111",
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("PASS_WITH_WARN");
    expect(result.json.blockers).toEqual([]);
    expect(result.json.warnings.map((warning: { item_id: string }) => warning.item_id)).toContain("AUDIT-FORMAT-W001");
  });

  it("keeps route_metadata PRs from completing the Cell", () => {
    const result = run("scripts/shirube/check-cell-decomposition.mjs", [
      "--handoff",
      fixture("handoff.route-metadata.yaml"),
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("PASS");
    expect(result.json.cell_complete).toBe(false);
    expect(result.json.next_cell_selection_allowed).toBe(false);
    expect(result.json.same_cell_continuation_required).toBe(true);
    expect(result.json.next_stage).toBe("implementation");
    expect(result.json.next_expected_action).toBe("open_implementation_pr_for_same_cell");
  });

  it("blocks route_metadata PRs without next_stage", () => {
    const result = run("scripts/shirube/check-cell-decomposition.mjs", [
      "--handoff",
      fixture("handoff.route-metadata-missing-next.yaml"),
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toContain("CELL-LC-003");
  });

  it("blocks Cells without completion definitions", () => {
    const result = run("scripts/shirube/check-cell-decomposition.mjs", [
      "--cell",
      fixture("cell.missing-completion.yaml"),
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toContain("CELL-DECOMP-004");
  });

  it("blocks unrelated outcomes grouped into one Cell", () => {
    const result = run("scripts/shirube/check-cell-cohesion.mjs", [
      "--cell",
      fixture("cell.unrelated.yaml"),
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toContain("CELL-COHESION-003");
  });

  it("blocks audit-reduction-only Cell grouping", () => {
    const result = run("scripts/shirube/check-cell-cohesion.mjs", [
      "--cell",
      fixture("cell.audit-reduction.yaml"),
      "--format",
      "json",
    ]);

    expect(result.json.verdict).toBe("BLOCKED");
    expect(ids(result)).toContain("CELL-COHESION-003");
  });

  it("integrates placeholder metadata into Rapid/Lite without report failure", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "shirube-cell-semantics-"));
    try {
      const result = run("scripts/shirube/run-rapid-lite-report.mjs", [
        "--pr-body",
        fixture("pr-body.placeholder.md"),
        "--changed-files",
        fixture("changed-files.txt"),
        "--actual-repo",
        "watchout/agent-comms-mcp",
        "--actual-head",
        "1111111111111111111111111111111111111111",
        "--result-dir",
        outDir,
        "--format",
        "json",
      ]);

      expect(result.json.current_phase).toBe("METADATA_REFRESH_REQUIRED");
      expect(result.json.next_action.action).toBe("remove_placeholder_machine_refs");
      expect(result.json.report_failed).toBe(false);
      expect(result.json.would_block).toBe(true);
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "pr-body-metadata").blockers[0].item_id).toBe("METADATA-REF-001");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("keeps route_metadata Cell continuation fields in Rapid/Lite when audit is missing", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "shirube-cell-semantics-"));
    try {
      const result = run("scripts/shirube/run-rapid-lite-report.mjs", [
        "--pr-body",
        fixture("pr-body.route-metadata.md"),
        "--changed-files",
        fixture("changed-files.txt"),
        "--actual-repo",
        "watchout/agent-comms-mcp",
        "--actual-pr",
        "835",
        "--actual-head",
        "1111111111111111111111111111111111111111",
        "--result-dir",
        outDir,
        "--format",
        "json",
      ]);

      expect(result.json.current_phase).toBe("AUDIT_REQUIRED");
      expect(result.json.next_action.action).toBe("request_independent_audit");
      expect(result.json.cell_complete).toBe(false);
      expect(result.json.next_cell_selection_allowed).toBe(false);
      expect(result.json.same_cell_continuation_required).toBe(true);
      expect(result.json.next_stage).toBe("implementation");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
