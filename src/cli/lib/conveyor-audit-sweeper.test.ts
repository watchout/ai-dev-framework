import { describe, expect, it } from "vitest";
import { buildConveyorAuditSweeperPlan, type ConveyorAuditSweeperPlan } from "./conveyor-audit-sweeper.js";
import type { ConveyorManifestInput } from "./conveyor-manifest.js";
import type { ConveyorProjectProfile } from "./conveyor-profile.js";

const frameworkRepo = "watchout/ai-dev-framework";
const memoryRepo = "watchout/agent-memory";
const platformRepo = "watchout/aun-platform";

function auditEvidence(input: { repo: string; pr: number; role: string; verdict: string; head: string }): string {
  return [
    "<!-- conveyor:audit-result/v1 -->",
    `repo: ${input.repo}`,
    `pr: ${input.pr}`,
    `role: ${input.role}`,
    `verdict: ${input.verdict}`,
    `head: ${input.head}`,
    "base: main",
    "route: standard",
    `next_state_recommendation: ${input.role === "l1" ? "state:impl-l2" : input.role === "l2" ? "state:impl-l3" : "state:done+merge-ready"}`,
    "reported_by: auditor",
    "recorded_at: 2026-06-04T00:00:00.000Z",
  ].join("\n");
}

function manifest(): ConveyorManifestInput {
  return {
    pull_requests: [
      {
        repo: frameworkRepo,
        number: 10,
        head: "head-10",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "foundation-blocker", "risk:R2"],
      },
      {
        repo: frameworkRepo,
        number: 11,
        head: "head-11-new",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "risk:R3"],
        comments: [{ body: auditEvidence({ repo: frameworkRepo, pr: 11, role: "l1", verdict: "PASS", head: "head-11-old" }) }],
      },
      {
        repo: memoryRepo,
        number: 20,
        head: "head-20",
        merge_state: "CLEAN",
        labels: ["state:impl-l2", "audit-pending", "audit:l1-passed", "risk:R1"],
        comments: [{ body: auditEvidence({ repo: memoryRepo, pr: 20, role: "l1", verdict: "PASS", head: "head-20" }) }],
      },
      {
        repo: platformRepo,
        number: 30,
        head: "head-30",
        merge_state: "CLEAN",
        labels: ["state:impl-l3", "audit-pending", "audit:l2-required", "risk:R2"],
        reviews: [{ body: auditEvidence({ repo: platformRepo, pr: 30, role: "l2", verdict: "PASS", head: "head-30-old" }) }],
      },
      {
        repo: "watchout/out-of-scope",
        number: 40,
        head: "head-40",
        merge_state: "CLEAN",
        labels: ["state:impl-l1", "audit-pending", "risk:R2"],
      },
    ],
    config: { dependencies: { [frameworkRepo]: [[10, 11]] } },
  };
}

function profile(): ConveyorProjectProfile {
  return {
    schema: "shirube-conveyor-project-profile/v1",
    profile_id: "wave1-mcp-dev-conveyor-lite",
    profile_version: "2026-06-04.1",
    repo_scope_id: "wave1-with-aun-platform",
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
    ],
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

function target(plan: ConveyorAuditSweeperPlan, repo: string, pr: number) {
  const found = plan.targets.find((item) => item.repo === repo && item.pr === pr);
  expect(found).toBeDefined();
  return found!;
}

describe("conveyor audit sweeper", () => {
  it("builds a read-only cross-repo audit dispatch plan from state labels", () => {
    const current = profile();
    const previous: ConveyorProjectProfile = {
      ...current,
      repositories: current.repositories.filter((repository) => repository.full_name !== platformRepo),
    };
    const plan = buildConveyorAuditSweeperPlan({
      manifest: manifest(),
      profile: current,
      previousProfile: previous,
      level: "all",
    });

    expect(plan.schema).toBe("shirube-conveyor-audit-sweeper-plan/v1");
    expect(plan.authority_notes).toEqual(
      expect.arrayContaining([
        "read_only_audit_dispatch_plan",
        "no_product_implementation_authority",
        "no_merge_authority",
        "no_aun_lifecycle_or_runner_dispatch",
      ]),
    );
    expect(plan.context_recovery?.preferred).toBe("wasurezu");
    expect(plan.profile_scope_changed).toBe(true);
    expect(plan.profile?.scope_changes).toEqual([
      {
        kind: "added",
        repo: platformRepo,
        profile: "saas_ui_platform",
        reason: "AUN Platform PRs now enter conveyor audit",
      },
    ]);
    expect(plan.targets.map((item) => `${item.audit_level}:${item.repo}#${item.pr}`)).toEqual([
      `l1:${frameworkRepo}#10`,
      `l1:${frameworkRepo}#11`,
      `l2:${memoryRepo}#20`,
      `l3:${platformRepo}#30`,
    ]);
    expect(plan.metrics).toEqual(
      expect.objectContaining({
        total_targets: 4,
        by_level: { l1: 2, l2: 1, l3: 1 },
        stop_lane: 1,
        stale_or_missing_evidence: 3,
        dependency_blocked: 1,
        high_risk_or_unclear: 1,
      }),
    );
  });

  it("prioritizes stop-lane work and reports stale exact-head evidence", () => {
    const plan = buildConveyorAuditSweeperPlan({ manifest: manifest(), profile: profile() });
    const first = plan.targets[0];
    const stale = target(plan, frameworkRepo, 11);

    expect(first).toEqual(
      expect.objectContaining({
        repo: frameworkRepo,
        pr: 10,
        priority_bucket: "stop_lane",
        evidence: { status: "missing" },
      }),
    );
    expect(stale.priority_bucket).toBe("stale_or_missing_evidence");
    expect(stale.evidence.status).toBe("stale");
    expect(stale.evidence.stale).toEqual(expect.objectContaining({ head: "head-11-old", verdict: "PASS" }));
    expect(stale.dependency_status).toEqual(
      expect.objectContaining({
        status: "blocked",
        blockers: [expect.objectContaining({ pr: 10, reason: "foundation_blocker" })],
      }),
    );
    expect(stale.recommendations).toEqual(
      expect.arrayContaining(["re_audit_exact_head_required", "review_dependency_watermark_before_final_verdict", "escalate_or_route_l2"]),
    );
  });

  it("reports prior audit exact-head readiness for L2 and L3", () => {
    const plan = buildConveyorAuditSweeperPlan({ manifest: manifest(), profile: profile() });
    const l2 = target(plan, memoryRepo, 20);
    const l3 = target(plan, platformRepo, 30);

    expect(l2.prior_audit).toEqual({
      required: ["l1"],
      satisfied: ["l1"],
      missing: [],
      stale: [],
    });
    expect(l3.prior_audit).toEqual({
      required: ["l2"],
      satisfied: [],
      missing: [],
      stale: ["l2"],
    });
    expect(l3.recommendations).toContain("prior_exact_head_pass_stale");
  });

  it("filters by requested audit level", () => {
    const plan = buildConveyorAuditSweeperPlan({ manifest: manifest(), profile: profile(), level: "l2" });

    expect(plan.level).toBe("l2");
    expect(plan.targets.map((item) => `${item.audit_level}:${item.repo}#${item.pr}`)).toEqual([
      `l2:${memoryRepo}#20`,
    ]);
  });
});
