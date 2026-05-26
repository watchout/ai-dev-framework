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

function writeDogfoodEvidence(projectDir: string): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework/project.json"),
    JSON.stringify({ name: "dogfood-test" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/goal-contract.json"),
    JSON.stringify({ status: "approved" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/phase-plan.json"),
    JSON.stringify({ phase: 1 }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/task-trace.json"),
    JSON.stringify({ task: "FEAT-001", issue: 222 }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/doc4l-readiness.json"),
    JSON.stringify({ status: "ready" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, ".framework/pre-impl-audit.json"),
    JSON.stringify({ verdict: "PASS" }),
    "utf-8",
  );
}
