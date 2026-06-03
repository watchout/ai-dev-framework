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

  it.each([
    "no audit",
    "not required",
    "without audit",
    "audit requested #283",
    "audit pending #283",
    "requested audit #283",
    "pending audit #283",
    "L3 audit requested #283",
    "L3 audit pending https://github.com/watchout/ai-dev-framework/pull/283",
  ])(
    "blocks R3 merge-ready claims with non-concrete audit refs: %s",
    (auditRefs) => {
      const result = validatePrEvidence(
        [
          {
            path: "pr.md",
            content: validEvidence({
              "Risk class": "R3",
              "Lane": "Governed",
              "Delivery strategy": "phase_conveyor",
              "Audit timing": "before_merge",
              "Merge readiness": "merge_ready",
              "Audit refs": auditRefs,
            }),
          },
        ],
        { mode: "strict" },
      );

      expect(result.status).toBe("BLOCK");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          severity: "BLOCK",
          type: "unsafe_merge_ready_claim",
          field: "audit_refs",
        }),
      );
    },
  );

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

  it.each([
    {
      auditRefs: "no audit",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "no approval",
    },
    {
      auditRefs: "audit not required",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "approval not required",
    },
    {
      auditRefs: "without audit",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "without approval",
    },
    {
      auditRefs: "audit requested #283",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "audit pending #283",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "requested audit #283",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "pending audit #283",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "L3 audit requested #283",
      approvalRefs: "CTO approval PASS",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "approval requested #283",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "approval pending #283",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "requested approval #283",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "pending approval #283",
    },
    {
      auditRefs: "L3 audit PASS",
      approvalRefs: "CTO approval pending #283",
    },
    {
      auditRefs: "L3 audit requested https://github.com/watchout/ai-dev-framework/pull/283",
      approvalRefs: "CTO approval pending https://github.com/watchout/ai-dev-framework/pull/283",
    },
  ])(
    "blocks R4 merge-ready claims with non-concrete refs: $auditRefs / $approvalRefs",
    ({ auditRefs, approvalRefs }) => {
      const result = validatePrEvidence(
        [
          {
            path: "pr.md",
            content: validEvidence({
              "Risk class": "R4",
              "Lane": "Stop",
              "Delivery strategy": "serial_gate",
              "Audit timing": "before_execution",
              "Merge readiness": "merge_ready",
              "Audit refs": auditRefs,
              "Approval refs": approvalRefs,
            }),
          },
        ],
        { mode: "strict" },
      );

      expect(result.status).toBe("BLOCK");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          severity: "BLOCK",
          type: "unsafe_merge_ready_claim",
          field: "approval_refs",
        }),
      );
    },
  );

  it("passes R3/R4 merge-ready claims with concrete refs", () => {
    const r3 = validatePrEvidence(
      [
        {
          path: "r3.md",
          content: validEvidence({
            "Risk class": "R3",
            "Lane": "Governed",
            "Delivery strategy": "phase_conveyor",
            "Audit timing": "before_merge",
            "Merge readiness": "merge_ready",
            "Audit refs": "L2 audit PASS #283",
          }),
        },
      ],
      { mode: "strict" },
    );
    const r4 = validatePrEvidence(
      [
        {
          path: "r4.md",
          content: validEvidence({
            "Risk class": "R4",
            "Lane": "Stop",
            "Delivery strategy": "serial_gate",
            "Audit timing": "before_execution",
            "Merge readiness": "merge_ready",
            "Audit refs": "L3 audit PASS #283",
            "Approval refs": "CTO approval PASS #283",
          }),
        },
      ],
      { mode: "strict" },
    );

    expect(r3.status).toBe("PASS");
    expect(r4.status).toBe("PASS");
  });
});
