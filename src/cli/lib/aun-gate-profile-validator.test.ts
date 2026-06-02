import { describe, expect, it } from "vitest";
import { validateAunGateProfile } from "./aun-gate-profile-validator.js";

const completeGovernanceBone = `
## Governance Bone

- Goal: Prepare Aun Gate Lite without live execution.
- Phase: Phase 1 profile preparation.
- Work Order: WO-AUN-GATE-001.
- Risk classification: high.
- PR slice: PR-2 policy evaluator.
- Script/gate owner: Shirube deterministic check.
- Action tools: no live execution.
- Context evidence: Kodama context labels are evidence only.
- Memory/recovery evidence: Wasurezu recovery refs are evidence only.
- Approval policy: human approval is required for live execution.
- Audit evidence: audit refs are required.
- Rollback/replay: revert PR and replay fixtures.
`;

const completePolicyEvaluator = `
${completeGovernanceBone}

## Aun Gate Lite Profile

- Aun Gate PR class: policy_evaluator.
- Live execution boundary: no live execution in this PR.
- Deterministic test evidence: policy evaluator fixtures and unit tests.
- Policy fixtures: allow, deny, pending approval, blocked.
- Deny/allow decisions: deterministic decision matrix.
`;

describe("validateAunGateProfile", () => {
  it("passes a complete strict policy evaluator profile", () => {
    const result = validateAunGateProfile(
      [{ path: "pr.md", content: completePolicyEvaluator }],
      { prClass: "policy_evaluator" },
    );

    expect(result.mode).toBe("strict");
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("warns by default for schema/migration profile gaps", () => {
    const result = validateAunGateProfile(
      [
        {
          path: "pr.md",
          content: `${completeGovernanceBone}
- Aun Gate PR class: schema_migration.
- Live execution boundary: no live execution.
`,
        },
      ],
      { prClass: "schema_migration" },
    );

    expect(result.mode).toBe("warning");
    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        field: "Schema/migration evidence",
      }),
    );
  });

  it("blocks strict execution ledger work without runtime stability evidence", () => {
    const result = validateAunGateProfile(
      [
        {
          path: "pr.md",
          content: `${completeGovernanceBone}
- Aun Gate PR class: execution_ledger.
- Live execution boundary: no live execution until the stability gate passes.
- Execution attempt ledger: attempt-ledger/v1.
- Approval evidence: approval refs required.
- Audit evidence: audit refs required.
- Rollback/replay: replay from audit refs.
`,
        },
      ],
      { prClass: "execution_ledger" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        field: "Runtime stability prerequisite",
      }),
    );
  });

  it("blocks live execution before runtime stability even in warning mode", () => {
    const result = validateAunGateProfile(
      [
        {
          path: "pr.md",
          content: `${completeGovernanceBone}
- Aun Gate PR class: schema_migration.
- Live execution boundary: enable live execution before runtime stability passes.
- Schema/migration evidence: migration plan.
- Migration rollback: rollback SQL.
`,
        },
      ],
      { prClass: "schema_migration", mode: "warning" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "live_execution_without_stability" }),
    );
  });

  it("blocks cross-repository authority substitution", () => {
    const result = validateAunGateProfile(
      [
        {
          path: "pr.md",
          content: `${completePolicyEvaluator}
Kodama authorizes execution decisions for Aun Gate policy.
`,
        },
      ],
      { prClass: "policy_evaluator", mode: "warning" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "forbidden_authority" }),
    );
  });
});
