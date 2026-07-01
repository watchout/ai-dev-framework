import { describe, expect, it } from "vitest";
import {
  buildConveyorPrerequisiteCheck,
  type ConveyorPrerequisiteCheckInput,
} from "./conveyor-prerequisite-check.js";

const completeBody = [
  "CELL-ID: CELL-ADF-GATE-001",
  "SPEC-ID: SPEC-ADF-GATE-001",
  "IMPL-ID: IMPL-ADF-GATE-001",
  "Risk Tier: R2",
  "Repo Spec: .shirube/repo-spec.yaml",
  "Spec Audit: AUDIT-ID: AUDIT-ADF-GATE-SPEC-001",
  "Spec-to-Cell Trace: EVIDENCE-ID: TRACE-ADF-GATE-001",
  "Impl Audit: AUDIT-ID: AUDIT-ADF-GATE-IMPL-001",
  "Required Test Mapping: TEST-MAP-ID: TEST-MAP-ADF-GATE-001",
  "Execution Contract: CONTRACT-ID: CONTRACT-ADF-GATE-001",
  "Allowed paths:",
  "- src/cli/**",
  "- test/**",
  "- tests/**",
].join("\n");

function fixture(overrides: Partial<ConveyorPrerequisiteCheckInput> = {}): ConveyorPrerequisiteCheckInput {
  return {
    schema: "shirube-conveyor-check-fixture/v1",
    repo: "watchout/ai-dev-framework",
    pr: 435,
    head_sha: "abc123",
    body: completeBody,
    labels: [],
    changed_files: ["src/cli/lib/conveyor-prerequisite-check.ts"],
    repo_files: [".shirube/repo-spec.yaml"],
    checked_at_utc: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

function blockerCodes(input: ConveyorPrerequisiteCheckInput): string[] {
  return buildConveyorPrerequisiteCheck(input).blockers.map((blocker) => blocker.code);
}

describe("conveyor prerequisite check", () => {
  it("blocks behavior-changing work when feature spec evidence is missing", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({ body: completeBody.replace("SPEC-ID: SPEC-ADF-GATE-001\n", "") }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.spec_ids).toEqual([]);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_feature_spec" }),
      ]),
    );
  });

  it("does not let historical repo spec files satisfy the current PR feature spec gate", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("SPEC-ID: SPEC-ADF-GATE-001\n", ""),
      repo_files: [".shirube/repo-spec.yaml", "docs/spec/old-spec.md"],
    }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_feature_spec" }),
      ]),
    );
  });

  it("blocks behavior-changing work when Cell evidence is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("CELL-ID: CELL-ADF-GATE-001\n", "") }))).toContain("missing_cell");
  });

  it("blocks R2/R3 work when Impl evidence is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("IMPL-ID: IMPL-ADF-GATE-001\n", "") }))).toContain("missing_impl");
  });

  it("does not let historical repo impl files satisfy the current PR Impl gate", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("IMPL-ID: IMPL-ADF-GATE-001\n", ""),
      repo_files: [".shirube/repo-spec.yaml", "docs/impl/old-impl.md"],
    }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_impl" }),
      ]),
    );
  });

  it("blocks behavior-changing work when spec-to-cell trace evidence is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("Spec-to-Cell Trace: EVIDENCE-ID: TRACE-ADF-GATE-001\n", "") }))).toContain(
      "missing_spec_to_cell_trace",
    );
  });

  it("blocks R2/R3 work when Impl audit evidence is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("Impl Audit: AUDIT-ID: AUDIT-ADF-GATE-IMPL-001\n", "") }))).toContain("missing_impl_audit");
  });

  it("does not treat bare Spec Audit PASS as artifact evidence", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("Spec Audit: AUDIT-ID: AUDIT-ADF-GATE-SPEC-001", "Spec Audit: PASS"),
    }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_spec_audit" }),
      ]),
    );
  });

  it("does not treat bare Impl Audit PASS as artifact evidence for R2/R3", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("Impl Audit: AUDIT-ID: AUDIT-ADF-GATE-IMPL-001", "Impl Audit: PASS"),
    }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_impl_audit" }),
      ]),
    );
  });

  it("accepts explicit artifact path evidence for an audit when the path exists", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("Spec Audit: AUDIT-ID: AUDIT-ADF-GATE-SPEC-001", "Spec Audit: docs/verify/spec-audit-current.md"),
      repo_files: [".shirube/repo-spec.yaml", "docs/verify/spec-audit-current.md"],
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_spec_audit");
  });

  it("accepts explicit artifact URL evidence for an audit", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("Impl Audit: AUDIT-ID: AUDIT-ADF-GATE-IMPL-001", "Impl Audit: https://github.com/watchout/ai-dev-framework/actions/runs/27848461002"),
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_impl_audit");
  });

  it("accepts spec, Cell, and Impl artifacts changed by the current PR", () => {
    const body = completeBody
      .replace("SPEC-ID: SPEC-ADF-GATE-001\n", "")
      .replace("CELL-ID: CELL-ADF-GATE-001\n", "")
      .replace("IMPL-ID: IMPL-ADF-GATE-001\n", "");
    const report = buildConveyorPrerequisiteCheck(fixture({
      body,
      changed_files: [
        "src/cli/lib/conveyor-prerequisite-check.ts",
        "docs/spec/current-feature-spec.md",
        "docs/spec/cell-plan.current.yml",
        "docs/impl/current-impl.md",
      ],
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_feature_spec");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_cell");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_impl");
  });

  it("accepts .shirube Spec, Cell, Impl, and audit artifacts changed by the current PR", () => {
    const body = completeBody
      .replace("SPEC-ID: SPEC-ADF-GATE-001\n", "")
      .replace("CELL-ID: CELL-ADF-GATE-001\n", "")
      .replace("IMPL-ID: IMPL-ADF-GATE-001\n", "")
      .replace("Spec Audit: AUDIT-ID: AUDIT-ADF-GATE-SPEC-001\n", "")
      .replace("Impl Audit: AUDIT-ID: AUDIT-ADF-GATE-IMPL-001\n", "");
    const report = buildConveyorPrerequisiteCheck(fixture({
      body,
      changed_files: [
        "src/cli/lib/conveyor-prerequisite-check.ts",
        ".shirube/specs/SPEC-ADF-GATE-001.md",
        ".shirube/cells/CELL-ADF-GATE-001.yaml",
        ".shirube/impls/IMPL-ADF-GATE-001.md",
        ".shirube/audits/AUDIT-ADF-GATE-SPEC-001.yaml",
        ".shirube/audits/AUDIT-ADF-GATE-IMPL-001.yaml",
      ],
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_feature_spec");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_cell");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_impl");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_spec_audit");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_impl_audit");
  });

  it("accepts an approved repo-level repo-spec baseline from repo files", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: completeBody.replace("Repo Spec: .shirube/repo-spec.yaml\n", ""),
      repo_files: [".shirube/repo-spec.yaml"],
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_repo_spec");
  });

  it("blocks forbidden path changes", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({ changed_files: [".github/workflows/shirube-pr-gate.yml"] }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "forbidden_path_touched", path: ".github/workflows/shirube-pr-gate.yml" }),
      ]),
    );
  });

  it("passes valid scaffold/docs-only R0 work", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: [
        "Risk Tier: R0",
        "Allowed paths:",
        "- templates/**",
      ].join("\n"),
      changed_files: ["templates/pull_request_template.md"],
    }));

    expect(report.verdict).toBe("PASS");
    expect(report.risk_tier).toBe("R0");
    expect(report.blockers).toEqual([]);
  });

  it("blocks R2/R3 work when required test mapping is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("Required Test Mapping: TEST-MAP-ID: TEST-MAP-ADF-GATE-001\n", "") }))).toContain(
      "missing_required_test_mapping",
    );
  });

  it("blocks R2/R3 work when execution contract is missing", () => {
    expect(blockerCodes(fixture({ body: completeBody.replace("Execution Contract: CONTRACT-ID: CONTRACT-ADF-GATE-001\n", "") }))).toContain(
      "missing_execution_contract",
    );
  });

  it("blocks skipped required gates when waiver evidence is missing", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({ body: `${completeBody}\nSkipped Required Gate: impl audit` }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_waiver_for_skipped_gate" }),
      ]),
    );
  });

  it("accepts a complete current waiver for a skipped required gate", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: [
        completeBody,
        "Skipped Required Gate: impl audit",
        "Waiver: WAIVER-001",
        "Waiver Owner: release-owner",
        "Waiver Reason: temporary fixture exercise",
        "Compensating Controls: narrow verification remains required",
        "Waiver Expiry: 2026-06-21T00:00:00.000Z",
      ].join("\n"),
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("missing_waiver_for_skipped_gate");
    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("expired_waiver");
  });

  it("blocks runtime files claimed as docs-only", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({ body: `${completeBody}\nScope: docs-only` }));

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "runtime_claimed_docs_only" }),
      ]),
    );
  });

  it("does not treat narrative test descriptions as docs-only scope claims", () => {
    const report = buildConveyorPrerequisiteCheck(fixture({
      body: `${completeBody}\nTests cover runtime claimed as docs-only.`,
    }));

    expect(report.blockers.map((blocker) => blocker.code)).not.toContain("runtime_claimed_docs_only");
  });
});
