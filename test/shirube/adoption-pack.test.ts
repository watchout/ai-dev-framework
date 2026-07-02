import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readStructuredFile } from "../../scripts/shirube/lib.mjs";

const root = process.cwd();
const script = "scripts/shirube/render-adoption-pack.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/adoption-pack");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function frameworkRef(): string {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return `watchout/ai-dev-framework@${head}`;
}

function run(args: string[]): { exitCode: number; json: any; stdout: string } {
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

function render(out: string): { exitCode: number; json: any; stdout: string } {
  return renderWithOptions(out, []);
}

function renderWithOptions(out: string, extraArgs: string[]): { exitCode: number; json: any; stdout: string } {
  return run([
    "--profile",
    "hotel-lite",
    "--target-repo",
    "watchout/example",
    "--product",
    "Example",
    "--source-control",
    "watchout/control#1",
    "--framework-ref",
    frameworkRef(),
    "--owner-actor",
    "watchout",
    "--owner-confirmation-ref",
    "https://github.com/watchout/control/issues/1#issuecomment-owner-confirmed",
    "--cell-id",
    "CELL-EXAMPLE-ADOPTION-001",
    "--generated-at",
    "2026-06-23T00:00:00Z",
    "--mode",
    "render",
    ...extraArgs,
    "--out",
    out,
    "--format",
    "json",
  ]);
}

function expectedFiles(name = "expected-files.txt"): string[] {
  return readFileSync(fixture(name), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function forbiddenFiles(): string[] {
  return readFileSync(fixture("forbidden-target-paths.txt"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("Shirube overlay adoption pack renderer", () => {
  it("renders the minimal hotel-lite target overlay without copied scripts or workflow caller", () => {
    const out = mkdtempSync(path.join(tmpdir(), "shirube-adoption-pack-"));
    try {
      const result = render(out);
      const generated = result.json.generated_files.map((file: { path: string }) => file.path).sort((a: string, b: string) => a.localeCompare(b));

      expect(result.exitCode).toBe(0);
      expect(result.json.schema).toBe("shirube-adoption-pack-render/v1");
      expect(result.json.verdict).toBe("PASS");
      expect(result.json.profile).toBe("hotel-lite");
      expect(result.json.target_repo).toBe("watchout/example");
      expect(generated).toEqual(expectedFiles());

      for (const file of expectedFiles()) {
        expect(existsSync(path.join(out, file))).toBe(true);
      }
      for (const file of forbiddenFiles()) {
        expect(existsSync(path.join(out, file))).toBe(false);
      }

      expect(result.json.target_change_policy.workflow_caller_generated).toBe(false);
      expect(result.json.target_change_policy.package_changes_allowed).toBe(false);
      expect(result.json.target_change_policy.external_repo_mutation_allowed).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("optionally renders the thin workflow caller without copied scripts or package files", () => {
    const out = mkdtempSync(path.join(tmpdir(), "shirube-adoption-pack-"));
    try {
      const result = renderWithOptions(out, ["--include-workflow-caller"]);
      const generated = result.json.generated_files.map((file: { path: string }) => file.path).sort((a: string, b: string) => a.localeCompare(b));

      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("PASS");
      expect(generated).toEqual(expectedFiles("expected-files-with-workflow-caller.txt"));
      expect(result.json.target_change_policy.workflow_caller_generated).toBe(true);
      expect(result.json.target_change_policy.workflow_caller_path).toBe(".github/workflows/shirube-rapid-lite-gates-report.yml");
      expect(existsSync(path.join(out, ".github/workflows/shirube-rapid-lite-gates-report.yml"))).toBe(true);
      for (const file of forbiddenFiles()) {
        expect(existsSync(path.join(out, file))).toBe(false);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("writes parseable control artifacts with partial-pilot to report-only semantics", () => {
    const out = mkdtempSync(path.join(tmpdir(), "shirube-adoption-pack-"));
    try {
      const result = render(out);
      expect(result.exitCode).toBe(0);

      const executionContext = readStructuredFile(path.join(out, ".shirube/execution-context.yaml"));
      const adoption = readStructuredFile(path.join(out, ".shirube/adoption-intake.yaml"));
      const repoSpec = readStructuredFile(path.join(out, ".shirube/repo-spec.yaml"));
      const handoff = readStructuredFile(path.join(out, ".shirube/control-handoffs/CH-001.yaml"));
      const lifecycle = readStructuredFile(path.join(out, ".shirube/lifecycle-state.yaml"));
      const sourceMirror = readStructuredFile(path.join(out, ".shirube/source-mirrors/control-issue.yaml"));
      const enforcement = readStructuredFile(path.join(out, ".shirube/enforcement-policy.yaml"));
      const controlState = readStructuredFile(path.join(out, ".shirube/control-state-completeness.yaml"));
      const readme = readFileSync(path.join(out, "docs/shirube/README.md"), "utf8");

      expect(executionContext.primary.repo).toBe("watchout/example");
      expect(executionContext.active_role).toBe("lead");
      expect(executionContext.repo_relations.map((relation: { relation: string }) => relation.relation)).toEqual([
        "primary",
        "framework_support",
        "control_source",
      ]);

      expect(adoption.current_status).toBe("PARTIAL_SHIRUBE_PILOT");
      expect(adoption.target_status_after_merge).toBe("RAPID_LITE_REPORT_ONLY");
      expect(adoption.disposition).toBe("retrofit_accelerate");

      expect(repoSpec.source_of_truth_policy.llm_final_authority).toBe(false);
      expect(repoSpec.source_of_truth_policy.mirror_is_truth).toBe(false);
      expect(repoSpec.agent_permission_boundary.allowed_paths).toEqual([
        ".shirube/**",
        "docs/shirube/**",
        ".github/workflows/shirube-rapid-lite-gates-report.yml",
      ]);

      expect(handoff.cell.allowed_paths).toEqual([
        ".shirube/**",
        "docs/shirube/**",
        ".github/workflows/shirube-rapid-lite-gates-report.yml",
      ]);
      expect(handoff.cell.forbidden_paths).toContain("package.json");
      expect(handoff.cell["CELL-ID"]).toBe("CELL-EXAMPLE-ADOPTION-001");
      expect(handoff.owner.actor).toBe("watchout");
      expect(handoff.owner_confirmation_ref).toBe("https://github.com/watchout/control/issues/1#issuecomment-owner-confirmed");
      expect(handoff.owner_decision.required_before_merge).toBe(true);
      expect(handoff.owner_decision.committed_pending_policy_only).toBe(true);
      expect(handoff.post_merge.required_when_done_claimed).toBe(true);

      expect(lifecycle.current_phase).toBe("HANDOFF_READY");
      expect(sourceMirror.source_type).toBe("github_issue");
      expect(sourceMirror.source_repo).toBe("watchout/control");
      expect(sourceMirror.issue_number).toBe(1);
      expect(sourceMirror.target_repo).toBe("watchout/example");
      expect(sourceMirror.product).toBe("Example");
      expect(sourceMirror.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sourceMirror.mirror_is_truth).toBe(false);
      expect(sourceMirror.source_authority.remains_authority).toBe(true);
      expect(sourceMirror.extracted_fields.owner_confirmation).toBe("https://github.com/watchout/control/issues/1#issuecomment-owner-confirmed");

      expect(enforcement.mode).toBe("report_only");
      expect(enforcement.enforce_by).toBe("2026-07-23");
      expect(enforcement.reason).toBe("Bounded Rapid/Lite report-only calibration for watchout/control#1 before owner-block promotion.");
      expect(enforcement.owner_observed).toBe(true);
      expect(enforcement.owner.actor).toBe("watchout");
      expect(enforcement.control_points[0].authority).toBe("deterministic-script");
      expect(enforcement.control_points[0].enforcement.mode).toBe("report-only");
      expect(enforcement.control_points[0].enforcement.enforce_by).toBe("2026-07-31");
      expect(enforcement.control_points[0].enforcement.owner).toBe("repo_owner");
      expect(enforcement.control_points[0].enforcement.reason).toBe("Bounded Rapid/Lite report-only calibration before owner-block promotion.");
      expect(enforcement.required_checks.enabled).toBe(false);
      expect(enforcement.branch_protection.unchanged).toBe(true);

      expect(controlState.required_inventory).toContain("execution_context_report");
      expect(controlState.required_inventory).toContain("post_merge_evidence_before_complete");
      expect(controlState.rules.full_control_claim_requires_full_readiness).toBe(true);

      expect(readme).toContain("LLM output is not authority");
      expect(readme).toContain("`report_only` is not the final enforcement state");
      expect(readme).toContain("The adoption PR must not mix runtime, API, DB, package");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("returns FAILURE for missing required inputs", () => {
    const result = run(["--profile", "hotel-lite", "--mode", "render", "--format", "json"]);

    expect(result.exitCode).toBe(1);
    expect(result.json.schema).toBe("shirube-adoption-pack-render/v1");
    expect(result.json.verdict).toBe("FAILURE");
      expect(result.json.errors.map((error: { code: string }) => error.code)).toEqual(expect.arrayContaining([
        "invalid_target_repo",
        "missing_product",
        "invalid_source_control",
        "invalid_framework_ref",
        "missing_owner_actor",
        "missing_owner_confirmation_ref",
        "missing_cell_id",
        "missing_output",
      ]));
  });
});
