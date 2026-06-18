import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPreflightLite, validateExternalGateVerdictText } from "../scripts/preflight-lite";

const files: Record<string, string> = {
  "phase-plan.yml": `
schema_version: shirube-phase-plan/v1
phase_id: shirube-3.0-phase-1-preflight-lite
status: planned
`,
  "cell-plan.preflight-lite.yml": `
schema_version: shirube-cell-plan/v1
cell_id: shirube-3.0-preflight-lite-cell-1
phase_refs:
  - shirube-3.0-phase-1-preflight-lite
risk_class: R3
required_gates:
  before_goal_mode:
    - design_consolidation_enterprise_fit_gate
release_owner: watchout
merge_executor: watchout
evidence_sink:
  - docs/spec/shirube/phase-1/
`,
  "design-consolidation-gate-request.yml": `
schema_version: shirube-design-consolidation-gate-request/v1
cell_id: shirube-3.0-preflight-lite-cell-1
requested_checks:
  - canonical_flow_complete
evidence_sink:
  - docs/spec/shirube/phase-1/design-consolidation-gate-record.yml
`,
  "design-consolidation-gate-record.yml": `
schema_version: shirube-design-consolidation-gate/v1
cell_id: shirube-3.0-preflight-lite-cell-1
external_gate_bootstrap_exception: true
external_gate_v0_ref: https://github.com/watchout/ai-dev-framework/issues/418#issuecomment-4738894749
checks:
  canonical_flow_complete: PASS
  architecture_ownership_defined: PASS
  responsibility_boundaries_defined: PASS
  vocabulary_consistent: PASS
  protected_surfaces_identified: PASS
  risk_not_underestimated: WARN
  authority_boundaries_defined: PASS
  machine_evidence_primary: PASS
  ai_review_advisory_only: PASS
  old_audit_conveyor_not_reintroduced: PASS
  merge_authority_separated: PASS
  stop_conditions_defined: PASS
  rollback_evidence_explainable: PASS
verdict: WARN
allowed_next_action: cell_intake
evidence_sink:
  - docs/spec/shirube/phase-1/design-consolidation-gate-record.yml
`,
  "cell-intake-gate-record.yml": `
schema_version: shirube-cell-intake-gate/v1
cell_id: shirube-3.0-preflight-lite-cell-1
phase_refs:
  - shirube-3.0-phase-1-preflight-lite
risk_class: R3
required_gates:
  before_goal_mode:
    - design_consolidation_enterprise_fit_gate
    - cell_intake_gate
    - security_or_domain_approval
release_owner: watchout
merge_executor: watchout
evidence_sink:
  - docs/spec/shirube/phase-1/
verdict: PASS
allowed_next_action: goal_mode_implementation
`,
  "machine-gate-record.yml": `
schema_version: shirube-machine-gate-record/v1
cell_id: shirube-3.0-preflight-lite-cell-1
status: pending
evidence_sink:
  - docs/spec/shirube/phase-1/machine-gate-record.yml
`,
  "narrow-verification-record.yml": `
schema_version: shirube-narrow-verification-record/v1
cell_id: shirube-3.0-preflight-lite-cell-1
status: pending
evidence_sink:
  - docs/spec/shirube/phase-1/narrow-verification-record.yml
`,
  "runner-handoff.yml": `
schema_version: shirube-runner-handoff/v1
runner: codex
cell_id: shirube-3.0-preflight-lite-cell-1
design_consolidation_gate_ref: docs/spec/shirube/phase-1/design-consolidation-gate-record.yml
cell_intake_gate_ref: docs/spec/shirube/phase-1/cell-intake-gate-record.yml
evidence_sink:
  - docs/spec/shirube/phase-1/
`,
  "runner-result.yml": `
schema_version: shirube-runner-result/v1
cell_id: shirube-3.0-preflight-lite-cell-1
status: pending
evidence_refs: []
`,
  "post-merge-evidence.yml": `
schema_version: shirube-post-merge-evidence/v1
cell_id: shirube-3.0-preflight-lite-cell-1
status: pending
evidence_sink:
  - docs/spec/shirube/phase-1/post-merge-evidence.yml
`,
};

function withFixture(overrides: Record<string, string | null> = {}): { root: string; phaseDir: string; cleanup: () => void } {
  const root = path.join(tmpdir(), `preflight-lite-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const phaseDir = path.join(root, "docs", "spec", "shirube", "phase-1");
  mkdirSync(phaseDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    const value = Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : content;
    if (value !== null) writeFileSync(path.join(phaseDir, name), value.trimStart());
  }

  return {
    root,
    phaseDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("preflight-lite", () => {
  it("passes a complete structured evidence set", () => {
    const fixture = withFixture();
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("PASS");
      expect(report.allowed_next_action).toBe("goal_mode_implementation");
      expect(report.findings).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks when a canonical evidence file is missing", () => {
    const fixture = withFixture({ "phase-plan.yml": null });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.some((finding) => finding.code === "missing_required_file")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks malformed evidence files", () => {
    const fixture = withFixture({ "phase-plan.yml": "this is natural language, not a structured record\n" });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.some((finding) => finding.code === "malformed_record")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks when Design Consolidation Gate evidence is missing", () => {
    const fixture = withFixture({ "design-consolidation-gate-record.yml": null });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.some((finding) => finding.code === "missing_required_file")).toBe(true);
      expect(report.findings.some((finding) => finding.code === "missing_design_before_intake")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks when Cell Intake Gate evidence is missing", () => {
    const fixture = withFixture({ "cell-intake-gate-record.yml": null });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.some((finding) => finding.code === "missing_required_file")).toBe(true);
      expect(report.findings.some((finding) => finding.code === "missing_intake_before_handoff")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks when required owner, executor, or evidence sink fields are placeholders or missing", () => {
    const fixture = withFixture({
      "cell-intake-gate-record.yml": files["cell-intake-gate-record.yml"]
        .replace("release_owner: watchout", "release_owner: <actor>")
        .replace("merge_executor: watchout", "merge_executor: null")
        .replace("evidence_sink:", "missing_evidence_sink:"),
    });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.filter((finding) => finding.code === "missing_concrete_field").length).toBeGreaterThanOrEqual(3);
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks invalid External Gate v0 verdict format", () => {
    const findings = validateExternalGateVerdictText(`
\`\`\`yaml
schema_version: shirube-external-gate-verdict/v0
overall: MAYBE
allowed_next_action: improvise
\`\`\`
`);
    expect(findings.map((finding) => finding.code)).toContain("invalid_external_gate_v0");
  });

  it("does not infer semantic-recorded checks from natural-language prose", () => {
    const fixture = withFixture({
      "design-consolidation-gate-record.yml": `
schema_version: shirube-design-consolidation-gate/v1
cell_id: shirube-3.0-preflight-lite-cell-1
external_gate_bootstrap_exception: true
external_gate_v0_ref: https://github.com/watchout/ai-dev-framework/issues/418#issuecomment-4738894749
summary: architecture ownership, machine evidence, old audit conveyor, and merge authority look good in prose
verdict: WARN
allowed_next_action: cell_intake
evidence_sink:
  - docs/spec/shirube/phase-1/design-consolidation-gate-record.yml
`,
    });
    try {
      const report = runPreflightLite({ repoRoot: fixture.root });
      expect(report.verdict).toBe("BLOCK");
      expect(report.findings.some((finding) => finding.code === "missing_required_field" && finding.message.includes("checks"))).toBe(true);
      expect(report.findings.some((finding) => finding.code === "missing_semantic_record_field")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});
