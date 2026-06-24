import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const reusableWorkflow = path.join(root, ".github/workflows/shirube-rapid-lite-reusable.yml");
const callerTemplate = path.join(root, "templates/adoption-pack/hotel-lite/workflow-caller.yml");
const renderScript = "scripts/shirube/render-adoption-pack.mjs";
const checkScript = "scripts/shirube/check-adoption-pack.mjs";
const fixtures = path.join(root, "test/fixtures/shirube/workflow-caller");

function fixtureLines(name: string): string[] {
  return readFileSync(path.join(fixtures, name), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

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

describe("Shirube Rapid/Lite reusable workflow caller", () => {
  it("defines the reusable workflow input model and runs pinned ADF scripts", () => {
    const workflow = readFileSync(reusableWorkflow, "utf8");

    expect(workflow).toContain("workflow_call:");
    for (const input of fixtureLines("required-inputs.txt")) {
      expect(workflow).toContain(`      ${input}:`);
    }
    expect(workflow).toContain("Checkout target repository");
    expect(workflow).toContain("Checkout pinned ADF");
    expect(workflow).toContain('node "$ADF_DIR/scripts/shirube/run-rapid-lite-report.mjs"');
    expect(workflow).toContain("matrix_ref:");
    expect(workflow).toContain("rule_pack_ref:");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("exit 0");
  });

  it("defines a thin target caller with the required PR triggers", () => {
    const template = readFileSync(callerTemplate, "utf8");

    expect(template).toContain("pull_request:");
    for (const type of fixtureLines("pull-request-types.txt")) {
      expect(template).toContain(`      - ${type}`);
    }
    expect(template).toContain('uses: "{{FRAMEWORK_REPO}}/.github/workflows/shirube-rapid-lite-reusable.yml@{{FRAMEWORK_REF_NAME}}"');
    expect(template).toContain('framework_ref: "{{FRAMEWORK_REF}}"');
    expect(template).toContain("report_only: true");
    expect(template).toContain("handoff_ref: .shirube/control-handoffs/CH-001.yaml");
  });

  it("renders an optional caller that passes adoption-pack safety checks", () => {
    const out = mkdtempSync(path.join(tmpdir(), "shirube-workflow-caller-"));
    try {
      const render = run(renderScript, [
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
        "--mode",
        "render",
        "--include-workflow-caller",
        "--out",
        out,
        "--format",
        "json",
      ]);
      expect(render.exitCode).toBe(0);
      expect(render.json.target_change_policy.workflow_caller_generated).toBe(true);
      expect(existsSync(path.join(out, ".github/workflows/shirube-rapid-lite-gates-report.yml"))).toBe(true);

      const check = run(checkScript, [
        "--pack-root",
        out,
        "--target-repo",
        "watchout/example",
        "--profile",
        "hotel-lite",
        "--format",
        "json",
      ]);
      expect(check.exitCode).toBe(0);
      expect(check.json.verdict).toBe("PASS");
      expect(check.json.would_block).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("can run the ADF report helper from a target repo root without copied scripts", () => {
    const out = mkdtempSync(path.join(tmpdir(), "shirube-workflow-caller-target-"));
    try {
      const render = run(renderScript, [
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
        "--mode",
        "render",
        "--include-workflow-caller",
        "--out",
        out,
        "--format",
        "json",
      ]);
      expect(render.exitCode).toBe(0);

      mkdirSync(path.join(out, ".shirube-rapid-lite"), { recursive: true });
      writeFileSync(path.join(out, "changed-files.txt"), ".github/workflows/shirube-rapid-lite-gates-report.yml\n");
      writeFileSync(path.join(out, "pr-body.md"), [
        "execution_context_ref: .shirube/execution-context.yaml",
        "adoption_plan_ref: .shirube/adoption-intake.yaml",
        "existing_state_ref: .shirube/existing-state-scan.yaml",
        "repo_spec_ref: .shirube/repo-spec.yaml",
        "lifecycle_state_ref: .shirube/lifecycle-state.yaml",
        "handoff_ref: .shirube/control-handoffs/CH-001.yaml",
        "enforcement_policy_ref: .shirube/enforcement-policy.yaml",
        `matrix_ref: ${path.join(root, ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml")}`,
        `rule_pack_ref: ${path.join(root, ".shirube/design-rule-packs/shirube-default-design-rules.yaml")}`,
        "",
      ].join("\n"));

      const stdout = execFileSync("node", [
        path.join(root, "scripts/shirube/run-rapid-lite-report.mjs"),
        "--result-dir",
        ".shirube-rapid-lite",
        "--changed-files",
        "changed-files.txt",
        "--pr-body",
        "pr-body.md",
        "--diff-root",
        ".",
        "--actual-repo",
        "watchout/example",
        "--actual-branch",
        "shirube/rapid-lite-adoption",
        "--actual-head",
        "0123456789abcdef0123456789abcdef01234567",
        "--format",
        "json",
      ], {
        cwd: out,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const report = JSON.parse(stdout);

      expect(report.schema).toBe("shirube-rapid-lite-report/v1");
      expect(report.gates.map((gate: { gate: string }) => gate.gate)).toContain("gate-contract");
      expect(report.gates.map((gate: { gate: string }) => gate.gate)).toContain("design-rules");
      expect(report.gates.some((gate: { report_failed: boolean }) => gate.report_failed)).toBe(false);
      expect(existsSync(path.join(out, ".shirube-rapid-lite/gate-contract.json"))).toBe(true);
      expect(existsSync(path.join(out, "scripts/shirube"))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
