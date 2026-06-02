import { describe, expect, it } from "vitest";
import { validateGovernanceBone } from "./governance-bone-validator.js";

const completeGovernanceIssue = `
## Governance Bone

- Goal: Ship a governed hotel workflow.
- Phase: Phase 1 internal adoption.
- Work Order: WO-HOTEL-001.
- Risk classification: medium.
- PR slice: Slice 1.
- Script/gate owner: Shirube warning-mode gate.
- Action tools: not applicable.
- Context evidence: Kodama context-pack/v1.
- Memory/recovery evidence: Wasurezu recovery-pack/v1.
- Approval policy: human approval required for customer data mutation.
- Audit evidence: AUN audit ref.
- Rollback/replay: replay from audit refs and revert PR.
`;

describe("validateGovernanceBone", () => {
  it("passes documents with all governance bone fields", () => {
    const result = validateGovernanceBone(
      [{ path: "issue.md", content: completeGovernanceIssue }],
      { mode: "strict", requireGovernanceBone: true },
    );

    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("warns in warning mode when required governance fields are missing", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "issue.md",
          content: "This Work Order changes a customer data mutation flow.",
        },
      ],
      { mode: "warning" },
    );

    expect(result.governanceDetected).toBe(true);
    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_field",
        field: "Goal",
      }),
    );
  });

  it("blocks in strict mode when required governance fields are missing", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "issue.md",
          content: "This Work Order changes a customer data mutation flow.",
        },
      ],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "Approval policy",
      }),
    );
  });

  it("uses strict mode automatically for high-risk work", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "issue.md",
          content: "This Work Order changes a customer data mutation flow.",
        },
      ],
      { risk: "high" },
    );

    expect(result.mode).toBe("strict");
    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "Risk classification",
      }),
    );
  });

  it("allows explicit warning mode for high-risk warning-first adoption", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "issue.md",
          content: "This Work Order changes a customer data mutation flow.",
        },
      ],
      { mode: "warning", risk: "high" },
    );

    expect(result.mode).toBe("warning");
    expect(result.status).toBe("WARNING");
  });

  it("treats profile-specific product terms as governance triggers", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "issue.md",
          content: "Update guest reservation recovery behavior.",
        },
      ],
      { profile: "hotel" },
    );

    expect(result.governanceDetected).toBe(true);
    expect(result.status).toBe("WARNING");
  });

  it("accepts PR evidence aliases for the governance bone fields", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "pull-request.md",
          content: `
## Governance Evidence

- Work Order: WO-001.
- Gate profile: warning.
- Context pack: context-pack/v1.
- Recovery pack: recovery-pack/v1.
- Tool execution policy: read-only.
- Human approval: required for risky changes.
- Verification: tests and gate check.
- Audit refs: audit-log/v1.

## Control Hierarchy

- Goal: Govern hotel work.
- Phase: Phase 1.
- PR / Change Slice: Slice 1.
- Scripted Step: deterministic Shirube check.
- Tool Execution: not applicable.
- Evidence / Audit Record: audit-log/v1.

## Risk And Scope

- Risk classification: medium.
- Customer data impact: none.
- External mutation impact: none.
- Runtime/queue impact: none.
- Security/privacy impact: none.
- Rollback/replay: revert PR.
`,
        },
      ],
      { mode: "strict", requireGovernanceBone: true },
    );

    expect(result.status).toBe("PASS");
  });

  it("does not require governance fields for unrelated copy-only changes", () => {
    const result = validateGovernanceBone([
      {
        path: "docs.md",
        content: "This copy-only change fixes a typo in static documentation.",
      },
    ]);

    expect(result.governanceDetected).toBe(false);
    expect(result.status).toBe("PASS");
  });

  it("blocks designs that assign flow authority to LLM output", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "spec.md",
          content: `${completeGovernanceIssue}
The LLM owns Work Order approval and advances the gate.`,
        },
      ],
      { mode: "warning" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "llm_owns_flow" }),
    );
  });

  it("blocks silent fallback for missing evidence", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "spec.md",
          content: `${completeGovernanceIssue}
If approval evidence is missing, continue by silent fallback.`,
        },
      ],
      { mode: "warning" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "silent_fallback" }),
    );
  });

  it("does not block explicit LLM ownership prohibition text", () => {
    const result = validateGovernanceBone(
      [
        {
          path: "spec.md",
          content: `${completeGovernanceIssue}
The LLM must not own action-tool approval or external mutation authority.`,
        },
      ],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
  });
});
