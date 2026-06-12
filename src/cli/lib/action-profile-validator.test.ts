import { describe, expect, it } from "vitest";
import { validateActionProfiles } from "./action-profile-validator.js";

function validProfile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      profile_version: "0.1.0",
      product: "totonoe",
      owner_repo: "watchout/totonoe",
      surfaces: [
        {
          surface_id: "totonoe.quality_issue.intake",
          surface_type: "api_endpoint",
          display_name: "Quality Issue Intake",
          description: "Create a room quality issue.",
          capability_classes: ["write"],
          risk_level: "high",
          boundary: {
            standalone_required: true,
            state_owner: "totonoe",
            execution_owner: "totonoe",
            policy_owner: "totonoe",
            audit_owner: "totonoe",
            interop_modes: ["command_request"],
            allowed_dependencies: ["signed_command_request"],
            forbidden_dependencies: [
              "direct_db_write",
              "shared_internal_state",
              "shared_credentials",
            ],
            direct_db_access_to_other_products: false,
            receiving_product_revalidates: true,
          },
          resource_scope: {
            tenant_scoped: true,
            resource_patterns: ["quality_issue:*"],
            data_categories: ["quality_issue"],
          },
          identity_requirements: {
            actor_required: true,
            agent_id_required: false,
            human_user_required: false,
            service_account_allowed: true,
          },
          context_requirements: {
            context_pack_required: false,
            required_labels: ["tenant_scope"],
            denied_labels: [],
            prompt_injection_check_required: false,
          },
          memory_requirements: {
            recovery_pack_required: false,
            approval_note_required: false,
            human_intent_ref_required: false,
          },
          approval_policy: {
            approval_required: false,
            approver_role: null,
            approval_ttl_seconds: null,
            reuse_allowed: false,
          },
          audit_policy: {
            audit_required: true,
            input_summary_required: true,
            output_summary_required: true,
            mutation_summary_required: true,
            egress_summary_required: false,
            redaction_required: true,
          },
          rollback_policy: {
            rollback_required: true,
            rollback_kind: "compensating_action",
            replay_supported: true,
          },
          execution_policy: {
            dry_run_supported: true,
            idempotency_key_required: true,
            rate_limit_policy: "per-tenant",
            timeout_seconds: 30,
          },
          ...overrides,
        },
      ],
    },
    null,
    2,
  );
}

describe("validateActionProfiles", () => {
  it("passes a complete standalone profile", () => {
    const result = validateActionProfiles(
      [{ path: "profile.json", content: validProfile() }],
      { mode: "strict" },
    );

    expect(result.status).toBe("PASS");
    expect(result.checkedSurfaces).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("warns in warning mode when required profile fields are missing", () => {
    const result = validateActionProfiles([
      {
        path: "profile.json",
        content: validProfile({ audit_policy: undefined }),
      },
    ]);

    expect(result.status).toBe("WARNING");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "WARNING",
        type: "missing_field",
        field: "surfaces[0].audit_policy",
      }),
    );
  });

  it("blocks in strict mode when required profile fields are missing", () => {
    const result = validateActionProfiles(
      [
        {
          path: "profile.json",
          content: validProfile({ audit_policy: undefined }),
        },
      ],
      { mode: "strict" },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        type: "missing_field",
        field: "surfaces[0].audit_policy",
      }),
    );
  });

  it("blocks command requests that do not require receiving-product revalidation", () => {
    const result = validateActionProfiles([
      {
        path: "profile.json",
        content: validProfile({
          boundary: {
            standalone_required: true,
            state_owner: "ai_concierge",
            execution_owner: "ai_concierge",
            policy_owner: "ai_concierge",
            audit_owner: "ai_concierge",
            interop_modes: ["command_request"],
            allowed_dependencies: ["signed_command_request"],
            forbidden_dependencies: [
              "direct_db_write",
              "shared_internal_state",
              "shared_credentials",
            ],
            direct_db_access_to_other_products: false,
            receiving_product_revalidates: false,
          },
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: "missing_revalidation" }),
    );
  });

  it("blocks direct cross-product database access", () => {
    const result = validateActionProfiles([
      {
        path: "profile.json",
        content: validProfile({
          boundary: {
            standalone_required: true,
            state_owner: "pms",
            execution_owner: "pms",
            policy_owner: "pms",
            audit_owner: "pms",
            interop_modes: ["contract_ref"],
            allowed_dependencies: ["remote_api_contract"],
            forbidden_dependencies: [
              "direct_db_write",
              "shared_internal_state",
              "shared_credentials",
            ],
            direct_db_access_to_other_products: true,
            receiving_product_revalidates: false,
          },
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "forbidden_coupling",
        field: "surfaces[0].boundary.direct_db_access_to_other_products",
      }),
    );
  });

  it("blocks profiles that do not forbid shared credentials", () => {
    const result = validateActionProfiles([
      {
        path: "profile.json",
        content: validProfile({
          boundary: {
            standalone_required: true,
            state_owner: "crm",
            execution_owner: "crm",
            policy_owner: "crm",
            audit_owner: "crm",
            interop_modes: ["event"],
            allowed_dependencies: ["event_contract"],
            forbidden_dependencies: ["direct_db_write", "shared_internal_state"],
            direct_db_access_to_other_products: false,
            receiving_product_revalidates: false,
          },
        }),
      },
    ]);

    expect(result.status).toBe("BLOCK");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: "forbidden_coupling",
        message: "forbidden_dependencies must include shared_credentials.",
      }),
    );
  });
});
