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

  it("emits strict #222 BLOCK decisions for missing dogfood implementation-start evidence", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
    fs.mkdirSync(path.join(tmpDir, ".framework"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".framework/project.json"),
      JSON.stringify({ name: "dogfood-test" }),
      "utf-8",
    );

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
      feature: "FEAT-001",
    });

    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.goal_contract.approved",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G10.doc4l.readiness",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G11.pre_impl_audit.disposition",
          decision: "BLOCK",
        }),
        expect.objectContaining({
          rule_id: "G18.admin_notice.sink_ready",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G18.admin_notice.lifecycle_record",
          decision: "OBSERVE",
        }),
      ]),
    );
  });

  it("maps local dogfood evidence to PASS decisions", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());
    writeDogfoodEvidence(tmpDir);

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
      feature: "FEAT-001",
    });

    expect(state.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "goal_contract" }),
        expect.objectContaining({ kind: "phase_plan" }),
        expect.objectContaining({ kind: "task_trace" }),
        expect.objectContaining({ kind: "doc4l_readiness" }),
        expect.objectContaining({ kind: "audit" }),
        expect.objectContaining({ kind: "lifecycle_sink" }),
      ]),
    );
    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.goal_contract.approved",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G10.phase_plan.present",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G10.task_trace.present",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G10.doc4l.readiness",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G11.pre_impl_audit.disposition",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("accepts boolean local evidence dispositions", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());
    writeDogfoodEvidence(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, ".framework/goal-contract.json"),
      JSON.stringify({ approved: true }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".framework/doc4l-readiness.json"),
      JSON.stringify({ readiness: true, feature: "FEAT-001" }),
      "utf-8",
    );

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
      feature: "FEAT-001",
    });

    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.goal_contract.approved",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G10.doc4l.readiness",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("accepts approved parent-scope evidence for selected-feature dogfood requirements", () => {
    saveSession(tmpDir, completedDiscoverSession());
    saveFrameworkConfig(tmpDir, readyConfig());
    writeDogfoodEvidence(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, ".framework/phase-plan.json"),
      JSON.stringify({ phase: 1, scope: "phase", status: "approved" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".framework/doc4l-readiness.json"),
      JSON.stringify({ scope: "parent_scope", readiness: "ready" }),
      "utf-8",
    );

    const state = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
      feature: "FEAT-001",
    });

    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G10.phase_plan.present",
          decision: "PASS",
        }),
        expect.objectContaining({
          rule_id: "G10.doc4l.readiness",
          decision: "PASS",
        }),
      ]),
    );
  });

  it("maps missing runtime step records to strict BLOCK decisions", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const state = buildWorkflowState(tmpDir, { now: NOW, profile: "strict" });

    expect(state.gate_decisions).toEqual(
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

  it("maps complete Codex runtime step evidence to PASS decisions", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
    writeRuntimeAdapter(tmpDir, completeRuntimeAdapter("codex"));
    writeInjectionPolicy(tmpDir, completeInjectionPolicy());
    writeRuntimeStep(tmpDir, completeRuntimeStep());

    const state = buildWorkflowState(tmpDir, { now: NOW, profile: "strict" });

    expect(state.gate_decisions).toEqual(
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

  it("blocks unsafe runtime interpolation and incomplete fallback behavior", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
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
    ];
    const policy = completeInjectionPolicy();
    policy.output_validation = {
      required_schema: true,
      fail_on_schema_mismatch: true,
      allow_text_fallback: true,
    };
    const step = completeRuntimeStep();
    step.fallback_behavior = { on_timeout: "BLOCK" };
    writeRuntimeAdapter(tmpDir, adapter);
    writeInjectionPolicy(tmpDir, policy);
    writeRuntimeStep(tmpDir, step);

    const state = buildWorkflowState(tmpDir, { now: NOW, profile: "strict" });

    expect(state.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G20.runtime_step.shell_interpolation",
          decision: "BLOCK",
          message: expect.stringContaining("github.event.issue.title"),
        }),
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
      ]),
    );
  });

  it("maps complete and incomplete audit ledger records", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
    writeAuditLedgerRecord(tmpDir, {
      schema_version: "audit-ledger/v1",
      ledger_id: "phase1-ledger",
      records: [
        {
          audit_id: "AUDIT-INCOMPLETE",
          level: "L2",
          artifact: { type: "pr", ref: "https://github.example/pr/1" },
          reviewer: { id: "codex-audit", role: "auditor" },
          verdict: "PASS",
          timestamp: "2026-05-27T00:00:00.000Z",
          evidence_urls: ["https://github.example/pr/1#comment"],
          conditions: false,
          supersedes: {},
          downstream_gates_remaining: "",
        },
      ],
    });

    const invalidState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(invalidState.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G19.audit_ledger.record_shape",
          decision: "BLOCK",
          message: expect.stringContaining("AUDIT-INCOMPLETE"),
        }),
        expect.objectContaining({
          rule_id: "G19.audit_ledger.next_action_derivable",
          decision: "BLOCK",
        }),
      ]),
    );

    writeAuditLedgerRecord(tmpDir, completeAuditLedgerRecord());
    const validState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(validState.gate_decisions).toEqual(
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

  it("maps phase closure records through blocker, carryover, postmerge, and pass paths", () => {
    saveFrameworkConfig(tmpDir, readyConfig());
    writePhaseClosureRecord(tmpDir, {
      phase: "Phase 1",
      phase_objective: "Internal dogfood",
      readiness_claim: "Phase 1 complete",
      merged_prs: [{ number: 231, postmerge_evidence: false }],
      l0_evidence_summary: "",
      audit_matrix: { l1: false, l2: false, l3: false },
      unresolved_blockers: [{ id: "#999", title: "open blocker" }],
      deferred_items: [{ id: "#233", target_phase: "Phase 1" }],
      residual_risks: [],
      explicit_non_claims: ["No public readiness claim"],
      next_phase_entry_conditions: ["T2 accepted"],
      reopen_criteria: ["Evidence drift"],
    });

    const invalidState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(invalidState.gate_decisions).toEqual(
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

    writePhaseClosureRecord(tmpDir, completePhaseClosureRecord());
    const validState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(validState.gate_decisions).toEqual(
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

  it("maps Work Order contract warnings and passes", () => {
    saveFrameworkConfig(tmpDir, readyConfig());

    const missingState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(missingState.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.record.present",
          decision: "WARN",
        }),
      ]),
    );

    writeDeliveryProfile(tmpDir, internalPrConveyorProfile());
    const unsafeOrder = completeWorkOrder();
    unsafeOrder.authority_boundary = {
      forbidden: ["merge approval", "phase transition", "gate pass"],
      merge_authority: "granted",
      phase_transition_authority: "allowed",
      gate_authority: true,
    };
    unsafeOrder.non_claims = ["merge authority granted"];
    unsafeOrder.context_pack_policy = {
      delivery: "instruction",
      treat_as_instruction: true,
    };
    unsafeOrder.runtime_invocation = {
      argv: ["codex", "exec", "${{ inputs.issue_body }}"],
    };
    writeWorkOrder(tmpDir, unsafeOrder);

    const warningState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(warningState.gate_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "G21.work_order.authority_boundary",
          decision: "WARN",
          message: expect.stringContaining("merge_authority:granted"),
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

    writeWorkOrder(tmpDir, completeWorkOrder());
    const validState = buildWorkflowState(tmpDir, {
      now: NOW,
      profile: "strict",
    });

    expect(validState.gate_decisions).toEqual(
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
          rule_id: "G21.work_order.context_pack_boundary",
          decision: "PASS",
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

function writeDogfoodEvidence(projectDir: string, feature = "FEAT-001"): void {
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
  writeFrameworkJson(projectDir, "phase-closure.json", record);
}

function writeAuditLedgerRecord(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "audit-ledger.json", record);
}

function writeRuntimeAdapter(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "runtime-command-adapter.json", record);
}

function writeInjectionPolicy(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "injection-policy-pack.json", record);
}

function writeRuntimeStep(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "delivery-graph-step.json", record);
}

function writeWorkOrder(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "work-order.json", record);
}

function writeDeliveryProfile(
  projectDir: string,
  record: Record<string, unknown>,
): void {
  writeFrameworkJson(projectDir, "delivery-profile.json", record);
}

function writeFrameworkJson(
  projectDir: string,
  fileName: string,
  record: Record<string, unknown>,
): void {
  fs.mkdirSync(path.join(projectDir, ".framework"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".framework", fileName),
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
        commands: [
          "npm run type-check",
          "npm test -- src/cli/lib/workflow-state.test.ts",
        ],
        approved_scope: "AUDITLEDGER-001 runtime and documentation slice only",
        explicit_non_claims: [
          "No Phase 1 closure claim",
          "No public readiness claim",
        ],
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

function completeRuntimeAdapter(
  runtime: "codex" | "claude",
): Record<string, unknown> {
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
      evidence_mapping: runtimeEvidenceMapping(),
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
    evidence_mapping: runtimeEvidenceMapping(),
  };
}

function runtimeEvidenceMapping(): Record<string, string> {
  return {
    argv: "runtime_invocation.argv",
    runtime_version: "runtime_invocation.version",
    schema_hash: "runtime_invocation.schema_hash",
    final_result: "runtime_result.final",
    gate_decision: "gate_decision",
  };
}

function completeInjectionPolicy(): Record<string, unknown> {
  return {
    policy_id: "strict-enterprise-v1",
    trusted_instruction_sources: ["system", "developer", "spec_owner"],
    trusted_policy_sources: [
      "docs/spec",
      "docs/ops",
      ".framework/policy-pack.json",
    ],
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
    allowed_files: [
      "src/cli/lib/workflow-state.ts",
      "src/cli/lib/workflow-state.test.ts",
    ],
    allowed_actions: ["edit code", "run tests", "open PR", "request audit"],
    forbidden_actions: ["merge", "production deploy", "secret change"],
    verification_commands: [
      "npm test -- src/cli/lib/workflow-state.test.ts",
      "npm run type-check",
    ],
    stop_conditions: ["R4 action requested", "missing implementation authority"],
    fallback_next_work_policy: "record blocker and move to next ready Work Order",
    inputs: [
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
      forbidden: ["merge approval", "phase transition", "goal completion"],
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
