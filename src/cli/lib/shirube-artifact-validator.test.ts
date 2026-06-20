import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildShirubeArtifactValidationReport } from "./shirube-artifact-validator.js";

const REPO_ROOT = process.cwd();

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-artifact-validator-"));
  fs.cpSync(path.join(REPO_ROOT, "schemas"), path.join(tmpDir, "schemas"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Shirube artifact validator", () => {
  it("validates a v1 Cell artifact against the checked-in schema", () => {
    writeArtifact(".shirube/cells/CELL-ADF-TEST-001.yaml", validCellYaml());

    const report = buildShirubeArtifactValidationReport({ rootDir: tmpDir });

    expect(report.schema).toBe("shirube-artifact-validation/v1");
    expect(report.verdict).toBe("PASS");
    expect(report.summary).toMatchObject({ scanned: 1, validated: 1, failed: 0 });
    expect(report.artifacts[0]).toMatchObject({
      path: ".shirube/cells/CELL-ADF-TEST-001.yaml",
      schema_version: "shirube-cell/v1",
      schema_file: "schemas/cell.schema.json",
      status: "PASS",
    });
  });

  it("blocks schema-extra fields in Cell artifacts", () => {
    writeArtifact(".shirube/cells/CELL-ADF-TEST-001.yaml", `${validCellYaml()}\nstatus: candidate\n`);

    const report = buildShirubeArtifactValidationReport({ rootDir: tmpDir });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema_additional_property",
          field: "$.status",
          path: ".shirube/cells/CELL-ADF-TEST-001.yaml",
        }),
      ]),
    );
  });

  it("blocks non-string audit_results entries in Evidence artifacts", () => {
    writeArtifact(".shirube/evidence/EVIDENCE-ADF-TEST-001.yaml", [
      "schema_version: shirube-evidence/v1",
      "EVIDENCE-ID: EVIDENCE-ADF-TEST-001",
      "SPEC-ID: SPEC-ADF-TEST-001",
      "CELL-ID: CELL-ADF-TEST-001",
      "IMPL-ID: IMPL-ADF-TEST-001",
      "PR-ID: pending",
      "commit_sha: pending-head",
      "audit_results:",
      "  - id: AUDIT-ADF-TEST-001",
      "ci_runs:",
      "  - name: lint",
      "    result: PASS",
      "    url: local",
      "artifact_locations:",
      "  - .shirube/evidence/EVIDENCE-ADF-TEST-001.yaml",
      "post_merge_verification:",
      "  result: N/A",
      "  evidence:",
      "    - not merged",
      "release_or_rollback_decision:",
      "  result: N/A",
      "  evidence:",
      "    - pending",
      "",
    ].join("\n"));

    const report = buildShirubeArtifactValidationReport({ rootDir: tmpDir });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema_type_mismatch",
          field: "$.audit_results[0]",
        }),
      ]),
    );
  });
});

function writeArtifact(relativePath: string, body: string): void {
  const absolutePath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, body, "utf8");
}

function validCellYaml(): string {
  return [
    "schema_version: shirube-cell/v1",
    "CELL-ID: CELL-ADF-TEST-001",
    "SPEC-ID: SPEC-ADF-TEST-001",
    "risk_tier: R2",
    "goal: Validate test artifact.",
    "covered_req_ids:",
    "  - REQ-ADF-TEST-001",
    "allowed_paths:",
    "  - src/cli/**",
    "forbidden_paths:",
    "  - .github/workflows/**",
    "acceptance_criteria:",
    "  - id: AC-ADF-TEST-001",
    "    statement: Validation succeeds.",
    "    linked_req_ids: [REQ-ADF-TEST-001]",
    "required_tests:",
    "  - \"TEST-MAP-ID: TEST-MAP-ADF-TEST-001\"",
    "required_evidence:",
    "  - validation_report",
    "non_goals:",
    "  - protected settings mutation",
    "stop_conditions:",
    "  - validation requires external mutation",
    "execution_contract:",
    "  canonical_term: Goal-directed bounded execution",
    "  shorthand: Goal-mode Implementation",
    "  allowed_commands:",
    "    - npm run build:cli",
    "  forbidden_commands:",
    "    - gh pr merge",
    "  handoff_conditions:",
    "    - validation PASS",
    "  completion_evidence:",
    "    - test results",
    "",
  ].join("\n");
}
