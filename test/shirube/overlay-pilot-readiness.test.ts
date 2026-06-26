import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readStructuredFile } from "../../scripts/shirube/lib.mjs";

const root = process.cwd();
const renderScript = "scripts/shirube/render-adoption-pack.mjs";
const readinessScript = "scripts/shirube/check-overlay-pilot-readiness.mjs";
const actualHead = "0123456789abcdef0123456789abcdef01234567";

function frameworkRef(): string {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return `watchout/ai-dev-framework@${head}`;
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

function render(out: string, extraArgs: string[] = []): void {
  const result = run(renderScript, [
    "--profile",
    "hotel-lite",
    "--target-repo",
    "watchout/example",
    "--product",
    "Example",
    "--source-control",
    "watchout/example#1",
    "--framework-ref",
    frameworkRef(),
    "--owner-actor",
    "watchout",
    "--owner-confirmation-ref",
    "https://github.com/watchout/example/issues/1#issuecomment-owner-confirmed",
    "--cell-id",
    "CELL-EXAMPLE-ADOPTION-001",
    "--mode",
    "render",
    "--include-workflow-caller",
    ...extraArgs,
    "--out",
    out,
    "--format",
    "json",
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.json.verdict).toBe("PASS");
}

function check(out: string, targetRepo = "watchout/example"): { exitCode: number; json: any; stdout: string } {
  return run(readinessScript, [
    "--pack-root",
    out,
    "--target-repo",
    targetRepo,
    "--profile",
    "hotel-lite",
    "--actual-head",
    actualHead,
    "--format",
    "json",
  ]);
}

function withPack(fn: (out: string) => void): void {
  const out = mkdtempSync(path.join(tmpdir(), "shirube-overlay-pilot-"));
  try {
    render(out);
    fn(out);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function blockerIds(result: { json: any }): string[] {
  return result.json.blockers.map((finding: { item_id: string }) => finding.item_id);
}

function nestedIds(result: { json: any }): string[] {
  return result.json.blockers.flatMap((finding: { nested?: Array<{ item_id?: string }> }) => finding.nested ?? [])
    .map((finding: { item_id?: string }) => finding.item_id)
    .filter(Boolean);
}

function replaceFile(file: string, pattern: string | RegExp, replacement: string): void {
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(pattern, replacement));
}

describe("Shirube overlay pilot readiness dry-run gate", () => {
  it("passes a generated pack with same-repo source control without CTX-006", () => {
    withPack((out) => {
      const context = readStructuredFile(path.join(out, ".shirube/execution-context.yaml"));
      expect(context.repo_relations.map((relation: { relation: string }) => relation.relation)).toContain("same_repo_control_source");
      expect(context.repo_relations.map((relation: { relation: string }) => relation.relation)).not.toContain("control_source");

      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(["PASS", "PASS_WITH_WARN"]).toContain(result.json.verdict);
      expect(result.json.would_block).toBe(false);
      expect(result.json.owner_must_not_merge).toBe(false);
      expect(nestedIds(result)).not.toContain("CTX-006");
    });
  }, 20000);

  it("passes with concrete owner and cell inputs and produces a Rapid/Lite dry-run", () => {
    withPack((out) => {
      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(["PASS", "PASS_WITH_WARN"]).toContain(result.json.verdict);
      expect(result.json.adoption_pack_check.verdict).toBe("PASS");
      expect(["PASS", "PASS_WITH_WARN"]).toContain(result.json.rapid_lite_dry_run.verdict);
      expect(result.json.rapid_lite_dry_run.would_block).toBe(false);
      expect(result.json.rapid_lite_dry_run.gates.map((gate: { gate: string }) => gate.gate)).toEqual([
        "execution-context",
        "adoption",
        "gate-contract",
        "design-rules",
        "audit-checklist",
        "review-plan",
        "lifecycle",
        "enforcement-policy",
        "control-state-completeness",
      ]);
      expect(existsSync(path.join(out, "scripts/shirube"))).toBe(false);
    });
  }, 20000);

  it("blocks missing cell-id before target PR creation", () => {
    withPack((out) => {
      replaceFile(path.join(out, ".shirube/control-handoffs/CH-001.yaml"), "CELL-ID: CELL-EXAMPLE-ADOPTION-001", "CELL-ID: <CELL-ID>");
      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("OPR-004");
    });
  }, 20000);

  it("blocks lifecycle phase mismatch detected by the dry-run", () => {
    withPack((out) => {
      replaceFile(path.join(out, ".shirube/lifecycle-state.yaml"), "current_phase: HANDOFF_READY", "current_phase: ADOPTION_READY");
      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("OPR-009");
      expect(nestedIds(result)).toContain("LC-BOOT-001");
    });
  }, 20000);

  it("blocks when the generated overlay dry-run would block", () => {
    withPack((out) => {
      replaceFile(
        path.join(out, ".shirube/control-handoffs/CH-001.yaml"),
        "    - '**/branch-protection/**'",
        "    - docs/shirube/**\n    - '**/branch-protection/**'",
      );
      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("OPR-002");
      expect(nestedIds(result)).toContain("RL-PR-003");
    });
  }, 20000);

  it("blocks if a committed pending owner decision is treated like approval evidence", () => {
    withPack((out) => {
      replaceFile(
        path.join(out, ".shirube/control-handoffs/CH-001.yaml"),
        "  exact_head_sha: null\n  decision_ref: null",
        `  decision: PENDING\n  approval_granted: false\n  exact_head_sha: ${actualHead}\n  decision_ref: .shirube/evidence/owner-decision-pending.yaml`,
      );
      const result = check(out);

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(blockerIds(result)).toContain("OPR-006");
    });
  }, 20000);

  it("fails invalid target repo input", () => {
    withPack((out) => {
      const result = check(out, "not-a-repo");

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("FAILURE");
      expect(blockerIds(result)).toContain("OPR-008");
    });
  });

  it("fails invalid source-control metadata in the generated source mirror", () => {
    withPack((out) => {
      replaceFile(path.join(out, ".shirube/source-mirrors/control-issue.yaml"), "source_ref: watchout/example#1", "source_ref: watchout/example/issues/1");
      const result = check(out);

      expect(result.exitCode).toBe(1);
      expect(result.json.verdict).toBe("FAILURE");
      expect(blockerIds(result)).toContain("OPR-007");
    });
  });
});
