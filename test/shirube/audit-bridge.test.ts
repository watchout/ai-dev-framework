import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuditBridgeCheck,
  resolveAuditBridgeInputFromFixture,
  type AuditBridgeCheckReport,
} from "../../src/cli/lib/shirube-audit-bridge.js";

const FIXTURE_DIR = path.resolve("test/shirube/fixtures/audit-bridge");
const CLI_PATH = path.resolve("src/cli/index.ts");
const TSX = path.resolve("node_modules/.bin/tsx");

function fixture(name: string): string {
  return path.join(FIXTURE_DIR, name);
}

function buildReport(name: string): AuditBridgeCheckReport {
  return buildAuditBridgeCheck(resolveAuditBridgeInputFromFixture(fixture(name)));
}

function blockerCodes(report: AuditBridgeCheckReport): string[] {
  return report.blockers.map((finding) => finding.code);
}

function invalidItemCodes(report: AuditBridgeCheckReport): string[] {
  return report.invalid_items.map((finding) => finding.code);
}

function runCli(args: string[]): { exitCode: number; report: AuditBridgeCheckReport } {
  try {
    const stdout = execFileSync(TSX, [CLI_PATH, "audit-bridge", "check", ...args], {
      encoding: "utf8",
    });
    return { exitCode: 0, report: JSON.parse(stdout) as AuditBridgeCheckReport };
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(failure.stdout) ? failure.stdout.toString("utf8") : failure.stdout ?? "";
    return {
      exitCode: failure.status ?? 1,
      report: JSON.parse(stdout) as AuditBridgeCheckReport,
    };
  }
}

describe("Shirube audit bridge admissibility", () => {
  it("passes a valid all-PASS audit record with matching item set", () => {
    const report = buildReport("valid.fixture.json");

    expect(report.schema).toBe("shirube-audit-bridge-check/v1");
    expect(report.verdict).toBe("PASS");
    expect(report.admissible).toBe(true);
    expect(report.would_block).toBe(false);
    expect(report.missing_item_ids).toEqual([]);
    expect(report.duplicate_item_ids).toEqual([]);
    expect(report.extra_item_ids).toEqual([]);
    expect(report.maker_checker_valid).toBe(true);
    expect(report.schema_valid).toBe(true);
    expect(report.evidence_recorded).toBe(true);
  });

  it("blocks missing required audit item answers", () => {
    const report = buildReport("missing-required.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.admissible).toBe(false);
    expect(report.missing_item_ids).toEqual(["STAGE9-FIXTURE-EVIDENCE"]);
    expect(blockerCodes(report)).toContain("missing_required_item");
  });

  it("blocks duplicate audit item answers", () => {
    const report = buildReport("duplicate-item.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.duplicate_item_ids).toEqual(["STAGE9-FIXTURE-SCOPE"]);
    expect(blockerCodes(report)).toContain("duplicate_item_result");
  });

  it("blocks unknown extra audit item IDs instead of silently passing them", () => {
    const report = buildReport("extra-item.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.extra_item_ids).toEqual(["STAGE9-FIXTURE-UNKNOWN"]);
    expect(blockerCodes(report)).toContain("extra_item_result");
  });

  it("blocks FAIL items without durable evidence_ref", () => {
    const report = buildReport("fail-without-evidence.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.fail_items).toEqual(["STAGE9-FIXTURE-SCOPE"]);
    expect(invalidItemCodes(report)).toContain("missing_fail_evidence_ref");
  });

  it("blocks FAIL items with placeholder or pending evidence_ref", () => {
    const report = buildReport("fail-placeholder-evidence.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.fail_items).toEqual(["STAGE9-FIXTURE-SCOPE"]);
    expect(invalidItemCodes(report)).toContain("non_durable_evidence_ref");
    expect(blockerCodes(report)).toContain("placeholder_or_pending_value");
  });

  it("blocks UNVERIFIED items without a waiver policy", () => {
    const report = buildReport("unverified.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.unverified_items).toEqual(["STAGE9-FIXTURE-SCOPE"]);
    expect(blockerCodes(report)).toContain("unverified_item");
  });

  it("blocks maker/checker actor reuse", () => {
    const report = buildReport("same-actor.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.maker_checker_valid).toBe(false);
    expect(blockerCodes(report)).toContain("maker_checker_violation");
  });

  it("keeps valid BLOCKED bridge reports exit-code zero at CLI level", () => {
    const result = runCli([
      "--fixture",
      fixture("missing-required.fixture.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.report.verdict).toBe("BLOCKED");
    expect(result.report.would_block).toBe(true);
  });

  it("returns FAILURE and nonzero exit for malformed audit records", () => {
    const result = runCli([
      "--fixture",
      fixture("records/malformed.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.report.verdict).toBe("FAILURE");
    expect(result.report.artifact_consistency).toBe("FAILURE");
  });

  it("blocks artifact head mismatch through the shared artifact primitive", () => {
    const report = buildReport("head-mismatch.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.artifact_consistency).toBe("BLOCKED");
    expect(blockerCodes(report)).toEqual(expect.arrayContaining([
      "head_mismatch",
      "evidence_artifact_head_mismatch",
    ]));
  });

  it("preserves fixture evidence artifacts through the CLI for head mismatch checks", () => {
    const result = runCli([
      "--fixture",
      fixture("head-mismatch.fixture.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.report.verdict).toBe("BLOCKED");
    expect(result.report.artifact_consistency).toBe("BLOCKED");
    expect(blockerCodes(result.report)).toEqual(expect.arrayContaining([
      "head_mismatch",
      "evidence_artifact_head_mismatch",
    ]));
  });

  it("blocks placeholder evidence artifacts through the shared artifact primitive", () => {
    const report = buildReport("placeholder-artifact.fixture.json");

    expect(report.verdict).toBe("BLOCKED");
    expect(report.artifact_consistency).toBe("BLOCKED");
    expect(blockerCodes(report)).toEqual(expect.arrayContaining([
      "evidence_artifact_placeholder_or_pending_value",
      "evidence_artifact_invalid_commit_sha",
    ]));
  });

  it("preserves fixture evidence artifacts through the CLI for placeholder checks", () => {
    const result = runCli([
      "--fixture",
      fixture("placeholder-artifact.fixture.json"),
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.report.verdict).toBe("BLOCKED");
    expect(result.report.admissible).toBe(false);
    expect(result.report.would_block).toBe(true);
    expect(blockerCodes(result.report)).toEqual(expect.arrayContaining([
      "evidence_artifact_placeholder_or_pending_value",
      "evidence_artifact_invalid_commit_sha",
    ]));
  });
});
