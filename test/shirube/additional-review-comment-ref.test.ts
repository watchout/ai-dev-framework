import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const resolverScript = "scripts/shirube/resolve-additional-review-ref.mjs";
const reviewPlanScript = "scripts/shirube/check-review-plan.mjs";
const reportScript = "scripts/shirube/run-rapid-lite-report.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/review-plan");
const head = "1111111111111111111111111111111111111111";

function run(script: string, args: string[], cwd = root): { exitCode: number; json: any; stdout: string } {
  try {
    const stdout = execFileSync("node", [path.join(root, script), ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout), stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout), stdout };
  }
}

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function additionalReviewYaml(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    schema_version: "shirube-additional-review/v1",
    review_type: "technical_owner_review",
    responsible_role: "technical_owner",
    verdict: "PASS",
    target_repo: "watchout/ai-dev-framework",
    target_pr: "517",
    exact_head_sha: head,
    reviewer_actor: "technical-owner",
    implementation_actor: "codex-adf",
    ...overrides,
  };
  return [
    `schema_version: ${values.schema_version}`,
    `review_type: ${values.review_type}`,
    `responsible_role: ${values.responsible_role}`,
    `verdict: ${values.verdict}`,
    `target_repo: ${values.target_repo}`,
    `target_pr: ${values.target_pr}`,
    `exact_head_sha: "${values.exact_head_sha}"`,
    `reviewer_actor: ${values.reviewer_actor}`,
    `implementation_actor: ${values.implementation_actor}`,
    "evidence_refs:",
    "  - protected-review-comment",
    "",
  ].join("\n");
}

function additionalReviewJson(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    schema_version: "shirube-additional-review/v1",
    review_type: "cto_review",
    responsible_role: "cto",
    verdict: "PASS",
    target_repo: "watchout/ai-dev-framework",
    target_pr: 517,
    exact_head_sha: head,
    reviewer_actor: "cto",
    implementation_actor: "codex-adf",
    evidence_refs: ["cto-review-comment"],
    ...overrides,
  }, null, 2);
}

function commentPayload(bodyBlocks: string, overrides: Record<string, any> = {}): any {
  return {
    id: 4810000001,
    html_url: "https://github.com/watchout/ai-dev-framework/pull/517#issuecomment-4810000001",
    issue_url: "https://api.github.com/repos/watchout/ai-dev-framework/issues/517",
    user: { login: "protected-reviewer" },
    body: bodyBlocks,
    ...overrides,
  };
}

function commentBody(...blocks: Array<{ language: "yaml" | "json"; body: string }>): string {
  return [
    "Additional review evidence.",
    "",
    ...blocks.map((block) => `\`\`\`${block.language}\n${block.body}\`\`\`\n`),
  ].join("\n");
}

function writeComment(dir: string, payload: any): string {
  const file = path.join(dir, "comment.json");
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

function resolveWithComment(
  dir: string,
  comment: any,
  ref = "https://github.com/watchout/ai-dev-framework/pull/517#issuecomment-4810000001",
  resultDir = path.join(dir, ".shirube-rapid-lite"),
): { exitCode: number; json: any; stdout: string } {
  return run(resolverScript, [
    "--additional-review-comment-ref",
    ref,
    "--actual-repo",
    "watchout/ai-dev-framework",
    "--actual-pr",
    "517",
    "--actual-head",
    head,
    "--result-dir",
    resultDir,
    "--comment-fixture",
    writeComment(dir, comment),
    "--format",
    "json",
  ]);
}

function blockerCodes(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { code: string }) => finding.code);
}

describe("comment-backed additional review refs", () => {
  it("keeps local additional_review_ref file paths compatible", () => {
    const result = run(resolverScript, [
      "--additional-review-ref",
      `${fixture("additional-review.cto.pass.json")},${fixture("additional-review.technical.pass.json")}`,
      "--result-dir",
      ".tmp/additional-review-local",
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.materialized_paths).toEqual([
      fixture("additional-review.cto.pass.json"),
      fixture("additional-review.technical.pass.json"),
    ]);
    expect(result.json.owner_approval_synthesized).toBe(false);
  });

  it("materializes same-PR comment-backed additional review YAML and JSON", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
    try {
      const result = resolveWithComment(dir, commentPayload(commentBody(
        { language: "yaml", body: additionalReviewYaml() },
        { language: "json", body: additionalReviewJson() },
      )));
      const source = JSON.parse(readFileSync(result.json.source_metadata_path, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.would_block).toBe(false);
      expect(result.json.review_types).toEqual(["cto_review", "technical_owner_review"]);
      expect(result.json.materialized_paths).toHaveLength(2);
      expect(result.json.materialized_paths.every((file: string) => existsSync(file))).toBe(true);
      expect(source.schema_version).toBe("shirube-comment-backed-additional-review-source/v1");
      expect(source.target_branch_mutated).toBe(false);
      expect(source.owner_approval_synthesized).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports github-comment URI refs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
    try {
      const result = resolveWithComment(
        dir,
        commentPayload(commentBody({ language: "yaml", body: additionalReviewYaml() })),
        "github-comment://watchout/ai-dev-framework/pull/517#issuecomment-4810000001",
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(existsSync(result.json.materialized_paths[0])).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks comments with no structured additional review block", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
    try {
      const result = resolveWithComment(dir, commentPayload("Review prose only."));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("review_block_missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks wrong schema_version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
    try {
      const result = resolveWithComment(dir, commentPayload(commentBody({
        language: "yaml",
        body: additionalReviewYaml({ schema_version: "shirube-structured-audit/v1" }),
      })));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("wrong_schema_version");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks target repo, PR, and head mismatches", () => {
    const cases = [
      { override: { target_repo: "watchout/other" }, code: "target_repo_mismatch" },
      { override: { target_pr: "516" }, code: "target_pr_mismatch" },
      { override: { exact_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, code: "head_mismatch" },
    ];

    for (const entry of cases) {
      const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
      try {
        const result = resolveWithComment(dir, commentPayload(commentBody({
          language: "yaml",
          body: additionalReviewYaml(entry.override),
        })));

        expect(result.json.verdict).toBe("BLOCKED");
        expect(blockerCodes(result)).toContain(entry.code);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("blocks missing head, maker/checker violations, and owner approval synthesis", () => {
    const cases = [
      { body: additionalReviewYaml().replace(`exact_head_sha: "${head}"\n`, ""), code: "missing_exact_head" },
      { body: additionalReviewYaml({ reviewer_actor: "codex-adf", implementation_actor: "codex-adf" }), code: "maker_checker_violation" },
      { body: `${additionalReviewYaml()}approval_granted: true\n`, code: "owner_approval_in_review" },
    ];

    for (const entry of cases) {
      const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-"));
      try {
        const result = resolveWithComment(dir, commentPayload(commentBody({ language: "yaml", body: entry.body })));

        expect(result.json.verdict).toBe("BLOCKED");
        expect(blockerCodes(result)).toContain(entry.code);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("lets check-review-plan consume materialized additional reviews", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-plan-"));
    try {
      const resolved = resolveWithComment(dir, commentPayload(commentBody({ language: "yaml", body: additionalReviewYaml() })));
      const result = run(reviewPlanScript, [
        "--handoff",
        fixture("handoff.r2-runtime-policy.yaml"),
        "--changed-files",
        fixture("changed-files.runtime.txt"),
        "--audit-checklist-report",
        fixture("audit-checklist.pass.json"),
        "--structured-audit",
        fixture("structured-audit.pass.json"),
        "--audit-source",
        fixture("audit-source.pass.json"),
        "--trusted-audit-source",
        "--additional-review",
        resolved.json.materialized_path,
        "--additional-review-source",
        resolved.json.source_metadata_path,
        "--trusted-additional-review-source",
        "--actual-repo",
        "watchout/ai-dev-framework",
        "--actual-pr",
        "517",
        "--actual-head",
        head,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.current_phase).toBe("OWNER_DECISION_REQUIRED");
      expect(result.json.owner_approval_allowed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets Rapid/Lite consume materialized additional reviews without reporting them missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-additional-review-report-"));
    try {
      const resultDir = path.join(dir, ".shirube-rapid-lite-report");
      const resolved = resolveWithComment(
        dir,
        commentPayload(commentBody({ language: "yaml", body: additionalReviewYaml() })),
        "https://github.com/watchout/ai-dev-framework/pull/517#issuecomment-4810000001",
        resultDir,
      );
      const prBody = path.join(dir, "pr-body.md");
      writeFileSync(prBody, [
        "execution_context_ref: test/fixtures/shirube/execution-context/valid-dev.yaml",
        "adoption_plan_ref: test/fixtures/shirube/adoption/greenfield.pass.yaml",
        "repo_spec_ref: test/fixtures/shirube/control-state-completeness/repo-spec.pass.yaml",
        `handoff_ref: ${fixture("handoff.r2-runtime-policy.yaml")}`,
        "lifecycle_state_ref: test/fixtures/shirube/lifecycle/pass.execution-ready.yaml",
        "validation_evidence_ref: test/fixtures/shirube/rapid-lite-report/validation.external-head.yaml",
        "enforcement_policy_ref: test/fixtures/shirube/enforcement-policy/report-only.pass.yaml",
        "audit_checklist_ref: test/fixtures/shirube/audit-checklist/checklist.pass.yaml",
        "structured_audit_ref: test/fixtures/shirube/review-plan/structured-audit.pass.json",
        "audit_source_ref: test/fixtures/shirube/review-plan/audit-source.pass.json",
        "audit_machine_evidence_ref: test/fixtures/shirube/audit-checklist/machine-evidence.pass.yaml",
        `additional_review_ref: ${resolved.json.materialized_path}`,
        `additional_review_source_ref: ${resolved.json.source_metadata_path}`,
        "",
      ].join("\n"));

      const result = run(reportScript, [
        "--result-dir",
        resultDir,
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
      ]);

      const reviewPlan = result.json.gates.find((gate: { gate: string }) => gate.gate === "review-plan");

      expect(result.exitCode).toBe(0);
      expect(reviewPlan.status).toBe("ran");
      expect(reviewPlan.additional_review_completion.complete).toBe(true);
      expect(reviewPlan.additional_review_completion.missing_reviews).toEqual([]);
      expect(reviewPlan.blockers.map((finding: { item_id: string }) => finding.item_id)).not.toContain("REVIEW-002");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
