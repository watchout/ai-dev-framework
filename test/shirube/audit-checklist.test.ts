import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixtures = path.join(root, "test/fixtures/shirube/audit-checklist");
const generateScript = "scripts/shirube/generate-audit-checklist.mjs";
const checkScript = "scripts/shirube/check-audit-checklist.mjs";

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function run(script: string, args: string[]): { exitCode: number; json: any; stdout: string } {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd: root,
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

function check(args: string[] = []): { exitCode: number; json: any; stdout: string } {
  return run(checkScript, [
    "--checklist",
    fixture("checklist.pass.yaml"),
    "--audit",
    fixture("audit.pass.yaml"),
    "--machine-evidence",
    fixture("machine-evidence.pass.yaml"),
    "--expected-head",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "--format",
    "json",
    ...args,
  ]);
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

describe("Shirube audit checklist P0", () => {
  it("generates a checklist from handoff/cell plan facts", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "shirube-audit-checklist-"));
    const out = path.join(outDir, "audit-checklist.yaml");
    try {
      const result = run(generateScript, [
        "--handoff",
        fixture("handoff.pass.yaml"),
        "--out",
        out,
        "--format",
        "json",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.schema).toBe("shirube-audit-checklist-generate/v1");
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.item_count).toBe(11);
      expect(readFileSync(out, "utf8")).toContain("schema_version: \"shirube-audit-checklist/v1\"");
      const sources = result.json.checklist.items.map((item: { source: string }) => item.source);
      expect(sources).toEqual([
        "acceptance_criteria",
        "stop_condition",
        "allowed_paths",
        "forbidden_paths",
        "protected_surface",
        "validation_command",
        "required_evidence",
        "required_evidence",
        "role_boundary",
        "owner_decision",
        "post_merge",
      ]);
      expect(result.json.checklist.items.find((item: { source: string }) => item.source === "validation_command").verification_method).toBe("executable");
      expect(result.json.checklist.items.find((item: { source: string }) => item.source === "acceptance_criteria").verification_method).toBe("semantic");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("passes a complete structured audit with machine evidence", () => {
    const result = check();

    expect(result.exitCode).toBe(0);
    expect(result.json.schema).toBe("shirube-audit-checklist-check/v1");
    expect(result.json.verdict).toBe("PASS");
    expect(result.json.current_phase).toBe("AUDIT_REQUIRED");
    expect(result.json.next_action.action).toBe("request_independent_audit");
    expect(result.json.owner_approval_allowed).toBe(false);
    expect(result.json.audit_completion.machine_readable).toBe(true);
    expect(result.json.audit_completion.complete).toBe(false);
    expect(result.json.would_block).toBe(false);
    expect(result.json.owner_must_not_merge).toBe(false);
    expect(result.json.blockers).toEqual([]);
  });

  it("does not treat self-authored resolver-looking source metadata as trusted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shirube-self-authored-audit-source-"));
    const source = path.join(dir, "audit-source.json");
    try {
      writeFileSync(source, `${JSON.stringify({
        schema_version: "shirube-comment-backed-audit-source/v1",
        generated_by: "scripts/shirube/resolve-structured-audit-ref.mjs",
        resolver_schema: "shirube-structured-audit-ref-resolution/v1",
        source_type: "github_pr_comment",
        source_comment_url: "https://github.com/watchout/ai-dev-framework/pull/490#issuecomment-1",
        comment_id: "1",
        target_repo: "watchout/ai-dev-framework",
        target_pr: "490",
        exact_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        materialized_path: fixture("audit.pass.yaml"),
        trusted_base_workflow: true,
        target_branch_mutated: false,
        owner_approval_synthesized: false,
      }, null, 2)}\n`);

      const result = check([
        "--audit-source",
        source,
        "--expected-repo",
        "watchout/ai-dev-framework",
        "--expected-pr",
        "490",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.audit_completion.source_runtime_trusted).toBe(false);
      expect(result.json.audit_completion.trusted_source).toBe(false);
      expect(result.json.audit_completion.complete).toBe(false);
      expect(result.json.current_phase).toBe("AUDIT_REQUIRED");
      expect(result.json.owner_approval_allowed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks a missing audit checklist", () => {
    const result = check(["--checklist", fixture("missing.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-001");
    expect(result.json.next_action.reason).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("blocks malformed required checklist items", () => {
    const result = check(["--checklist", fixture("checklist.malformed.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-002");
  });

  it("blocks duplicate item results", () => {
    const result = check(["--audit", fixture("audit.duplicate.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-003");
  });

  it("blocks unanswered required items", () => {
    const result = check(["--audit", fixture("audit.missing-required.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-004");
  });

  it("blocks executable PASS without machine evidence", () => {
    const result = check([
      "--audit",
      fixture("audit.executable-no-machine.yaml"),
      "--machine-evidence",
      fixture("machine-evidence.empty.yaml"),
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-005");
  });

  it("blocks FAIL without evidence or action", () => {
    const result = check(["--audit", fixture("audit.fail-no-action.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-006");
  });

  it("blocks UNVERIFIED without escalation", () => {
    const result = check(["--audit", fixture("audit.unverified-no-escalation.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-007");
  });

  it("blocks audit head mismatch", () => {
    const result = check(["--audit", fixture("audit.head-mismatch.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-008");
  });

  it("blocks maker/checker violation", () => {
    const result = check(["--audit", fixture("audit.same-maker.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-009");
  });

  it("blocks scope-only audit requests in full operational mode", () => {
    const result = check(["--audit", fixture("audit.scope-only.yaml")]);

    expect(result.exitCode).toBe(0);
    expect(result.json.verdict).toBe("BLOCKED");
    expect(blockerIds(result)).toContain("AUDIT-LIST-010");
  });
});
