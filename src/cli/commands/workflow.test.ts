import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type DiscoverSessionData, saveSession } from "../lib/discover-session.js";
import {
  createDefaultFrameworkConfig,
  saveFrameworkConfig,
  type FrameworkConfig,
  type RequiredRoleName,
  type RoleBinding,
} from "../lib/workflow-config.js";

const REPO_ROOT = process.cwd();
const CLI_PATH = path.resolve(REPO_ROOT, "src/cli/index.ts");
const TSX = path.resolve(REPO_ROOT, "node_modules", ".bin", "tsx");
const NOW = "2026-05-23T00:00:00.000Z";

let tmpDir: string;

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-workflow-command-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runWorkflow(args: string): CliResult {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} workflow ${args}`, {
      cwd: tmpDir,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

function parseJson<T>(result: CliResult): T {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as T;
}

describe("workflow command", () => {
  it("prints synthesized workflow-state/v1 as JSON", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("status --json");
    const state = parseJson<{
      schema_version: string;
      phase: string;
      evidence: Array<{ kind: string }>;
      gate_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(state.schema_version).toBe("workflow-state/v1");
    expect(state.phase).toBe("hearing_complete");
    expect(state.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "discovery_session" })]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("doctor reports BLOCK findings without turning observability into enforcement", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("doctor --json");
    const report = parseJson<{
      status: string;
      blocking_decisions: Array<{ rule_id: string }>;
      decision_counts: { BLOCK: number };
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.status).toBe("blocked");
    expect(report.decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.blocking_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule_id: "G4.publish.remote" }),
      ]),
    );
  });

  it("check fails when BLOCK findings are present", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("check --action implementation_start --json");
    const report = parseJson<{
      check: {
        status: string;
        action: string;
        fail_on: string;
        scoped_decision_counts: { BLOCK: number };
      };
      decision_counts: { BLOCK: number };
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.action).toBe("implementation_start");
    expect(report.check.fail_on).toBe("block");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.decision_counts.BLOCK).toBeGreaterThan(0);
  });

  it("check passes when only OBSERVE findings remain at the default threshold", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action merge --json");
    const report = parseJson<{
      check: {
        status: string;
        action: string;
        fail_on: string;
        scoped_decision_counts: { BLOCK: number; OBSERVE: number };
      };
      decision_counts: { BLOCK: number; OBSERVE: number };
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.action).toBe("merge");
    expect(report.check.fail_on).toBe("block");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.check.scoped_decision_counts.OBSERVE).toBeGreaterThan(0);
  });

  it("implementation_start ignores remote_publish-only blocks", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".framework/project.json"),
      JSON.stringify({ name: "workflow-test" }),
      "utf-8",
    );

    const result = runWorkflow("check --action implementation_start --json");
    const report = parseJson<{
      check: {
        status: string;
        action: string;
        scoped_decision_counts: { BLOCK: number };
      };
      decision_counts: { BLOCK: number };
      scoped_decisions: Array<{ rule_id: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.check).toEqual(
      expect.objectContaining({
        status: "passed",
        action: "implementation_start",
      }),
    );
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule_id: "G4.publish.remote" }),
      ]),
    );
  });

  it("strict implementation_start fails on missing #222 dogfood evidence", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("check --action implementation_start --profile strict --feature FEAT-001 --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.goal_contract.approved",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G11.pre_impl_audit.disposition",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("strict implementation_start passes when #222 dogfood evidence is present", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDogfoodEvidence(tmpDir);

    const result = runWorkflow("check --action implementation_start --profile strict --feature FEAT-001 --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.goal_contract.approved",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G18.admin_notice.sink_ready",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict implementation_start blocks evidence scoped to a different selected feature", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDogfoodEvidence(tmpDir, "OTHER-FEATURE");

    const result = runWorkflow("check --action implementation_start --profile strict --feature FEAT-001 --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.phase_plan.present",
          decision: "BLOCK",
          message: expect.stringContaining("selected feature/task FEAT-001"),
        }),
        expect.objectContaining({
          rule_id: "G10.task_trace.present",
          decision: "BLOCK",
          message: expect.stringContaining("selected feature/task FEAT-001"),
        }),
      ]),
    );
  });

  it("strict implementation_start uses the same project-applied boundary as start", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDogfoodEvidence(tmpDir, "FEAT-001", { project: false });

    const result = runWorkflow("check --action implementation_start --profile strict --feature FEAT-001 --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G0.start_boundary.project_applied",
          decision: "BLOCK",
          message: expect.stringContaining(".framework/project.json"),
        }),
      ]),
    );
  });

  it("strict phase_closure fails when the closure record is missing", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.record.present",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("strict audit_ledger fails when the ledger record is missing", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action audit_ledger --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record.present",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("strict audit_ledger blocks incomplete audit records", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeAuditLedgerRecord(tmpDir, {
      schema_version: "audit-ledger/v1",
      ledger_id: "phase1-ledger",
      records: [
        {
          audit_id: "AUDIT-1",
          level: "L2",
          artifact: { type: "pr", ref: "https://github.example/pr/1" },
          reviewer: { id: "codex-audit", role: "auditor" },
          verdict: "PASS",
          timestamp: "2026-05-27T00:00:00.000Z",
          evidence_urls: ["https://github.example/pr/1#comment"],
          approved_scope: "code/runtime slice only",
          explicit_non_claims: ["No phase closure claim"],
          conditions: [],
          supersedes: [],
          phase: "Phase 1",
          task: "T3 #225",
          goal: "internal dogfood",
        },
      ],
    });

    const result = runWorkflow("check --action audit_ledger --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record_shape",
          decision: "BLOCK",
          message: expect.stringContaining("commands"),
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.next_action_derivable",
          decision: "BLOCK",
          message: expect.stringContaining("AUDIT-1"),
        }),
      ]),
    );
  });

  it("strict audit_ledger rejects placeholder trace fields", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const baseRecord = (completeAuditLedgerRecord().records as Record<string, unknown>[])[0];
    const falseRecord: Record<string, unknown> = {
      ...baseRecord,
      audit_id: "AUDIT-PLACEHOLDER-FALSE",
      conditions: false,
      supersedes: "pending",
      downstream_gates_remaining: false,
    };
    const emptyRecord: Record<string, unknown> = {
      ...baseRecord,
      audit_id: "AUDIT-PLACEHOLDER-EMPTY",
      conditions: null,
      supersedes: {},
      downstream_gates_remaining: "",
    };
    delete falseRecord.recommended_next_action;
    delete emptyRecord.recommended_next_action;
    writeAuditLedgerRecord(tmpDir, {
      schema_version: "audit-ledger/v1",
      ledger_id: "phase1-ledger",
      records: [falseRecord, emptyRecord],
    });

    const result = runWorkflow("check --action audit_ledger --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record_shape",
          decision: "BLOCK",
          message: expect.stringContaining(
            "AUDIT-PLACEHOLDER-FALSE(conditions|supersedes_or_amends)",
          ),
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record_shape",
          decision: "BLOCK",
          message: expect.stringContaining(
            "AUDIT-PLACEHOLDER-EMPTY(conditions|supersedes_or_amends)",
          ),
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.next_action_derivable",
          decision: "BLOCK",
          message: expect.stringContaining("AUDIT-PLACEHOLDER-FALSE"),
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.next_action_derivable",
          decision: "BLOCK",
          message: expect.stringContaining("AUDIT-PLACEHOLDER-EMPTY"),
        }),
      ]),
    );
  });

  it("strict audit_ledger passes with complete machine-readable records", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeAuditLedgerRecord(tmpDir, completeAuditLedgerRecord());

    const result = runWorkflow("check --action audit_ledger --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record_shape",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.next_action_derivable",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict runtime_step fails when adapter, policy, and step records are missing", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThanOrEqual(3);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.adapter.present",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.injection_policy.present",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.step_contract.present",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("strict runtime_step passes with a complete Codex JSONL adapter and strict injection policy", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeRuntimeAdapter(tmpDir, completeRuntimeAdapter("codex"));
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, completeRuntimeStep());

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.adapter.contract",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.output_schema",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.permission_scope",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict runtime_step blocks missing runtime CLI option values", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const adapter = completeRuntimeAdapter("codex");
    const invocation = adapter.invocation_template as Record<string, unknown>;
    invocation.argv = [
      "codex",
      "exec",
      "--json",
      "--output-schema",
      ".framework/runtime/schemas/l1-audit-result-v1.schema.json",
      "--output-last-message",
      "--sandbox",
      "--cd",
      ".",
    ];
    writeRuntimeAdapter(tmpDir, adapter);
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, completeRuntimeStep());

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.adapter.contract",
          decision: "BLOCK",
          message: expect.stringContaining("codex_argv:--output-last-message:value"),
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.adapter.contract",
          decision: "BLOCK",
          message: expect.stringContaining("codex_argv:--sandbox:value"),
        }),
      ]),
    );
  });

  it("strict runtime_step passes with a complete Claude stream-json adapter", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeRuntimeAdapter(tmpDir, completeRuntimeAdapter("claude"));
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, {
      ...completeRuntimeStep(),
      runtime_adapter: "claude-stream-json-readonly-v1",
    });

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.adapter.contract",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict runtime_step blocks incompatible repo-write and host-specific sandboxes", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeRuntimeAdapter(tmpDir, completeRuntimeAdapter("codex"));
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, {
      ...completeRuntimeStep(),
      write_scope: "repo-write",
    });

    const repoWriteResult = runWorkflow("check --action runtime_step --profile strict --json");
    const repoWriteReport = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(repoWriteResult);

    expect(repoWriteResult.exitCode).toBe(1);
    expect(repoWriteReport.check.status).toBe("failed");
    expect(repoWriteReport.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.permission_scope",
          decision: "BLOCK",
          message: expect.stringContaining("repo-write:requires-workspace-write-sandbox"),
        }),
      ]),
    );

    writeRuntimeStep(tmpDir, {
      ...completeRuntimeStep(),
      write_scope: "host-specific",
    });

    const hostSpecificResult = runWorkflow("check --action runtime_step --profile strict --json");
    const hostSpecificReport = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(hostSpecificResult);

    expect(hostSpecificResult.exitCode).toBe(1);
    expect(hostSpecificReport.check.status).toBe("failed");
    expect(hostSpecificReport.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.permission_scope",
          decision: "BLOCK",
          message: expect.stringContaining(
            "host-specific:requires-host-specific-or-danger-full-access-sandbox",
          ),
        }),
      ]),
    );
  });

  it("strict runtime_step blocks unsafe GitHub interpolation and untrusted instruction delivery", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const adapter = completeRuntimeAdapter("codex");
    const invocation = adapter.invocation_template as Record<string, unknown>;
    invocation.argv = [
      "codex",
      "exec",
      "--json",
      "--output-schema",
      ".framework/runtime/schemas/l1-audit-result-v1.schema.json",
      "--output-last-message",
      ".framework/runtime/results/last-message.json",
      "--sandbox",
      "read-only",
      "--cd",
      ".",
      "${{ github.event.issue.title }}",
      "${{ inputs.target_branch }}",
    ];
    const policy = completeInjectionPolicy();
    policy.prompt_assembly_rules = [
      ...(policy.prompt_assembly_rules as Record<string, unknown>[]),
      {
        segment: "context",
        allowed_origin: ["github_issue_body"],
        delivery: "instruction",
      },
    ];
    writeRuntimeAdapter(tmpDir, adapter);
    writeInjectionPolicy(tmpDir, policy);
    writeRuntimeStep(tmpDir, completeRuntimeStep());

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.shell_interpolation",
          decision: "BLOCK",
          message: expect.stringContaining("github.event.issue.title"),
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.shell_interpolation",
          decision: "BLOCK",
          message: expect.stringContaining("inputs.target_branch"),
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.injection_policy.contract",
          decision: "BLOCK",
          message: expect.stringContaining("context"),
        }),
      ]),
    );
  });

  it("strict runtime_step blocks scalar fallback behavior", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeRuntimeAdapter(tmpDir, completeRuntimeAdapter("codex"));
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, {
      ...completeRuntimeStep(),
      fallback_behavior: "manual_review_required",
    });

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.step_contract.shape",
          decision: "BLOCK",
          message: expect.stringContaining("fallback_behavior"),
        }),
      ]),
    );
  });

  it("strict runtime_step blocks schema mismatch, text fallback, and incomplete fallback behavior", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const adapter = completeRuntimeAdapter("codex");
    const invocation = adapter.invocation_template as Record<string, unknown>;
    invocation.final_schema_ref = "wrong-result-schema-v1";
    const policy = completeInjectionPolicy();
    policy.output_validation = {
      required_schema: true,
      fail_on_schema_mismatch: true,
      allow_text_fallback: true,
    };
    const step = completeRuntimeStep();
    step.fallback_behavior = {
      on_timeout: "BLOCK",
      on_non_zero_exit: "BLOCK",
    };
    writeRuntimeAdapter(tmpDir, adapter);
    writeInjectionPolicy(tmpDir, policy);
    writeRuntimeStep(tmpDir, step);

    const result = runWorkflow("check --action runtime_step --profile strict --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.injection_policy.contract",
          decision: "BLOCK",
          message: expect.stringContaining("allow_text_fallback"),
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.step_contract.shape",
          decision: "BLOCK",
          message: expect.stringContaining("fallback_behavior"),
        }),
        expect.objectContaining({
          rule_id: "G20.runtime_step.output_schema",
          decision: "BLOCK",
          message: expect.stringContaining("final_schema_ref"),
        }),
      ]),
    );
  });

  it("strict work_order is warning-first when the contract is missing", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action work_order --profile strict --json");
    const report = parseJson<{
      check: {
        status: string;
        scoped_decision_counts: { BLOCK: number; WARN: number };
      };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.check.scoped_decision_counts.WARN).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.record.present",
          decision: "WARN",
        }),
      ]),
    );
  });

  it("strict work_order can fail on warnings during migration audits", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { WARN: number } };
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.WARN).toBeGreaterThan(0);
  });

  it("strict work_order passes with a complete verifiable Work Order contract", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    writeWorkOrder(tmpDir, completeWorkOrder());

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: {
        status: string;
        scoped_decision_counts: { BLOCK: number; WARN: number };
      };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.check.scoped_decision_counts.WARN).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.required_fields",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.delivery_profile_defaults",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.dispatch_contract",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.context_pack_boundary",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict work_order resolves R0-R2 PR Conveyor defaults from the delivery profile", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.risk_class = "R2";
    delete order.delivery_strategy;
    delete order.audit_timing;
    delete order.pr_mode;
    delete order.lane;
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.delivery_profile_defaults",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("strict work_order warns when R4 tries to use PR Conveyor after PR creation", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.risk_class = "R4";
    order.lane = "Fast";
    order.delivery_strategy = "pr_conveyor";
    order.audit_timing = "after_pr";
    order.pr_mode = "normal";
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.delivery_profile_defaults",
          decision: "WARN",
          message: expect.stringContaining("R4.delivery_strategy:pr_conveyor"),
        }),
      ]),
    );
  });

  it("strict work_order warns when R3 tries to use normal PR mode", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.risk_class = "R3";
    order.lane = "Governed";
    order.delivery_strategy = "phase_conveyor";
    order.audit_timing = "before_merge";
    order.pr_mode = "normal";
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.delivery_profile_defaults",
          decision: "WARN",
          message: expect.stringContaining("R3.pr_mode:normal"),
        }),
      ]),
    );
  });

  it("strict work_order blocks when delivery owner fields are placeholders", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.implementation_owner = "TBD";
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number; WARN: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("missing:implementation_owner"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.delivery_profile_defaults",
          decision: "WARN",
          message: expect.stringContaining("owner:implementation_owner"),
        }),
      ]),
    );
  });

  it("strict work_order blocks prompt-only shape while warning on dispatch/runtime gaps", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeWorkOrder(tmpDir, {
      schema_version: "prompt-template/v1",
      request: "Please implement #244",
      handoff_target: "codex",
    });

    const result = runWorkflow("check --action work_order --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number; WARN: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.check.scoped_decision_counts.WARN).toBeGreaterThanOrEqual(5);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("schema_version:prompt-template/v1"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.dispatch_contract",
          decision: "WARN",
          message: expect.stringContaining("dispatch_surfaces"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.runtime_contract",
          decision: "WARN",
          message: expect.stringContaining("runtime_adapter_or_structured_invocation"),
        }),
      ]),
    );
  });

  it("strict work_order warns when context packs become instructions or shell commands", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.context_pack_refs = [];
    order.context_pack_policy = {
      delivery: "instruction",
      treat_as_instruction: true,
    };
    order.runtime_invocation = {
      argv: ["codex", "exec", "${{ inputs.issue_body }}"],
    };
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.context_pack_boundary",
          decision: "WARN",
          message: expect.stringContaining("context_pack_refs"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.context_pack_boundary",
          decision: "WARN",
          message: expect.stringContaining("context_pack_instruction_promotion"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.runtime_contract",
          decision: "WARN",
          message: expect.stringContaining("direct_shell_command"),
        }),
      ]),
    );
  });

  it("strict work_order warns when authority values grant transition authority", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const order = completeWorkOrder();
    order.authority_boundary = {
      forbidden: [
        "merge approval",
        "phase transition",
        "gate pass",
        "goal completion",
      ],
      merge_authority: "granted",
      phase_transition_authority: "allowed",
      gate_authority: true,
      goal_completion_authority: "approved",
    };
    order.non_claims = [
      "merge authority granted",
      "phase transition authority allowed",
    ];
    writeWorkOrder(tmpDir, order);

    const result = runWorkflow("check --action work_order --profile strict --fail-on warn --json");
    const report = parseJson<{
      check: { status: string };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("merge_authority:granted"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("phase_transition_authority:allowed"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("gate_authority:true"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("goal_completion_authority:approved"),
        }),
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("non_claims.authority_claim"),
        }),
      ]),
    );
  });

  it("strict phase_closure blocks incomplete closure evidence", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writePhaseClosureRecord(tmpDir, {
      phase: "Phase 1",
      phase_objective: "Internal dogfood",
      readiness_claim: "Phase 1 complete",
      merged_prs: [{ number: 231 }],
      l0_evidence_summary: "",
      audit_matrix: { l1: "pass" },
      unresolved_blockers: [{ id: "#999", title: "open blocker" }],
      deferred_items: [{ id: "#233", target_phase: "Phase 1" }],
      residual_risks: [],
      explicit_non_claims: ["No public readiness claim"],
      next_phase_entry_conditions: ["T2 accepted"],
      reopen_criteria: ["Evidence drift"],
    });

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThanOrEqual(4);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("completed_tasks"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.blockers_cleared",
          decision: "BLOCK",
          message: expect.stringContaining("#999"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.carryovers_justified",
          decision: "BLOCK",
          message: expect.stringContaining("#233"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.postmerge_evidence",
          decision: "BLOCK",
          message: expect.stringContaining("231"),
        }),
      ]),
    );
  });

  it("strict phase_closure blocks closure records that cannot cite the audit ledger", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const record = completePhaseClosureRecord();
    delete record.audit_ledger_refs;
    record.audit_matrix = { l1: "PASS", l2: "PASS", l3: "PASS" };
    writePhaseClosureRecord(tmpDir, record);

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.audit_ledger_refs",
          decision: "BLOCK",
          message: expect.stringContaining("l1"),
        }),
      ]),
    );
  });

  it("strict phase_closure rejects explicit false closure evidence", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const record = completePhaseClosureRecord();
    record.audit_matrix = { l1: false, l2: false, l3: false };
    record.deferred_items = [
      { id: "#233", target_phase: "Phase 1", justification: false },
    ];
    record.merged_prs = [{ number: 231, postmerge_evidence: false }];
    writePhaseClosureRecord(tmpDir, record);

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThanOrEqual(3);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("audit_matrix.l1_l2_l3"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.carryovers_justified",
          decision: "BLOCK",
          message: expect.stringContaining("#233"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.postmerge_evidence",
          decision: "BLOCK",
          message: expect.stringContaining("231"),
        }),
      ]),
    );
  });

  it("strict phase_closure does not satisfy root registers from nested aliases", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    const record = completePhaseClosureRecord();
    delete record.completed_tasks;
    delete record.merged_prs;
    record.deferred_items = [
      {
        id: "#233",
        target_phase: "Phase 1",
        justification: "Tracked as non-blocking test hygiene follow-up.",
        tasks: [{ id: "T0", issue: 223 }],
        prs: [
          {
            number: 231,
            postmerge_evidence:
              "https://github.com/watchout/ai-dev-framework/pull/231#issuecomment-4549558867",
          },
        ],
      },
    ];
    writePhaseClosureRecord(tmpDir, record);

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string; message: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThanOrEqual(2);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("completed_tasks"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.required_fields",
          decision: "BLOCK",
          message: expect.stringContaining("merged_prs"),
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.postmerge_evidence",
          decision: "BLOCK",
          message: expect.stringContaining("merged_prs"),
        }),
      ]),
    );
  });

  it("strict phase_closure passes with a complete closure record", () => {
    saveFrameworkConfig(tmpDir, autoPublishConfig());
    writePhaseClosureRecord(tmpDir, completePhaseClosureRecord());

    const result = runWorkflow("check --action phase_closure --profile strict --json");
    const report = parseJson<{
      check: { status: string; scoped_decision_counts: { BLOCK: number } };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(report.check.status).toBe("passed");
    expect(report.check.scoped_decision_counts.BLOCK).toBe(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G12.phase_closure.required_fields",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G12.phase_closure.postmerge_evidence",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("remote_publish fails on remote publish blocks", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("check --action remote_publish --json");
    const report = parseJson<{
      check: {
        status: string;
        action: string;
        scoped_decision_counts: { BLOCK: number };
      };
      scoped_decisions: Array<{ rule_id: string; decision: string }>;
    }>(result);

    expect(result.exitCode).toBe(1);
    expect(report.check.status).toBe("failed");
    expect(report.check.action).toBe("remote_publish");
    expect(report.check.scoped_decision_counts.BLOCK).toBeGreaterThan(0);
    expect(report.scoped_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G4.publish.remote",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("check requires an explicit action", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("check --json");
    const payload = parseJson<{ error: { message: string } }>(result);

    expect(result.exitCode).toBe(1);
    expect(payload.error.message).toContain("Invalid or missing workflow action");
  });

  it("explains a gate rule with its evidence", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("explain G2.hearing.required_confirmation --json");
    const explanation = parseJson<{
      found: boolean;
      gate_decisions: Array<{ rule_id: string; decision: string }>;
      evidence: Array<{ kind: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(explanation.found).toBe(true);
    expect(explanation.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "PASS",
        }),
      ]),
    );
    expect(explanation.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "discovery_session" })]),
    );
  });

  it("explains an action from the allowed and blocked action lists", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("explain remote_publish --json");
    const explanation = parseJson<{
      found: boolean;
      blocked_actions: Array<{ action: string; reason: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(explanation.found).toBe(true);
    expect(explanation.blocked_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "remote_publish",
          reason: "approval_required",
        }),
      ]),
    );
  });

  it("explains missing hearing remediation", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("explain G2.hearing.required_confirmation --json");
    const explanation = parseJson<{
      found: boolean;
      gate_decisions: Array<{ decision: string; remediation: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(explanation.found).toBe(true);
    expect(explanation.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decision: "BLOCK",
          remediation: expect.stringContaining("shirube discover"),
        }),
      ]),
    );
  });

  it("explains placeholder role remediation", () => {
    saveFrameworkConfig(tmpDir, createDefaultFrameworkConfig());

    const result = runWorkflow("explain G1.roles.required_bindings --json");
    const explanation = parseJson<{
      found: boolean;
      gate_decisions: Array<{ decision: string; remediation: string }>;
      evidence: Array<{ kind: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(explanation.found).toBe(true);
    expect(explanation.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decision: "BLOCK",
          remediation: expect.stringContaining("shirube roles set"),
        }),
      ]),
    );
    expect(explanation.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "role_binding" })]),
    );
  });

  it("explains draft_only remote publish blocks", () => {
    saveFrameworkConfig(tmpDir, createDefaultFrameworkConfig());

    const result = runWorkflow("explain remote_publish --json");
    const explanation = parseJson<{
      found: boolean;
      blocked_actions: Array<{ action: string; reason: string }>;
    }>(result);

    expect(result.exitCode).toBe(0);
    expect(explanation.found).toBe(true);
    expect(explanation.blocked_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "remote_publish",
          reason: "publish_policy_draft_only",
        }),
      ]),
    );
  });

  it("accepts an explicit profile without requiring GitHub", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const result = runWorkflow("status --profile strict --json");
    const state = parseJson<{ profile: string; source: { kind: string } }>(result);

    expect(result.exitCode).toBe(0);
    expect(state.profile).toBe("strict");
    expect(state.source.kind).toBe("local");
  });
});

function completedDiscoverSession(): DiscoverSessionData {
  return {
    id: "discover-1",
    status: "completed",
    currentStage: 5,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    stages: [
      { stageNumber: 1, status: "confirmed", summary: "stage 1" },
      { stageNumber: 2, status: "confirmed", summary: "stage 2" },
      { stageNumber: 3, status: "confirmed", summary: "stage 3" },
      { stageNumber: 4, status: "confirmed", summary: "stage 4" },
      { stageNumber: 5, status: "confirmed", summary: "stage 5" },
    ],
    answers: {
      "Q1-1": "Room quality maintenance",
    },
  };
}

function readyConfig(): FrameworkConfig {
  const bindings: Record<RequiredRoleName, RoleBinding> = {
    architecture_owner: { type: "github_user", id: "discord-arc" },
    l3_governance_owner: { type: "github_user", id: "cto" },
    implementation_lead: {
      type: "local_agent",
      id: "codex-implementation-lead",
    },
    reviewer: { type: "github_user", id: "adf-lead" },
    auditor: { type: "github_user", id: "codex-auditor" },
    release_owner: { type: "github_user", id: "watchout" },
    human_approver: { type: "github_user", id: "watchout" },
    worker_pool: { type: "local_agent", id: "dev-bot-pool" },
  };
  return {
    roles: { bindings },
    workflow: {
      publishPolicy: "approval_required",
      outputs: ["local_files", "github"],
    },
  };
}

function autoPublishConfig(): FrameworkConfig {
  const config = readyConfig();
  config.workflow = {
    publishPolicy: "auto_publish",
    outputs: ["local_files", "github"],
  };
  return config;
}

function writeDogfoodEvidence(
  projectDir: string,
  feature = "FEAT-001",
  options: { project?: boolean } = {},
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  if (options.project !== false) {
    fs.writeFileSync(
      path.join(projectDir, ".framework/project.json"),
      JSON.stringify({ name: "dogfood-test" }),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(projectDir, ".framework/goal-contract.json"),
    JSON.stringify({ status: "approved" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/phase-plan.json"),
    JSON.stringify({ phase: 1, feature }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/task-trace.json"),
    JSON.stringify({ task: feature, feature, issue: 222 }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/doc4l-readiness.json"),
    JSON.stringify({ status: "ready", feature }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/pre-impl-audit.json"),
    JSON.stringify({ verdict: "PASS", feature }),
    "utf-8",
  );
}

function writePhaseClosureRecord(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/phase-closure.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeAuditLedgerRecord(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/audit-ledger.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeRuntimeAdapter(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/runtime-command-adapter.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeInjectionPolicy(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/injection-policy-pack.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeRuntimeStep(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/delivery-graph-step.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeWorkOrder(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/work-order.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function writeDeliveryProfile(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/delivery-profile.json"),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

function completeAuditLedgerRecord(): Record<string, unknown> {
  return {
    schema_version: "audit-ledger/v1",
    ledger_id: "phase1-t3-ledger",
    records: [
      {
        audit_id: "AUDIT-P1-T3-L2",
        artifact: {
          type: "pr",
          ref: "https://github.com/watchout/ai-dev-framework/pull/999",
        },
        level: "L2",
        reviewer: {
          type: "agent",
          id: "codex-audit",
          role: "auditor",
          source: "github",
        },
        verdict: "PASS",
        timestamp: "2026-05-27T00:00:00.000Z",
        evidence_urls: [
          "https://github.com/watchout/ai-dev-framework/pull/999#issuecomment-1",
        ],
        aun_message_ids: ["85000"],
        commands: ["npm run type-check", "npm test -- src/cli/commands/workflow.test.ts"],
        approved_scope: "AUDITLEDGER-001 runtime and documentation slice only",
        explicit_non_claims: ["No Phase 1 closure claim", "No public readiness claim"],
        conditions: [],
        required_followups: [],
        supersedes: [],
        amends: [],
        phase: "Phase 1",
        task: "T3 #225",
        goal: "internal applied dogfood",
        downstream_gates_remaining: ["L3", "merge", "postmerge"],
        recommended_next_action: "request_l3_review",
      },
    ],
  };
}

function completeRuntimeAdapter(runtime: "codex" | "claude"): Record<string, unknown> {
  if (runtime === "claude") {
    return {
      adapter_id: "claude-stream-json-readonly-v1",
      runtime: "claude",
      min_version: "1.0.0",
      feature_detection: [
        "jsonl_stream",
        "json_schema_final",
        "tool_allowlist",
        "mcp_config",
      ],
      invocation_template: {
        argv: [
          "claude",
          "-p",
          "--output-format",
          "stream-json",
          "--json-schema",
          "l1-audit-result-v1",
          "--permission-mode",
          "acceptEdits",
          "--allowedTools",
          "Read,Grep,Glob",
          "--disallowedTools",
          "Bash",
          "--mcp-config",
          ".mcp.json",
        ],
        stdin_mode: "context-pack",
        output_mode: "jsonl",
        final_schema_ref: "l1-audit-result-v1",
      },
      permission_profile: {
        sandbox: "read-only",
        allowed_tools: ["Read", "Grep", "Glob"],
        disallowed_tools: ["Bash", "Write", "Edit"],
        env_allowlist: ["CI"],
      },
      evidence_mapping: {
        argv: "runtime_invocation.argv",
        runtime_version: "runtime_invocation.version",
        schema_hash: "runtime_invocation.schema_hash",
        final_result: "runtime_result.final",
        gate_decision: "gate_decision",
      },
    };
  }

  return {
    adapter_id: "codex-jsonl-readonly-v1",
    runtime: "codex",
    min_version: "0.52.0",
    feature_detection: [
      "jsonl_stream",
      "json_schema_final",
      "tool_allowlist",
      "sandbox",
    ],
    invocation_template: {
      argv: [
        "codex",
        "exec",
        "--json",
        "--output-schema",
        ".framework/runtime/schemas/l1-audit-result-v1.schema.json",
        "--output-last-message",
        ".framework/runtime/results/last-message.json",
        "--sandbox",
        "read-only",
        "--cd",
        ".",
      ],
      stdin_mode: "context-pack",
      output_mode: "jsonl",
      final_schema_ref: "l1-audit-result-v1",
    },
    permission_profile: {
      sandbox: "read-only",
      allowed_tools: ["read", "rg", "sed"],
      disallowed_tools: ["write", "network"],
      env_allowlist: ["CI"],
    },
    evidence_mapping: {
      argv: "runtime_invocation.argv",
      runtime_version: "runtime_invocation.version",
      schema_hash: "runtime_invocation.schema_hash",
      final_result: "runtime_result.final",
      gate_decision: "gate_decision",
    },
  };
}

function completeInjectionPolicy(): Record<string, unknown> {
  return {
    policy_id: "strict-enterprise-v1",
    trusted_instruction_sources: ["system", "developer", "spec_owner"],
    trusted_policy_sources: ["docs/spec", "docs/ops", ".framework/policy-pack.json"],
    untrusted_context_sources: [
      "github_issue_title",
      "github_issue_body",
      "github_comment",
      "pull_request_body",
      "tool_output",
      "retrieved_source",
    ],
    prompt_assembly_rules: [
      {
        segment: "system",
        allowed_origin: ["system"],
        delivery: "instruction",
      },
      {
        segment: "developer",
        allowed_origin: ["developer", "docs/spec"],
        delivery: "instruction",
      },
      {
        segment: "task",
        allowed_origin: ["spec_owner"],
        delivery: "instruction",
      },
      {
        segment: "context",
        allowed_origin: ["github_issue_body", "pull_request_body"],
        delivery: "data-only",
      },
      {
        segment: "tool_output",
        allowed_origin: ["tool_output"],
        delivery: "data-only",
      },
      {
        segment: "retrieved_source",
        allowed_origin: ["retrieved_source"],
        delivery: "citation-only",
      },
    ],
    shell_interpolation_policy: "no-untrusted-interpolation",
    output_validation: {
      required_schema: true,
      fail_on_schema_mismatch: true,
      allow_text_fallback: false,
    },
  };
}

function completeRuntimeStep(): Record<string, unknown> {
  return {
    step_id: "PR-123.L1_AUDIT",
    position: "L1_REVIEWER",
    runtime_adapter: "codex-jsonl-readonly-v1",
    injection_policy: "strict-enterprise-v1",
    expected_result_schema: "l1-audit-result-v1",
    write_scope: "none",
    evidence_sink: "github-check-and-audit-ledger",
    fallback_behavior: {
      on_timeout: "BLOCK",
      on_non_zero_exit: "BLOCK",
      on_schema_mismatch: "BLOCK",
      degraded_fallback: "manual_review_required",
    },
  };
}

function completeWorkOrder(): Record<string, unknown> {
  return {
    schema_version: "work-order/v1",
    work_order_id: "WO-244",
    issue: 244,
    repo: "watchout/ai-dev-framework",
    product: "shirube",
    work_package_id: "phase1-work-order-contract",
    objective: "Implement warning-first Work Order contract validation.",
    risk_class: "R2",
    work_unit: "PR",
    delivery_profile_ref: "iyasaka-internal.pr-conveyor",
    architecture_owner: "IYASAKA ARC",
    implementation_owner: "Shirube repo maintainer",
    review_owner: "Shirube reviewer",
    audit_owner: "Shirube audit owner",
    merge_authority: "Shirube repo maintainer",
    handoff_target: "codex",
    dispatch_surfaces: ["aun", "codex", "claude", "shirube_report"],
    scope: ["Implement warning-first Work Order contract validation."],
    non_goals: ["Do not enable live AUN dispatch.", "Do not merge automatically."],
    allowed_files: ["src/cli/lib/workflow-state.ts", "src/cli/commands/workflow.test.ts"],
    allowed_actions: ["edit code", "run tests", "open PR", "request audit"],
    forbidden_actions: ["merge", "production deploy", "secret change"],
    verification_commands: [
      "npm test -- src/cli/commands/workflow.test.ts",
      "npm run type-check",
      "npm run build:cli",
    ],
    stop_conditions: ["R4 action requested", "missing implementation authority"],
    fallback_next_work_policy: "record blocker and move to next ready Work Order",
    inputs: [
      {
        type: "aun_message",
        ref: "3602251b-ce84-46aa-9e9c-f17b83ea3d99",
      },
      {
        type: "github_issue",
        ref: "watchout/ai-dev-framework#244",
      },
    ],
    evidence_refs: ["github:watchout/ai-dev-framework#244"],
    context_pack_refs: [
      {
        pack_id: "kodama-pack-issue-242",
        citation: "github:watchout/kodama#7",
      },
    ],
    context_pack_policy: {
      data_not_instruction: true,
      delivery: "data-only",
    },
    runtime_adapter: "codex-jsonl-readonly-v1",
    structured_invocation: {
      runtime: "codex",
      output_mode: "jsonl",
      output_schema: "work-order-result-v1",
    },
    expected_output_schema: "work-order-result-v1",
    write_scope: "workspace-write",
    required_gates: ["work_order", "runtime_step", "context_pack"],
    report_sink: "shirube-gate-report",
    authority_boundary: {
      forbidden: [
        "merge approval",
        "phase transition",
        "goal completion",
      ],
      merge_authority: "not_granted",
      phase_transition_authority: "not_granted",
    },
    non_claims: [
      "No merge authority.",
      "No phase transition authority.",
      "No public or enterprise readiness claim.",
    ],
    enforcement_mode: "warning",
    promotion_criteria: [
      "AUN, Codex, Claude, and Shirube report consumers accept work-order/v1.",
      "Downstream migration has no warning-only violations.",
    ],
  };
}

function internalPrConveyorProfile(): Record<string, unknown> {
  return {
    profile_version: "0.1.0",
    profile_id: "iyasaka-internal.pr-conveyor",
    default_delivery_strategy: "pr_conveyor",
    allowed_delivery_strategies: [
      "pr_conveyor",
      "phase_conveyor",
      "release_train",
      "serial_gate",
      "design_only",
      "hotfix",
    ],
    strategy_by_risk: {
      R0: {
        delivery_strategy: "pr_conveyor",
        audit_timing: "after_pr",
        pr_mode: "normal",
      },
      R1: {
        delivery_strategy: "pr_conveyor",
        audit_timing: "after_pr",
        pr_mode: "normal",
      },
      R2: {
        delivery_strategy: "pr_conveyor",
        audit_timing: "after_pr",
        pr_mode: "normal",
      },
      R3: {
        delivery_strategy: "phase_conveyor",
        audit_timing: "before_merge",
        pr_mode: "draft_or_reference_until_owner_adopts",
      },
      R4: {
        delivery_strategy: "serial_gate",
        audit_timing: "before_execution",
        pr_mode: "blocked_until_approved",
      },
    },
  };
}

function completePhaseClosureRecord(): Record<string, unknown> {
  return {
    phase: "Phase 1",
    phase_objective: "Apply Shirube to its own development workflow.",
    readiness_claim: "Phase 1 closure gate fixture is complete.",
    completed_tasks: [
      { id: "T0", issue: 223 },
      { id: "T1", issue: 222 },
    ],
    merged_prs: [
      {
        number: 231,
        merge_commit: "2f820c59518a22e1e6436176a59252753b12a824",
        postmerge_evidence:
          "https://github.com/watchout/ai-dev-framework/pull/231#issuecomment-4549558867",
      },
    ],
    l0_evidence_summary: "build, type-check, lint, tests, and trace verify passed.",
    audit_matrix: {
      l1: { verdict: "PASS", audit_id: "AUDIT-P1-CLOSE-L1" },
      l2: { verdict: "PASS", audit_id: "AUDIT-P1-CLOSE-L2" },
      l3: { verdict: "PASS", audit_id: "AUDIT-P1-CLOSE-L3" },
    },
    audit_ledger_refs: [
      "AUDIT-P1-CLOSE-L1",
      "AUDIT-P1-CLOSE-L2",
      "AUDIT-P1-CLOSE-L3",
    ],
    unresolved_blockers: [],
    deferred_items: [
      {
        id: "#233",
        target_phase: "Phase 1",
        owner: "adf-lead",
        justification: "Tracked as non-blocking test hygiene follow-up.",
      },
    ],
    residual_risks: [],
    explicit_non_claims: [
      "No public MVP readiness claim.",
      "No OSS quality claim.",
      "No enterprise readiness claim.",
    ],
    next_phase_entry_conditions: ["T2 audit gate remains green."],
    reopen_criteria: ["Merged PR evidence becomes stale or invalid."],
  };
}
