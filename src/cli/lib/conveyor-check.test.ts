import { describe, expect, it } from "vitest";
import {
  buildConveyorCheckReport,
  classifyDiffScope,
  parsePullRequestTarget,
  type ConveyorCheckSnapshot,
} from "./conveyor-check.js";

const observedAt = "2026-06-18T00:00:00.000Z";

describe("conveyor check target parsing", () => {
  it("parses GitHub PR URLs", () => {
    expect(parsePullRequestTarget("https://github.com/watchout/ai-dev-framework/pull/415")).toEqual({
      repo: "watchout/ai-dev-framework",
      pr: 415,
      pr_url: "https://github.com/watchout/ai-dev-framework/pull/415",
    });
  });

  it("parses owner/repo#number shorthand", () => {
    expect(parsePullRequestTarget("watchout/ai-dev-framework#405")).toEqual({
      repo: "watchout/ai-dev-framework",
      pr: 405,
      pr_url: "https://github.com/watchout/ai-dev-framework/pull/405",
    });
  });

  it("parses local PR numbers when a default repo is supplied", () => {
    expect(parsePullRequestTarget("#405", "watchout/ai-dev-framework")).toEqual({
      repo: "watchout/ai-dev-framework",
      pr: 405,
      pr_url: "https://github.com/watchout/ai-dev-framework/pull/405",
    });
  });
});

describe("conveyor check diff scope classification", () => {
  it("classifies docs and fixture-only paths without forbidden hits", () => {
    const scope = classifyDiffScope([
      "docs/spec/shirube-v2.1-enterprise-governance.md",
      "docs/spec/fixtures/shirube-v2.1/policy.example.yml",
      "docs/spec/fixtures/shirube-v2.1/db-evidence.example.json",
    ]);

    expect(scope.classification).toBe("fixtures");
    expect(scope.forbidden_hits).toEqual([]);
  });

  it("classifies protected runtime, DB, queue, permission, CI, and deploy path hits", () => {
    const scope = classifyDiffScope([
      ".github/workflows/ci.yml",
      "deploy/vercel.json",
      "migrations/001-init.sql",
      "scripts/queue-worker.ts",
      "src/auth/permissions.ts",
      "src/cli/index.ts",
    ]);

    expect(scope.classification).toBe("mixed");
    expect(scope.forbidden_hits).toEqual([
      { path: ".github/workflows/ci.yml", class: "ci" },
      { path: "deploy/vercel.json", class: "deploy" },
      { path: "migrations/001-init.sql", class: "db" },
      { path: "scripts/queue-worker.ts", class: "queue" },
      { path: "src/auth/permissions.ts", class: "permission" },
      { path: "src/cli/index.ts", class: "runtime" },
    ]);
  });
});

describe("conveyor check report", () => {
  it("produces stable shirube-conveyor-check/v1 JSON fields", () => {
    const report = buildConveyorCheckReport(baseSnapshot(), { observedAt });

    expect(report).toEqual(
      expect.objectContaining({
        schema_version: "shirube-conveyor-check/v1",
        gate_version: "gate-completion-barrier/v1",
        repo: "watchout/ai-dev-framework",
        pr: 415,
        pr_url: "https://github.com/watchout/ai-dev-framework/pull/415",
        observed_at: observedAt,
        head_sha: "a2275b56056720647f606c4c1a75227993158b9b",
        base_branch: "main",
        base_sha: "base-sha",
        verdict: "PASS",
        blockers: [],
        warnings: [],
      }),
    );
    expect(report.diff_scope).toEqual({
      classification: "fixtures",
      changed_files: [
        "docs/spec/fixtures/shirube-v2.1/policy.example.yml",
        "docs/spec/shirube-v2.1-enterprise-governance.md",
      ],
      forbidden_hits: [],
    });
    expect(report.github_checks.summary).toEqual([
      {
        name: "Lint",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        workflow_name: "CI",
        details_url: "https://github.com/watchout/ai-dev-framework/actions/runs/1",
      },
    ]);
    expect(report.legacy_flow).toEqual({
      detected: false,
      invalid_release_owner: false,
      machine_gate_evidence_exact_head: false,
      completion_claim_without_exact_head_machine_gate: false,
      can_proceed_by_machine_evidence: true,
      findings: [],
    });
  });

  it("blocks when required PR head or changed-file facts are missing", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      head_sha: null,
      changed_files: null,
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(["missing_pr_head_sha", "missing_changed_files"]);
  });

  it("blocks docs-only claims that include protected path classes", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: "Scope: docs-only",
      changed_files: ["docs/spec/readme.md", "src/cli/index.ts"],
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toContain("docs_or_fixture_scope_contains_forbidden_path_classes");
    expect(report.diff_scope.forbidden_hits).toEqual([{ path: "src/cli/index.ts", class: "runtime" }]);
  });

  it("does not treat explanatory docs/fixture-only text as a scope claim", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: "Focused verification: docs/fixture-only paths classify without protected path hits.",
      changed_files: ["docs/spec/readme.md", "src/cli/index.ts"],
    }, { observedAt });

    expect(report.verdict).toBe("PASS_WITH_WARN");
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toContain("protected_path_classes_present");
  });

  it("blocks merge-readiness packets missing release executor or evidence sink", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: [
        "release readiness: ready",
        "release_owner: CTO",
        "release_executor: codex",
      ].join("\n"),
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual([
      "release_readiness_missing_release_executor_or_evidence_sink",
      "missing_exact_head_machine_gate_evidence",
    ]);
    expect(report.executor).toEqual({
      release_owner: "CTO",
      release_executor: "codex",
      fallback_executor: null,
      evidence_sink: null,
      executor_bound: false,
    });
  });

  it("blocks handoffs that route to the legacy L1/L2 audit then QA/check flow", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: [
        "<!-- shirube:implementation-handoff/v1 -->",
        "exact_head: a2275b56056720647f606c4c1a75227993158b9b",
        "machine_gate_evidence: shirube conveyor check at exact head a2275b56056720647f606c4c1a75227993158b9b",
        "Next required review: L1/L2 audit, then QA/check",
      ].join("\n"),
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toContain("legacy_review_flow_detected");
    expect(report.legacy_flow.detected).toBe(true);
    expect(report.legacy_flow.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "legacy_review_flow",
          excerpt: "Next required review: L1/L2 audit, then QA/check",
        }),
      ]),
    );
  });

  it("blocks review queues used as release_owner values", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: [
        "<!-- shirube:implementation-handoff/v1 -->",
        "release_owner: L1/L2 audit then QA/check",
        "release_executor: codex",
        "evidence_sink: https://github.com/watchout/ai-dev-framework/pull/415",
      ].join("\n"),
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toEqual(["legacy_review_flow_detected", "invalid_release_owner_review_queue"]);
    expect(report.legacy_flow.invalid_release_owner).toBe(true);
  });

  it("does not treat ARC rework instruction quotes as a legacy route source", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      comments: [
        {
          body: [
            "<!-- shirube:arc-rework-instruction/gate-completion-barrier/v1 -->",
            "- docs/spec addition: `PR2.5 requires L1/L2 audit and QA/check before the later GitHub Check projection slice`",
            "Do not send #416 to legacy L1/L2 audit or QA/check in its current form.",
          ].join("\n"),
        },
      ],
    }, { observedAt });

    expect(report.verdict).not.toBe("BLOCKED");
    expect(report.blockers).not.toContain("legacy_review_flow_detected");
    expect(report.legacy_flow.detected).toBe(false);
  });

  it("does not treat blocker test summaries as legacy route sources", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: "- handoff text that routes to old L1/L2 plus QA/check flow blocks with `legacy_review_flow_detected`;",
    }, { observedAt });

    expect(report.verdict).not.toBe("BLOCKED");
    expect(report.blockers).not.toContain("legacy_review_flow_detected");
    expect(report.legacy_flow.detected).toBe(false);
  });

  it("allows corrected handoffs with exact-head machine evidence and no legacy route blocker", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: [
        "<!-- shirube:implementation-handoff/v1 -->",
        "release_owner: shirube-gate-maintainer",
        "release_executor: machine-gate-cli",
        "evidence_sink: https://github.com/watchout/ai-dev-framework/pull/415#issuecomment-1",
        "completion: machine gate evidence recorded",
        "machine_gate_evidence: shirube-conveyor-check/v1 PASS_WITH_WARN at exact head a2275b56056720647f606c4c1a75227993158b9b",
      ].join("\n"),
    }, { observedAt });

    expect(report.verdict).toBe("PASS");
    expect(report.blockers).not.toContain("legacy_review_flow_detected");
    expect(report.blockers).not.toContain("invalid_release_owner_review_queue");
    expect(report.blockers).not.toContain("missing_exact_head_machine_gate_evidence");
    expect(report.legacy_flow).toEqual(
      expect.objectContaining({
        detected: false,
        invalid_release_owner: false,
        machine_gate_evidence_exact_head: true,
        completion_claim_without_exact_head_machine_gate: false,
        can_proceed_by_machine_evidence: true,
      }),
    );
  });

  it("blocks completion claims without exact-head machine gate evidence", () => {
    const report = buildConveyorCheckReport({
      ...baseSnapshot(),
      body: [
        "<!-- shirube:implementation-handoff/v1 -->",
        "release_owner: shirube-gate-maintainer",
        "release_executor: machine-gate-cli",
        "evidence_sink: https://github.com/watchout/ai-dev-framework/pull/415#issuecomment-1",
        "completion: implementation complete",
      ].join("\n"),
    }, { observedAt });

    expect(report.verdict).toBe("BLOCKED");
    expect(report.blockers).toContain("missing_exact_head_machine_gate_evidence");
    expect(report.legacy_flow.completion_claim_without_exact_head_machine_gate).toBe(true);
  });
});

function baseSnapshot(): ConveyorCheckSnapshot {
  return {
    repo: "watchout/ai-dev-framework",
    pr: 415,
    pr_url: "https://github.com/watchout/ai-dev-framework/pull/415",
    body: [
      "<!-- shirube:implementation-handoff/v1 -->",
      "release_owner: CTO",
      "release_executor: codex",
      "evidence_sink: https://github.com/watchout/ai-dev-framework/pull/415#issuecomment-1",
    ].join("\n"),
    head_sha: "a2275b56056720647f606c4c1a75227993158b9b",
    base_branch: "main",
    base_sha: "base-sha",
    state: "open",
    draft: false,
    merged: false,
    mergeable: true,
    changed_files: [
      "docs/spec/shirube-v2.1-enterprise-governance.md",
      "docs/spec/fixtures/shirube-v2.1/policy.example.yml",
    ],
    labels: ["state:impl-l1"],
    comments: [],
    checks: [
      {
        name: "Lint",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        workflow_name: "CI",
        details_url: "https://github.com/watchout/ai-dev-framework/actions/runs/1",
      },
    ],
  };
}
