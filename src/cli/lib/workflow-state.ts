import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadSession, type DiscoverSessionData } from "./discover-session.js";
import {
  canGenerateLocalDraft,
  evaluatePublishWorkflow,
  loadFrameworkConfig,
  resolveRequiredRoles,
  validateRoleSeparation,
  type FrameworkConfig,
  type RequiredRoleName,
  type RoleBinding,
  type RoleResolution,
  type RoleSeparationViolation,
  type WorkflowDecision as PublishWorkflowDecision,
} from "./workflow-config.js";
import { resolveLifecycleSinkReadiness } from "./lifecycle-events.js";
import type { MergeAuthorityDecision } from "./merge-authority.js";
import {
  resolveWorkOrderDeliveryDefaults,
  type WorkOrderDeliveryDefaults,
} from "./work-order-delivery-defaults.js";

export const WORKFLOW_STATE_SCHEMA_VERSION = "workflow-state/v1" as const;

export type WorkflowStateSchemaVersion = typeof WORKFLOW_STATE_SCHEMA_VERSION;
export type WorkflowProfile = "minimal" | "standard" | "strict";
export type WorkflowSourceKind = "local" | "github_issue" | "mcp" | "imported";
export type WorkflowPhase =
  | "uninitialized"
  | "started"
  | "intake_ready"
  | "hearing_in_progress"
  | "hearing_complete";

export type WorkflowEvidenceKind =
  | "project_state"
  | "discovery_session"
  | "current_session"
  | "goal_contract"
  | "phase_plan"
  | "task_trace"
  | "hearing_answer"
  | "human_confirmation"
  | "github_issue"
  | "design_artifact"
  | "doc4l_readiness"
  | "lifecycle_sink"
  | "lifecycle_record"
  | "role_binding"
  | "validator_result"
  | "review"
  | "audit"
  | "read_receipt"
  | "merge_authority"
  | "phase_closure"
  | "audit_ledger"
  | "work_order"
  | "delivery_profile"
  | "runtime_adapter"
  | "injection_policy"
  | "runtime_step"
  | "exception";

export type WorkflowActorType = "human" | "agent" | "github_user" | "system";
export type WorkflowEvidenceValidity =
  | "current"
  | "stale"
  | "superseded"
  | "invalid";
export type WorkflowPrivacyScope = "local" | "repo" | "public";
export type WorkflowGateDecisionValue = "PASS" | "WARN" | "BLOCK" | "OBSERVE";
export type WorkflowGateSeverity = "info" | "warning" | "error";
export type WorkflowRoleStatus = "ready" | "setup_required" | "invalid";

export interface WorkflowGitHubIssueContext {
  number: number;
  title?: string;
  body?: string;
  url?: string;
}

export interface BuildWorkflowStateOptions {
  profile?: WorkflowProfile;
  now?: string;
  feature?: string | null;
  githubIssue?: WorkflowGitHubIssueContext;
  mergeAuthorityDecision?: MergeAuthorityDecision | null;
}

export interface WorkflowState {
  schema_version: WorkflowStateSchemaVersion;
  project: {
    id: string;
    root: string | null;
    repo: string | null;
  };
  profile: WorkflowProfile;
  phase: WorkflowPhase;
  source: {
    kind: WorkflowSourceKind;
    uri: string | null;
  };
  roles: {
    status: WorkflowRoleStatus;
    config_ref: string | null;
    findings: string[];
    missing_roles?: RequiredRoleName[];
    placeholder_roles?: RequiredRoleName[];
  };
  evidence: WorkflowEvidenceRecord[];
  gate_decisions: WorkflowGateDecision[];
  allowed_actions: WorkflowAction[];
  blocked_actions: WorkflowAction[];
  exceptions: unknown[];
  timestamps: {
    created_at: string;
    updated_at: string;
  };
}

export interface WorkflowEvidenceRecord {
  id: string;
  kind: WorkflowEvidenceKind;
  source_uri: string | null;
  artifact_path: string | null;
  artifact_hash: string | null;
  actor: {
    type: WorkflowActorType;
    id: string;
  };
  summary: string;
  observed_at: string;
  validity: WorkflowEvidenceValidity;
  privacy_scope: WorkflowPrivacyScope;
  metadata: Record<string, unknown>;
}

export interface WorkflowGateDecision {
  rule_id: string;
  gate: string;
  decision: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
  profile: WorkflowProfile;
  message: string;
  evidence_refs: string[];
  remediation: string;
  deterministic: true;
}

export interface WorkflowAction {
  action: string;
  reason: string;
  rule_id: string;
}

interface CurrentSessionV1 {
  version?: number;
  mode?: string;
  phase?: string;
  feature?: string;
  startedAt?: string;
  updatedAt?: string;
}

const DISCOVER_SESSION_PATH = ".framework/discover-session.json";
const CURRENT_SESSION_PATH = ".framework/current-session.json";
const CONFIG_PATH = ".framework/config.json";
const PROJECT_PATH = ".framework/project.json";

export function buildWorkflowState(
  projectDir: string,
  options: BuildWorkflowStateOptions = {},
): WorkflowState {
  const now = options.now ?? new Date().toISOString();
  const profile = options.profile ?? "standard";
  const config = loadFrameworkConfig(projectDir);
  const evidence: WorkflowEvidenceRecord[] = [];
  const gateDecisions: WorkflowGateDecision[] = [];
  const allowedActions: WorkflowAction[] = [];
  const blockedActions: WorkflowAction[] = [];

  applyProjectApplied(projectDir, now, profile, evidence, gateDecisions);
  applyDogfoodReadiness(
    projectDir,
    config,
    now,
    profile,
    options.feature ?? null,
    evidence,
    gateDecisions,
  );
  applyPhaseClosureReadiness(projectDir, now, profile, evidence, gateDecisions);
  applyAuditLedgerReadiness(projectDir, now, profile, evidence, gateDecisions);
  applyWorkOrderReadiness(projectDir, now, profile, evidence, gateDecisions);
  applyRuntimeStepReadiness(projectDir, now, profile, evidence, gateDecisions);

  const currentSession = readJsonFile<CurrentSessionV1>(
    projectDir,
    CURRENT_SESSION_PATH,
  );
  if (currentSession) {
    evidence.push(
      createEvidence({
        projectDir,
        now,
        kind: "current_session",
        artifactPath: CURRENT_SESSION_PATH,
        sourceUri: `file://${CURRENT_SESSION_PATH}`,
        summary: `Current session ${currentSession.mode ?? "unknown"}${currentSession.phase ? ` at ${currentSession.phase}` : ""}`,
        metadata: {
          version: currentSession.version ?? null,
          mode: currentSession.mode ?? null,
          phase: currentSession.phase ?? null,
          feature: currentSession.feature ?? null,
        },
      }),
    );
  }

  if (options.githubIssue) {
    evidence.push(createGitHubIssueEvidence(options.githubIssue, now));
  }

  let hearingComplete = false;
  const discoverSession = loadDiscoverSession(projectDir);
  if (discoverSession?.status === "completed") {
    const discoverEvidence = createDiscoverSessionEvidence(
      projectDir,
      discoverSession,
      now,
    );
    evidence.push(discoverEvidence);
    gateDecisions.push(
      decision({
        ruleId: "G2.hearing.required_confirmation",
        gate: "hearing",
        decisionValue: "PASS",
        severity: "info",
        profile,
        message: "Completed discover session provides hearing evidence.",
        evidenceRefs: [discoverEvidence.id],
        remediation: "No action required.",
      }),
    );
    hearingComplete = true;
  } else {
    if (discoverSession) {
      evidence.push(
        createDiscoverSessionEvidence(projectDir, discoverSession, now, "invalid"),
      );
    }
    gateDecisions.push(
      decision({
        ruleId: "G2.hearing.required_confirmation",
        gate: "hearing",
        decisionValue: "BLOCK",
        severity: "error",
        profile,
        message: discoverSession
          ? `Discover session is ${discoverSession.status}; hearing evidence is not complete.`
          : "No discover session found; hearing evidence is missing.",
        evidenceRefs: [],
        remediation:
          "Run or resume shirube discover, or provide deterministic hearing evidence before implementation.",
      }),
    );
  }

  const roleState = evaluateRoles(config, projectDir, now, evidence, gateDecisions, profile);
  const publishDecision = evaluatePublishWorkflow(config);
  const localDraftDecision = canGenerateLocalDraft(config);
  applyPublishActions(
    publishDecision,
    localDraftDecision,
    profile,
    allowedActions,
    blockedActions,
    gateDecisions,
  );
  applyMergeAuthority(
    options.mergeAuthorityDecision,
    profile,
    evidence,
    gateDecisions,
    now,
  );

  return {
    schema_version: WORKFLOW_STATE_SCHEMA_VERSION,
    project: {
      id: path.basename(projectDir),
      root: projectDir,
      repo: null,
    },
    profile,
    phase: derivePhase({
      currentSession,
      githubIssue: options.githubIssue,
      discoverSession,
      hearingComplete,
    }),
    source: options.githubIssue
      ? { kind: "github_issue", uri: options.githubIssue.url ?? null }
      : { kind: "local", uri: null },
    roles: roleState,
    evidence,
    gate_decisions: gateDecisions,
    allowed_actions: allowedActions,
    blocked_actions: blockedActions,
    exceptions: [],
    timestamps: {
      created_at: now,
      updated_at: now,
    },
  };
}

interface LocalEvidenceRequirement {
  ruleId: string;
  gate: string;
  kind: WorkflowEvidenceKind;
  paths: string[];
  passMessage: string;
  missingMessage: string;
  remediation: string;
  validator?: (artifact: LocalEvidenceArtifact) => boolean;
  requireSelectedFeatureScope?: boolean;
}

interface LocalEvidenceArtifact {
  path: string;
  raw: string;
  metadata: Record<string, unknown>;
}

const DOGFOOD_EVIDENCE_REQUIREMENTS: LocalEvidenceRequirement[] = [
  {
    ruleId: "G10.goal_contract.approved",
    gate: "goal_contract",
    kind: "goal_contract",
    paths: [
      ".framework/goal-contract.json",
      ".framework/goal-contract.md",
      "docs/management/GOAL_CONTRACT.md",
      "docs/specs/goal-contract.md",
      "docs/specs/GOAL_CONTRACT.md",
    ],
    passMessage: "Goal Contract approval evidence is present.",
    missingMessage: "Goal Contract approval evidence is missing.",
    remediation: "Create or import an approved V0/V1 Goal Contract.",
    validator: hasApprovedDisposition,
  },
  {
    ruleId: "G10.phase_plan.present",
    gate: "phase_plan",
    kind: "phase_plan",
    paths: [
      ".framework/phase-plan.json",
      ".framework/phase-plan.md",
      "docs/management/PHASE_PLAN.md",
      "docs/specs/phase-plan.md",
      "docs/specs/roadmap.md",
    ],
    passMessage: "Phase plan evidence is present.",
    missingMessage: "Phase plan evidence is missing.",
    remediation: "Create a phase plan that traces to the Goal Contract.",
    requireSelectedFeatureScope: true,
  },
  {
    ruleId: "G10.task_trace.present",
    gate: "task_trace",
    kind: "task_trace",
    paths: [
      ".framework/task-trace.json",
      ".framework/task-trace.md",
      ".framework/tasks.json",
      "docs/specs/phase1-internal-dogfood-start.md",
    ],
    passMessage: "Task trace evidence is present.",
    missingMessage: "Task trace evidence is missing.",
    remediation: "Link the selected task to phase, issue, and feature/task decomposition.",
    requireSelectedFeatureScope: true,
  },
  {
    ruleId: "G10.doc4l.readiness",
    gate: "doc4l",
    kind: "doc4l_readiness",
    paths: [
      ".framework/doc4l-readiness.json",
      ".framework/doc4l-readiness.md",
    ],
    passMessage: "SPEC/IMPL/VERIFY/OPS readiness evidence is present.",
    missingMessage: "SPEC/IMPL/VERIFY/OPS readiness evidence is missing.",
    remediation: "Add SPEC/IMPL/VERIFY/OPS docs or explicit non-applicability.",
    validator: hasReadyDisposition,
    requireSelectedFeatureScope: true,
  },
  {
    ruleId: "G11.pre_impl_audit.disposition",
    gate: "pre_impl_audit",
    kind: "audit",
    paths: [
      ".framework/pre-impl-audit.json",
      ".framework/pre-impl-audit.md",
      ".framework/audit/pre-impl.json",
      ".framework/audit/pre-impl.md",
    ],
    passMessage: "Pre-implementation audit disposition evidence is present.",
    missingMessage: "Pre-implementation audit disposition evidence is missing.",
    remediation: "Record pre-implementation audit PASS or an approved non-applicability rationale.",
    validator: hasPassOrApprovedDisposition,
    requireSelectedFeatureScope: true,
  },
];

interface PhaseClosureFieldRequirement {
  label: string;
  keys: string[];
  requireNonEmpty: boolean;
}

const PHASE_CLOSURE_EVIDENCE_PATHS = [
  ".framework/phase-closure.json",
  ".framework/phase-closure.md",
  ".framework/phase-closures/latest.json",
  "docs/management/phase-closure.md",
];

const PHASE_CLOSURE_REQUIRED_FIELDS: PhaseClosureFieldRequirement[] = [
  { label: "phase", keys: ["phase", "phase_id"], requireNonEmpty: true },
  {
    label: "phase_objective",
    keys: ["phase_objective", "objective"],
    requireNonEmpty: true,
  },
  {
    label: "readiness_claim",
    keys: ["readiness_claim", "exact_readiness_claim", "claim"],
    requireNonEmpty: true,
  },
  {
    label: "completed_tasks",
    keys: ["completed_tasks", "tasks_complete", "tasks"],
    requireNonEmpty: true,
  },
  {
    label: "merged_prs",
    keys: ["merged_prs", "merged_pull_requests", "prs"],
    requireNonEmpty: true,
  },
  {
    label: "l0_evidence_summary",
    keys: ["l0_evidence_summary", "l0", "l0_evidence"],
    requireNonEmpty: true,
  },
  {
    label: "audit_matrix",
    keys: ["audit_matrix", "l1_l2_l3_coverage_matrix", "coverage_matrix"],
    requireNonEmpty: true,
  },
  {
    label: "unresolved_blockers",
    keys: ["unresolved_blockers", "blockers"],
    requireNonEmpty: false,
  },
  {
    label: "deferred_items",
    keys: ["deferred_items", "carryovers", "non_blocking_items"],
    requireNonEmpty: false,
  },
  {
    label: "residual_risks",
    keys: ["residual_risks", "risk_register", "risks"],
    requireNonEmpty: false,
  },
  {
    label: "explicit_non_claims",
    keys: ["explicit_non_claims", "non_claims"],
    requireNonEmpty: true,
  },
  {
    label: "next_phase_entry_conditions",
    keys: ["next_phase_entry_conditions", "entry_conditions"],
    requireNonEmpty: true,
  },
  {
    label: "reopen_criteria",
    keys: ["reopen_criteria", "reopen_escalation_criteria", "escalation_criteria"],
    requireNonEmpty: true,
  },
];

interface AuditLedgerValidation {
  missingFields: string[];
  invalidRecords: string[];
  nextActionGaps: string[];
  recordCount: number;
}

const AUDIT_LEDGER_EVIDENCE_PATHS = [
  ".framework/audit-ledger.json",
  ".framework/audit-ledger.md",
  ".framework/audit/ledger.json",
  ".framework/audit-ledger/latest.json",
  ".framework/audits/ledger.json",
  "docs/management/audit-ledger.md",
];

interface RuntimeAdapterValidation {
  missingFields: string[];
  invalidFields: string[];
  unsafeArgv: string[];
  evidenceMappingGaps: string[];
}

interface InjectionPolicyValidation {
  missingFields: string[];
  invalidFields: string[];
  unsafeRules: string[];
}

interface RuntimeStepValidation {
  missingFields: string[];
  invalidFields: string[];
  referenceGaps: string[];
  outputSchemaGaps: string[];
  permissionGaps: string[];
}

interface WorkOrderValidation {
  missingFields: string[];
  invalidFields: string[];
  deliveryGaps: string[];
  deliveryDefaults: WorkOrderDeliveryDefaults | null;
  dispatchGaps: string[];
  runtimeGaps: string[];
  contextPackGaps: string[];
  authorityGaps: string[];
  promotionGaps: string[];
}

const WORK_ORDER_EVIDENCE_PATHS = [
  ".framework/work-order.json",
  ".framework/work-order/latest.json",
  ".framework/work-orders/latest.json",
  ".framework/delivery-graph/work-order.json",
  ".framework/aun/work-order.json",
];

const DELIVERY_PROFILE_EVIDENCE_PATHS = [
  ".framework/delivery-profile.json",
  ".framework/delivery-profile/latest.json",
  ".framework/delivery-profiles/active.json",
  "templates/delivery-profiles/iyasaka-internal.pr-conveyor.delivery-profile.json",
];

const RUNTIME_ADAPTER_EVIDENCE_PATHS = [
  ".framework/runtime-command-adapter.json",
  ".framework/runtime-adapter.json",
  ".framework/runtime/adapter.json",
  ".framework/runtime/adapters.json",
  ".framework/delivery-graph/runtime-command-adapter.json",
];

const INJECTION_POLICY_EVIDENCE_PATHS = [
  ".framework/injection-policy-pack.json",
  ".framework/injection-policy.json",
  ".framework/runtime/injection-policy-pack.json",
  ".framework/delivery-graph/injection-policy-pack.json",
];

const RUNTIME_STEP_EVIDENCE_PATHS = [
  ".framework/delivery-graph-step.json",
  ".framework/runtime-step.json",
  ".framework/runtime/step.json",
  ".framework/delivery-graph/step.json",
];

const RUNTIME_ADAPTER_FEATURES = new Set([
  "jsonl_stream",
  "stream_json",
  "json_schema_final",
  "tool_allowlist",
  "sandbox",
  "mcp_config",
  "session_resume",
]);

const RUNTIME_VALUES = new Set(["codex", "claude", "custom"]);
const STDIN_MODES = new Set(["none", "prompt", "json-envelope", "context-pack"]);
const OUTPUT_MODES = new Set(["jsonl", "json", "text"]);
const SANDBOX_MODES = new Set([
  "read-only",
  "workspace-write",
  "danger-full-access",
  "host-specific",
]);
const STEP_WRITE_SCOPES = new Set([
  "none",
  "read-only",
  "workspace-write",
  "repo-write",
  "host-specific",
]);
const PROMPT_SEGMENTS = new Set([
  "system",
  "developer",
  "task",
  "context",
  "tool_output",
  "retrieved_source",
]);
const PROMPT_DELIVERIES = new Set([
  "instruction",
  "data-only",
  "citation-only",
  "omit",
]);

const CODEX_VALUE_FLAGS = [
  "--output-schema",
  "--output-last-message",
  "--sandbox",
  "--cd",
];

const CLAUDE_REQUIRED_VALUE_FLAGS = [
  "--output-format",
  "--json-schema",
  "--permission-mode",
];

const CLAUDE_OPTIONAL_VALUE_FLAGS = [
  "--allowedTools",
  "--disallowedTools",
  "--mcp-config",
];

const REQUIRED_RUNTIME_EVIDENCE_MAPPING_KEYS = [
  "argv",
  "runtime_version",
  "schema_hash",
  "final_result",
  "gate_decision",
];

const WORK_ORDER_DISPATCH_SURFACES = new Set([
  "aun",
  "aundispatch",
  "codex",
  "claude",
  "structuredinvocation",
  "shirube",
  "shirubegate",
  "shirubereport",
]);

const WORK_ORDER_WRITE_SCOPES = new Set([
  "none",
  "read-only",
  "workspace-write",
  "repo-write",
  "host-specific",
]);

const WORK_ORDER_ENFORCEMENT_MODES = new Set([
  "warning",
  "warn",
  "observe",
  "block-ready",
  "hard-block-ready",
]);
const WORK_ORDER_CANONICAL_NO_AUTHORITY_VALUE = "notgranted";
const WORK_ORDER_NO_AUTHORITY_VALUES = new Set([
  "notgranted",
  "notallowed",
  "none",
  "no",
  "false",
  "denied",
  "forbidden",
  "prohibited",
]);
const WORK_ORDER_AUTHORITY_GRANT_VALUES = new Set([
  "granted",
  "allowed",
  "allow",
  "true",
  "yes",
  "approved",
  "approve",
  "passed",
  "pass",
  "enabled",
  "permitted",
]);

function applyProjectApplied(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const projectPath = path.join(projectDir, PROJECT_PATH);
  const configPath = path.join(projectDir, CONFIG_PATH);
  if (fs.existsSync(projectPath)) {
    const artifactPath = PROJECT_PATH;
    const projectEvidence = createEvidence({
      projectDir,
      now,
      kind: "project_state",
      artifactPath,
      sourceUri: `file://${artifactPath}`,
      summary: "Project application state is present.",
      metadata: {
        projectPathPresent: fs.existsSync(projectPath),
        configPathPresent: fs.existsSync(configPath),
      },
    });
    evidence.push(projectEvidence);
    gateDecisions.push(
      decision({
        ruleId: "G0.start_boundary.project_applied",
        gate: "start_boundary",
        decisionValue: "PASS",
        severity: "info",
        profile,
        message: "Project application state is present.",
        evidenceRefs: [projectEvidence.id],
        remediation: "No action required.",
      }),
    );
    return;
  }

  gateDecisions.push(
    decision({
      ruleId: "G0.start_boundary.project_applied",
      gate: "start_boundary",
      decisionValue: "BLOCK",
      severity: "error",
      profile,
      message: fs.existsSync(configPath)
        ? "Project application state is incomplete: .framework/project.json is missing."
        : "Project application state is missing.",
      evidenceRefs: [],
      remediation: "Run shirube retrofit or shirube init to create project state.",
    }),
  );
}

function applyDogfoodReadiness(
  projectDir: string,
  config: FrameworkConfig,
  now: string,
  profile: WorkflowProfile,
  feature: string | null,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  for (const requirement of DOGFOOD_EVIDENCE_REQUIREMENTS) {
    applyLocalEvidenceRequirement(projectDir, now, profile, feature, requirement, evidence, gateDecisions);
  }

  const lifecycleSink = resolveLifecycleSinkReadiness(projectDir, config);
  if (lifecycleSink.ready && lifecycleSink.path) {
    const lifecycleEvidence = createSyntheticEvidence({
      now,
      kind: "lifecycle_sink",
      sourceUri: lifecycleSink.destination,
      artifactPath: lifecycleSink.path,
      artifactHash: null,
      summary: "Lifecycle evidence sink is ready.",
      validity: "current",
      metadata: {
        reason: lifecycleSink.reason,
        feature,
      },
    });
    evidence.push(lifecycleEvidence);
    gateDecisions.push(
      decision({
        ruleId: "G18.admin_notice.sink_ready",
        gate: "admin_notice",
        decisionValue: "PASS",
        severity: "info",
        profile,
        message: "Lifecycle evidence sink is ready.",
        evidenceRefs: [lifecycleEvidence.id],
        remediation: "No action required.",
      }),
    );
  } else {
    const missing = dogfoodMissingDecision(profile);
    gateDecisions.push(
      decision({
        ruleId: "G18.admin_notice.sink_ready",
        gate: "admin_notice",
        decisionValue: missing.decision,
        severity: missing.severity,
        profile,
        message: `Lifecycle evidence sink is not ready: ${lifecycleSink.reason}`,
        evidenceRefs: [],
        remediation: "Configure a deterministic lifecycle evidence sink or local fallback.",
      }),
    );
  }

  gateDecisions.push(
    decision({
      ruleId: "G18.admin_notice.lifecycle_record",
      gate: "admin_notice",
      decisionValue: "OBSERVE",
      severity: "info",
      profile,
      message: "Lifecycle records are transition outputs and are emitted by strict start.",
      evidenceRefs: [],
      remediation: "Run shirube start so task_start or blocked lifecycle evidence is written in the same transition.",
    }),
  );
}

function applyPhaseClosureReadiness(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const artifact = findLocalEvidence(projectDir, PHASE_CLOSURE_EVIDENCE_PATHS);
  if (!artifact) {
    const missing = dogfoodMissingDecision(profile);
    gateDecisions.push(
      decision({
        ruleId: "G12.phase_closure.record.present",
        gate: "phase_closure",
        decisionValue: missing.decision,
        severity: missing.severity,
        profile,
        message: "Phase closure record is missing.",
        evidenceRefs: [],
        remediation:
          "Create .framework/phase-closure.json before claiming phase completion.",
      }),
    );
    return;
  }

  const missingFields = findMissingPhaseClosureFields(artifact.metadata);
  const unresolvedBlockers = findUnresolvedPhaseClosureBlockers(artifact.metadata);
  const unjustifiedCarryovers = findUnjustifiedPhaseClosureCarryovers(artifact.metadata);
  const postmergeGaps = findPhaseClosurePostmergeGaps(artifact.metadata);
  const auditLedgerGaps = findPhaseClosureAuditLedgerGaps(artifact.metadata);
  const hasClosureIssues =
    missingFields.length > 0 ||
    unresolvedBlockers.length > 0 ||
    unjustifiedCarryovers.length > 0 ||
    postmergeGaps.length > 0 ||
    auditLedgerGaps.length > 0;

  const closureEvidence = createEvidence({
    projectDir,
    now,
    kind: "phase_closure",
    artifactPath: artifact.path,
    sourceUri: `file://${artifact.path}`,
    summary: hasClosureIssues
      ? "Phase closure record is present but incomplete."
      : "Phase closure record is complete.",
    validity: hasClosureIssues ? "invalid" : "current",
    metadata: artifact.metadata,
  });
  evidence.push(closureEvidence);

  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.record.present",
      gate: "phase_closure",
      decisionValue: "PASS",
      severity: "info",
      profile,
      message: "Phase closure record is present.",
      evidenceRefs: [closureEvidence.id],
      remediation: "No action required.",
    }),
  );

  const missing = dogfoodMissingDecision(profile);
  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.required_fields",
      gate: "phase_closure",
      decisionValue: missingFields.length === 0 ? "PASS" : missing.decision,
      severity: missingFields.length === 0 ? "info" : missing.severity,
      profile,
      message:
        missingFields.length === 0
          ? "Phase closure required fields are complete."
          : `Phase closure record is missing required fields: ${missingFields.join(", ")}.`,
      evidenceRefs: [closureEvidence.id],
      remediation:
        missingFields.length === 0
          ? "No action required."
          : "Fill every required phase closure field, including audit coverage and non-claims.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.blockers_cleared",
      gate: "phase_closure",
      decisionValue: unresolvedBlockers.length === 0 ? "PASS" : missing.decision,
      severity: unresolvedBlockers.length === 0 ? "info" : missing.severity,
      profile,
      message:
        unresolvedBlockers.length === 0
          ? "Phase closure has no unresolved blockers."
          : `Phase closure still has unresolved blockers: ${unresolvedBlockers.join(", ")}.`,
      evidenceRefs: [closureEvidence.id],
      remediation:
        unresolvedBlockers.length === 0
          ? "No action required."
          : "Resolve blockers or move non-blocking items to justified carryovers before claiming phase completion.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.carryovers_justified",
      gate: "phase_closure",
      decisionValue: unjustifiedCarryovers.length === 0 ? "PASS" : missing.decision,
      severity: unjustifiedCarryovers.length === 0 ? "info" : missing.severity,
      profile,
      message:
        unjustifiedCarryovers.length === 0
          ? "Deferred or non-blocking carryovers are justified."
          : `Deferred carryovers lack safety rationale: ${unjustifiedCarryovers.join(", ")}.`,
      evidenceRefs: [closureEvidence.id],
      remediation:
        unjustifiedCarryovers.length === 0
          ? "No action required."
          : "Add owner, target phase/task, and why each carryover is safe to defer.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.postmerge_evidence",
      gate: "phase_closure",
      decisionValue: postmergeGaps.length === 0 ? "PASS" : missing.decision,
      severity: postmergeGaps.length === 0 ? "info" : missing.severity,
      profile,
      message:
        postmergeGaps.length === 0
          ? "POSTMERGE evidence is present for phase-exit PRs."
          : `POSTMERGE evidence is missing for: ${postmergeGaps.join(", ")}.`,
      evidenceRefs: [closureEvidence.id],
      remediation:
        postmergeGaps.length === 0
          ? "No action required."
          : "Link POSTMERGE-001 evidence for every merged PR that supports the phase closure claim.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G12.phase_closure.audit_ledger_refs",
      gate: "phase_closure",
      decisionValue: auditLedgerGaps.length === 0 ? "PASS" : missing.decision,
      severity: auditLedgerGaps.length === 0 ? "info" : missing.severity,
      profile,
      message:
        auditLedgerGaps.length === 0
          ? "Phase closure cites audit ledger records."
          : `Phase closure is missing audit ledger references for: ${auditLedgerGaps.join(", ")}.`,
      evidenceRefs: [closureEvidence.id],
      remediation:
        auditLedgerGaps.length === 0
          ? "No action required."
          : "Cite machine-readable audit ledger record ids for L1/L2/L3 closure coverage.",
    }),
  );
}

function applyAuditLedgerReadiness(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const artifact = findLocalEvidence(projectDir, AUDIT_LEDGER_EVIDENCE_PATHS);
  if (!artifact) {
    const missing = dogfoodMissingDecision(profile);
    gateDecisions.push(
      decision({
        ruleId: "G19.audit_ledger.record.present",
        gate: "audit_ledger",
        decisionValue: missing.decision,
        severity: missing.severity,
        profile,
        message: "Audit ledger record is missing.",
        evidenceRefs: [],
        remediation:
          "Create .framework/audit-ledger.json before relying on audit approval evidence.",
      }),
    );
    return;
  }

  const validation = validateAuditLedgerMetadata(artifact.metadata);
  const hasLedgerIssues =
    validation.missingFields.length > 0 ||
    validation.invalidRecords.length > 0 ||
    validation.nextActionGaps.length > 0;
  const ledgerEvidence = createEvidence({
    projectDir,
    now,
    kind: "audit_ledger",
    artifactPath: artifact.path,
    sourceUri: `file://${artifact.path}`,
    summary: hasLedgerIssues
      ? "Audit ledger is present but incomplete."
      : "Audit ledger is present and valid.",
    validity: hasLedgerIssues ? "invalid" : "current",
    metadata: {
      ...artifact.metadata,
      validation,
    },
  });
  evidence.push(ledgerEvidence);

  gateDecisions.push(
    decision({
      ruleId: "G19.audit_ledger.record.present",
      gate: "audit_ledger",
      decisionValue: "PASS",
      severity: "info",
      profile,
      message: "Audit ledger record is present.",
      evidenceRefs: [ledgerEvidence.id],
      remediation: "No action required.",
    }),
  );

  const missing = dogfoodMissingDecision(profile);
  gateDecisions.push(
    decision({
      ruleId: "G19.audit_ledger.required_fields",
      gate: "audit_ledger",
      decisionValue:
        validation.missingFields.length === 0 ? "PASS" : missing.decision,
      severity: validation.missingFields.length === 0 ? "info" : missing.severity,
      profile,
      message:
        validation.missingFields.length === 0
          ? "Audit ledger root fields are complete."
          : `Audit ledger is missing root fields: ${validation.missingFields.join(", ")}.`,
      evidenceRefs: [ledgerEvidence.id],
      remediation:
        validation.missingFields.length === 0
          ? "No action required."
          : "Fill schema_version, ledger_id, and records at the audit ledger root.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G19.audit_ledger.record_shape",
      gate: "audit_ledger",
      decisionValue:
        validation.invalidRecords.length === 0 ? "PASS" : missing.decision,
      severity: validation.invalidRecords.length === 0 ? "info" : missing.severity,
      profile,
      message:
        validation.invalidRecords.length === 0
          ? "Audit ledger records have the required shape."
          : `Audit ledger records are incomplete: ${validation.invalidRecords.join(", ")}.`,
      evidenceRefs: [ledgerEvidence.id],
      remediation:
        validation.invalidRecords.length === 0
          ? "No action required."
          : "Add audit id, artifact reference, level, reviewer, verdict, timestamp, evidence, scope, non-claims, conditions, supersedes/amends, commands, and phase/task/goal linkage to every record.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G19.audit_ledger.next_action_derivable",
      gate: "audit_ledger",
      decisionValue:
        validation.nextActionGaps.length === 0 ? "PASS" : missing.decision,
      severity: validation.nextActionGaps.length === 0 ? "info" : missing.severity,
      profile,
      message:
        validation.nextActionGaps.length === 0
          ? "Audit ledger records can drive next-action derivation."
          : `Audit ledger records lack next-action derivation data: ${validation.nextActionGaps.join(", ")}.`,
      evidenceRefs: [ledgerEvidence.id],
      remediation:
        validation.nextActionGaps.length === 0
          ? "No action required."
          : "Add recommended_next_action, unresolved findings, or downstream gate data for each audit record.",
    }),
  );
}

function applyWorkOrderReadiness(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const warning = workOrderWarningDecision();
  const artifact = findLocalEvidence(projectDir, WORK_ORDER_EVIDENCE_PATHS);
  const deliveryProfileArtifact = findLocalEvidence(projectDir, DELIVERY_PROFILE_EVIDENCE_PATHS);
  const deliveryProfileEvidence = deliveryProfileArtifact
    ? createEvidence({
        projectDir,
        now,
        kind: "delivery_profile",
        artifactPath: deliveryProfileArtifact.path,
        sourceUri: `file://${deliveryProfileArtifact.path}`,
        summary: "Delivery profile evidence is present.",
        validity: "current",
        metadata: deliveryProfileArtifact.metadata,
      })
    : null;
  if (deliveryProfileEvidence) {
    evidence.push(deliveryProfileEvidence);
  }
  const workOrderMetadata = artifact
    ? selectWorkOrderMetadata(artifact.metadata)
    : null;
  const validation = workOrderMetadata
    ? validateWorkOrderMetadata(workOrderMetadata, deliveryProfileArtifact?.metadata ?? null)
    : null;
  const workOrderEvidence = artifact
    ? createEvidence({
        projectDir,
        now,
        kind: "work_order",
        artifactPath: artifact.path,
        sourceUri: `file://${artifact.path}`,
        summary:
          validation && workOrderValidationHasIssues(validation)
            ? "Work Order contract is present but incomplete."
            : "Work Order contract is present.",
        validity:
          validation && workOrderValidationHasIssues(validation)
            ? "invalid"
            : "current",
        metadata: {
          ...artifact.metadata,
          selected_work_order: workOrderMetadata,
          selected_delivery_profile: deliveryProfileArtifact?.metadata ?? null,
          validation,
        },
      })
    : null;
  if (workOrderEvidence) {
    evidence.push(workOrderEvidence);
  }

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.record.present",
      gate: "work_order",
      decisionValue: workOrderMetadata ? "PASS" : warning.decision,
      severity: workOrderMetadata ? "info" : warning.severity,
      profile,
      message: workOrderMetadata
        ? "Work Order contract is present."
        : "Work Order contract is missing.",
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation: workOrderMetadata
        ? "No action required."
        : "Create .framework/work-order.json before dispatching work to agents or runtimes.",
    }),
  );

  if (!validation) {
    return;
  }

  const fieldIssues = [
    ...validation.missingFields.map((field) => `missing:${field}`),
    ...validation.invalidFields.map((field) => `invalid:${field}`),
  ];
  const requiredFieldDecision = fieldIssues.length === 0
    ? ({ decision: "PASS", severity: "info" } as const)
    : ({ decision: "BLOCK", severity: "error" } as const);
  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.required_fields",
      gate: "work_order",
      decisionValue: requiredFieldDecision.decision,
      severity: requiredFieldDecision.severity,
      profile,
      message:
        fieldIssues.length === 0
          ? "Work Order required fields are complete."
          : `Work Order required fields have issues: ${fieldIssues.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        fieldIssues.length === 0
          ? "No action required."
          : "Fill schema, id, scope, objective, handoff target, input evidence, expected output schema, write scope, required gates, authority boundary, and non-claims.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.delivery_profile_defaults",
      gate: "work_order",
      decisionValue: validation.deliveryGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.deliveryGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.deliveryGaps.length === 0
          ? "Work Order delivery strategy defaults resolve from the selected profile."
          : `Work Order delivery profile defaults have gaps: ${validation.deliveryGaps.join(", ")}.`,
      evidenceRefs: [workOrderEvidence?.id, deliveryProfileEvidence?.id].filter(
        (id): id is string => Boolean(id),
      ),
      remediation:
        validation.deliveryGaps.length === 0
          ? "No action required."
          : "Declare risk class, owner fields, action envelope, or delivery profile evidence so strategy, lane, PR mode, and audit timing can be resolved.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.dispatch_contract",
      gate: "work_order",
      decisionValue: validation.dispatchGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.dispatchGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.dispatchGaps.length === 0
          ? "Work Order declares dispatch surfaces for AUN, structured invocation, or Shirube reporting."
          : `Work Order dispatch contract has gaps: ${validation.dispatchGaps.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        validation.dispatchGaps.length === 0
          ? "No action required."
          : "Declare dispatch surfaces, handoff target, and report/gate sink compatibility before dispatch.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.runtime_contract",
      gate: "work_order",
      decisionValue: validation.runtimeGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.runtimeGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.runtimeGaps.length === 0
          ? "Work Order declares structured runtime invocation requirements."
          : `Work Order runtime contract has gaps: ${validation.runtimeGaps.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        validation.runtimeGaps.length === 0
          ? "No action required."
          : "Declare runtime adapter or structured invocation needs, expected output schema, and write scope.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.context_pack_boundary",
      gate: "work_order",
      decisionValue: validation.contextPackGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.contextPackGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.contextPackGaps.length === 0
          ? "Work Order treats context-pack refs as data evidence, not instruction authority."
          : `Work Order context-pack boundary has gaps: ${validation.contextPackGaps.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        validation.contextPackGaps.length === 0
          ? "No action required."
          : "Declare context_pack_refs or explicit non-applicability, and keep context-pack item text data-only or citation-only.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.authority_boundary",
      gate: "work_order",
      decisionValue: validation.authorityGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.authorityGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.authorityGaps.length === 0
          ? "Work Order authority boundary is explicit."
          : `Work Order authority boundary has gaps: ${validation.authorityGaps.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        validation.authorityGaps.length === 0
          ? "No action required."
          : "Declare forbidden authority, required gates, non-claims, and no shell-command generation from Work Order text.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G21.work_order.promotion_path",
      gate: "work_order",
      decisionValue: validation.promotionGaps.length === 0 ? "PASS" : warning.decision,
      severity: validation.promotionGaps.length === 0 ? "info" : warning.severity,
      profile,
      message:
        validation.promotionGaps.length === 0
          ? "Work Order declares a warning-first migration path."
          : `Work Order promotion path has gaps: ${validation.promotionGaps.join(", ")}.`,
      evidenceRefs: workOrderEvidence ? [workOrderEvidence.id] : [],
      remediation:
        validation.promotionGaps.length === 0
          ? "No action required."
          : "Declare enforcement mode and criteria for later promotion from WARN to BLOCK.",
    }),
  );
}

function applyRuntimeStepReadiness(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const missing = dogfoodMissingDecision(profile);
  const adapterArtifact = findLocalEvidence(projectDir, RUNTIME_ADAPTER_EVIDENCE_PATHS);
  const policyArtifact = findLocalEvidence(projectDir, INJECTION_POLICY_EVIDENCE_PATHS);
  const stepArtifact = findLocalEvidence(projectDir, RUNTIME_STEP_EVIDENCE_PATHS);

  const adapterMetadata = adapterArtifact
    ? selectRuntimeAdapterMetadata(adapterArtifact.metadata)
    : null;
  const policyMetadata = policyArtifact
    ? selectInjectionPolicyMetadata(policyArtifact.metadata)
    : null;
  const stepMetadata = stepArtifact
    ? selectRuntimeStepMetadata(stepArtifact.metadata)
    : null;

  const adapterValidation = adapterMetadata
    ? validateRuntimeAdapterMetadata(adapterMetadata)
    : null;
  const policyValidation = policyMetadata
    ? validateInjectionPolicyMetadata(policyMetadata)
    : null;
  const stepValidation = stepMetadata
    ? validateRuntimeStepMetadata(stepMetadata, adapterMetadata, policyMetadata)
    : null;

  const adapterEvidence = adapterArtifact
    ? createEvidence({
        projectDir,
        now,
        kind: "runtime_adapter",
        artifactPath: adapterArtifact.path,
        sourceUri: `file://${adapterArtifact.path}`,
        summary:
          adapterValidation && runtimeAdapterValidationHasIssues(adapterValidation)
            ? "Runtime command adapter is present but invalid."
            : "Runtime command adapter is present.",
        validity:
          adapterValidation && runtimeAdapterValidationHasIssues(adapterValidation)
            ? "invalid"
            : "current",
        metadata: {
          ...adapterArtifact.metadata,
          selected_adapter: adapterMetadata,
          validation: adapterValidation,
        },
      })
    : null;
  if (adapterEvidence) {
    evidence.push(adapterEvidence);
  }

  const policyEvidence = policyArtifact
    ? createEvidence({
        projectDir,
        now,
        kind: "injection_policy",
        artifactPath: policyArtifact.path,
        sourceUri: `file://${policyArtifact.path}`,
        summary:
          policyValidation && injectionPolicyValidationHasIssues(policyValidation)
            ? "Injection policy pack is present but invalid."
            : "Injection policy pack is present.",
        validity:
          policyValidation && injectionPolicyValidationHasIssues(policyValidation)
            ? "invalid"
            : "current",
        metadata: {
          ...policyArtifact.metadata,
          selected_policy: policyMetadata,
          validation: policyValidation,
        },
      })
    : null;
  if (policyEvidence) {
    evidence.push(policyEvidence);
  }

  const stepEvidence = stepArtifact
    ? createEvidence({
        projectDir,
        now,
        kind: "runtime_step",
        artifactPath: stepArtifact.path,
        sourceUri: `file://${stepArtifact.path}`,
        summary:
          stepValidation && runtimeStepValidationHasIssues(stepValidation)
            ? "Delivery Graph runtime step is present but invalid."
            : "Delivery Graph runtime step is present.",
        validity:
          stepValidation && runtimeStepValidationHasIssues(stepValidation)
            ? "invalid"
            : "current",
        metadata: {
          ...stepArtifact.metadata,
          selected_step: stepMetadata,
          validation: stepValidation,
        },
      })
    : null;
  if (stepEvidence) {
    evidence.push(stepEvidence);
  }

  gateDecisions.push(
    decision({
      ruleId: "G20.runtime_step.adapter.present",
      gate: "runtime_step",
      decisionValue: adapterMetadata ? "PASS" : missing.decision,
      severity: adapterMetadata ? "info" : missing.severity,
      profile,
      message: adapterMetadata
        ? "Runtime command adapter profile is present."
        : "Runtime command adapter profile is missing.",
      evidenceRefs: adapterEvidence ? [adapterEvidence.id] : [],
      remediation: adapterMetadata
        ? "No action required."
        : "Create .framework/runtime-command-adapter.json before executing a Delivery Graph runtime step.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G20.runtime_step.injection_policy.present",
      gate: "runtime_step",
      decisionValue: policyMetadata ? "PASS" : missing.decision,
      severity: policyMetadata ? "info" : missing.severity,
      profile,
      message: policyMetadata
        ? "Injection policy pack is present."
        : "Injection policy pack is missing.",
      evidenceRefs: policyEvidence ? [policyEvidence.id] : [],
      remediation: policyMetadata
        ? "No action required."
        : "Create .framework/injection-policy-pack.json before executing a Delivery Graph runtime step.",
    }),
  );

  gateDecisions.push(
    decision({
      ruleId: "G20.runtime_step.step_contract.present",
      gate: "runtime_step",
      decisionValue: stepMetadata ? "PASS" : missing.decision,
      severity: stepMetadata ? "info" : missing.severity,
      profile,
      message: stepMetadata
        ? "Delivery Graph runtime step contract is present."
        : "Delivery Graph runtime step contract is missing.",
      evidenceRefs: stepEvidence ? [stepEvidence.id] : [],
      remediation: stepMetadata
        ? "No action required."
        : "Create .framework/delivery-graph-step.json with runtime adapter, injection policy, schema, write scope, evidence sink, and fallback behavior.",
    }),
  );

  if (adapterValidation) {
    const adapterIssues = [
      ...adapterValidation.missingFields.map((field) => `missing:${field}`),
      ...adapterValidation.invalidFields.map((field) => `invalid:${field}`),
      ...adapterValidation.evidenceMappingGaps.map((field) => `evidence_mapping:${field}`),
    ];
    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.adapter.contract",
        gate: "runtime_step",
        decisionValue: adapterIssues.length === 0 ? "PASS" : missing.decision,
        severity: adapterIssues.length === 0 ? "info" : missing.severity,
        profile,
        message:
          adapterIssues.length === 0
            ? "Runtime command adapter contract is complete."
            : `Runtime command adapter contract has issues: ${adapterIssues.join(", ")}.`,
        evidenceRefs: adapterEvidence ? [adapterEvidence.id] : [],
        remediation:
          adapterIssues.length === 0
            ? "No action required."
            : "Fill adapter id, runtime, feature detection, invocation template, permission profile, and evidence mapping fields.",
      }),
    );

    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.shell_interpolation",
        gate: "runtime_step",
        decisionValue:
          adapterValidation.unsafeArgv.length === 0 ? "PASS" : missing.decision,
        severity:
          adapterValidation.unsafeArgv.length === 0 ? "info" : missing.severity,
        profile,
        message:
          adapterValidation.unsafeArgv.length === 0
            ? "Runtime argv contains no detected untrusted shell interpolation."
            : `Runtime argv contains unsafe untrusted interpolation: ${adapterValidation.unsafeArgv.join(", ")}.`,
        evidenceRefs: adapterEvidence ? [adapterEvidence.id] : [],
        remediation:
          adapterValidation.unsafeArgv.length === 0
            ? "No action required."
            : "Pass untrusted context through stdin/context packs with provenance, not through argv or shell interpolation.",
      }),
    );
  }

  if (policyValidation) {
    const policyIssues = [
      ...policyValidation.missingFields.map((field) => `missing:${field}`),
      ...policyValidation.invalidFields.map((field) => `invalid:${field}`),
      ...policyValidation.unsafeRules.map((field) => `unsafe:${field}`),
    ];
    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.injection_policy.contract",
        gate: "runtime_step",
        decisionValue: policyIssues.length === 0 ? "PASS" : missing.decision,
        severity: policyIssues.length === 0 ? "info" : missing.severity,
        profile,
        message:
          policyIssues.length === 0
            ? "Injection policy pack contract is complete."
            : `Injection policy pack has issues: ${policyIssues.join(", ")}.`,
        evidenceRefs: policyEvidence ? [policyEvidence.id] : [],
        remediation:
          policyIssues.length === 0
            ? "No action required."
            : "Keep trusted instruction/policy sources separate, deliver untrusted context as data, forbid untrusted shell interpolation, and require schema validation.",
      }),
    );
  }

  if (stepValidation) {
    const stepIssues = [
      ...stepValidation.missingFields.map((field) => `missing:${field}`),
      ...stepValidation.invalidFields.map((field) => `invalid:${field}`),
      ...stepValidation.referenceGaps.map((field) => `reference:${field}`),
    ];
    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.step_contract.shape",
        gate: "runtime_step",
        decisionValue: stepIssues.length === 0 ? "PASS" : missing.decision,
        severity: stepIssues.length === 0 ? "info" : missing.severity,
        profile,
        message:
          stepIssues.length === 0
            ? "Delivery Graph runtime step shape is complete."
            : `Delivery Graph runtime step shape has issues: ${stepIssues.join(", ")}.`,
        evidenceRefs: stepEvidence ? [stepEvidence.id] : [],
        remediation:
          stepIssues.length === 0
            ? "No action required."
            : "Declare step id, position, adapter, injection policy, expected output schema, write scope, evidence sink, and fallback behavior.",
      }),
    );

    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.output_schema",
        gate: "runtime_step",
        decisionValue:
          stepValidation.outputSchemaGaps.length === 0 ? "PASS" : missing.decision,
        severity:
          stepValidation.outputSchemaGaps.length === 0 ? "info" : missing.severity,
        profile,
        message:
          stepValidation.outputSchemaGaps.length === 0
            ? "Runtime step output is schema-validated before gate/state update."
            : `Runtime step output schema validation has gaps: ${stepValidation.outputSchemaGaps.join(", ")}.`,
        evidenceRefs: [adapterEvidence?.id, policyEvidence?.id, stepEvidence?.id].filter(
          (id): id is string => Boolean(id),
        ),
        remediation:
          stepValidation.outputSchemaGaps.length === 0
            ? "No action required."
            : "Require a final structured schema, fail on schema mismatch, and disallow text fallback before updating graph state or gates.",
      }),
    );

    gateDecisions.push(
      decision({
        ruleId: "G20.runtime_step.permission_scope",
        gate: "runtime_step",
        decisionValue:
          stepValidation.permissionGaps.length === 0 ? "PASS" : missing.decision,
        severity:
          stepValidation.permissionGaps.length === 0 ? "info" : missing.severity,
        profile,
        message:
          stepValidation.permissionGaps.length === 0
            ? "Runtime permission profile matches the Delivery Graph step write scope."
            : `Runtime permission scope has gaps: ${stepValidation.permissionGaps.join(", ")}.`,
        evidenceRefs: [adapterEvidence?.id, stepEvidence?.id].filter(
          (id): id is string => Boolean(id),
        ),
        remediation:
          stepValidation.permissionGaps.length === 0
            ? "No action required."
            : "Use least-privilege sandbox and tool/env allowlists that match the step write scope.",
      }),
    );
  }
}

function applyLocalEvidenceRequirement(
  projectDir: string,
  now: string,
  profile: WorkflowProfile,
  feature: string | null,
  requirement: LocalEvidenceRequirement,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
): void {
  const artifact = findLocalEvidence(projectDir, requirement.paths);
  const validation = artifact
    ? validateLocalEvidenceRequirement(artifact, requirement, feature)
    : { valid: false, reason: requirement.missingMessage };
  if (artifact && validation.valid) {
    const record = createEvidence({
      projectDir,
      now,
      kind: requirement.kind,
      artifactPath: artifact.path,
      sourceUri: `file://${artifact.path}`,
      summary: requirement.passMessage,
      metadata: {
        ...artifact.metadata,
        feature,
      },
    });
    evidence.push(record);
    gateDecisions.push(
      decision({
        ruleId: requirement.ruleId,
        gate: requirement.gate,
        decisionValue: "PASS",
        severity: "info",
        profile,
        message: requirement.passMessage,
        evidenceRefs: [record.id],
        remediation: "No action required.",
      }),
    );
    return;
  }

  const invalidRecord = artifact
    ? createEvidence({
        projectDir,
        now,
        kind: requirement.kind,
        artifactPath: artifact.path,
        sourceUri: `file://${artifact.path}`,
        summary: `${requirement.missingMessage} ${validation.reason}`,
        validity: "invalid",
        metadata: {
          ...artifact.metadata,
          feature,
        },
      })
    : null;
  if (invalidRecord) {
    evidence.push(invalidRecord);
  }

  const missing = dogfoodMissingDecision(profile);
  gateDecisions.push(
    decision({
      ruleId: requirement.ruleId,
      gate: requirement.gate,
      decisionValue: missing.decision,
      severity: missing.severity,
      profile,
      message: artifact
        ? `${requirement.missingMessage} ${validation.reason}`
        : requirement.missingMessage,
      evidenceRefs: invalidRecord ? [invalidRecord.id] : [],
      remediation: requirement.remediation,
    }),
  );
}

function validateLocalEvidenceRequirement(
  artifact: LocalEvidenceArtifact,
  requirement: LocalEvidenceRequirement,
  feature: string | null,
): { valid: boolean; reason: string } {
  if (requirement.validator && !requirement.validator(artifact)) {
    return {
      valid: false,
      reason: "Existing artifact is not approved or ready.",
    };
  }

  if (
    requirement.requireSelectedFeatureScope &&
    feature &&
    !isEvidenceScopedToSelectedFeature(artifact.metadata, feature)
  ) {
    return {
      valid: false,
      reason: `Existing artifact is not scoped to selected feature/task ${feature}.`,
    };
  }

  return { valid: true, reason: "" };
}

function findMissingPhaseClosureFields(
  metadata: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const requirement of PHASE_CLOSURE_REQUIRED_FIELDS) {
    const value = findDirectMetadataValue(metadata, requirement.keys);
    if (
      value === undefined ||
      (requirement.requireNonEmpty && !hasNonEmptyRegisterValue(value))
    ) {
      missing.push(requirement.label);
    }
  }

  if (!phaseClosureAuditMatrixHasCoverage(metadata)) {
    missing.push("audit_matrix.l1_l2_l3");
  }

  return missing;
}

function findUnresolvedPhaseClosureBlockers(
  metadata: Record<string, unknown>,
): string[] {
  const blockers = findDirectMetadataValue(metadata, [
    "unresolved_blockers",
    "blockers",
  ]);
  if (blockers === undefined || isEmptyRegisterValue(blockers)) {
    return [];
  }
  return phaseClosureItems(blockers).map((item, index) =>
    describePhaseClosureItem(item, `blocker_${index + 1}`),
  );
}

function findUnjustifiedPhaseClosureCarryovers(
  metadata: Record<string, unknown>,
): string[] {
  const carryovers = findDirectMetadataValue(metadata, [
    "deferred_items",
    "carryovers",
    "non_blocking_items",
  ]);
  if (carryovers === undefined || isEmptyRegisterValue(carryovers)) {
    return [];
  }
  return phaseClosureItems(carryovers)
    .map((item, index) => ({ item, label: describePhaseClosureItem(item, `carryover_${index + 1}`) }))
    .filter(({ item }) => !phaseClosureCarryoverHasRationale(item))
    .map(({ label }) => label);
}

function findPhaseClosurePostmergeGaps(
  metadata: Record<string, unknown>,
): string[] {
  const topLevelEvidence = findDirectMetadataValue(metadata, [
    "postmerge_evidence",
    "post_merge_evidence",
    "postmerge_001_evidence",
  ]);
  if (topLevelEvidence !== undefined && hasNonEmptyRegisterValue(topLevelEvidence)) {
    return [];
  }

  const prs = findDirectMetadataValue(metadata, [
    "merged_prs",
    "merged_pull_requests",
    "prs",
  ]);
  if (prs === undefined || isEmptyRegisterValue(prs)) {
    return ["merged_prs"];
  }

  return phaseClosureItems(prs)
    .map((item, index) => ({ item, label: describePhaseClosureItem(item, `pr_${index + 1}`) }))
    .filter(({ item }) => !phaseClosurePrHasPostmergeEvidence(item))
    .map(({ label }) => label);
}

function findPhaseClosureAuditLedgerGaps(
  metadata: Record<string, unknown>,
): string[] {
  const topLevelRefs = findDirectMetadataValue(metadata, [
    "audit_ledger_refs",
    "audit_ledger",
    "audit_records",
    "approval_ledger",
  ]);
  if (topLevelRefs !== undefined && hasNonEmptyRegisterValue(topLevelRefs)) {
    return [];
  }

  const matrix = findDirectMetadataValue(metadata, [
    "audit_matrix",
    "l1_l2_l3_coverage_matrix",
    "coverage_matrix",
  ]);
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    return ["audit_matrix"];
  }

  const gaps: string[] = [];
  for (const [level, aliases] of Object.entries({
    l1: ["l1", "l1_review", "l1_audit"],
    l2: ["l2", "l2_review", "l2_audit"],
    l3: ["l3", "l3_review", "l3_audit"],
  })) {
    const entry = findDirectMetadataValue(matrix as Record<string, unknown>, aliases);
    if (!auditMatrixEntryHasLedgerRef(entry)) {
      gaps.push(level);
    }
  }
  return gaps;
}

function auditMatrixEntryHasLedgerRef(entry: unknown): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }
  return metadataValueHasNonEmptyKey(entry, [
    "audit_id",
    "audit_ref",
    "ledger_ref",
    "ledger_record_id",
    "record_id",
  ]);
}

function validateAuditLedgerMetadata(
  metadata: Record<string, unknown>,
): AuditLedgerValidation {
  const missingFields: string[] = [];
  const schemaVersion = findDirectMetadataValue(metadata, [
    "schema_version",
    "schema",
    "version",
  ]);
  if (!hasNonEmptyRegisterValue(schemaVersion)) {
    missingFields.push("schema_version");
  }

  const ledgerId = findDirectMetadataValue(metadata, ["ledger_id", "id"]);
  if (!hasNonEmptyRegisterValue(ledgerId)) {
    missingFields.push("ledger_id");
  }

  const recordsValue = findDirectMetadataValue(metadata, [
    "records",
    "audit_records",
    "entries",
  ]);
  const records = auditLedgerRecords(recordsValue);
  if (records.length === 0) {
    missingFields.push("records");
  }

  const invalidRecords: string[] = [];
  const nextActionGaps: string[] = [];
  records.forEach((record, index) => {
    const missingRecordFields = findMissingAuditLedgerRecordFields(record);
    if (missingRecordFields.length > 0) {
      invalidRecords.push(
        `${describeAuditLedgerRecord(record, index)}(${missingRecordFields.join("|")})`,
      );
    }
    if (!auditLedgerRecordHasNextAction(record)) {
      nextActionGaps.push(describeAuditLedgerRecord(record, index));
    }
  });

  return {
    missingFields,
    invalidRecords,
    nextActionGaps,
    recordCount: records.length,
  };
}

function auditLedgerRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function findMissingAuditLedgerRecordFields(
  record: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  if (!metadataValueHasNonEmptyKey(record, ["audit_id", "id"])) {
    missing.push("audit_id");
  }
  if (!auditLedgerRecordHasArtifact(record)) {
    missing.push("artifact");
  }
  if (!auditLedgerRecordHasLevel(record)) {
    missing.push("audit_level");
  }
  if (!auditLedgerRecordHasReviewer(record)) {
    missing.push("reviewer");
  }
  if (!auditLedgerRecordHasVerdict(record)) {
    missing.push("verdict");
  }
  if (!metadataValueHasNonEmptyKey(record, ["timestamp", "created_at", "audited_at"])) {
    missing.push("timestamp");
  }
  if (!auditLedgerRecordHasEvidence(record)) {
    missing.push("evidence");
  }
  if (!metadataValueHasNonEmptyKey(record, ["approved_scope", "scope"])) {
    missing.push("approved_scope");
  }
  if (!metadataValueHasNonEmptyKey(record, ["explicit_non_claims", "non_claims"])) {
    missing.push("explicit_non_claims");
  }
  if (
    !metadataValueHasAuditLedgerTraceKey(record, [
      "conditions",
      "required_followups",
      "followups",
    ], { allowEmptyArray: true })
  ) {
    missing.push("conditions");
  }
  if (
    !metadataValueHasAuditLedgerTraceKey(record, [
      "supersedes",
      "amends",
      "supersedes_or_amends",
    ], { allowEmptyArray: true })
  ) {
    missing.push("supersedes_or_amends");
  }
  if (!metadataValueHasNonEmptyKey(record, ["commands", "checks_reproduced", "reproduced_checks"])) {
    missing.push("commands");
  }
  if (!auditLedgerRecordHasLinkage(record)) {
    missing.push("phase_task_goal_linkage");
  }
  return missing;
}

function auditLedgerRecordHasArtifact(record: Record<string, unknown>): boolean {
  const artifact = findDirectMetadataValue(record, ["artifact"]);
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    return (
      metadataValueHasNonEmptyKey(artifact, ["type", "artifact_type"]) &&
      metadataValueHasNonEmptyKey(artifact, [
        "ref",
        "url",
        "path",
        "artifact_ref",
      ])
    );
  }
  return (
    metadataValueHasNonEmptyKey(record, ["artifact_type"]) &&
    metadataValueHasNonEmptyKey(record, ["artifact_ref", "artifact_url", "artifact_path"])
  );
}

function auditLedgerRecordHasLevel(record: Record<string, unknown>): boolean {
  const level = findDirectMetadataValue(record, ["audit_level", "level"]);
  return (
    typeof level === "string" &&
    ["L0", "L1", "L2", "L3", "L4"].includes(level.trim().toUpperCase())
  );
}

function auditLedgerRecordHasReviewer(record: Record<string, unknown>): boolean {
  const reviewer = findDirectMetadataValue(record, [
    "reviewer",
    "approver",
    "actor",
  ]);
  if (reviewer && typeof reviewer === "object" && !Array.isArray(reviewer)) {
    return (
      metadataValueHasNonEmptyKey(reviewer, ["id", "handle", "agent_id"]) &&
      metadataValueHasNonEmptyKey(reviewer, ["role", "source", "source_system"])
    );
  }
  return (
    metadataValueHasNonEmptyKey(record, ["reviewer_id", "approver_id"]) &&
    metadataValueHasNonEmptyKey(record, ["reviewer_role", "approver_role"])
  );
}

function auditLedgerRecordHasVerdict(record: Record<string, unknown>): boolean {
  const verdict = findDirectMetadataValue(record, [
    "verdict",
    "decision",
    "result",
  ]);
  return (
    typeof verdict === "string" &&
    ["PASS", "WARN", "BLOCK", "CONDITIONALLY_PASS"].includes(
      verdict.trim().toUpperCase(),
    )
  );
}

function auditLedgerRecordHasEvidence(record: Record<string, unknown>): boolean {
  return metadataValueHasNonEmptyKey(record, [
    "evidence",
    "evidence_refs",
    "evidence_urls",
    "aun_message_ids",
    "source_urls",
  ]);
}

function auditLedgerRecordHasLinkage(record: Record<string, unknown>): boolean {
  return (
    metadataValueHasNonEmptyKey(record, ["phase", "phase_id"]) &&
    metadataValueHasNonEmptyKey(record, ["task", "task_id", "issue"]) &&
    metadataValueHasNonEmptyKey(record, ["goal", "goal_ref", "goal_contract"])
  );
}

function auditLedgerRecordHasNextAction(record: Record<string, unknown>): boolean {
  if (
    metadataValueHasNonEmptyKey(record, [
      "recommended_next_action",
      "next_action",
      "next_allowed_action",
    ])
  ) {
    return true;
  }
  const verdict = String(
    findDirectMetadataValue(record, ["verdict", "decision", "result"]) ?? "",
  )
    .trim()
    .toUpperCase();
  if (verdict === "BLOCK") {
    return metadataValueHasNonEmptyKey(record, [
      "unresolved_findings",
      "blocking_findings",
      "findings",
    ]);
  }
  return metadataValueHasAuditLedgerTraceKey(record, [
    "downstream_gates_remaining",
    "remaining_gates",
    "next_required_gates",
  ]);
}

function describeAuditLedgerRecord(
  record: Record<string, unknown>,
  index: number,
): string {
  const id = findDirectMetadataValue(record, ["audit_id", "id"]);
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  return `record_${index + 1}`;
}

function selectWorkOrderMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> | null {
  return selectNestedObject(metadata, [
    "work_order",
    "work_order_v1",
    "order",
  ], ["work_orders", "orders"]);
}

function selectRuntimeAdapterMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> | null {
  return selectNestedObject(metadata, [
    "runtime_command_adapter",
    "runtime_adapter",
    "adapter",
  ], ["runtime_command_adapters", "runtime_adapters", "adapters"]);
}

function selectInjectionPolicyMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> | null {
  return selectNestedObject(metadata, [
    "injection_policy_pack",
    "injection_policy",
    "policy",
  ], ["injection_policy_packs", "injection_policies", "policies"]);
}

function selectRuntimeStepMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> | null {
  return selectNestedObject(metadata, [
    "runtime_step",
    "delivery_graph_step",
    "step",
  ], ["runtime_steps", "delivery_graph_steps", "steps"]);
}

function selectNestedObject(
  metadata: Record<string, unknown>,
  objectKeys: string[],
  arrayKeys: string[],
): Record<string, unknown> | null {
  for (const key of objectKeys) {
    const value = findDirectMetadataValue(metadata, [key]);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  for (const key of arrayKeys) {
    const value = findDirectMetadataValue(metadata, [key]);
    if (Array.isArray(value)) {
      const first = value.find(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
      if (first) {
        return first;
      }
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function validateWorkOrderMetadata(
  workOrder: Record<string, unknown>,
  deliveryProfile: Record<string, unknown> | null,
): WorkOrderValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const deliveryResolution = resolveWorkOrderDeliveryDefaults(deliveryProfile, workOrder);
  const deliveryGaps = [...deliveryResolution.gaps];
  const dispatchGaps: string[] = [];
  const runtimeGaps: string[] = [];
  const contextPackGaps: string[] = [];
  const authorityGaps: string[] = [];
  const promotionGaps: string[] = [];

  const schemaVersion = stringValue(
    findDirectMetadataValue(workOrder, ["schema_version", "version"]),
  );
  if (!schemaVersion) {
    missingFields.push("schema_version");
  } else if (normalizeSchemaVersion(schemaVersion) !== "workorderv1") {
    invalidFields.push(`schema_version:${schemaVersion}`);
  }

  if (!metadataValueHasNonEmptyKey(workOrder, ["work_order_id", "id"])) {
    missingFields.push("work_order_id");
  }
  if (!workOrderHasScope(workOrder)) {
    missingFields.push("scope");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["objective", "goal", "request"])) {
    missingFields.push("objective");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["risk_class", "risk", "riskClass"])) {
    missingFields.push("risk_class");
  }
  for (const ownerField of [
    "architecture_owner",
    "implementation_owner",
    "review_owner",
    "audit_owner",
    "merge_authority",
  ]) {
    if (!metadataValueHasNonEmptyKey(workOrder, [ownerField, snakeToCamelCase(ownerField)])) {
      missingFields.push(ownerField);
    }
  }
  for (const envelopeField of [
    "work_unit",
    "github_state_ref",
    "phase_goal",
    "runner_policy",
    "evidence_contract",
    "scope",
    "non_goals",
    "acceptance_criteria",
    "role_flow",
    "current_owner",
    "next_action",
    "evidence_required",
    "required_review",
    "allowed_files",
    "allowed_actions",
    "forbidden_actions",
    "verification_commands",
    "stop_conditions",
    "fallback_next_work_policy",
  ]) {
    if (!metadataValueHasNonEmptyKey(workOrder, [envelopeField, snakeToCamelCase(envelopeField)])) {
      missingFields.push(envelopeField);
    }
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["handoff_target", "assignee", "recipient"])) {
    missingFields.push("handoff_target");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["inputs", "input_refs", "evidence_refs"])) {
    missingFields.push("inputs_or_evidence_refs");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["expected_output_schema", "output_schema"])) {
    missingFields.push("expected_output_schema");
    runtimeGaps.push("expected_output_schema");
  }

  const writeScope = normalizedString(
    findDirectMetadataValue(workOrder, ["write_scope", "allowed_write_scope"]),
  );
  if (!writeScope) {
    missingFields.push("write_scope");
    runtimeGaps.push("write_scope");
  } else if (!WORK_ORDER_WRITE_SCOPES.has(writeScope)) {
    invalidFields.push(`write_scope:${writeScope}`);
    runtimeGaps.push(`write_scope:${writeScope}`);
  }

  if (!metadataValueHasNonEmptyKey(workOrder, ["required_gates", "gates"])) {
    missingFields.push("required_gates");
    authorityGaps.push("required_gates");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["authority_boundary", "forbidden_authority"])) {
    missingFields.push("authority_boundary");
    authorityGaps.push("authority_boundary");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["non_claims", "explicit_non_claims"])) {
    missingFields.push("non_claims");
    authorityGaps.push("non_claims");
  }

  dispatchGaps.push(...findWorkOrderDispatchGaps(workOrder));
  runtimeGaps.push(...findWorkOrderRuntimeGaps(workOrder));
  contextPackGaps.push(...findWorkOrderContextPackGaps(workOrder));
  authorityGaps.push(...findWorkOrderAuthorityGaps(workOrder));
  promotionGaps.push(...findWorkOrderPromotionGaps(workOrder));

  return {
    missingFields,
    invalidFields,
    deliveryGaps,
    deliveryDefaults: deliveryResolution.defaults,
    dispatchGaps,
    runtimeGaps,
    contextPackGaps,
    authorityGaps,
    promotionGaps,
  };
}

function validateRuntimeAdapterMetadata(
  adapter: Record<string, unknown>,
): RuntimeAdapterValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const unsafeArgv: string[] = [];
  const evidenceMappingGaps: string[] = [];

  const adapterId = findDirectMetadataValue(adapter, ["adapter_id", "id"]);
  if (!hasNonEmptyRegisterValue(adapterId)) {
    missingFields.push("adapter_id");
  }

  const runtime = normalizedString(findDirectMetadataValue(adapter, ["runtime"]));
  if (!runtime) {
    missingFields.push("runtime");
  } else if (!RUNTIME_VALUES.has(runtime)) {
    invalidFields.push(`runtime:${runtime}`);
  }

  const features = primitiveStringArray(
    findDirectMetadataValue(adapter, ["feature_detection", "features"]),
  );
  if (features.length === 0) {
    missingFields.push("feature_detection");
  }
  for (const feature of features) {
    if (!RUNTIME_ADAPTER_FEATURES.has(feature)) {
      invalidFields.push(`feature_detection:${feature}`);
    }
  }

  const invocation = objectValue(
    findDirectMetadataValue(adapter, ["invocation_template", "invocation"]),
  );
  if (!invocation) {
    missingFields.push("invocation_template");
  } else {
    const argv = primitiveStringArray(findDirectMetadataValue(invocation, ["argv"]));
    if (argv.length === 0) {
      missingFields.push("invocation_template.argv");
    } else {
      unsafeArgv.push(...argv.filter(containsUnsafeShellInterpolation));
      validateRuntimeSpecificArgv(runtime, argv, invalidFields);
    }

    const stdinMode = normalizedString(findDirectMetadataValue(invocation, ["stdin_mode"]));
    if (!stdinMode) {
      missingFields.push("invocation_template.stdin_mode");
    } else if (!STDIN_MODES.has(stdinMode)) {
      invalidFields.push(`stdin_mode:${stdinMode}`);
    }

    const outputMode = normalizedString(findDirectMetadataValue(invocation, ["output_mode"]));
    if (!outputMode) {
      missingFields.push("invocation_template.output_mode");
    } else if (!OUTPUT_MODES.has(outputMode)) {
      invalidFields.push(`output_mode:${outputMode}`);
    } else if (outputMode === "text") {
      invalidFields.push("output_mode:text");
    }
  }

  const permission = objectValue(
    findDirectMetadataValue(adapter, ["permission_profile", "permissions"]),
  );
  if (!permission) {
    missingFields.push("permission_profile");
  } else {
    const sandbox = normalizedString(findDirectMetadataValue(permission, ["sandbox"]));
    if (!sandbox) {
      missingFields.push("permission_profile.sandbox");
    } else if (!SANDBOX_MODES.has(sandbox)) {
      invalidFields.push(`sandbox:${sandbox}`);
    }
    const envAllowlist = findDirectMetadataValue(permission, [
      "env_allowlist",
      "environment_allowlist",
    ]);
    if (!Array.isArray(envAllowlist)) {
      missingFields.push("permission_profile.env_allowlist");
    }
    validateOptionalStringArray(permission, "allowed_tools", invalidFields);
    validateOptionalStringArray(permission, "disallowed_tools", invalidFields);
  }

  const evidenceMapping = objectValue(
    findDirectMetadataValue(adapter, ["evidence_mapping", "evidence"]),
  );
  if (!evidenceMapping) {
    missingFields.push("evidence_mapping");
  } else {
    for (const key of REQUIRED_RUNTIME_EVIDENCE_MAPPING_KEYS) {
      if (!metadataValueHasNonEmptyKey(evidenceMapping, [key])) {
        evidenceMappingGaps.push(key);
      }
    }
  }

  return {
    missingFields,
    invalidFields,
    unsafeArgv,
    evidenceMappingGaps,
  };
}

function validateRuntimeSpecificArgv(
  runtime: string | null,
  argv: string[],
  invalidFields: string[],
): void {
  if (runtime === "codex") {
    const hasCodex = argv.some((value) => value.includes("codex"));
    const required = ["exec", "--json"];
    const missingValueFlags = CODEX_VALUE_FLAGS.filter(
      (flag) => !argvHasFlagWithValue(argv, flag),
    );
    if (!hasCodex || required.some((flag) => !argv.includes(flag))) {
      invalidFields.push("codex_argv");
    }
    invalidFields.push(
      ...missingValueFlags.map((flag) => `codex_argv:${flag}:value`),
    );
  }

  if (runtime === "claude") {
    const hasClaude = argv.some((value) => value.includes("claude"));
    const outputFormat = argvFlagValue(argv, "--output-format");
    const hasOutputFormat = outputFormat === "stream-json" || outputFormat === "json";
    const missingValueFlags = CLAUDE_REQUIRED_VALUE_FLAGS.filter(
      (flag) => !argvHasFlagWithValue(argv, flag),
    );
    const optionalValueGaps = CLAUDE_OPTIONAL_VALUE_FLAGS.filter(
      (flag) => argvHasFlag(argv, flag) && !argvHasFlagWithValue(argv, flag),
    );
    if (!hasClaude || !argv.includes("-p") || !hasOutputFormat) {
      invalidFields.push("claude_argv");
    }
    invalidFields.push(
      ...missingValueFlags.map((flag) => `claude_argv:${flag}:value`),
      ...optionalValueGaps.map((flag) => `claude_argv:${flag}:value`),
    );
  }
}

function argvHasFlag(argv: string[], flag: string): boolean {
  return argv.some((value) => value === flag || value.startsWith(`${flag}=`));
}

function argvHasFlagWithValue(argv: string[], flag: string): boolean {
  return argv.some((value, index) => {
    if (value.startsWith(`${flag}=`)) {
      return isRuntimeCliOptionValue(value.slice(flag.length + 1));
    }
    if (value === flag) {
      return isRuntimeCliOptionValue(argv[index + 1]);
    }
    return false;
  });
}

function argvFlagValue(argv: string[], flag: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith(`${flag}=`)) {
      const inlineValue = value.slice(flag.length + 1);
      if (isRuntimeCliOptionValue(inlineValue)) {
        return inlineValue;
      }
    } else if (value === flag && isRuntimeCliOptionValue(argv[index + 1])) {
      return argv[index + 1] ?? null;
    }
  }
  return null;
}

function isRuntimeCliOptionValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0 && !value.startsWith("-");
}

function validateInjectionPolicyMetadata(
  policy: Record<string, unknown>,
): InjectionPolicyValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const unsafeRules: string[] = [];

  if (!metadataValueHasNonEmptyKey(policy, ["policy_id", "id"])) {
    missingFields.push("policy_id");
  }

  const trustedInstructionSources = primitiveStringArray(
    findDirectMetadataValue(policy, ["trusted_instruction_sources"]),
  );
  if (trustedInstructionSources.length === 0) {
    missingFields.push("trusted_instruction_sources");
  }

  const trustedPolicySources = primitiveStringArray(
    findDirectMetadataValue(policy, ["trusted_policy_sources"]),
  );
  if (trustedPolicySources.length === 0) {
    missingFields.push("trusted_policy_sources");
  }

  const untrustedContextSources = primitiveStringArray(
    findDirectMetadataValue(policy, ["untrusted_context_sources"]),
  );
  if (untrustedContextSources.length === 0) {
    missingFields.push("untrusted_context_sources");
  }

  const promptRules = objectArray(
    findDirectMetadataValue(policy, ["prompt_assembly_rules", "assembly_rules"]),
  );
  if (promptRules.length === 0) {
    missingFields.push("prompt_assembly_rules");
  }

  const untrustedOrigins = new Set(untrustedContextSources.map(normalizeScopeValue));
  promptRules.forEach((rule, index) => {
    const label = describePromptRule(rule, index);
    const segment = normalizedString(findDirectMetadataValue(rule, ["segment"]));
    const delivery = normalizedString(findDirectMetadataValue(rule, ["delivery"]));
    const allowedOrigin = primitiveStringArray(
      findDirectMetadataValue(rule, ["allowed_origin", "allowed_origins"]),
    );
    if (!segment) {
      invalidFields.push(`${label}.segment`);
    } else if (!PROMPT_SEGMENTS.has(segment)) {
      invalidFields.push(`${label}.segment:${segment}`);
    }
    if (!delivery) {
      invalidFields.push(`${label}.delivery`);
    } else if (!PROMPT_DELIVERIES.has(delivery)) {
      invalidFields.push(`${label}.delivery:${delivery}`);
    }
    if (allowedOrigin.length === 0) {
      invalidFields.push(`${label}.allowed_origin`);
    }

    const originIsUntrusted = allowedOrigin
      .map(normalizeScopeValue)
      .some((origin) => untrustedOrigins.has(origin));
    if (
      delivery === "instruction" &&
      (originIsUntrusted ||
        segment === "context" ||
        segment === "tool_output" ||
        segment === "retrieved_source")
    ) {
      unsafeRules.push(label);
    }
  });

  const shellPolicy = normalizedString(
    findDirectMetadataValue(policy, ["shell_interpolation_policy"]),
  );
  if (!shellPolicy) {
    missingFields.push("shell_interpolation_policy");
  } else if (shellPolicy !== "no-untrusted-interpolation") {
    invalidFields.push(`shell_interpolation_policy:${shellPolicy}`);
  }

  const outputValidation = objectValue(
    findDirectMetadataValue(policy, ["output_validation"]),
  );
  if (!outputValidation) {
    missingFields.push("output_validation");
  } else {
    if (findDirectMetadataValue(outputValidation, ["required_schema"]) !== true) {
      invalidFields.push("output_validation.required_schema");
    }
    if (findDirectMetadataValue(outputValidation, ["fail_on_schema_mismatch"]) !== true) {
      invalidFields.push("output_validation.fail_on_schema_mismatch");
    }
    if (findDirectMetadataValue(outputValidation, ["allow_text_fallback"]) !== false) {
      invalidFields.push("output_validation.allow_text_fallback");
    }
  }

  return { missingFields, invalidFields, unsafeRules };
}

function validateRuntimeStepMetadata(
  step: Record<string, unknown>,
  adapter: Record<string, unknown> | null,
  policy: Record<string, unknown> | null,
): RuntimeStepValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const referenceGaps: string[] = [];
  const outputSchemaGaps: string[] = [];
  const permissionGaps: string[] = [];

  const stepId = findDirectMetadataValue(step, ["step_id", "id"]);
  if (!hasNonEmptyRegisterValue(stepId)) {
    missingFields.push("step_id");
  }
  if (!metadataValueHasNonEmptyKey(step, ["position", "role"])) {
    missingFields.push("position");
  }
  const runtimeAdapterRef = stringValue(
    findDirectMetadataValue(step, ["runtime_adapter", "runtime_adapter_ref"]),
  );
  if (!runtimeAdapterRef) {
    missingFields.push("runtime_adapter");
  }
  const injectionPolicyRef = stringValue(
    findDirectMetadataValue(step, ["injection_policy", "injection_policy_ref"]),
  );
  if (!injectionPolicyRef) {
    missingFields.push("injection_policy");
  }
  const expectedSchema = stringValue(
    findDirectMetadataValue(step, ["expected_result_schema", "expected_output_schema"]),
  );
  if (!expectedSchema) {
    missingFields.push("expected_result_schema");
    outputSchemaGaps.push("expected_result_schema");
  }
  const writeScope = normalizedString(
    findDirectMetadataValue(step, ["write_scope", "allowed_write_scope"]),
  );
  if (!writeScope) {
    missingFields.push("write_scope");
  } else if (!STEP_WRITE_SCOPES.has(writeScope)) {
    invalidFields.push(`write_scope:${writeScope}`);
  }
  if (!metadataValueHasNonEmptyKey(step, ["evidence_sink", "evidence_sinks"])) {
    missingFields.push("evidence_sink");
  }
  if (!runtimeStepHasFallbackBehavior(step)) {
    missingFields.push("fallback_behavior");
  }

  if (!adapter) {
    referenceGaps.push("runtime_adapter");
    outputSchemaGaps.push("runtime_adapter");
    permissionGaps.push("runtime_adapter");
  } else {
    const adapterId = stringValue(findDirectMetadataValue(adapter, ["adapter_id", "id"]));
    if (runtimeAdapterRef && adapterId && runtimeAdapterRef !== adapterId) {
      referenceGaps.push(`runtime_adapter:${runtimeAdapterRef}!=${adapterId}`);
    }
    const invocation = objectValue(
      findDirectMetadataValue(adapter, ["invocation_template", "invocation"]),
    );
    const outputMode = invocation
      ? normalizedString(findDirectMetadataValue(invocation, ["output_mode"]))
      : null;
    if (outputMode === "text") {
      outputSchemaGaps.push("adapter.output_mode:text");
    }
    const finalSchema = invocation
      ? stringValue(findDirectMetadataValue(invocation, ["final_schema_ref"]))
      : null;
    if (finalSchema && expectedSchema && finalSchema !== expectedSchema) {
      outputSchemaGaps.push(`final_schema_ref:${finalSchema}!=${expectedSchema}`);
    }

    const permission = objectValue(
      findDirectMetadataValue(adapter, ["permission_profile", "permissions"]),
    );
    const sandbox = permission
      ? normalizedString(findDirectMetadataValue(permission, ["sandbox"]))
      : null;
    permissionGaps.push(...findRuntimePermissionGaps(writeScope, sandbox));
  }

  if (!policy) {
    referenceGaps.push("injection_policy");
    outputSchemaGaps.push("injection_policy");
  } else {
    const policyId = stringValue(findDirectMetadataValue(policy, ["policy_id", "id"]));
    if (injectionPolicyRef && policyId && injectionPolicyRef !== policyId) {
      referenceGaps.push(`injection_policy:${injectionPolicyRef}!=${policyId}`);
    }
    const outputValidation = objectValue(
      findDirectMetadataValue(policy, ["output_validation"]),
    );
    if (!outputValidation) {
      outputSchemaGaps.push("policy.output_validation");
    } else {
      if (findDirectMetadataValue(outputValidation, ["required_schema"]) !== true) {
        outputSchemaGaps.push("policy.required_schema");
      }
      if (findDirectMetadataValue(outputValidation, ["fail_on_schema_mismatch"]) !== true) {
        outputSchemaGaps.push("policy.fail_on_schema_mismatch");
      }
      if (findDirectMetadataValue(outputValidation, ["allow_text_fallback"]) !== false) {
        outputSchemaGaps.push("policy.allow_text_fallback");
      }
    }
  }

  return {
    missingFields,
    invalidFields,
    referenceGaps,
    outputSchemaGaps,
    permissionGaps,
  };
}

function findRuntimePermissionGaps(
  writeScope: string | null,
  sandbox: string | null,
): string[] {
  if (!writeScope || !sandbox) {
    return [];
  }
  if (sandbox === "danger-full-access" && writeScope !== "host-specific") {
    return ["danger-full-access:requires-host-specific-write-scope"];
  }
  switch (writeScope) {
    case "none":
    case "read-only":
      return sandbox === "read-only"
        ? []
        : [`${writeScope}:requires-read-only-sandbox`];
    case "workspace-write":
    case "repo-write":
      return sandbox === "workspace-write"
        ? []
        : [`${writeScope}:requires-workspace-write-sandbox`];
    case "host-specific":
      return sandbox === "host-specific" || sandbox === "danger-full-access"
        ? []
        : ["host-specific:requires-host-specific-or-danger-full-access-sandbox"];
    default:
      return [];
  }
}

function runtimeStepHasFallbackBehavior(step: Record<string, unknown>): boolean {
  const fallback = findDirectMetadataValue(step, [
    "fallback_behavior",
    "degraded_fallback_behavior",
    "retry_policy",
    "on_failure",
  ]);
  if (!hasNonEmptyRegisterValue(fallback)) {
    return false;
  }
  const fallbackObject = objectValue(fallback);
  if (!fallbackObject) {
    return false;
  }
  return (
    metadataValueHasNonEmptyKey(fallbackObject, [
      "timeout",
      "on_timeout",
      "timeout_behavior",
    ]) &&
    metadataValueHasNonEmptyKey(fallbackObject, [
      "non_zero_exit",
      "on_non_zero_exit",
      "exit_code",
    ]) &&
    metadataValueHasNonEmptyKey(fallbackObject, [
      "schema_mismatch",
      "on_schema_mismatch",
      "malformed_output",
    ])
  );
}

function runtimeAdapterValidationHasIssues(
  validation: RuntimeAdapterValidation,
): boolean {
  return (
    validation.missingFields.length > 0 ||
    validation.invalidFields.length > 0 ||
    validation.unsafeArgv.length > 0 ||
    validation.evidenceMappingGaps.length > 0
  );
}

function injectionPolicyValidationHasIssues(
  validation: InjectionPolicyValidation,
): boolean {
  return (
    validation.missingFields.length > 0 ||
    validation.invalidFields.length > 0 ||
    validation.unsafeRules.length > 0
  );
}

function runtimeStepValidationHasIssues(
  validation: RuntimeStepValidation,
): boolean {
  return (
    validation.missingFields.length > 0 ||
    validation.invalidFields.length > 0 ||
    validation.referenceGaps.length > 0 ||
    validation.outputSchemaGaps.length > 0 ||
    validation.permissionGaps.length > 0
  );
}

function workOrderValidationHasIssues(
  validation: WorkOrderValidation,
): boolean {
  return (
    validation.missingFields.length > 0 ||
    validation.invalidFields.length > 0 ||
    validation.deliveryGaps.length > 0 ||
    validation.dispatchGaps.length > 0 ||
    validation.runtimeGaps.length > 0 ||
    validation.contextPackGaps.length > 0 ||
    validation.authorityGaps.length > 0 ||
    validation.promotionGaps.length > 0
  );
}

function workOrderWarningDecision(): {
  decision: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
} {
  return { decision: "WARN", severity: "warning" };
}

function workOrderHasScope(workOrder: Record<string, unknown>): boolean {
  return (
    metadataValueHasNonEmptyKey(workOrder, ["task", "task_id"]) ||
    metadataValueHasNonEmptyKey(workOrder, ["issue", "issue_number"]) ||
    metadataValueHasNonEmptyKey(workOrder, ["pr", "pull_request"]) ||
    metadataValueHasNonEmptyKey(workOrder, ["work_package", "work_package_id"]) ||
    metadataValueHasNonEmptyKey(workOrder, ["delivery_graph_ref", "graph_ref"])
  );
}

function findWorkOrderDispatchGaps(workOrder: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  const surfaces = primitiveStringArray(
    findDirectMetadataValue(workOrder, [
      "dispatch_surfaces",
      "dispatch_surface",
      "surfaces",
      "adapter_surfaces",
    ]),
  ).map(normalizeScopeValue);
  if (surfaces.length === 0) {
    gaps.push("dispatch_surfaces");
  } else {
    for (const surface of surfaces) {
      if (!WORK_ORDER_DISPATCH_SURFACES.has(surface)) {
        gaps.push(`dispatch_surface:${surface}`);
      }
    }
    if (
      !surfaces.some((surface) =>
        ["aun", "aundispatch", "codex", "claude", "structuredinvocation", "shirube", "shirubegate", "shirubereport"].includes(surface),
      )
    ) {
      gaps.push("dispatch_surface:known_adapter");
    }
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["handoff_target", "assignee", "recipient"])) {
    gaps.push("handoff_target");
  }
  if (!metadataValueHasNonEmptyKey(workOrder, ["report_sink", "gate_sink", "evidence_sink"])) {
    gaps.push("report_or_gate_sink");
  }
  return gaps;
}

function findWorkOrderRuntimeGaps(workOrder: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  if (
    !metadataValueHasNonEmptyKey(workOrder, [
      "runtime_adapter",
      "runtime_adapter_ref",
      "structured_invocation",
      "runtime_invocation",
    ])
  ) {
    gaps.push("runtime_adapter_or_structured_invocation");
  }
  if (containsWorkOrderShellCommand(workOrder)) {
    gaps.push("direct_shell_command");
  }
  return gaps;
}

function findWorkOrderContextPackGaps(workOrder: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  const contextPackRefs = findDirectMetadataValue(workOrder, [
    "context_pack_refs",
    "context_pack_ref",
    "context_packs",
  ]);
  if (contextPackRefs === undefined && !hasContextPackNonApplicability(workOrder)) {
    gaps.push("context_pack_refs_or_non_applicability");
  }
  if (
    contextPackRefs !== undefined &&
    !hasNonEmptyRegisterValue(contextPackRefs)
  ) {
    gaps.push("context_pack_refs");
  }
  if (!workOrderTreatsContextPackAsData(workOrder)) {
    gaps.push("context_pack_data_not_instruction");
  }
  if (workOrderPromotesContextPackInstruction(workOrder)) {
    gaps.push("context_pack_instruction_promotion");
  }
  return gaps;
}

function findWorkOrderAuthorityGaps(workOrder: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  const authorityBoundary = objectValue(
    findDirectMetadataValue(workOrder, ["authority_boundary", "forbidden_authority"]),
  );
  if (!authorityBoundary) {
    gaps.push("authority_boundary");
  } else {
    if (
      !metadataValueHasNonEmptyKey(authorityBoundary, [
        "cannot_approve",
        "forbidden",
        "forbidden_authority",
      ])
    ) {
      gaps.push("authority_boundary.forbidden");
    }
    gaps.push(
      ...findRequiredWorkOrderNoAuthorityGaps(authorityBoundary, [
        { keys: ["merge_authority"], label: "merge_authority" },
        {
          keys: ["phase_transition_authority"],
          label: "phase_transition_authority",
        },
      ]),
      ...findOptionalWorkOrderAuthorityGrantGaps(authorityBoundary, [
        {
          keys: ["gate_authority", "gate_pass_authority", "gate_decision_authority"],
          label: "gate_authority",
        },
        {
          keys: ["goal_completion_authority", "goal_authority", "complete_goal"],
          label: "goal_completion_authority",
        },
      ], "authority_boundary"),
    );
  }
  const rootAuthorityGaps = findOptionalWorkOrderAuthorityGrantGaps(workOrder, [
    { keys: ["approve_merge", "merge_authority"], label: "approve_merge" },
    { keys: ["approve_phase", "phase_transition_authority"], label: "approve_phase" },
    { keys: ["complete_goal", "goal_completion_authority"], label: "complete_goal" },
    { keys: ["gate_pass", "gate_authority"], label: "gate_pass" },
  ], "authority_self_approval");
  gaps.push(...rootAuthorityGaps);
  if (workOrderNonClaimsGrantAuthority(workOrder)) {
    gaps.push("non_claims.authority_claim");
  }
  return gaps;
}

function findRequiredWorkOrderNoAuthorityGaps(
  metadata: Record<string, unknown>,
  fields: Array<{ keys: string[]; label: string }>,
): string[] {
  const gaps: string[] = [];
  for (const field of fields) {
    const value = findDirectMetadataValue(metadata, field.keys);
    if (value === undefined || isEmptyRegisterValue(value)) {
      gaps.push(`authority_boundary.${field.label}`);
      continue;
    }
    const normalizedValues = normalizeWorkOrderAuthorityValues(value);
    if (
      normalizedValues.length !== 1 ||
      normalizedValues[0] !== WORK_ORDER_CANONICAL_NO_AUTHORITY_VALUE
    ) {
      gaps.push(`authority_boundary.${field.label}:${describeAuthorityValue(value)}`);
    }
  }
  return gaps;
}

function findOptionalWorkOrderAuthorityGrantGaps(
  metadata: Record<string, unknown>,
  fields: Array<{ keys: string[]; label: string }>,
  prefix: string,
): string[] {
  const gaps: string[] = [];
  for (const field of fields) {
    const value = findDirectMetadataValue(metadata, field.keys);
    if (value === undefined || isEmptyRegisterValue(value)) {
      continue;
    }
    if (workOrderAuthorityValueGrantsAuthority(value)) {
      gaps.push(`${prefix}.${field.label}:${describeAuthorityValue(value)}`);
    }
  }
  return gaps;
}

function normalizeWorkOrderAuthorityValues(value: unknown): string[] {
  return collectPrimitiveLeafValues(value)
    .map((item) => normalizeScopeValue(item))
    .filter((item) => item.length > 0);
}

function describeAuthorityValue(value: unknown): string {
  const values = collectPrimitiveLeafValues(value)
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values.join("|") : "non_scalar";
}

function workOrderAuthorityValueGrantsAuthority(value: unknown): boolean {
  const normalizedValues = normalizeWorkOrderAuthorityValues(value);
  return normalizedValues.some((item) => {
    if (WORK_ORDER_NO_AUTHORITY_VALUES.has(item)) {
      return false;
    }
    if (WORK_ORDER_AUTHORITY_GRANT_VALUES.has(item)) {
      return true;
    }
    return (
      (item.includes("granted") && !item.includes("notgranted")) ||
      (item.includes("allowed") && !item.includes("notallowed")) ||
      item.includes("canapprove") ||
      item.includes("canmerge") ||
      item.includes("canpass") ||
      item.includes("cancomplete")
    );
  });
}

function workOrderNonClaimsGrantAuthority(workOrder: Record<string, unknown>): boolean {
  const nonClaims = findDirectMetadataValue(workOrder, [
    "non_claims",
    "explicit_non_claims",
  ]);
  return collectPrimitiveLeafValues(nonClaims).some(workOrderTextClaimsAuthority);
}

function workOrderTextClaimsAuthority(text: string): boolean {
  const normalized = normalizeScopeValue(text);
  const mentionsAuthority =
    normalized.includes("merge") ||
    normalized.includes("phase") ||
    normalized.includes("gate") ||
    normalized.includes("goal") ||
    normalized.includes("authority") ||
    normalized.includes("approve") ||
    normalized.includes("complete");
  if (!mentionsAuthority) {
    return false;
  }
  const hasNegativeBoundary =
    normalized.includes("no") ||
    normalized.includes("not") ||
    normalized.includes("without") ||
    normalized.includes("cannot") ||
    normalized.includes("cant") ||
    normalized.includes("forbidden") ||
    normalized.includes("denied") ||
    normalized.includes("prohibited");
  return !hasNegativeBoundary && workOrderAuthorityValueGrantsAuthority(text);
}

function findWorkOrderPromotionGaps(workOrder: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  const enforcementMode = normalizedString(
    findDirectMetadataValue(workOrder, [
      "enforcement_mode",
      "gate_mode",
      "migration_mode",
    ]),
  );
  if (!enforcementMode) {
    gaps.push("enforcement_mode");
  } else if (!WORK_ORDER_ENFORCEMENT_MODES.has(enforcementMode)) {
    gaps.push(`enforcement_mode:${enforcementMode}`);
  }
  if (
    !metadataValueHasNonEmptyKey(workOrder, [
      "promotion_criteria",
      "block_promotion_criteria",
      "hard_block_criteria",
    ])
  ) {
    gaps.push("promotion_criteria");
  }
  return gaps;
}

function hasContextPackNonApplicability(workOrder: Record<string, unknown>): boolean {
  const value = findDirectMetadataValue(workOrder, [
    "context_pack_non_applicability",
    "context_pack_not_applicable",
    "context_pack_applicability",
  ]);
  if (value === undefined) {
    return false;
  }
  return hasNonEmptyRegisterValue(value);
}

function workOrderTreatsContextPackAsData(workOrder: Record<string, unknown>): boolean {
  const policy = objectValue(
    findDirectMetadataValue(workOrder, [
      "context_pack_policy",
      "context_policy",
      "source_context_policy",
    ]),
  );
  if (!policy) {
    return false;
  }
  if (
    findDirectMetadataValue(policy, ["data_not_instruction", "text_is_data"]) === true
  ) {
    return true;
  }
  const delivery = normalizedString(
    findDirectMetadataValue(policy, ["delivery", "prompt_delivery"]),
  );
  return delivery === "data-only" || delivery === "citation-only";
}

function workOrderPromotesContextPackInstruction(
  workOrder: Record<string, unknown>,
): boolean {
  const policy = objectValue(
    findDirectMetadataValue(workOrder, [
      "context_pack_policy",
      "context_policy",
      "source_context_policy",
    ]),
  );
  if (!policy) {
    return false;
  }
  const delivery = normalizedString(
    findDirectMetadataValue(policy, ["delivery", "prompt_delivery"]),
  );
  if (delivery === "instruction") {
    return true;
  }
  return findDirectMetadataValue(policy, [
    "trusted_instruction",
    "treat_as_instruction",
  ]) === true;
}

function containsWorkOrderShellCommand(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsWorkOrderShellCommand);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeMetadataKey(key);
    if (
      [
        "shell_command",
        "generated_shell_command",
        "command_line",
        "argv",
      ].includes(normalizedKey) &&
      hasNonEmptyRegisterValue(child)
    ) {
      return true;
    }
    if (containsWorkOrderShellCommand(child)) {
      return true;
    }
  }
  return false;
}

function validateOptionalStringArray(
  metadata: Record<string, unknown>,
  key: string,
  invalidFields: string[],
): void {
  const value = findDirectMetadataValue(metadata, [key]);
  if (
    value !== undefined &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  ) {
    invalidFields.push(key);
  }
}

function containsUnsafeShellInterpolation(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /\$\(|`/.test(value) ||
    /\$\{\{\s*github\.(event|head_ref|ref_name|base_ref|actor)/i.test(value) ||
    /\{\{\s*(github|inputs|issue|pull_request|comment|branch|user_input|untrusted)[^}]*\}\}/i.test(value) ||
    /\{(inputs|issue|pull_request|comment|branch|user_input|untrusted)[^}]*\}/i.test(value) ||
    normalized.includes("github.event.issue") ||
    normalized.includes("github.event.pull_request") ||
    normalized.includes("inputs.") ||
    normalized.includes("comment.body") ||
    normalized.includes("issue.body") ||
    normalized.includes("issue.title") ||
    normalized.includes("pull_request.title") ||
    normalized.includes("untrusted")
  );
}

function describePromptRule(
  rule: Record<string, unknown>,
  index: number,
): string {
  const id = findDirectMetadataValue(rule, ["id", "name", "segment"]);
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  return `prompt_rule_${index + 1}`;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function primitiveStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function normalizedString(value: unknown): string | null {
  const string = stringValue(value);
  return string ? string.toLowerCase() : null;
}

function phaseClosureAuditMatrixHasCoverage(
  metadata: Record<string, unknown>,
): boolean {
  const matrix = findDirectMetadataValue(metadata, [
    "audit_matrix",
    "l1_l2_l3_coverage_matrix",
    "coverage_matrix",
  ]);
  if (matrix === undefined || !hasNonEmptyRegisterValue(matrix)) {
    return false;
  }

  return (
    metadataValueHasNonEmptyKey(matrix, ["l1", "l1_review", "l1_audit"]) &&
    metadataValueHasNonEmptyKey(matrix, ["l2", "l2_review", "l2_audit"]) &&
    metadataValueHasNonEmptyKey(matrix, ["l3", "l3_review", "l3_audit"])
  );
}

function phaseClosureCarryoverHasRationale(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const value = findDirectMetadataValue(item as Record<string, unknown>, [
    "justification",
    "rationale",
    "safety_rationale",
    "why_safe",
    "safe_to_carry",
    "reason",
  ]);
  return value !== undefined && hasNonEmptyRegisterValue(value);
}

function phaseClosurePrHasPostmergeEvidence(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const value = findDirectMetadataValue(item as Record<string, unknown>, [
    "postmerge_evidence",
    "post_merge_evidence",
    "postmerge_001_evidence",
    "postmerge_evidence_ref",
    "postmerge_url",
  ]);
  return value !== undefined && hasNonEmptyRegisterValue(value);
}

function findFirstMetadataValue(
  value: Record<string, unknown>,
  keys: string[],
): unknown {
  const keySet = new Set(keys.map(normalizeMetadataKey));
  return findFirstMetadataValueByKeySet(value, keySet);
}

function findDirectMetadataValue(
  value: Record<string, unknown>,
  keys: string[],
): unknown {
  const keySet = new Set(keys.map(normalizeMetadataKey));
  for (const [key, child] of Object.entries(value)) {
    if (keySet.has(normalizeMetadataKey(key))) {
      return child;
    }
  }
  return undefined;
}

function findFirstMetadataValueByKeySet(
  value: unknown,
  keys: Set<string>,
): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstMetadataValueByKeySet(item, keys);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(normalizeMetadataKey(key))) {
      return child;
    }
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findFirstMetadataValueByKeySet(child, keys);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function metadataValueHasNonEmptyKey(value: unknown, keys: string[]): boolean {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const found = findDirectMetadataValue(value as Record<string, unknown>, keys);
    return found !== undefined && hasNonEmptyRegisterValue(found);
  }
  return false;
}

function snakeToCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function metadataValueHasAuditLedgerTraceKey(
  value: unknown,
  keys: string[],
  options: { allowEmptyArray?: boolean } = {},
): boolean {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const found = findDirectMetadataValue(value as Record<string, unknown>, keys);
    return found !== undefined && hasAuditLedgerTraceValue(found, options);
  }
  return false;
}

function hasAuditLedgerTraceValue(
  value: unknown,
  options: { allowEmptyArray?: boolean },
): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 && !isEmptyRegisterString(value);
  }
  if (typeof value === "number") {
    return true;
  }
  if (typeof value === "boolean") {
    return false;
  }
  if (Array.isArray(value)) {
    if (options.allowEmptyArray && value.length === 0) {
      return true;
    }
    return value.length > 0 && value.every((item) =>
      hasAuditLedgerTraceValue(item, { allowEmptyArray: false }),
    );
  }
  if (typeof value === "object") {
    const nested = Object.values(value as Record<string, unknown>);
    return nested.length > 0 && nested.some((item) =>
      hasAuditLedgerTraceValue(item, options),
    );
  }
  return false;
}

function hasNonEmptyRegisterValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 && !isEmptyRegisterString(value);
  }
  if (typeof value === "number") {
    return true;
  }
  if (typeof value === "boolean") {
    return value === true;
  }
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(hasNonEmptyRegisterValue);
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0 &&
      Object.values(value as Record<string, unknown>).some(hasNonEmptyRegisterValue);
  }
  return false;
}

function isEmptyRegisterValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0 || isEmptyRegisterString(value);
  }
  if (typeof value === "boolean") {
    return value === false;
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyRegisterValue);
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0 ||
      Object.values(value as Record<string, unknown>).every(isEmptyRegisterValue);
  }
  return false;
}

function isEmptyRegisterString(value: string): boolean {
  return [
    "none",
    "no",
    "n/a",
    "na",
    "[]",
    "{}",
    "empty",
    "false",
    "missing",
    "pending",
    "todo",
    "tbd",
    "not_ready",
  ].includes(normalizeDisposition(value));
}

function phaseClosureItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isEmptyRegisterValue(value)) {
    return [];
  }
  if (value && typeof value === "object") {
    const nestedItems = findDirectMetadataValue(value as Record<string, unknown>, [
      "items",
      "entries",
      "prs",
      "tasks",
    ]);
    if (nestedItems !== undefined && nestedItems !== value) {
      return phaseClosureItems(nestedItems);
    }
  }
  return [value];
}

function describePhaseClosureItem(item: unknown, fallback: string): string {
  if (typeof item === "string" && item.trim().length > 0) {
    return item.trim();
  }
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const metadata = item as Record<string, unknown>;
    const value = findDirectMetadataValue(metadata, [
      "id",
      "number",
      "pr",
      "issue",
      "title",
      "name",
    ]);
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return fallback;
}

function dogfoodMissingDecision(profile: WorkflowProfile): {
  decision: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
} {
  if (profile === "strict") {
    return { decision: "BLOCK", severity: "error" };
  }
  return { decision: "WARN", severity: "warning" };
}

function findLocalEvidence(
  projectDir: string,
  paths: string[],
): LocalEvidenceArtifact | null {
  for (const relativePath of paths) {
    const filePath = path.join(projectDir, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    if (raw.trim().length === 0) {
      continue;
    }
    return {
      path: relativePath,
      raw,
      metadata: extractEvidenceMetadata(raw),
    };
  }
  return null;
}

function extractEvidenceMetadata(raw: string): Record<string, unknown> {
  const json = parseJsonObject(raw);
  if (json) {
    return json;
  }
  return parseSimpleMetadata(raw);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function parseSimpleMetadata(raw: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/);
  const source = frontmatter?.[1] ?? raw;
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]?\s*([A-Za-z0-9_. -]+)\s*:\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim().toLowerCase().replace(/[\s.-]+/g, "_");
    metadata[key] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return metadata;
}

function hasApprovedDisposition(artifact: LocalEvidenceArtifact): boolean {
  return hasAnyDisposition(artifact, ["approved", "pass", "accepted", "true"]);
}

function hasReadyDisposition(artifact: LocalEvidenceArtifact): boolean {
  return hasAnyDisposition(artifact, [
    "approved",
    "pass",
    "ready",
    "not_applicable",
    "non_applicable",
    "n/a",
    "true",
  ]);
}

function hasPassOrApprovedDisposition(artifact: LocalEvidenceArtifact): boolean {
  return hasAnyDisposition(artifact, [
    "approved",
    "pass",
    "passed",
    "not_applicable",
    "non_applicable",
    "n/a",
    "true",
  ]);
}

function hasAnyDisposition(
  artifact: LocalEvidenceArtifact,
  accepted: string[],
): boolean {
  return metadataHasAnyDisposition(artifact.metadata, accepted);
}

function metadataHasAnyDisposition(
  metadata: Record<string, unknown>,
  accepted: string[],
): boolean {
  const values = collectDispositionValues(metadata).map(normalizeDisposition);
  return values.some((value) => accepted.includes(value));
}

function collectDispositionValues(metadata: Record<string, unknown>): string[] {
  const values: string[] = [];
  const keys = [
    "status",
    "state",
    "approval",
    "approval_status",
    "approved",
    "verdict",
    "disposition",
    "result",
    "readiness",
  ];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" || typeof value === "boolean") {
      values.push(String(value));
    }
  }
  for (const value of Object.values(metadata)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      values.push(...collectDispositionValues(value as Record<string, unknown>));
    }
  }
  return values;
}

function normalizeDisposition(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const FEATURE_SCOPE_KEYS = new Set([
  "feature",
  "feature_id",
  "featureid",
  "features",
  "feature_ids",
  "featureids",
  "selected_feature",
  "selected_feature_id",
  "task",
  "task_id",
  "taskid",
  "tasks",
  "task_ids",
  "taskids",
  "selected_task",
  "selected_task_id",
]);

const PARENT_SCOPE_KEYS = new Set([
  "scope",
  "scope_type",
  "evidence_scope",
  "applicability",
  "applies_to",
]);

const APPROVED_PARENT_SCOPES = new Set([
  "global",
  "parent",
  "parent_scope",
  "phase",
  "phase_scope",
  "cross_feature",
  "cross_task",
  "not_applicable",
  "non_applicable",
  "n/a",
]);

function isEvidenceScopedToSelectedFeature(
  metadata: Record<string, unknown>,
  feature: string,
): boolean {
  const selected = normalizeScopeValue(feature);
  const scopedValues = collectValuesForKeys(metadata, FEATURE_SCOPE_KEYS)
    .map(normalizeScopeValue)
    .filter(Boolean);

  if (scopedValues.includes(selected)) {
    return true;
  }

  return hasApprovedParentScope(metadata);
}

function hasApprovedParentScope(metadata: Record<string, unknown>): boolean {
  const parentScopes = collectValuesForKeys(metadata, PARENT_SCOPE_KEYS)
    .map(normalizeDisposition)
    .filter(Boolean);
  if (!parentScopes.some((scope) => APPROVED_PARENT_SCOPES.has(scope))) {
    return false;
  }

  if (
    metadataHasAnyDisposition(metadata, [
      "approved",
      "pass",
      "passed",
      "accepted",
      "ready",
      "not_applicable",
      "non_applicable",
      "n/a",
      "true",
    ])
  ) {
    return true;
  }

  return collectValuesForKeys(
    metadata,
    new Set([
      "approved_parent_scope",
      "parent_scope_approved",
      "non_applicability_approved",
      "scope_approved",
    ]),
  )
    .map(normalizeDisposition)
    .some((value) => value === "true" || value === "approved" || value === "accepted");
}

function collectValuesForKeys(
  value: unknown,
  keys: Set<string>,
  currentKey: string | null = null,
): string[] {
  const values: string[] = [];
  const normalizedKey = currentKey ? normalizeMetadataKey(currentKey) : null;
  const keyMatches = normalizedKey ? keys.has(normalizedKey) : false;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (keyMatches) {
      values.push(String(value));
    }
    return values;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      values.push(...collectValuesForKeys(item, keys, currentKey));
    }
    return values;
  }

  if (value && typeof value === "object") {
    if (keyMatches) {
      values.push(...collectPrimitiveLeafValues(value));
      return values;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      values.push(...collectValuesForKeys(child, keys, key));
    }
  }

  return values;
}

function collectPrimitiveLeafValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPrimitiveLeafValues(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectPrimitiveLeafValues(item),
    );
  }
  return [];
}

function normalizeMetadataKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function normalizeScopeValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function normalizeSchemaVersion(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_.\-/]+/g, "");
}

function loadDiscoverSession(projectDir: string): DiscoverSessionData | null {
  try {
    return loadSession(projectDir);
  } catch {
    return null;
  }
}

function evaluateRoles(
  config: FrameworkConfig,
  projectDir: string,
  now: string,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
  profile: WorkflowProfile,
): WorkflowState["roles"] {
  const roleEvidence = createEvidence({
    projectDir,
    now,
    kind: "role_binding",
    artifactPath: CONFIG_PATH,
    sourceUri: `file://${CONFIG_PATH}`,
    summary: "Framework role bindings loaded from .framework/config.json.",
    metadata: {
      requiredRoles: Object.keys(config.roles?.bindings ?? {}),
    },
  });
  evidence.push(roleEvidence);

  const roles = resolveRequiredRoles(config);
  if (roles.status === "setup_required") {
    gateDecisions.push(
      decision({
        ruleId: "G1.roles.required_bindings",
        gate: "roles",
        decisionValue: "BLOCK",
        severity: "error",
        profile,
        message: "Required role bindings are missing or placeholders.",
        evidenceRefs: [roleEvidence.id],
        remediation: "Run shirube roles set for every placeholder or missing role.",
      }),
    );
    return {
      status: "setup_required",
      config_ref: CONFIG_PATH,
      findings: [
        ...roles.missingRoles.map((role) => `${role}: missing`),
        ...roles.placeholderRoles.map((role) => `${role}: placeholder`),
      ],
      missing_roles: roles.missingRoles,
      placeholder_roles: roles.placeholderRoles,
    };
  }

  const separationViolations = validateRoleSeparation(roles.bindings);
  if (separationViolations.length > 0) {
    gateDecisions.push(
      decision({
        ruleId: "G1.roles.separation",
        gate: "roles",
        decisionValue: "BLOCK",
        severity: "error",
        profile,
        message: "Producer and authority roles are not separated.",
        evidenceRefs: [roleEvidence.id],
        remediation: "Assign producer roles and authority roles to distinct actors.",
      }),
    );
    return {
      status: "invalid",
      config_ref: CONFIG_PATH,
      findings: separationViolations.map(formatSeparationFinding),
    };
  }

  gateDecisions.push(
    decision({
      ruleId: "G1.roles.required_bindings",
      gate: "roles",
      decisionValue: "PASS",
      severity: "info",
      profile,
      message: "Required role bindings are ready.",
      evidenceRefs: [roleEvidence.id],
      remediation: "No action required.",
    }),
  );
  return {
    status: "ready",
    config_ref: CONFIG_PATH,
    findings: [],
  };
}

function applyPublishActions(
  publishDecision: PublishWorkflowDecision,
  localDraftDecision: PublishWorkflowDecision,
  profile: WorkflowProfile,
  allowedActions: WorkflowAction[],
  blockedActions: WorkflowAction[],
  gateDecisions: WorkflowGateDecision[],
): void {
  if (localDraftDecision.status === "allowed") {
    allowedActions.push({
      action: "local_draft",
      reason: "local_files output is available",
      rule_id: "G4.publish.local_draft",
    });
  } else {
    blockedActions.push({
      action: "local_draft",
      reason: localDraftDecision.reason ?? "local draft unavailable",
      rule_id: "G4.publish.local_draft",
    });
  }

  if (publishDecision.status === "allowed") {
    allowedActions.push({
      action: "remote_publish",
      reason: "publish workflow allows remote output",
      rule_id: "G4.publish.remote",
    });
    return;
  }

  blockedActions.push({
    action: "remote_publish",
    reason: publishDecision.reason ?? publishDecision.status,
    rule_id: "G4.publish.remote",
  });
  gateDecisions.push(
    decision({
      ruleId: "G4.publish.remote",
      gate: "publish",
      decisionValue: "BLOCK",
      severity: "error",
      profile,
      message:
        publishDecision.reason === "publish_policy_draft_only"
          ? "workflow.publishPolicy=draft_only blocks remote publish."
          : `Remote publish is not ready: ${publishDecision.reason ?? publishDecision.status}.`,
      evidenceRefs: [],
      remediation:
        "Keep work local/draft, or update workflow policy and role readiness before remote publish.",
    }),
  );
}

function applyMergeAuthority(
  mergeAuthorityDecision: MergeAuthorityDecision | null | undefined,
  profile: WorkflowProfile,
  evidence: WorkflowEvidenceRecord[],
  gateDecisions: WorkflowGateDecision[],
  now: string,
): void {
  if (!mergeAuthorityDecision) {
    gateDecisions.push(
      decision({
        ruleId: "G9.merge_authority.evidence",
        gate: "merge_authority",
        decisionValue: "OBSERVE",
        severity: "info",
        profile,
        message: "Merge authority was not evaluated for this read-only state.",
        evidenceRefs: [],
        remediation:
          "Run shirube merge-authority in a PR context when remote merge readiness is needed.",
      }),
    );
    return;
  }

  const mergeEvidence = createSyntheticEvidence({
    now,
    kind: "merge_authority",
    sourceUri: null,
    artifactPath: null,
    artifactHash: null,
    summary: `Merge authority decision: ${mergeAuthorityDecision.status}`,
    validity: mergeAuthorityDecision.status === "pass" ? "current" : "invalid",
    metadata: mergeAuthorityDecision,
  });
  evidence.push(mergeEvidence);
  gateDecisions.push(
    decision({
      ruleId: "G9.merge_authority.evidence",
      gate: "merge_authority",
      decisionValue: mergeAuthorityDecision.status === "pass" ? "PASS" : "BLOCK",
      severity: mergeAuthorityDecision.status === "pass" ? "info" : "error",
      profile,
      message:
        mergeAuthorityDecision.status === "pass"
          ? "Merge authority evidence is valid."
          : `Merge authority is blocked: ${mergeAuthorityDecision.reason}.`,
      evidenceRefs: [mergeEvidence.id],
      remediation:
        mergeAuthorityDecision.status === "pass"
          ? "No action required."
          : "Collect required authority approvals on the current PR head.",
    }),
  );
}

function createGitHubIssueEvidence(
  issue: WorkflowGitHubIssueContext,
  now: string,
): WorkflowEvidenceRecord {
  return createSyntheticEvidence({
    now,
    kind: "github_issue",
    sourceUri: issue.url ?? `github:issue:${issue.number}`,
    artifactPath: null,
    artifactHash: hashText(JSON.stringify(issue)),
    summary: `GitHub issue #${issue.number}${issue.title ? `: ${issue.title}` : ""}`,
    validity: "current",
    metadata: {
      number: issue.number,
      title: issue.title ?? null,
      bodyHash: issue.body ? hashText(issue.body) : null,
    },
  });
}

function createDiscoverSessionEvidence(
  projectDir: string,
  session: DiscoverSessionData,
  now: string,
  validity: WorkflowEvidenceValidity = "current",
): WorkflowEvidenceRecord {
  return createEvidence({
    projectDir,
    now,
    kind: "discovery_session",
    artifactPath: DISCOVER_SESSION_PATH,
    sourceUri: `file://${DISCOVER_SESSION_PATH}`,
    summary: `Discover session ${session.id} is ${session.status}.`,
    validity,
    metadata: {
      id: session.id,
      status: session.status,
      currentStage: session.currentStage,
      completedAt: session.completedAt ?? null,
      answerCount: Object.keys(session.answers).length,
    },
  });
}

function createEvidence(input: {
  projectDir: string;
  now: string;
  kind: WorkflowEvidenceKind;
  sourceUri: string | null;
  artifactPath: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  validity?: WorkflowEvidenceValidity;
}): WorkflowEvidenceRecord {
  const artifactHash = input.artifactPath
    ? hashFileIfPresent(path.join(input.projectDir, input.artifactPath))
    : null;
  return createSyntheticEvidence({
    now: input.now,
    kind: input.kind,
    sourceUri: input.sourceUri,
    artifactPath: input.artifactPath,
    artifactHash,
    summary: input.summary,
    validity: input.validity ?? "current",
    metadata: input.metadata ?? {},
  });
}

function createSyntheticEvidence(input: {
  now: string;
  kind: WorkflowEvidenceKind;
  sourceUri: string | null;
  artifactPath: string | null;
  artifactHash: string | null;
  summary: string;
  validity: WorkflowEvidenceValidity;
  metadata: Record<string, unknown>;
}): WorkflowEvidenceRecord {
  const id = evidenceId(input.kind, input.sourceUri, input.artifactPath, input.artifactHash, input.summary);
  return {
    id,
    kind: input.kind,
    source_uri: input.sourceUri,
    artifact_path: input.artifactPath,
    artifact_hash: input.artifactHash,
    actor: {
      type: "system",
      id: "shirube",
    },
    summary: input.summary,
    observed_at: input.now,
    validity: input.validity,
    privacy_scope: "local",
    metadata: input.metadata,
  };
}

function decision(input: {
  ruleId: string;
  gate: string;
  decisionValue: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
  profile: WorkflowProfile;
  message: string;
  evidenceRefs: string[];
  remediation: string;
}): WorkflowGateDecision {
  return {
    rule_id: input.ruleId,
    gate: input.gate,
    decision: input.decisionValue,
    severity: input.severity,
    profile: input.profile,
    message: input.message,
    evidence_refs: input.evidenceRefs,
    remediation: input.remediation,
    deterministic: true,
  };
}

function derivePhase(input: {
  currentSession: CurrentSessionV1 | null;
  githubIssue?: WorkflowGitHubIssueContext;
  discoverSession: DiscoverSessionData | null;
  hearingComplete: boolean;
}): WorkflowPhase {
  if (input.hearingComplete) {
    return "hearing_complete";
  }
  if (input.discoverSession) {
    return "hearing_in_progress";
  }
  if (input.currentSession?.mode === "framework-led") {
    return "started";
  }
  if (input.githubIssue) {
    return "intake_ready";
  }
  return "uninitialized";
}

function readJsonFile<T>(projectDir: string, relativePath: string): T | null {
  const filePath = path.join(projectDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function hashFileIfPresent(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return hashText(fs.readFileSync(filePath, "utf-8"));
}

function hashText(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function evidenceId(
  kind: WorkflowEvidenceKind,
  sourceUri: string | null,
  artifactPath: string | null,
  artifactHash: string | null,
  summary: string,
): string {
  const digest = crypto
    .createHash("sha256")
    .update([kind, sourceUri ?? "", artifactPath ?? "", artifactHash ?? "", summary].join("\0"))
    .digest("hex")
    .slice(0, 16);
  return `ev_${digest}`;
}

function formatSeparationFinding(violation: RoleSeparationViolation): string {
  return `${violation.producerRole} and ${violation.authorityRole} share ${violation.target}`;
}
