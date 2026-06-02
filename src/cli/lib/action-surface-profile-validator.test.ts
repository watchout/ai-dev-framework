import { describe, expect, it } from "vitest";
import { validateActionSurfaceProfiles } from "./action-surface-profile-validator.js";

const completeProfile = {
  surface_id: "wasurezu.recover_context",
  surface_type: "mcp_tool",
  product: "Wasurezu",
  owner_repo: "watchout/agent-memory",
  display_name: "Recover context",
  description: "Restore bounded project recovery context for an agent session.",
  capability_classes: ["read", "reveal"],
  risk_level: "high",
  resource_scope: {
    tenant_scoped: false,
    resource_patterns: ["project:*"],
    data_categories: ["memory", "recovery_context"],
  },
  identity_requirements: {
    actor_required: true,
    agent_id_required: true,
    human_user_required: false,
    service_account_allowed: false,
  },
  context_requirements: {
    context_pack_required: false,
    required_labels: ["project_scope"],
    denied_labels: ["secret"],
    prompt_injection_check_required: false,
  },
  memory_requirements: {
    recovery_pack_required: true,
    approval_note_required: false,
    human_intent_ref_required: false,
  },
  approval_policy: {
    approval_required: true,
    approver_role: "product-owner",
    approval_ttl_seconds: 3600,
    reuse_allowed: false,
  },
  audit_policy: {
    audit_required: true,
    input_summary_required: true,
    output_summary_required: true,
    mutation_summary_required: false,
    egress_summary_required: false,
    redaction_required: true,
  },
  rollback_policy: {
    rollback_required: false,
    rollback_kind: "manual_reconcile",
    replay_supported: true,
  },
  execution_policy: {
    dry_run_supported: false,
    idempotency_key_required: false,
    timeout_seconds: 30,
  },
};

describe("validateActionSurfaceProfiles", () => {
  it("passes a complete stage 1 JSON action surface profile", () => {
    const result = validateActionSurfaceProfiles(
      [{ path: "surfaces.json", content: JSON.stringify({ surfaces: [completeProfile] }) }],
      { mode: "strict", stage: "profile" },
    );

    expect(result.status).toBe("PASS");
    expect(result.surfacesChecked).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("accepts stage 0 inventory rows with minimal fields", () => {
    const result = validateActionSurfaceProfiles(
      [
        {
          path: "inventory.md",
          content: `
| Surface ID | Type | Capability | Risk | Owner repo |
|---|---|---|---|---|
| kodama.get_context | mcp_tool | read, reveal | medium | watchout/kodama |
`,
        },
      ],
      { mode: "strict", stage: "inventory" },
    );

    expect(result.status).toBe("PASS");
    expect(result.surfacesChecked).toBe(1);
  });

  it("warns in stage 1 when profile fields are missing", () => {
    const result = validateActionSurfaceProfiles(
      [
        {
          path: "inventory.md",
          content: `
| Surface ID | Type | Capability | Risk | Owner repo |
|---|---|---|---|---|
| hotel_saas.ai_response.send | api_endpoint | external_send, action | high | watchout/hotel-kanri |
`,
        },
      ],
      { mode: "warning", stage: "profile" },
    );

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        field: "approval_policy",
        surfaceId: "hotel_saas.ai_response.send",
      }),
    );
  });

  it("does not silently pass unknown risk on risky capabilities", () => {
    const result = validateActionSurfaceProfiles(
      [
        {
          path: "surface.json",
          content: JSON.stringify({
            surface_id: "aun.execute_tool",
            surface_type: "agent_action",
            owner_repo: "watchout/agent-comms-mcp",
            capability_classes: ["action"],
          }),
        },
      ],
      { mode: "warning", stage: "inventory" },
    );

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "unknown_risk_for_risky_capability",
        field: "risk_level",
      }),
    );
  });

  it("blocks missing approval and audit policy for strict critical profiles", () => {
    const incomplete = {
      ...completeProfile,
      surface_id: "crm.bulk_outreach.send",
      capability_classes: ["external_send", "action"],
      risk_level: "critical",
      approval_policy: {},
      audit_policy: {
        audit_required: true,
        input_summary_required: true,
        output_summary_required: true,
        mutation_summary_required: false,
        egress_summary_required: false,
        redaction_required: true,
      },
    };

    const result = validateActionSurfaceProfiles(
      [{ path: "surface.json", content: JSON.stringify(incomplete) }],
      { mode: "strict", stage: "profile" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "BLOCK",
          type: "missing_approval_policy",
        }),
        expect.objectContaining({
          severity: "BLOCK",
          type: "missing_audit_policy",
        }),
      ]),
    );
  });
});
