import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuthorityCheck,
  buildEvidenceCheck,
  buildWaiverCheck,
  readRecord,
  type AuthorityCheckInput,
  type ShirubeGateReport,
} from "../../src/cli/lib/shirube-artifact-gates.js";

const FIXTURE_DIR = path.resolve("test/shirube/fixtures/artifact-gates");
const CLI_PATH = path.resolve("src/cli/index.ts");
const TSX = path.resolve("node_modules/.bin/tsx");
const HEAD = "1111111111111111111111111111111111111111";

function fixture(name: string): string {
  return path.join(FIXTURE_DIR, name);
}

function findingCodes(report: ShirubeGateReport): string[] {
  return report.blockers.map((finding) => finding.code);
}

describe("Shirube artifact gates", () => {
  it("passes evidence with required fields and matching head/base", () => {
    const report = buildEvidenceCheck({
      files: [fixture("evidence.present.json")],
      expectedHead: HEAD,
      expectedBase: "main",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.would_block).toBe(false);
  });

  it("blocks stale evidence head", () => {
    const report = buildEvidenceCheck({
      files: [fixture("evidence.stale-head.json")],
      expectedHead: HEAD,
      expectedBase: "main",
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(findingCodes(report)).toContain("head_mismatch");
  });

  it("blocks evidence missing required fields", () => {
    const report = buildEvidenceCheck({
      files: [fixture("evidence.missing-field.json")],
      expectedHead: HEAD,
    });

    expect(report.verdict).toBe("BLOCKED");
    expect(findingCodes(report)).toContain("missing_required_field");
  });

  it("blocks base mismatch and placeholder values in artifact consistency", () => {
    const baseMismatch = buildEvidenceCheck({
      files: [fixture("evidence.base-mismatch.json")],
      expectedHead: HEAD,
      expectedBase: "main",
    });
    const placeholder = buildEvidenceCheck({
      files: [fixture("evidence.placeholder.json")],
      expectedBase: "main",
    });

    expect(findingCodes(baseMismatch)).toContain("base_mismatch");
    expect(findingCodes(placeholder)).toContain("placeholder_or_pending_value");
    expect(findingCodes(placeholder)).toContain("invalid_commit_sha");
  });

  it("passes valid waiver and blocks expired or scope-mismatched waivers", () => {
    const valid = buildWaiverCheck({
      files: [fixture("waiver.valid.json")],
      targetCell: "CELL-ADF-452-D",
      targetCheck: "script-gate",
      checkedAtUtc: "2026-06-21T00:00:00Z",
    });
    const expired = buildWaiverCheck({
      files: [fixture("waiver.expired.json")],
      checkedAtUtc: "2026-06-21T00:00:00Z",
    });
    const scopeMismatch = buildWaiverCheck({
      files: [fixture("waiver.scope-mismatch.json")],
      targetCell: "CELL-ADF-452-D",
      checkedAtUtc: "2026-06-21T00:00:00Z",
    });

    expect(valid.verdict).toBe("PASS");
    expect(findingCodes(expired)).toContain("expired_waiver");
    expect(findingCodes(scopeMismatch)).toContain("waiver_scope_mismatch");
  });

  it("enforces maker/checker authority separation on canonical scaffold roles", () => {
    const distinctInput = readRecord(fixture("authority.distinct.json")) as AuthorityCheckInput;
    const sameActorInput = readRecord(fixture("authority.same-actor.json")) as AuthorityCheckInput;
    const distinct = buildAuthorityCheck(distinctInput);
    const sameActor = buildAuthorityCheck(sameActorInput);

    expect(distinct.verdict).toBe("PASS");
    expect(sameActor.verdict).toBe("BLOCKED");
    expect(findingCodes(sameActor)).toContain("maker_checker_violation");
  });

  it("keeps valid BLOCKED artifact findings report-only at CLI level", () => {
    const stdout = execFileSync(TSX, [
      CLI_PATH,
      "evidence",
      "check",
      "--fixture",
      fixture("evidence.stale-head.json"),
      "--head",
      HEAD,
      "--format",
      "json",
    ], { encoding: "utf8" });
    const report = JSON.parse(stdout) as ShirubeGateReport;

    expect(report.verdict).toBe("BLOCKED");
    expect(report.would_block).toBe(true);
    expect(findingCodes(report)).toContain("head_mismatch");
  });
});
