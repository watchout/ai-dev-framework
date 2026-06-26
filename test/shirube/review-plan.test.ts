import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/review-plan");
const buildScript = "scripts/shirube/build-review-plan.mjs";
const checkScript = "scripts/shirube/check-review-plan.mjs";
const reportScript = "scripts/shirube/run-rapid-lite-report.mjs";
const head = "1111111111111111111111111111111111111111";

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function runJson(script: string, args: string[]): any {
  const stdout = execFileSync("node", [script, ...args, "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

function buildPlan(handoff: string, changed = "changed-files.docs.txt"): any {
  return runJson(buildScript, [
    "--handoff",
    fixture(handoff),
    "--changed-files",
    fixture(changed),
  ]).review_plan;
}

function check(args: string[]): any {
  return runJson(checkScript, [
    "--actual-repo",
    "watchout/ai-dev-framework",
    "--actual-pr",
    "517",
    "--actual-head",
    head,
    ...args,
  ]);
}

describe("Shirube machine-derived review plan", () => {
  it("generates docs-light base audit without additional protected review for R1 docs_contract", () => {
    const plan = buildPlan("handoff.r1-docs-contract.yaml");

    expect(plan.schema_version).toBe("shirube-review-plan/v1");
    expect(plan.base_audit.required).toBe(true);
    expect(plan.base_audit.checklist_profile).toBe("docs_light");
    expect(plan.additional_reviews).toEqual([]);
    expect(plan.owner_decision.allowed_after).toEqual(["base_audit_complete"]);
    expect(plan.decision_basis.reason_codes).toContain("NO_ADDITIONAL_PROTECTED_REVIEW");
  });

  it("ignores cto_review_question prose for R1 docs_only", () => {
    const plan = buildPlan("handoff.r1-docs-cto-question.yaml");

    expect(plan.base_audit.required).toBe(true);
    expect(plan.additional_reviews).toEqual([]);
    expect(plan.decision_basis.reason_codes).not.toContain("CTO_REVIEW_QUESTION");
  });

  it("requires technical owner review for R2 runtime/policy surfaces", () => {
    const plan = buildPlan("handoff.r2-runtime-policy.yaml", "changed-files.runtime.txt");

    expect(plan.base_audit.required).toBe(true);
    expect(plan.base_audit.checklist_profile).toBe("runtime_policy_standard");
    expect(plan.additional_reviews.map((review: { review_type: string }) => review.review_type)).toContain("technical_owner_review");
    expect(plan.owner_decision.allowed_after).toEqual(["base_audit_complete", "all_additional_reviews_complete"]);
  });

  it("requires protected reviews for R3 security/privacy surfaces", () => {
    const plan = buildPlan("handoff.r3-protected.yaml");
    const reviewTypes = plan.additional_reviews.map((review: { review_type: string }) => review.review_type);

    expect(plan.base_audit.checklist_profile).toBe("protected");
    expect(reviewTypes).toContain("cto_review");
    expect(reviewTypes).toContain("security_review");
    expect(reviewTypes).toContain("privacy_review");
  });

  it("is deterministic for the same handoff", () => {
    const first = JSON.stringify(buildPlan("handoff.r2-runtime-policy.yaml", "changed-files.runtime.txt"));
    const second = JSON.stringify(buildPlan("handoff.r2-runtime-policy.yaml", "changed-files.runtime.txt"));

    expect(second).toBe(first);
  });

  it("blocks owner approval before base audit completion", () => {
    const result = check([
      "--handoff",
      fixture("handoff.r1-docs-contract.yaml"),
      "--owner-decision",
      fixture("owner-decision.pass.json"),
    ]);

    expect(result.verdict).toBe("BLOCKED");
    expect(result.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.next_action.action).toBe("request_independent_audit");
    expect(result.owner_approval_allowed).toBe(false);
    expect(result.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("OWNER-SEQ-001");
  });

  it("blocks owner approval before required additional reviews complete", () => {
    const result = check([
      "--handoff",
      fixture("handoff.r2-runtime-policy.yaml"),
      "--changed-files",
      fixture("changed-files.runtime.txt"),
      "--audit-checklist-report",
      fixture("audit-checklist.pass.json"),
      "--audit-source",
      fixture("audit-source.pass.json"),
      "--owner-decision",
      fixture("owner-decision.pass.json"),
    ]);

    expect(result.verdict).toBe("BLOCKED");
    expect(result.current_phase).toBe("ADDITIONAL_REVIEW_REQUIRED");
    expect(result.next_action.action).toBe("request_required_additional_review");
    expect(result.owner_approval_allowed).toBe(false);
    expect(result.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("REVIEW-SEQ-001");
  });

  it("requests owner decision after base audit and additional reviews complete", () => {
    const result = check([
      "--handoff",
      fixture("handoff.r2-runtime-policy.yaml"),
      "--changed-files",
      fixture("changed-files.runtime.txt"),
      "--audit-checklist-report",
      fixture("audit-checklist.pass.json"),
      "--audit-source",
      fixture("audit-source.pass.json"),
      "--additional-review",
      fixture("additional-review.technical.pass.json"),
    ]);

    expect(result.verdict).toBe("PASS");
    expect(result.current_phase).toBe("OWNER_DECISION_REQUIRED");
    expect(result.next_action.action).toBe("request_owner_exact_head_decision");
    expect(result.owner_approval_allowed).toBe(true);
    expect(result.merge_ready_allowed).toBe(false);
  });

  it("allows merge readiness after audit, additional review, and owner decision", () => {
    const result = check([
      "--handoff",
      fixture("handoff.r2-runtime-policy.yaml"),
      "--changed-files",
      fixture("changed-files.runtime.txt"),
      "--audit-checklist-report",
      fixture("audit-checklist.pass.json"),
      "--audit-source",
      fixture("audit-source.pass.json"),
      "--additional-review",
      fixture("additional-review.technical.pass.json"),
      "--owner-decision",
      fixture("owner-decision.pass.json"),
    ]);

    expect(result.verdict).toBe("PASS");
    expect(result.current_phase).toBe("MERGE_READY");
    expect(result.merge_ready_allowed).toBe(true);
  });

  it("surfaces additional review as top Rapid/Lite next action before owner approval", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-review-plan-report-"));
    const prBody = path.join(dir, "pr-body.md");
    writeFileSync(prBody, [
      "execution_context_ref: test/fixtures/shirube/execution-context/valid-dev.yaml",
      "adoption_plan_ref: test/fixtures/shirube/adoption/greenfield.pass.yaml",
      "repo_spec_ref: test/fixtures/shirube/control-state-completeness/repo-spec.pass.yaml",
      `handoff_ref: ${fixture("handoff.r2-runtime-policy.yaml")}`,
      "lifecycle_state_ref: test/fixtures/shirube/lifecycle/pass.execution-ready.yaml",
      "validation_evidence_ref: test/fixtures/shirube/rapid-lite-report/validation.external-head.yaml",
      "enforcement_policy_ref: test/fixtures/shirube/enforcement-policy/report-only.pass.yaml",
      `audit_checklist_report_ref: ${fixture("audit-checklist.pass.json")}`,
      `audit_source_ref: ${fixture("audit-source.pass.json")}`,
      "",
    ].join("\n"));

    try {
      const stdout = execFileSync("node", [
        reportScript,
        "--result-dir",
        path.join(dir, "out"),
        "--changed-files",
        fixture("changed-files.runtime.txt"),
        "--pr-body",
        prBody,
        "--actual-repo",
        "watchout/ai-dev-framework",
        "--actual-pr",
        "517",
        "--actual-branch",
        "codex/review-plan-policy",
        "--actual-head",
        head,
        "--diff-root",
        ".",
        "--format",
        "json",
      ], {
        cwd: root,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const report = JSON.parse(stdout);
      const reviewPlan = report.gates.find((gate: { gate: string }) => gate.gate === "review-plan");

      expect(report.current_phase).toBe("ADDITIONAL_REVIEW_REQUIRED");
      expect(report.next_action.action).toBe("request_required_additional_review");
      expect(report.owner_approval_allowed).toBe(false);
      expect(reviewPlan.status).toBe("ran");
      expect(reviewPlan.verdict).toBe("BLOCKED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
