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
