import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");
const repo = "watchout/ai-dev-framework";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-conveyor-command-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runConveyor(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} conveyor ${args}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

function writeFixture(): string {
  const fixturePath = path.join(tmpDir, "conveyor-fixture.json");
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      issues: [
        {
          repo: "watchout/aun-platform",
          number: 24,
          title: "Discord-like thread stream",
          labels: ["needs:implementation"],
        },
      ],
      pull_requests: [
        {
          repo,
          number: 286,
          head: "head-286",
          merge_state: "CLEAN",
          labels: ["state:impl-l2", "audit:l2-pending", "needs:l2-audit"],
          comments: [
            {
              body: [
                "<!-- conveyor:audit-result/v1 -->",
                `repo: ${repo}`,
                "pr: 286",
                "role: l2",
                "verdict: PASS",
                "head: head-286",
              ].join("\n"),
            },
          ],
        },
      ],
    }),
    "utf-8",
  );
  return fixturePath;
}

function writeClaimFixture(): string {
  const fixturePath = path.join(tmpDir, "conveyor-claim-fixture.json");
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      pull_requests: [
        {
          repo,
          number: 286,
          head: "head-286",
          merge_state: "CLEAN",
          labels: ["state:impl-l2", "audit:l1-passed", "audit:l2-pending", "needs:l2-audit"],
        },
      ],
    }),
    "utf-8",
  );
  return fixturePath;
}

function writeProfileFixtures(): { fixturePath: string; profilePath: string; previousProfilePath: string } {
  const fixturePath = path.join(tmpDir, "conveyor-profile-fixture.json");
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      pull_requests: [
        {
          repo,
          number: 288,
          head: "head-288",
          merge_state: "CLEAN",
          labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
        },
        {
          repo: "watchout/aun-platform",
          number: 41,
          head: "head-41",
          merge_state: "CLEAN",
          labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit", "blocked-stop-lane"],
        },
        {
          repo: "watchout/out-of-scope",
          number: 9,
          head: "head-9",
          merge_state: "CLEAN",
          labels: ["state:impl-l1", "audit-pending", "audit:l1-pending", "needs:l1-audit"],
        },
      ],
    }),
    "utf-8",
  );

  const profile = {
    schema: "shirube-conveyor-project-profile/v1",
    profile_id: "wave1-mcp-dev-conveyor-lite",
    profile_version: "2026-06-04.1",
    repo_scope_id: "wave1-mcp-dev-conveyor-lite",
    repositories: [
      { full_name: repo, profile: "mcp_framework", product: "shirube", wave: "wave1", enabled: true },
      { full_name: "watchout/agent-comms-mcp", profile: "mcp_runtime", product: "aun", wave: "wave1", enabled: true },
      { full_name: "watchout/agent-memory", profile: "mcp_memory", product: "wasurezu", wave: "wave1", enabled: true },
      {
        full_name: "watchout/aun-platform",
        profile: "saas_ui_platform",
        product: "aun-platform",
        wave: "wave-b",
        enabled: true,
        added_reason: "AUN Platform PRs now enter conveyor audit",
      },
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
  const profilePath = path.join(tmpDir, "conveyor-profile.json");
  fs.writeFileSync(profilePath, JSON.stringify(profile), "utf-8");

  const previousProfilePath = path.join(tmpDir, "previous-conveyor-profile.json");
  fs.writeFileSync(
    previousProfilePath,
    JSON.stringify({
      ...profile,
      repositories: profile.repositories.filter((repository) => repository.full_name !== "watchout/aun-platform"),
    }),
    "utf-8",
  );
  return { fixturePath, profilePath, previousProfilePath };
}

describe("conveyor command", () => {
  it("prints reconcile help", () => {
    const result = runConveyor("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("conveyor");
    expect(result.stdout).toContain("reconcile");
  });

  it("reconciles a fixture as JSON without live GitHub mutation", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`reconcile --fixture ${fixturePath} --apply --json`);
    const report = JSON.parse(result.stdout) as {
      schema: string;
      mode: string;
      prs: Array<{ final_labels: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(report.schema).toBe("shirube-conveyor-reconcile-report/v1");
    expect(report.mode).toBe("apply");
    expect(report.prs[0].final_labels).toEqual(
      expect.arrayContaining(["state:impl-l3", "audit:l2-passed", "audit:l3-pending"]),
    );
  });

  it("requires fixture until live GitHub label sync lands", () => {
    const result = runConveyor("reconcile --json");
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).error.message).toContain("Missing --fixture");
  });

  it("builds a tick manifest from a fixture without live discovery", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`tick --fixture ${fixturePath} --json`);
    const manifest = JSON.parse(result.stdout) as {
      schema: string;
      lanes: {
        implementation: { targets: Array<{ repo: string; number: number }> };
        l3: { targets: Array<{ repo: string; number: number }> };
      };
    };

    expect(result.exitCode).toBe(0);
    expect(manifest.schema).toBe("shirube-conveyor-tick-manifest/v1");
    expect(manifest.lanes.implementation.targets[0]).toEqual(
      expect.objectContaining({ repo: "watchout/aun-platform", number: 24 }),
    );
    expect(manifest.lanes.l3.targets[0]).toEqual(
      expect.objectContaining({ repo, number: 286 }),
    );
  });

  it("selects the next role target deterministically", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`next --role implementation --fixture ${fixturePath} --json`);
    const payload = JSON.parse(result.stdout) as {
      schema: string;
      role: string;
      target: { repo: string; number: number };
    };

    expect(result.exitCode).toBe(0);
    expect(payload.schema).toBe("shirube-conveyor-next-target/v1");
    expect(payload.role).toBe("implementation");
    expect(payload.target).toEqual(expect.objectContaining({ repo: "watchout/aun-platform", number: 24 }));
  });

  it("emits append-only claim evidence for the selected next target without changing labels", () => {
    const fixturePath = writeClaimFixture();
    const result = runConveyor(
      [
        "next --role l2",
        `--fixture ${fixturePath}`,
        "--claim",
        "--claimed-by auditor-1",
        "--claimed-at 2026-06-04T00:00:00.000Z",
        "--claim-ttl-minutes 45",
        "--json",
      ].join(" "),
    );
    const payload = JSON.parse(result.stdout) as {
      claim_mode: string;
      target: { repo: string; number: number; labels: string[] };
      claim: {
        schema: string;
        role: string;
        actor: string;
        repo: string;
        kind: string;
        number: number;
        head: string;
        claimed_at: string;
        expires_at: string;
        comment_body: string;
      };
    };

    expect(result.exitCode).toBe(0);
    expect(payload.claim_mode).toBe("evidence_only");
    expect(payload.target).toEqual(
      expect.objectContaining({
        repo,
        number: 286,
        labels: expect.arrayContaining(["state:impl-l2", "audit:l1-passed"]),
      }),
    );
    expect(payload.claim).toEqual(
      expect.objectContaining({
        schema: "conveyor:claim/v1",
        role: "l2",
        actor: "auditor-1",
        repo,
        kind: "pr",
        number: 286,
        head: "head-286",
        claimed_at: "2026-06-04T00:00:00.000Z",
        expires_at: "2026-06-04T00:45:00.000Z",
      }),
    );
    expect(payload.claim.comment_body).toContain("<!-- conveyor:claim/v1 -->");
    expect(payload.claim.comment_body).toContain("CONVEYOR CLAIM role=l2 actor=auditor-1");
  });

  it("skips targets with active same-role claim evidence", () => {
    const fixturePath = path.join(tmpDir, "conveyor-active-claim-fixture.json");
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        pull_requests: [
          {
            repo,
            number: 286,
            head: "head-286",
            merge_state: "CLEAN",
            labels: ["state:impl-l2", "audit:l1-passed", "audit:l2-pending", "needs:l2-audit"],
            comments: [
              {
                body: [
                  "<!-- conveyor:claim/v1 -->",
                  "CONVEYOR CLAIM role=l2 actor=auditor-1 repo=watchout/ai-dev-framework pr=286 head=head-286 claimed_at=2026-06-04T00:00:00.000Z expires_at=2099-01-01T00:00:00.000Z",
                ].join("\n"),
              },
            ],
          },
          {
            repo,
            number: 287,
            head: "head-287",
            merge_state: "CLEAN",
            labels: ["state:impl-l2", "audit:l1-passed", "audit:l2-pending", "needs:l2-audit"],
          },
        ],
      }),
      "utf-8",
    );
    const result = runConveyor(`next --role l2 --fixture ${fixturePath} --json`);
    const payload = JSON.parse(result.stdout) as {
      target: { number: number };
      excluded: Array<{ pr: number; reason_codes: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.target).toEqual(expect.objectContaining({ number: 287 }));
    expect(payload.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pr: 286,
          reason_codes: expect.arrayContaining(["already_claimed", "active_claim:auditor-1"]),
        }),
      ]),
    );
  });

  it("selects next targets through a project profile and reports scope changes", () => {
    const { fixturePath, profilePath, previousProfilePath } = writeProfileFixtures();
    const result = runConveyor(
      `next --role l1_auditor --fixture ${fixturePath} --profile ${profilePath} --previous-profile ${previousProfilePath} --json`,
    );
    const payload = JSON.parse(result.stdout) as {
      role: string;
      normalized_role: string;
      profile_scope_changed: boolean;
      profile: {
        profile_id: string;
        profile_hash: string;
        repo_scope_id: string;
        repositories: Array<{ full_name: string; profile: string }>;
        scope_changes: Array<{ kind: string; repo: string; profile: string; reason: string }>;
      };
      role_query: { include_labels: string[]; exclude_labels: string[] };
      context_recovery: { preferred: string };
      target: { repo: string; number: number; reason_codes: string[] };
      excluded: Array<{ repo: string; pr: number; reason_codes: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.role).toBe("l1_auditor");
    expect(payload.normalized_role).toBe("l1");
    expect(payload.profile_scope_changed).toBe(true);
    expect(payload.profile.profile_id).toBe("wave1-mcp-dev-conveyor-lite");
    expect(payload.profile.profile_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.profile.repo_scope_id).toBe("wave1-mcp-dev-conveyor-lite");
    expect(payload.profile.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ full_name: "watchout/aun-platform", profile: "saas_ui_platform" }),
      ]),
    );
    expect(payload.profile.scope_changes).toEqual([
      {
        kind: "added",
        repo: "watchout/aun-platform",
        profile: "saas_ui_platform",
        reason: "AUN Platform PRs now enter conveyor audit",
      },
    ]);
    expect(payload.role_query.include_labels).toEqual(["state:impl-l1", "audit:l1-pending"]);
    expect(payload.role_query.exclude_labels).toEqual(["blocked-stop-lane"]);
    expect(payload.context_recovery.preferred).toBe("wasurezu");
    expect(payload.target).toEqual(
      expect.objectContaining({
        repo,
        number: 288,
        reason_codes: expect.arrayContaining(["repo_profile:mcp_framework"]),
      }),
    );
    expect(payload.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repo: "watchout/aun-platform",
          pr: 41,
          reason_codes: ["profile_role_query_excluded"],
        }),
      ]),
    );
  });

  it("selects checker role targets with degraded reason codes", () => {
    const fixturePath = path.join(tmpDir, "conveyor-checker-fixture.json");
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        pull_requests: [
          {
            repo,
            number: 131,
            head: "head-131",
            merge_state: "DIRTY",
            labels: ["state:impl-l1", "audit-pending", "audit:l1-pending"],
          },
        ],
      }),
      "utf-8",
    );
    const result = runConveyor(`next --role checker --fixture ${fixturePath} --json`);
    const payload = JSON.parse(result.stdout) as {
      role: string;
      target: { number: number; reason_codes: string[] } | null;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.role).toBe("checker");
    expect(payload.target).toEqual(
      expect.objectContaining({
        number: 131,
        reason_codes: expect.arrayContaining(["dirty_audit_pending", "missing_pr_conveyor_evidence"]),
      }),
    );
  });

  it("checks role authority for proposed labels without mutating", () => {
    const result = runConveyor("check --role implementation --add-label evidence-ready --add-label merge-ready --json");
    const payload = JSON.parse(result.stdout) as {
      schema: string;
      authorized: boolean;
      violations: Array<{ label: string; reason: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.schema).toBe("shirube-conveyor-role-authority-check/v1");
    expect(payload.authorized).toBe(false);
    expect(payload.violations).toEqual([
      expect.objectContaining({
        label: "merge-ready",
        reason: "role_forbidden_final_or_foreign_authority_label",
      }),
    ]);
  });

  it("prints a durable audit-report evidence block without posting it", () => {
    const result = runConveyor(
      "audit-report --repo watchout/agent-memory --pr 132 --role l2 --verdict PASS --head abc123 --reported-by auditor",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<!-- conveyor:audit-result/v1 -->");
    expect(result.stdout).toContain("repo: watchout/agent-memory");
    expect(result.stdout).toContain("pr: 132");
    expect(result.stdout).toContain("role: l2");
    expect(result.stdout).toContain("verdict: PASS");
    expect(result.stdout).toContain("head: abc123");
  });

  it("builds an observe-only label sync plan from a fixture", () => {
    const fixturePath = writeFixture();
    const result = runConveyor(`labels sync --fixture ${fixturePath} --json`);
    const plan = JSON.parse(result.stdout) as {
      schema: string;
      safe_to_apply: boolean;
      actions: Array<{ add: string[]; remove: string[]; blocked: boolean }>;
    };

    expect(result.exitCode).toBe(0);
    expect(plan.schema).toBe("shirube-conveyor-label-sync-plan/v1");
    expect(plan.safe_to_apply).toBe(true);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        add: expect.arrayContaining(["state:impl-l3", "audit:l2-passed"]),
        remove: expect.arrayContaining(["state:impl-l2", "audit:l2-pending"]),
        blocked: false,
      }),
    );
  });

  it("builds an observe-only stack gate report from a fixture", () => {
    const fixturePath = path.join(tmpDir, "conveyor-stack-fixture.json");
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        config: { dependencies: { [repo]: [[285, 286]] } },
        pull_requests: [
          { repo, number: 285, head: "head-285", labels: ["state:impl-l2", "foundation-blocker"] },
          { repo, number: 286, head: "head-286", labels: ["state:impl-l2", "audit:l2-pending"] },
        ],
      }),
      "utf-8",
    );
    const result = runConveyor(`stack gate --fixture ${fixturePath} --json`);
    const report = JSON.parse(result.stdout) as {
      schema: string;
      safe_to_advance_dependents: boolean;
      blocked_dependents: Array<{ pr: number; recommended_add: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(report.schema).toBe("shirube-conveyor-stack-gate-report/v1");
    expect(report.safe_to_advance_dependents).toBe(false);
    expect(report.blocked_dependents[0]).toEqual(
      expect.objectContaining({ pr: 286, recommended_add: ["dependency-blocked"] }),
    );
  });

  it("builds a read-only audit sweeper plan through a project profile", () => {
    const { fixturePath, profilePath, previousProfilePath } = writeProfileFixtures();
    const result = runConveyor(
      `audit-sweeper plan --fixture ${fixturePath} --profile ${profilePath} --previous-profile ${previousProfilePath} --level l1 --json`,
    );
    const plan = JSON.parse(result.stdout) as {
      schema: string;
      level: string;
      profile_scope_changed: boolean;
      authority_notes: string[];
      profile: { scope_changes: Array<{ repo: string; profile: string }> };
      targets: Array<{ repo: string; pr: number; audit_level: string; state_label: string; priority_bucket: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(plan.schema).toBe("shirube-conveyor-audit-sweeper-plan/v1");
    expect(plan.level).toBe("l1");
    expect(plan.authority_notes).toEqual(
      expect.arrayContaining(["read_only_audit_dispatch_plan", "no_merge_authority", "no_aun_lifecycle_or_runner_dispatch"]),
    );
    expect(plan.profile_scope_changed).toBe(true);
    expect(plan.profile.scope_changes).toEqual([
      expect.objectContaining({ repo: "watchout/aun-platform", profile: "saas_ui_platform" }),
    ]);
    expect(plan.targets.map((target) => `${target.audit_level}:${target.repo}#${target.pr}`)).toEqual([
      "l1:watchout/aun-platform#41",
      `l1:${repo}#288`,
    ]);
    expect(plan.targets[0]).toEqual(
      expect.objectContaining({
        state_label: "state:impl-l1",
        priority_bucket: "stop_lane",
      }),
    );
  });
});
