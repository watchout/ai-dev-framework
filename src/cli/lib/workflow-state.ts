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
  },
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
  if (fs.existsSync(projectPath) || fs.existsSync(configPath)) {
    const artifactPath = fs.existsSync(projectPath) ? PROJECT_PATH : CONFIG_PATH;
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
      message: "Project application state is missing.",
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
  if (artifact && (requirement.validator?.(artifact) ?? true)) {
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
        summary: `${requirement.missingMessage} Existing artifact is not approved or ready.`,
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
        ? `${requirement.missingMessage} Existing artifact is not approved or ready.`
        : requirement.missingMessage,
      evidenceRefs: invalidRecord ? [invalidRecord.id] : [],
      remediation: requirement.remediation,
    }),
  );
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
  const values = collectDispositionValues(artifact.metadata).map(normalizeDisposition);
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
