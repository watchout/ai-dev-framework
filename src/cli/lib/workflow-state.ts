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
  | "discovery_session"
  | "current_session"
  | "hearing_answer"
  | "human_confirmation"
  | "github_issue"
  | "design_artifact"
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

export function buildWorkflowState(
  projectDir: string,
  options: BuildWorkflowStateOptions = {},
): WorkflowState {
  const now = options.now ?? new Date().toISOString();
  const config = loadFrameworkConfig(projectDir);
  const evidence: WorkflowEvidenceRecord[] = [];
  const gateDecisions: WorkflowGateDecision[] = [];
  const allowedActions: WorkflowAction[] = [];
  const blockedActions: WorkflowAction[] = [];

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
        profile: options.profile ?? "standard",
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
        profile: options.profile ?? "standard",
        message: discoverSession
          ? `Discover session is ${discoverSession.status}; hearing evidence is not complete.`
          : "No discover session found; hearing evidence is missing.",
        evidenceRefs: [],
        remediation:
          "Run or resume shirube discover, or provide deterministic hearing evidence before implementation.",
      }),
    );
  }

  const roleState = evaluateRoles(config, projectDir, now, evidence, gateDecisions, options.profile ?? "standard");
  const publishDecision = evaluatePublishWorkflow(config);
  const localDraftDecision = canGenerateLocalDraft(config);
  applyPublishActions(
    publishDecision,
    localDraftDecision,
    options.profile ?? "standard",
    allowedActions,
    blockedActions,
    gateDecisions,
  );
  applyMergeAuthority(
    options.mergeAuthorityDecision,
    options.profile ?? "standard",
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
    profile: options.profile ?? "standard",
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
