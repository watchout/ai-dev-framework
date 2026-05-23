import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type DiscoverSessionData, saveSession } from "./discover-session.js";
import {
  createDefaultFrameworkConfig,
  saveFrameworkConfig,
  type FrameworkConfig,
  type RequiredRoleName,
  type RoleBinding,
} from "./workflow-config.js";
import { buildWorkflowState } from "./workflow-state.js";

const NOW = "2026-05-23T00:00:00.000Z";

describe("workflow-state", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shirube-workflow-state-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("maps a completed legacy discover session to hearing evidence", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.schema_version).toBe("workflow-state/v1");
    expect(state.phase).toBe("hearing_complete");
    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "discovery_session",
          validity: "current",
          artifact_path: ".framework/discover-session.json",
        }),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "PASS",
          deterministic: true,
        }),
      ]),
    );
  });

  it("maps an incomplete legacy discover session to missing hearing evidence", () => {
    const session = completedDiscoverSession();
    session.status = "in_progress";
    saveSession(tmpDir, session);
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.phase).toBe("hearing_in_progress");
    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "discovery_session",
          validity: "invalid",
        }),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("maps a missing discover session to missing hearing evidence", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.phase).toBe("uninitialized");
    expect(state.evidence.some((record) => record.kind === "discovery_session")).toBe(false);
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "BLOCK",
          message: expect.stringContaining("No discover session"),
        }),
      ]),
    );
  });

  it("maps GitHub issue context to intake evidence only", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      githubIssue: {
        number: 42,
        title: "Design Totonoe intake",
        body: "Initial intake",
        url: "https://github.com/watchout/kodama/issues/42",
      },
    });

    expect(state.source).toEqual({
      kind: "github_issue",
      uri: "https://github.com/watchout/kodama/issues/42",
    });
    expect(state.phase).toBe("intake_ready");
    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "github_issue",
          source_uri: "https://github.com/watchout/kodama/issues/42",
        }),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G2.hearing.required_confirmation",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("maps placeholder roles to setup_required", () => {
    saveFrameworkConfig(tmpDir, createDefaultFrameworkConfig());

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.roles.status).toBe("setup_required");
    expect(state.roles.placeholder_roles).toEqual(
      expect.arrayContaining(["architecture_owner", "l3_governance_owner"]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G1.roles.required_bindings",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("maps role separation violations to deterministic role findings", () => {
    const config = readyConfig();
    config.roles!.bindings!.reviewer = {
      type: "github_user",
      id: "codex-implementation-lead",
    };
    saveFrameworkConfig(tmpDir, config);

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.roles.status).toBe("invalid");
    expect(state.roles.findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("implementation_lead and reviewer"),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G1.roles.separation",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("represents draft_only as a blocked remote publish action", () => {
    const config = readyConfig();
    config.workflow = { publishPolicy: "draft_only", outputs: ["local_files"] };
    saveFrameworkConfig(tmpDir, config);

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.allowed_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "local_draft" }),
      ]),
    );
    expect(state.blocked_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "remote_publish",
          reason: "publish_policy_draft_only",
        }),
      ]),
    );
  });

  it("reads v1 current-session without data loss", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".framework/current-session.json"),
      JSON.stringify(
        {
          version: 1,
          mode: "framework-led",
          phase: "ready",
          feature: "GATE-ENGINE",
          customField: "preserved-on-disk",
        },
        null,
        2,
      ),
      "utf-8",
    );

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.phase).toBe("started");
    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "current_session",
          artifact_path: ".framework/current-session.json",
          metadata: expect.objectContaining({
            version: 1,
            mode: "framework-led",
            feature: "GATE-ENGINE",
          }),
        }),
      ]),
    );
    expect(
      fs.readFileSync(path.join(tmpDir, ".framework/current-session.json"), "utf-8"),
    ).toContain("preserved-on-disk");
  });

  it("keeps local-only projects independent of GitHub", () => {
    const config = readyConfig();
    config.workflow = { publishPolicy: "draft_only", outputs: ["local_files"] };
    saveFrameworkConfig(tmpDir, config);

    const state = buildWorkflowState(tmpDir, { now: NOW });

    expect(state.source.kind).toBe("local");
    expect(state.project.repo).toBeNull();
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G9.merge_authority.evidence",
          decision: "OBSERVE",
        }),
      ]),
    );
  });

  it("maps provided merge-authority decisions without duplicating evaluator logic", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      mergeAuthorityDecision: {
        status: "block",
        reason: "missing_authority_evidence",
        missing: [],
        details: ["l3_governance_owner: no current-head APPROVED review"],
      },
    });

    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "merge_authority",
          validity: "invalid",
        }),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G9.merge_authority.evidence",
          decision: "BLOCK",
          message: expect.stringContaining("missing_authority_evidence"),
        }),
      ]),
    );
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
