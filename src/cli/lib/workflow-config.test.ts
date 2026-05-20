import { describe, expect, it } from "vitest";
import {
  createDefaultFrameworkConfig,
  evaluatePublishWorkflow,
  resolveRequiredRoles,
  canGenerateLocalDraft,
  type FrameworkConfig,
  type RequiredRoleName,
  type RoleBinding,
} from "./workflow-config.js";

const roles: RequiredRoleName[] = [
  "architecture_owner",
  "implementation_lead",
  "reviewer",
  "auditor",
  "release_owner",
  "human_approver",
  "worker_pool",
];

function completeBindings(): Record<RequiredRoleName, RoleBinding> {
  return Object.fromEntries(
    roles.map((role) => [
      role,
      {
        type: role === "worker_pool" ? "local_agent" : "human",
        id: `${role}-target`,
      },
    ]),
  ) as Record<RequiredRoleName, RoleBinding>;
}

describe("workflow config", () => {
  it("creates generic role placeholders without internal names", () => {
    const config = createDefaultFrameworkConfig();
    const serialized = JSON.stringify(config);

    expect(config.workflow?.publishPolicy).toBe("draft_only");
    expect(config.workflow?.outputs).toEqual(["local_files"]);
    expect(config.roles?.bindings?.architecture_owner?.placeholder).toBe(true);
    expect(serialized).not.toMatch(/iyasaka|watchout|repo lead/i);
    expect(serialized).not.toMatch(/\b(ARC|CTO)\b/);
  });

  it("returns setup_required for placeholder bindings", () => {
    const result = resolveRequiredRoles(createDefaultFrameworkConfig());

    expect(result.status).toBe("setup_required");
    if (result.status === "setup_required") {
      expect(result.placeholderRoles).toEqual(roles);
      expect(result.missingRoles).toEqual([]);
    }
  });

  it("returns setup_required for missing bindings", () => {
    const config: FrameworkConfig = {
      roles: {
        bindings: {
          reviewer: { type: "human", id: "maintainer" },
        },
      },
    };

    const result = resolveRequiredRoles(config);

    expect(result.status).toBe("setup_required");
    if (result.status === "setup_required") {
      expect(result.missingRoles).toContain("architecture_owner");
      expect(result.missingRoles).toContain("worker_pool");
      expect(result.placeholderRoles).toEqual([]);
    }
  });

  it("resolves complete bindings", () => {
    const result = resolveRequiredRoles({
      roles: { bindings: completeBindings() },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.bindings.auditor.id).toBe("auditor-target");
    }
  });

  it("allows local draft generation with local_files output", () => {
    expect(canGenerateLocalDraft(createDefaultFrameworkConfig())).toEqual({
      status: "allowed",
    });
  });

  it("blocks remote publishing in draft_only mode", () => {
    const result = evaluatePublishWorkflow({
      roles: { bindings: completeBindings() },
      workflow: { publishPolicy: "draft_only", outputs: ["local_files"] },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "publish_policy_draft_only",
    });
  });

  it("blocks approval_required publish until human approval happens", () => {
    const result = evaluatePublishWorkflow({
      roles: { bindings: completeBindings() },
      workflow: {
        publishPolicy: "approval_required",
        outputs: ["local_files", "github"],
      },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "approval_required",
    });
  });

  it("allows auto_publish only when roles and github output are configured", () => {
    expect(
      evaluatePublishWorkflow({
        roles: { bindings: completeBindings() },
        workflow: {
          publishPolicy: "auto_publish",
          outputs: ["local_files", "github"],
        },
      }),
    ).toEqual({ status: "allowed" });

    expect(
      evaluatePublishWorkflow({
        roles: { bindings: completeBindings() },
        workflow: {
          publishPolicy: "auto_publish",
          outputs: ["local_files"],
        },
      }),
    ).toEqual({
      status: "blocked",
      reason: "github_output_required",
    });
  });
});
