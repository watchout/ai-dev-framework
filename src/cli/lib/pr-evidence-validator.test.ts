import { describe, expect, it } from "vitest";
import { validatePrEvidence } from "./pr-evidence-validator.js";

function validEvidence(overrides: Record<string, string> = {}): string {
  const fields = {
    "Work Order": "SHIRUBE-CONVEYOR-001",
    "Delivery strategy": "pr_conveyor",
    "Lane": "Fast",
    "Risk class": "R2",
    "Audit timing": "after_pr",
    "Queue state": "audit_pending",
    "Runner identity": "codex",
    "Runtime mode": "codex exec",
    "Implementation owner": "Shirube repo maintainer",
    "Review owner": "Shirube reviewer",
    "Audit owner": "Shirube audit owner",
    "Merge authority": "Shirube repo maintainer",
    "Changed files": "src/cli/lib/pr-evidence-validator.ts",
    "Verification commands": "npm test -- pr-evidence",
    "Verification results": "PASS",
    "Residual risk": "warning-first migration only",
    "Stop conditions encountered": "none",
    "Merge readiness": "audit_pending",
    ...overrides,
  };

  return Object.entries(fields)
    .map(([field, value]) => `- ${field}: ${value}`)
    .join("\n");
}

describe("validatePrEvidence", () => {
  it("passes complete R0-R2 audit-pending evidence", () => {
    const result = validatePrEvidence(
      [{ path: "pr.md", content: validEvidence() }],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("warns in warning mode when required fields are missing", () => {
    const result = validatePrEvidence([
      { path: "pr.md", content: validEvidence({ "Runner identity": "TBD" }) },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_field",
        field: "runner_identity",
      }),
    );
  });

  it("blocks in strict mode when required fields are missing", () => {
    const result = validatePrEvidence(
      [{ path: "pr.md", content: validEvidence({ "Runner identity": "TBD" }) }],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "runner_identity",
      }),
    );
  });

  it("blocks R3 after-pr audit timing", () => {
    const result = validatePrEvidence([
      {
        path: "pr.md",
        content: validEvidence({
          "Risk class": "R3",
          "Lane": "Governed",
          "Delivery strategy": "phase_conveyor",
          "Audit timing": "after_pr",
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_audit_timing",
        field: "audit_timing",
      }),
    );
  });

  it("blocks R3 merge-ready claims without audit refs", () => {
    const result = validatePrEvidence([
      {
        path: "pr.md",
        content: validEvidence({
          "Risk class": "R3",
          "Lane": "Governed",
          "Delivery strategy": "phase_conveyor",
          "Audit timing": "before_merge",
          "Merge readiness": "merge_ready",
          "Audit refs": "TBD",
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_merge_ready_claim",
        field: "audit_refs",
      }),
    );
  });

  it("blocks R4 merge-ready claims without approval refs", () => {
    const result = validatePrEvidence([
      {
        path: "pr.md",
        content: validEvidence({
          "Risk class": "R4",
          "Lane": "Stop",
          "Delivery strategy": "serial_gate",
          "Audit timing": "before_execution",
          "Merge readiness": "merge_ready",
          "Audit refs": "L3 audit PASS",
          "Approval refs": "TBD",
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unsafe_merge_ready_claim",
        field: "approval_refs",
      }),
    );
  });
});
