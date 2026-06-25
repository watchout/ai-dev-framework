import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = "scripts/shirube/run-rapid-lite-report.mjs";
const fixtures = path.join(root, "test/fixtures/shirube");

function fixture(name: string): string {
  return path.join(fixtures, name);
}

function run(args: string[]): { exitCode: number; json: any; resultDir: string } {
  const resultDir = mkdtempSync(path.join(tmpdir(), "shirube-rapid-lite-"));
  try {
    const stdout = execFileSync("node", [script, "--result-dir", resultDir, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, json: JSON.parse(stdout), resultDir };
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer | string };
    const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : err.stdout ?? "";
    return { exitCode: err.status ?? 1, json: JSON.parse(stdout), resultDir };
  }
}

describe("Shirube Rapid/Lite report workflow helper", () => {
  it("runs relevant gates from explicit PR body refs and writes JSON artifacts", () => {
    const result = run([
      "--changed-files",
      fixture("gate-contract/changed-files.pass.txt"),
      "--pr-body",
      fixture("execution-context/pr-body.report-pass.md"),
      "--actual-repo",
      "watchout/ai-dev-framework",
      "--actual-branch",
      "codex/487-execution-context-lock",
      "--actual-head",
      "0123456789abcdef0123456789abcdef01234567",
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.schema).toBe("shirube-rapid-lite-report/v1");
      expect(result.json.report_only).toBe(true);
      expect(["PASS", "PASS_WITH_WARN", "BLOCKED"]).toContain(result.json.verdict);
      expect(result.json.gates.map((gate: { gate: string }) => gate.gate)).toEqual([
        "execution-context",
        "adoption",
        "lifecycle",
        "gate-contract",
        "design-rules",
        "audit-checklist",
        "enforcement-policy",
        "control-state-completeness",
      ]);
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "execution-context").status).toBe("ran");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "adoption").status).toBe("ran");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "lifecycle").status).toBe("ran");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "gate-contract").status).toBe("ran");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "design-rules").status).toBe("ran");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "audit-checklist").status).toBe("skipped");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "enforcement-policy").status).toBe("ran");
      const controlState = result.json.gates.find((gate: { gate: string }) => gate.gate === "control-state-completeness");
      expect(controlState.status).toBe("ran");
      expect(controlState.verdict).toBe("PASS");
      expect(readFileSync(path.join(result.resultDir, "aggregate.json"), "utf8")).toContain("shirube-rapid-lite-report/v1");
      expect(readFileSync(path.join(result.resultDir, "summary.md"), "utf8")).toContain("<!-- shirube-rapid-lite-gates-report/v1 -->");
      expect(readFileSync(path.join(result.resultDir, "execution-context.json"), "utf8")).toContain("shirube-execution-context-check/v1");
      expect(readFileSync(path.join(result.resultDir, "adoption.json"), "utf8")).toContain("shirube-adoption-check/v1");
      expect(readFileSync(path.join(result.resultDir, "lifecycle.json"), "utf8")).toContain("shirube-lifecycle-check/v1");
      expect(readFileSync(path.join(result.resultDir, "gate-contract.json"), "utf8")).toContain("shirube-gate-contract-check/v1");
      expect(readFileSync(path.join(result.resultDir, "design-rules.json"), "utf8")).toContain("shirube-design-rule-check/v1");
      expect(readFileSync(path.join(result.resultDir, "enforcement-policy.json"), "utf8")).toContain("shirube-enforcement-policy-check/v1");
      expect(readFileSync(path.join(result.resultDir, "control-state-completeness.json"), "utf8")).toContain("shirube-control-state-completeness/v1");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("runs audit checklist when checklist and structured audit refs are present", () => {
    const result = run([
      "--changed-files",
      fixture("gate-contract/changed-files.pass.txt"),
      "--pr-body",
      fixture("rapid-lite-report/pr-body.audit-checklist.md"),
      "--actual-repo",
      "watchout/ai-dev-framework",
      "--actual-branch",
      "codex/487-audit-checklist-report",
      "--actual-head",
      "0123456789abcdef0123456789abcdef01234567",
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.discovered_inputs.auditChecklist).toBe("test/fixtures/shirube/audit-checklist/checklist.pass.yaml");
      expect(result.json.discovered_inputs.structuredAudit).toBe("test/fixtures/shirube/rapid-lite-report/audit.pass.yaml");
      expect(result.json.discovered_inputs.auditMachineEvidence).toBe("test/fixtures/shirube/audit-checklist/machine-evidence.pass.yaml");
      const auditChecklist = result.json.gates.find((gate: { gate: string }) => gate.gate === "audit-checklist");
      expect(auditChecklist.status).toBe("ran");
      expect(auditChecklist.verdict).toBe("PASS");
      expect(auditChecklist.would_block).toBe(false);
      expect(readFileSync(path.join(result.resultDir, "audit-checklist.json"), "utf8")).toContain("shirube-audit-checklist-check/v1");
      expect(readFileSync(path.join(result.resultDir, "summary.md"), "utf8")).toContain("audit-checklist");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("blocks aggregate when audit checklist check blocks", () => {
    const result = run([
      "--changed-files",
      fixture("gate-contract/changed-files.pass.txt"),
      "--pr-body",
      fixture("rapid-lite-report/pr-body.audit-checklist-blocked.md"),
      "--actual-repo",
      "watchout/ai-dev-framework",
      "--actual-branch",
      "codex/487-audit-checklist-report",
      "--actual-head",
      "0123456789abcdef0123456789abcdef01234567",
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(result.json.would_block).toBe(true);
      expect(result.json.owner_must_not_merge).toBe(true);
      const auditChecklist = result.json.gates.find((gate: { gate: string }) => gate.gate === "audit-checklist");
      expect(auditChecklist.status).toBe("ran");
      expect(auditChecklist.verdict).toBe("BLOCKED");
      expect(auditChecklist.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("AUDIT-LIST-005");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("does not select stale self-dogfood handoffs from the repo tree", () => {
    const result = run([
      "--changed-files",
      fixture("rapid-lite-report/changed-files.empty.txt"),
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      const executionContext = result.json.gates.find((gate: { gate: string }) => gate.gate === "execution-context");
      expect(executionContext.verdict).toBe("BLOCKED");
      expect(executionContext.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("CTX-001");
      expect(result.json.discovered_inputs.handoff).not.toBe(".shirube/self-dogfood/control-handoff.yaml");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "gate-contract").status).toBe("skipped");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  });

  it("uses a changed-file handoff before any stale repo-local handoff", () => {
    const result = run([
      "--changed-files",
      fixture("rapid-lite-report/changed-files.changed-handoff.txt"),
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.discovered_inputs.handoff).toBe("test/fixtures/shirube/rapid-lite-report/handoff.changed.yaml");
      expect(result.json.gates.find((gate: { gate: string }) => gate.gate === "gate-contract").status).toBe("ran");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("passes external validation evidence while preserving pending owner-decision warning", () => {
    const result = run([
      "--changed-files",
      fixture("gate-contract/changed-files.pass.txt"),
      "--pr-body",
      fixture("rapid-lite-report/pr-body.external-validation.md"),
      "--actual-repo",
      "watchout/ai-dev-framework",
      "--actual-branch",
      "codex/487-execution-context-lock",
      "--actual-head",
      "0123456789abcdef0123456789abcdef01234567",
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.discovered_inputs.validation).toBe("test/fixtures/shirube/rapid-lite-report/validation.external-head.yaml");
      const gateContract = result.json.gates.find((gate: { gate: string }) => gate.gate === "gate-contract");
      expect(gateContract.status).toBe("ran");
      expect(gateContract.verdict).toBe("PASS_WITH_WARN");
      expect(gateContract.blockers.map((finding: { item_id: string }) => finding.item_id)).not.toContain("RL-PR-001");
      expect(gateContract.warnings.map((finding: { item_id: string }) => finding.item_id)).toContain("RL-MERGE-W001");
      expect(readFileSync(path.join(result.resultDir, "gate-contract.json"), "utf8")).toContain("validation.external-head.yaml");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("does not block report-only target repos when optional design rules are skipped", () => {
    const temp = mkdtempSync(path.join(tmpdir(), "shirube-rapid-lite-no-design-rules-"));
    const prBody = path.join(temp, "pr-body.md");
    const changedFiles = path.join(temp, "changed-files.txt");
    const resultDir = path.join(temp, "out");
    mkdirSync(path.join(temp, ".shirube/gate-contracts"), { recursive: true });
    writeFileSync(
      path.join(temp, ".shirube/repo-spec.yaml"),
      readFileSync(fixture("control-state-completeness/repo-spec.pass.yaml")),
    );
    writeFileSync(
      path.join(temp, ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml"),
      readFileSync(path.join(root, ".shirube/gate-contracts/shirube-v3-rapid-lite-gate-contract-matrix.yaml")),
    );
    writeFileSync(prBody, [
      `execution_context_ref: ${fixture("execution-context/valid-dev.yaml")}`,
      `adoption_plan_ref: ${fixture("adoption/greenfield.pass.yaml")}`,
      `repo_spec_ref: ${fixture("control-state-completeness/repo-spec.pass.yaml")}`,
      `source_mirror_ref: ${fixture("control-state-completeness/source-mirror.pass.yaml")}`,
      `handoff_ref: ${fixture("gate-contract/rapid-lite.pass.yaml")}`,
      `lifecycle_state_ref: ${fixture("lifecycle/pass.execution-ready.yaml")}`,
      `validation_evidence_ref: ${fixture("rapid-lite-report/validation.external-head.yaml")}`,
      `owner_decision_ref: ${fixture("lifecycle/owner-decision.ready.yaml")}`,
      `enforcement_policy_ref: ${fixture("enforcement-policy/report-only.pass.yaml")}`,
      "",
    ].join("\n"));
    writeFileSync(changedFiles, readFileSync(fixture("gate-contract/changed-files.pass.txt"), "utf8"));

    try {
      const stdout = execFileSync("node", [
        path.join(root, script),
        "--result-dir",
        resultDir,
        "--changed-files",
        changedFiles,
        "--pr-body",
        prBody,
        "--actual-repo",
        "watchout/ai-dev-framework",
        "--actual-branch",
        "shirube/rapid-lite-adoption",
        "--actual-head",
        "0123456789abcdef0123456789abcdef01234567",
        "--diff-root",
        ".",
        "--format",
        "json",
      ], {
        cwd: temp,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const report = JSON.parse(stdout);
      const designRules = report.gates.find((gate: { gate: string }) => gate.gate === "design-rules");
      const controlState = report.gates.find((gate: { gate: string }) => gate.gate === "control-state-completeness");
      expect(designRules.status).toBe("skipped");
      expect(controlState.status).toBe("ran");
      expect(controlState.would_block).toBe(false);
      expect(report.would_block).toBe(false);
      expect(readFileSync(path.join(resultDir, "design-rules.json"), "utf8")).toContain("shirube-skipped-gate-report/v1");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 15000);

  it("runs execution-context first and blocks aggregate when context fails", () => {
    const result = run([
      "--changed-files",
      fixture("gate-contract/changed-files.pass.txt"),
      "--pr-body",
      fixture("execution-context/pr-body.report-mismatch.md"),
      "--actual-repo",
      "watchout/other-repo",
      "--actual-branch",
      "codex/487-execution-context-lock",
      "--actual-head",
      "0123456789abcdef0123456789abcdef01234567",
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(result.json.would_block).toBe(true);
      expect(result.json.owner_must_not_merge).toBe(true);
      expect(result.json.gates[0].gate).toBe("execution-context");
      expect(result.json.gates[0].verdict).toBe("BLOCKED");
      expect(result.json.gates[0].blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("CTX-002");
      expect(result.json.gates.at(-1).gate).toBe("control-state-completeness");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  }, 15000);

  it("blocks ambiguous current-PR artifact discovery instead of picking a stale artifact", () => {
    const result = run([
      "--changed-files",
      fixture("rapid-lite-report/changed-files.ambiguous.txt"),
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("BLOCKED");
      expect(result.json.would_block).toBe(true);
      expect(result.json.owner_must_not_merge).toBe(true);
      const discovery = result.json.gates.find((gate: { gate: string }) => gate.gate === "discovery");
      expect(discovery.verdict).toBe("BLOCKED");
      expect(discovery.blockers.map((finding: { item_id: string }) => finding.item_id)).toContain("RL-DISC-001");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  });

  it("reports missing changed-files input as report_failed and would_block", () => {
    const result = run([
      "--changed-files",
      fixture("rapid-lite-report/missing-changed-files.txt"),
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("FAILURE");
      expect(result.json.report_failed).toBe(true);
      expect(result.json.would_block).toBe(true);
      expect(result.json.owner_must_not_merge).toBe(true);
      const inputCollection = result.json.gates.find((gate: { gate: string }) => gate.gate === "input-collection");
      expect(inputCollection.report_failed).toBe(true);
      expect(inputCollection.blockers[0].code).toBe("changed_files_missing");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  });

  it("reports workflow input collection failures as report_failed and would_block", () => {
    const result = run([
      "--changed-files",
      fixture("rapid-lite-report/changed-files.empty.txt"),
      "--input-failure",
      fixture("rapid-lite-report/input-failure.json"),
      "--diff-root",
      ".",
      "--format",
      "json",
    ]);

    try {
      expect(result.exitCode).toBe(0);
      expect(result.json.verdict).toBe("FAILURE");
      expect(result.json.report_failed).toBe(true);
      expect(result.json.would_block).toBe(true);
      expect(result.json.owner_must_not_merge).toBe(true);
      const inputCollection = result.json.gates.find((gate: { gate: string }) => gate.gate === "input-collection");
      expect(inputCollection.blockers[0].code).toBe("changed_files_collection_failed");
    } finally {
      rmSync(result.resultDir, { recursive: true, force: true });
    }
  });
});
