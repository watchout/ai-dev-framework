import { describe, expect, it } from "vitest";
import {
  buildProfiledConveyorRoleView,
  hashConveyorProfile,
  normalizeConveyorProfileRole,
  summarizeConveyorProfile,
  type ConveyorProjectProfile,
} from "./conveyor-profile.js";
import type { ConveyorManifestInput } from "./conveyor-manifest.js";

const frameworkRepo = "watchout/ai-dev-framework";
const memoryRepo = "watchout/agent-memory";
const platformRepo = "watchout/aun-platform";

function profile(): ConveyorProjectProfile {
  return {
    schema: "shirube-conveyor-project-profile/v1",
    profile_id: "wave1-mcp-dev-conveyor-lite",
    profile_version: "2026-06-04.1",
    repo_scope_id: "wave1-mcp-dev-conveyor-lite",
    repositories: [
      { full_name: frameworkRepo, profile: "mcp_framework", product: "shirube", wave: "wave1", enabled: true },
      { full_name: memoryRepo, profile: "mcp_memory", product: "wasurezu", wave: "wave1", enabled: true },
      {
        full_name: platformRepo,
        profile: "saas_ui_platform",
        product: "aun-platform",
        wave: "wave-b",
        enabled: true,
        added_reason: "AUN Platform PRs now enter conveyor audit",
      },
      { full_name: "watchout/disabled-repo", profile: "disabled", enabled: false },
    ],
    role_queries: {
      l1_auditor: {
        include_labels: ["state:impl-l1", "audit:l1-pending"],
        exclude_labels: ["blocked-stop-lane"],
      },
    },
    wip_limits: { l1_auditor: 2 },
    context_recovery: {
      preferred: "wasurezu",
      fallback: "bounded_context_pack",
      require_recovery_before_dispatch: true,
    },
    mutation_authority: {
      labels: "authorized_only",
      comments: "authorized_only",
      check_results: "authorized_only",
      cross_repo_code_edits: "forbidden_without_target_work_order",
    },
  };
}

function manifest(): ConveyorManifestInput {
  return {
    pull_requests: [
      {
        repo: frameworkRepo,
        number: 288,
        head: "head-288",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
      },
      {
        repo: memoryRepo,
        number: 132,
        head: "head-132",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit", "blocked-stop-lane"],
      },
      {
        repo: "watchout/out-of-scope",
        number: 1,
        head: "head-1",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
      },
      {
        repo: "watchout/disabled-repo",
        number: 2,
        head: "head-2",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
      },
    ],
  };
}

describe("conveyor project profile", () => {
  it("normalizes role aliases for role-scoped conveyor views", () => {
    expect(normalizeConveyorProfileRole("l1_auditor")).toBe("l1");
    expect(normalizeConveyorProfileRole("implementation_runner")).toBe("implementation");
    expect(normalizeConveyorProfileRole("shirube_checker")).toBe("checker");
  });

  it("filters targets by enabled repo scope and profile role query", () => {
    const view = buildProfiledConveyorRoleView({
      manifest: manifest(),
      profile: profile(),
      role: "l1_auditor",
    });

    expect(view.schema).toBe("shirube-conveyor-role-view/v1");
    expect(view.profile_role).toBe("l1_auditor");
    expect(view.normalized_role).toBe("l1");
    expect(view.targets.map((target) => `${target.repo}#${target.number}`)).toEqual([
      `${frameworkRepo}#288`,
    ]);
    expect(view.targets[0].reason_codes).toContain("repo_profile:mcp_framework");
    expect(view.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: memoryRepo,
          pr: 132,
          reason_codes: ["profile_role_query_excluded"],
        }),
      ]),
    );
  });

  it("reports repository scope changes including the AUN Platform profile", () => {
    const current = profile();
    const previous: ConveyorProjectProfile = {
      ...current,
      repositories: current.repositories.filter((repository) => repository.full_name !== platformRepo),
    };
    const summary = summarizeConveyorProfile(current, previous);

    expect(summary.profile_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(summary.scope_changes).toEqual([
      {
        kind: "added",
        repo: platformRepo,
        profile: "saas_ui_platform",
        reason: "AUN Platform PRs now enter conveyor audit",
      },
    ]);
  });

  it("uses stable profile hashing independent of object key order", () => {
    const left = profile();
    const right = {
      profile_version: left.profile_version,
      schema: left.schema,
      repositories: left.repositories,
      repo_scope_id: left.repo_scope_id,
      profile_id: left.profile_id,
      mutation_authority: left.mutation_authority,
      context_recovery: left.context_recovery,
      wip_limits: left.wip_limits,
      role_queries: left.role_queries,
    } as ConveyorProjectProfile;

    expect(hashConveyorProfile(left)).toBe(hashConveyorProfile(right));
  });
});
