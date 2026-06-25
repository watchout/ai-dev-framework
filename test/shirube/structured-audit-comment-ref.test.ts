import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const resolverScript = "scripts/shirube/resolve-structured-audit-ref.mjs";
const checkAuditScript = "scripts/shirube/check-audit-checklist.mjs";
const reportScript = "scripts/shirube/run-rapid-lite-report.mjs";
const fixtures = path.join(root, "test/fixtures/shirube");
const resolverFixtures = path.join(fixtures, "structured-audit-comment-ref");
const head = "0123456789abcdef0123456789abcdef01234567";

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

function auditYaml(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    target_repo: "watchout/ai-dev-framework",
    target_pr: "999",
    exact_head_sha: head,
    pr_head_sha: head,
    reviewer_actor: "codex-audit",
    implementation_actor: "codex-adf",
    schema_version: "shirube-structured-audit/v1",
    ...overrides,
  };
  return [
    `schema_version: ${values.schema_version}`,
    `target_repo: ${values.target_repo}`,
    `target_pr: ${values.target_pr}`,
    `exact_head_sha: ${values.exact_head_sha}`,
    `pr_head_sha: ${values.pr_head_sha}`,
    "audit_checklist_ref: test/fixtures/shirube/audit-checklist/checklist.pass.yaml",
    `reviewer_actor: ${values.reviewer_actor}`,
    "reviewer_model: gpt-5-audit",
    `implementation_actor: ${values.implementation_actor}`,
    "items:",
    ...Array.from({ length: 11 }, (_, index) => {
      const item = `AUDIT-${String(index + 1).padStart(3, "0")}`;
      const evidence = [
        "structured-review-notes",
        "changed_files",
        "diff_scope_report",
        "diff_scope_report",
        "protected_surface_declaration",
        "command_result:npm run test -- test/shirube/audit-checklist.test.ts",
        "pr_head_sha",
        "validation_results",
        "maker_checker_review",
        "owner_decision",
        "post_merge_evidence",
      ][index];
      return [
        `  - item_id: ${item}`,
        "    result: PASS",
        "    evidence_refs:",
        `      - ${evidence}`,
        "    confidence: high",
        "    notes: Comment-backed structured audit fixture.",
      ].join("\n");
    }),
    "",
  ].join("\n");
}

function commentPayload(yaml: string, overrides: Record<string, any> = {}): any {
  return {
    id: 4796054046,
    html_url: "https://github.com/watchout/ai-dev-framework/pull/999#issuecomment-4796054046",
    issue_url: "https://api.github.com/repos/watchout/ai-dev-framework/issues/999",
    user: { login: "codex-audit" },
    body: `Structured audit.\n\n\`\`\`yaml\n${yaml}\`\`\`\n`,
    ...overrides,
  };
}

function writeComment(dir: string, payload: any): string {
  const file = path.join(dir, "comment.json");
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

function resolveWithComment(dir: string, comment: any, ref = "https://github.com/watchout/ai-dev-framework/pull/999#issuecomment-4796054046"): { exitCode: number; json: any; stdout: string } {
  const commentFile = writeComment(dir, comment);
  return run(resolverScript, [
    "--structured-audit-comment-ref",
    ref,
    "--actual-repo",
    "watchout/ai-dev-framework",
    "--actual-pr",
    "999",
    "--actual-head",
    head,
    "--result-dir",
    path.join(dir, ".shirube-rapid-lite"),
    "--comment-fixture",
    commentFile,
    "--format",
    "json",
  ]);
}

function blockerCodes(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { code: string }) => finding.code);
}

describe("comment-backed structured audit refs", () => {
  it("keeps local structured_audit_ref file paths compatible", () => {
    const result = run(resolverScript, [
      "--structured-audit-ref",
      "test/fixtures/shirube/audit-checklist/audit.pass.yaml",
      "--result-dir",
      ".tmp/structured-audit-local",
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.materialized_path).toBe("test/fixtures/shirube/audit-checklist/audit.pass.yaml");
    expect(result.json.owner_approval_synthesized).toBe(false);
  });

  it("materializes a valid GitHub PR comment URL with fenced structured audit YAML", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml()));
      const materialized = result.json.materialized_path;
      const source = JSON.parse(readFileSync(result.json.source_metadata_path, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.would_block).toBe(false);
      expect(materialized).toBe(path.join(dir, ".shirube-rapid-lite/structured-audit.yaml"));
      expect(existsSync(materialized)).toBe(true);
      expect(readFileSync(materialized, "utf8")).toContain("schema_version: shirube-structured-audit/v1");
      expect(source.schema_version).toBe("shirube-comment-backed-audit-source/v1");
      expect(source.source_comment_url).toBe("https://github.com/watchout/ai-dev-framework/pull/999#issuecomment-4796054046");
      expect(source.target_branch_mutated).toBe(false);
      expect(source.owner_approval_synthesized).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("materializes a valid github-comment URI", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(
        dir,
        commentPayload(auditYaml(), { html_url: "https://github.com/watchout/ai-dev-framework/issues/999#issuecomment-4796054046" }),
        "github-comment://watchout/ai-dev-framework/pull/999#issuecomment-4796054046",
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(existsSync(result.json.materialized_path)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks comments with no structured audit block", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload("", { body: "Audit prose only." }));

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("audit_block_missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks wrong schema_version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml({ schema_version: "shirube-audit/v1" })));

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("wrong_schema_version");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks target_repo mismatch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml({ target_repo: "watchout/other" })));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("target_repo_mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks target_pr mismatch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml({ target_pr: "998" })));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("target_pr_mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks exact head mismatch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml({ exact_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", pr_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("head_mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks missing exact_head_sha / pr_head_sha", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const yaml = auditYaml().replace(`exact_head_sha: ${head}\n`, "").replace(`pr_head_sha: ${head}\n`, "");
      const result = resolveWithComment(dir, commentPayload(yaml));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("missing_exact_head");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks maker/checker violations", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const result = resolveWithComment(dir, commentPayload(auditYaml({ reviewer_actor: "codex-adf", implementation_actor: "codex-adf" })));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("maker_checker_violation");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks owner approval embedded in audit comments", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const yaml = `${auditYaml()}approval_granted: true\n`;
      const result = resolveWithComment(dir, commentPayload(yaml));

      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerCodes(result)).toContain("owner_approval_in_audit");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes check-audit-checklist with a valid materialized comment audit", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-"));
    try {
      const resolved = resolveWithComment(dir, commentPayload(auditYaml()));
      const checked = run(checkAuditScript, [
        "--checklist",
        "test/fixtures/shirube/audit-checklist/checklist.pass.yaml",
        "--audit",
        resolved.json.materialized_path,
        "--machine-evidence",
        "test/fixtures/shirube/audit-checklist/machine-evidence.pass.yaml",
        "--expected-head",
        head,
        "--format",
        "json",
      ]);

      expect(checked.exitCode).toBe(0);
      expect(checked.json.verdict).toBe("PASS");
      expect(checked.json.would_block).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets Rapid/Lite consume a materialized comment audit without owner approval synthesis", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-report-"));
    try {
      const resolved = resolveWithComment(dir, commentPayload(auditYaml()));
      const prBody = path.join(dir, "pr-body.md");
      writeFileSync(prBody, [
        "<!-- shirube:rapid-lite-report-fixture/v1 -->",
        "execution_context_ref: test/fixtures/shirube/execution-context/valid-dev.yaml",
        "adoption_plan_ref: test/fixtures/shirube/adoption/greenfield.pass.yaml",
        "repo_spec_ref: test/fixtures/shirube/control-state-completeness/repo-spec.pass.yaml",
        "source_mirror_ref: test/fixtures/shirube/control-state-completeness/source-mirror.pass.yaml",
        "handoff_ref: test/fixtures/shirube/gate-contract/rapid-lite.pass.yaml",
        "lifecycle_state_ref: test/fixtures/shirube/lifecycle/pass.execution-ready.yaml",
        "rule_pack_ref: .shirube/design-rule-packs/shirube-default-design-rules.yaml",
        "validation_evidence_ref: test/fixtures/shirube/rapid-lite-report/validation.external-head.yaml",
        "owner_decision_ref: test/fixtures/shirube/lifecycle/owner-decision.ready.yaml",
        "enforcement_policy_ref: test/fixtures/shirube/enforcement-policy/report-only.pass.yaml",
        "audit_checklist_ref: test/fixtures/shirube/audit-checklist/checklist.pass.yaml",
        `structured_audit_ref: ${resolved.json.materialized_path}`,
        "audit_machine_evidence_ref: test/fixtures/shirube/audit-checklist/machine-evidence.pass.yaml",
        "",
      ].join("\n"));
      const result = run(reportScript, [
        "--result-dir",
        path.join(dir, ".shirube-rapid-lite-report"),
        "--changed-files",
        "test/fixtures/shirube/gate-contract/changed-files.pass.txt",
        "--pr-body",
        prBody,
        "--actual-repo",
        "watchout/ai-dev-framework",
        "--actual-branch",
        "codex/509-comment-backed-audit",
        "--actual-head",
        head,
        "--diff-root",
        ".",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(["PASS", "PASS_WITH_WARN"]).toContain(result.json.verdict);
      expect(result.json.would_block).toBe(false);
      expect(result.json.owner_must_not_merge).toBe(false);
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "audit-checklist").verdict).toBe("PASS");
      expect(resolved.json.owner_approval_synthesized).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("replays the watchout/agent-comms-mcp#813 comment-backed audit pattern", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-audit-comment-813-"));
    try {
      const result = run(resolverScript, [
        "--structured-audit-comment-ref",
        "https://github.com/watchout/agent-comms-mcp/pull/813#issuecomment-4796054046",
        "--actual-repo",
        "watchout/agent-comms-mcp",
        "--actual-pr",
        "813",
        "--actual-head",
        "bb868dc07dceb8536907b8aee115fbc765fb2b50",
        "--result-dir",
        path.join(dir, ".shirube-rapid-lite"),
        "--comment-fixture",
        path.join(resolverFixtures, "comment.agent-comms-813.json"),
        "--format",
        "json",
      ]);
      const checked = run(checkAuditScript, [
        "--checklist",
        "test/fixtures/shirube/audit-checklist/checklist.pass.yaml",
        "--audit",
        result.json.materialized_path,
        "--machine-evidence",
        "test/fixtures/shirube/audit-checklist/machine-evidence.pass.yaml",
        "--expected-head",
        "bb868dc07dceb8536907b8aee115fbc765fb2b50",
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.source_comment_url).toBe("https://github.com/watchout/agent-comms-mcp/pull/813#issuecomment-4796054046");
      expect(result.json.exact_head_sha).toBe("bb868dc07dceb8536907b8aee115fbc765fb2b50");
      expect(checked.json.verdict).toBe("PASS");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
