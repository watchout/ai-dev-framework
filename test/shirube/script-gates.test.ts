import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/script-gates");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function run(script: string, args: string[] = []): { exitCode: number; json: any } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout) };
  }
}

function readFixture(name: string): any {
  return JSON.parse(readFileSync(fixture(name), "utf8"));
}

function expectGateShape(result: { json: any }): void {
  expect(result.json).toHaveProperty("gate");
  expect(["PASS", "WARN", "BLOCK"]).toContain(result.json.verdict);
  expect(Array.isArray(result.json.reasons)).toBe(true);
  expect(result.json.remediation).toHaveProperty("what");
  expect(result.json.remediation).toHaveProperty("doc_ref");
}

describe("Shirube script gates", () => {
  it("repo-spec fixture with all required fields passes", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.pass.json")]);
    expectGateShape(result);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
  });

  it("repo-spec encodes audit assignment and RPS confirmation evidence contracts", () => {
    const spec = readFixture("repo-spec.pass.json");
    expect(spec.audit_assignment.author_must_not_audit_own_artifact).toBe(true);
    expect(spec.audit_assignment.roles.spec.may_audit).toBe(false);
    expect(spec.audit_assignment.roles.arc.may_audit).toBe(false);
    expect(spec.audit_assignment.roles.codex_audit.may_audit).toBe(true);
    expect(spec.audit_assignment.artifacts.premise_rps.audit_role).toBe("codex-audit");
    expect(spec.audit_assignment.artifacts.premise_rps.audit_role).not.toBe("arc");
    expect(spec.audit_assignment.artifacts.premise_rps.audit_role).not.toBe("spec");
    expect(spec.audit_assignment.artifacts.bridge_admissibility.machine_gate).toBe("bridge");
    expect(spec.confirmation_evidence.rps_readiness.canonical_artifact_path).toBe(
      ".shirube/evidence/rps-confirmation.yaml",
    );
    expect(spec.confirmation_evidence.rps_readiness.github_marker).toBe("shirube:rps-confirmation/v1");
    expect(spec.confirmation_evidence.rps_readiness.required_fields).toContain("exact_head_sha");
    expect(spec.confirmation_evidence.rps_readiness.valid_verdicts).toEqual([
      "CONFIRMED",
      "CHANGES_REQUIRED",
      "BLOCKED",
    ]);
  });

  it("repo-spec warns when audit assignment is missing during report-only migration", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.lightweight-aun.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_audit_assignment");
  });

  it("repo-spec warns when RPS readiness confirmation evidence is missing during report-only migration", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.lightweight-aun.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_confirmation_evidence");
  });

  it("repo-spec warns on canonical_core without @ pin during pilot migration", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.bad-canonical.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("invalid_canonical_core");
  });

  it("repo-spec warns on missing role assignments during pilot migration", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.missing-role.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_role_assignment");
  });

  it("repo-spec warns on missing recommended SOC2 categories during pilot migration", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.missing-soc2.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_soc2_category");
  });

  it("repo-spec accepts lightweight repo_id scaffolds with warnings instead of hard-failing", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.lightweight-aun.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_recommended_key");
    expect(result.json.reasons.map((reason: any) => reason.code)).not.toContain("invalid_repo_id");
  });

  it("repo-spec warns when shared_terminology is empty", () => {
    const result = run("scripts/shirube/check-repo-spec.mjs", ["--fixture", fixture("repo-spec.empty-terminology.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("empty_shared_terminology");
  });

  it("planning blocks missing premise_ref", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.missing-premise.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_premise_ref");
  });

  it("blocked checks emit the canonical remediation contract", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.missing-premise.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.remediation_contract).toEqual(
      expect.objectContaining({
        verdict: "BLOCK",
        current_phase: expect.any(String),
        blocked_reason: expect.any(String),
        missing_prerequisites: expect.any(Array),
        required_next_actions: expect.any(Array),
        responsible_role: expect.any(String),
        allowed_next_phases: expect.any(Array),
        forbidden_next_phases: expect.any(Array),
        required_evidence: expect.any(Array),
        observed_evidence: expect.any(Array),
        reference_docs: expect.any(Array),
      }),
    );
    expect(result.json.remediation_contract.missing_prerequisites).toContain("missing_premise_ref");
    expect(result.json.remediation_contract.forbidden_next_phases).toContain("MERGED");
  });

  it("planning blocks unconfirmed premise_ref", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.unconfirmed-premise.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_premise_confirmation");
  });

  it("planning blocks missing inventory evidence", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.missing-inventory.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_inventory_ref");
  });

  it("planning warns on missing owner confirmation", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.missing-owner.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("WARN");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("missing_owner_confirmation");
  });

  it("planning passes when premise, inventory, and owner evidence exist", () => {
    const result = run("scripts/shirube/check-planning.mjs", ["--fixture", fixture("planning.pass.json")]);
    expect(result.json.verdict).toBe("PASS");
  });

  it("trace passes when every requirement is covered", () => {
    const result = run("scripts/shirube/check-trace.mjs", ["--fixture", fixture("trace.pass.json")]);
    expect(result.json.verdict).toBe("PASS");
  });

  it("trace blocks uncovered requirements", () => {
    const result = run("scripts/shirube/check-trace.mjs", ["--fixture", fixture("trace.uncovered.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("uncovered_requirement");
  });

  it("trace blocks orphan Cell requirement mappings", () => {
    const result = run("scripts/shirube/check-trace.mjs", ["--fixture", fixture("trace.orphan.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("orphan_cell_requirement");
  });

  it("trace blocks Cell records missing allowed_paths or risk_tier", () => {
    const result = run("scripts/shirube/check-trace.mjs", ["--fixture", fixture("trace.bad-cell.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toEqual(
      expect.arrayContaining(["cell_missing_risk_tier", "cell_missing_allowed_paths"]),
    );
  });

  it("phase passes allowed transitions", () => {
    const result = run("scripts/shirube/check-phase.mjs", ["--fixture", fixture("phase.pass.json")]);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.allowed_next_phases).toContain("REPO_SPEC_CONFIRMED");
  });

  it("phase blocks invalid transitions", () => {
    const result = run("scripts/shirube/check-phase.mjs", ["--fixture", fixture("phase.invalid.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("invalid_phase_transition");
  });

  it("phase blocks undeclared current phase", () => {
    const result = run("scripts/shirube/check-phase.mjs", ["--fixture", fixture("phase.missing.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("phase_undeclared");
  });

  it("conformance passes when all controls have impl and test mappings", () => {
    const result = run("scripts/shirube/check-conformance.mjs", ["--fixture", fixture("conformance.pass.json")]);
    expect(result.json.verdict).toBe("PASS");
  });

  it("conformance blocks unmapped controls", () => {
    const result = run("scripts/shirube/check-conformance.mjs", ["--fixture", fixture("conformance.unmapped.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("control_unmapped");
  });

  it("conformance blocks implementation-status meaning judgments", () => {
    const result = run("scripts/shirube/check-conformance.mjs", ["--fixture", fixture("conformance.meaning.json")]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.code)).toContain("meaning_judgment_in_matrix");
  });

  it("readiness controller aggregates repo-spec and planning gates", () => {
    const result = run("scripts/shirube/controller.mjs", [
      "readiness",
      "--repo-spec-fixture",
      fixture("repo-spec.pass.json"),
      "--planning-fixture",
      fixture("planning.pass.json"),
    ]);
    expectGateShape(result);
    expect(result.json.verdict).toBe("PASS");
  });

  it("dev-loop controller aggregates trace, phase, and conformance gates", () => {
    const result = run("scripts/shirube/controller.mjs", [
      "dev-loop",
      "--trace-fixture",
      fixture("trace.pass.json"),
      "--phase-fixture",
      fixture("phase.pass.json"),
      "--conformance-fixture",
      fixture("conformance.pass.json"),
    ]);
    expect(result.json.verdict).toBe("PASS");
  });

  it("change-flow controller blocks governed changes without spec and Cell artifacts", () => {
    const result = run("scripts/shirube/controller.mjs", [
      "change-flow",
      "--repo-spec-fixture",
      fixture("repo-spec.pass.json"),
      "--trace-fixture",
      fixture("trace.pass.json"),
      "--phase-fixture",
      fixture("phase.pass.json"),
      "--conformance-fixture",
      fixture("conformance.pass.json"),
      "--changed-files",
      fixture("changed-files.block.txt"),
    ]);
    expect(result.json.verdict).toBe("BLOCK");
    expect(result.json.reasons.map((reason: any) => reason.gate)).toContain("change-flow");
  });

  it("change-flow controller passes governed changes with spec and Cell artifacts", () => {
    const result = run("scripts/shirube/controller.mjs", [
      "change-flow",
      "--repo-spec-fixture",
      fixture("repo-spec.pass.json"),
      "--trace-fixture",
      fixture("trace.pass.json"),
      "--phase-fixture",
      fixture("phase.pass.json"),
      "--conformance-fixture",
      fixture("conformance.pass.json"),
      "--changed-files",
      fixture("changed-files.pass.txt"),
    ]);
    expect(result.json.verdict).toBe("PASS");
  });
});
