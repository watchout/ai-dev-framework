import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getWorkflowActionRuleIds,
  type WorkflowCheckAction,
} from "./workflow-action-registry.js";
import type {
  WorkflowGateDecision,
  WorkflowGateDecisionValue,
  WorkflowGateSeverity,
  WorkflowProfile,
  WorkflowState,
  WorkflowStateSchemaVersion,
} from "./workflow-state.js";
import type { WorkflowCheckFailOn } from "./workflow-observability.js";

export const WORKFLOW_CHAIN_SCHEMA_VERSION = "workflow-chain/v1" as const;

export type WorkflowChainSchemaVersion = typeof WORKFLOW_CHAIN_SCHEMA_VERSION;
export type WorkflowChainDecisionSource =
  | "workflow_state"
  | "chain_artifact"
  | "chain_model";
export type WorkflowChainStatus = "complete" | "attention_required" | "blocked";

export interface WorkflowChainArtifactRequirement {
  rule_id: string;
  label: string;
  paths: readonly string[];
  remediation: string;
}

export interface WorkflowChainAuthority {
  owner: string;
  forbidden_authority: readonly string[];
}

export interface WorkflowChainTransitionSpec {
  id: string;
  order: number;
  label: string;
  workflow_action?: WorkflowCheckAction;
  required_rule_ids: readonly string[];
  required_artifacts?: readonly WorkflowChainArtifactRequirement[];
  authority: WorkflowChainAuthority;
}

export interface WorkflowChainDecision {
  rule_id: string;
  source: WorkflowChainDecisionSource;
  decision: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
  profile: WorkflowProfile;
  message: string;
  evidence_refs: string[];
  remediation: string;
  deterministic: true;
}

export interface WorkflowChainTransition {
  id: string;
  order: number;
  label: string;
  workflow_action: WorkflowCheckAction | null;
  status: WorkflowGateDecisionValue;
  authority: WorkflowChainAuthority;
  required_rule_ids: string[];
  required_artifacts: WorkflowChainArtifactRequirement[];
  decisions: WorkflowChainDecision[];
}

export interface WorkflowChainActionRef {
  transition_id: string;
  workflow_action: WorkflowCheckAction | null;
  reason: string;
}

export interface WorkflowChainReport {
  schema_version: WorkflowChainSchemaVersion;
  state_schema_version: WorkflowStateSchemaVersion;
  profile: WorkflowProfile;
  status: WorkflowChainStatus;
  current_transition: WorkflowChainActionRef | null;
  allowed_next_actions: WorkflowChainActionRef[];
  blocked_actions: WorkflowChainActionRef[];
  decision_counts: Record<WorkflowGateDecisionValue, number>;
  transitions: WorkflowChainTransition[];
}

export interface WorkflowChainCheckReport extends WorkflowChainReport {
  check: {
    status: "passed" | "failed";
    action: string;
    target_transition: string;
    fail_on: WorkflowCheckFailOn;
    scoped_decision_counts: Record<WorkflowGateDecisionValue, number>;
    evaluated_transitions: string[];
  };
  scoped_transitions: WorkflowChainTransition[];
  scoped_decisions: WorkflowChainDecision[];
}

export const WORKFLOW_CHAIN_TRANSITIONS = [
  {
    id: "intake_hearing",
    order: 1,
    label: "intake / hearing",
    workflow_action: "design_draft",
    required_rule_ids: ["G2.hearing.required_confirmation"],
    authority: transitionAuthority("product_owner"),
  },
  {
    id: "goal_contract_approval",
    order: 2,
    label: "Goal Contract approval",
    required_rule_ids: ["G10.goal_contract.approved"],
    authority: transitionAuthority("product_owner"),
  },
  {
    id: "sufficient_conditions",
    order: 3,
    label: "V0/V1 goal sufficient conditions",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.sufficient_conditions.present",
        "goal sufficient conditions",
        [".framework/goal-sufficient-conditions.json", ".framework/goal-sufficient-conditions.md"],
        "Record V0/V1 sufficient conditions before treating a goal contract as executable.",
      ),
    ],
    authority: transitionAuthority("architecture_owner"),
  },
  {
    id: "phase_plan",
    order: 4,
    label: "phase plan and phase exit criteria",
    required_rule_ids: ["G10.phase_plan.present"],
    authority: transitionAuthority("architecture_owner"),
  },
  {
    id: "carryover_ledger",
    order: 5,
    label: "phase carryover ledger from prior phase",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.carryover_ledger.present",
        "carryover ledger",
        [".framework/carryover-ledger.json", ".framework/carryover-ledger.md"],
        "Record prior-phase carryovers or an explicit empty carryover ledger.",
      ),
    ],
    authority: transitionAuthority("architecture_owner"),
  },
  {
    id: "feature_catalog",
    order: 6,
    label: "feature catalog",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.feature_catalog.present",
        "feature catalog",
        [".framework/feature-catalog.json", ".framework/features.json", ".framework/feature-catalog.md"],
        "Record the feature catalog or selected feature slice before task execution.",
      ),
    ],
    authority: transitionAuthority("architecture_owner"),
  },
  {
    id: "task_issue",
    order: 7,
    label: "task DAG / task issue",
    required_rule_ids: ["G10.task_trace.present"],
    authority: transitionAuthority("implementation_lead"),
  },
  {
    id: "doc4l_readiness",
    order: 8,
    label: "SPEC/IMPL/VERIFY/OPS readiness",
    required_rule_ids: ["G10.doc4l.readiness"],
    authority: transitionAuthority("architecture_owner"),
  },
  {
    id: "pre_impl_audit",
    order: 9,
    label: "pre-implementation audit",
    required_rule_ids: ["G11.pre_impl_audit.disposition"],
    authority: transitionAuthority("auditor"),
  },
  {
    id: "implementation_start",
    order: 10,
    label: "implementation start",
    workflow_action: "implementation_start",
    required_rule_ids: getWorkflowActionRuleIds("implementation_start"),
    authority: transitionAuthority("implementation_lead"),
  },
  {
    id: "implementation_evidence",
    order: 11,
    label: "implementation evidence",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.implementation_evidence.present",
        "implementation evidence",
        [".framework/implementation-evidence.json", ".framework/implementation-evidence.md"],
        "Record implementation evidence before requesting implementation audit.",
      ),
    ],
    authority: transitionAuthority("implementation_lead"),
  },
  {
    id: "implementation_audit",
    order: 12,
    label: "implementation audit",
    workflow_action: "audit_ledger",
    required_rule_ids: getWorkflowActionRuleIds("audit_ledger"),
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.implementation_audit.present",
        "implementation audit",
        [".framework/implementation-audit.json", ".framework/implementation-audit.md"],
        "Record implementation audit disposition and ledger references before publish.",
      ),
    ],
    authority: transitionAuthority("auditor"),
  },
  {
    id: "pr_publish",
    order: 13,
    label: "PR publish / AI Change Record",
    workflow_action: "remote_publish",
    required_rule_ids: getWorkflowActionRuleIds("remote_publish"),
    authority: transitionAuthority("implementation_lead"),
  },
  {
    id: "merge_authority",
    order: 14,
    label: "merge authority",
    workflow_action: "merge",
    required_rule_ids: getWorkflowActionRuleIds("merge"),
    authority: transitionAuthority("l3_governance_owner"),
  },
  {
    id: "merge",
    order: 15,
    label: "merge",
    workflow_action: "merge",
    required_rule_ids: getWorkflowActionRuleIds("merge"),
    authority: transitionAuthority("l3_governance_owner"),
  },
  {
    id: "postmerge_verify",
    order: 16,
    label: "POSTMERGE-001 verification",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.postmerge_evidence.present",
        "POSTMERGE-001 evidence",
        [".framework/postmerge-001.json", ".framework/postmerge.json", ".framework/postmerge-001.md"],
        "Record POSTMERGE-001 verification before updating goal or phase progress.",
      ),
    ],
    authority: transitionAuthority("implementation_lead"),
  },
  {
    id: "goal_progress_update",
    order: 17,
    label: "goal progress update",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.goal_progress.present",
        "goal progress update",
        [".framework/goal-progress.json", ".framework/goal-progress.md"],
        "Record goal progress update after post-merge verification.",
      ),
    ],
    authority: transitionAuthority("product_owner"),
  },
  {
    id: "phase_closure_audit",
    order: 18,
    label: "phase closure audit",
    workflow_action: "phase_closure",
    required_rule_ids: getWorkflowActionRuleIds("phase_closure"),
    authority: transitionAuthority("auditor"),
  },
  {
    id: "carryover_assignment",
    order: 19,
    label: "carryover assignment for new findings",
    required_rule_ids: [],
    required_artifacts: [
      artifactRequirement(
        "G22.workflow_chain.carryover_assignment.present",
        "carryover assignment",
        [".framework/carryover-assignment.json", ".framework/carryover-assignment.md"],
        "Assign unresolved non-blocking findings to an owner and target phase/task.",
      ),
    ],
    authority: transitionAuthority("architecture_owner"),
  },
] as const satisfies readonly WorkflowChainTransitionSpec[];

export type WorkflowChainTransitionId =
  (typeof WORKFLOW_CHAIN_TRANSITIONS)[number]["id"];

export function createWorkflowChainReport(
  projectDir: string,
  state: WorkflowState,
): WorkflowChainReport {
  const transitions = WORKFLOW_CHAIN_TRANSITIONS.map((transition) =>
    evaluateTransition(projectDir, state, transition),
  );
  const decisions = transitions.flatMap((transition) => transition.decisions);
  const decisionCounts = countDecisions(decisions);
  const firstNonPass =
    transitions.find((transition) => transition.status !== "PASS") ?? null;
  const blockedActions = transitions
    .filter((transition) => transition.status === "BLOCK")
    .map((transition) =>
      actionRef(transition, `blocked at ${transition.label}`),
    );

  return {
    schema_version: WORKFLOW_CHAIN_SCHEMA_VERSION,
    state_schema_version: state.schema_version,
    profile: state.profile,
    status: deriveChainStatus(decisionCounts),
    current_transition: firstNonPass
      ? actionRef(firstNonPass, `next incomplete transition: ${firstNonPass.label}`)
      : null,
    allowed_next_actions:
      firstNonPass && firstNonPass.status !== "BLOCK"
        ? [actionRef(firstNonPass, `requires ${firstNonPass.status}`)]
        : [],
    blocked_actions: blockedActions,
    decision_counts: decisionCounts,
    transitions,
  };
}

export function createWorkflowChainCheckReport(
  report: WorkflowChainReport,
  action: string,
  failOn: WorkflowCheckFailOn,
): WorkflowChainCheckReport {
  const target = resolveWorkflowChainAction(action);
  if (!target) {
    throw new Error(
      `Invalid or missing workflow chain action: ${action || "(missing)"}. Expected one of: ${formatWorkflowChainActionList()}`,
    );
  }
  const scopedTransitions = report.transitions.filter(
    (transition) => transition.order <= target.order,
  );
  const scopedDecisions = scopedTransitions.flatMap(
    (transition) => transition.decisions,
  );
  const scopedDecisionCounts = countDecisions(scopedDecisions);
  const failed = shouldFail(scopedDecisionCounts, failOn);

  return {
    ...report,
    check: {
      status: failed ? "failed" : "passed",
      action,
      target_transition: target.id,
      fail_on: failOn,
      scoped_decision_counts: scopedDecisionCounts,
      evaluated_transitions: scopedTransitions.map((transition) => transition.id),
    },
    scoped_transitions: scopedTransitions,
    scoped_decisions: scopedDecisions,
  };
}

export function resolveWorkflowChainAction(
  action: string | undefined,
): WorkflowChainTransitionSpec | null {
  if (!action) {
    return null;
  }
  const transition = WORKFLOW_CHAIN_TRANSITIONS.find(
    (candidate) => candidate.id === action,
  );
  if (transition) {
    return transition;
  }
  const workflowActionMatches = WORKFLOW_CHAIN_TRANSITIONS.filter(
    (candidate) => workflowActionOf(candidate) === action,
  );
  if (workflowActionMatches.length === 1) {
    return workflowActionMatches[0];
  }
  if (workflowActionMatches.length > 1) {
    throw new Error(
      `Workflow action ${action} maps to multiple chain transitions: ${workflowActionMatches.map((candidate) => candidate.id).join(", ")}. Use a transition id.`,
    );
  }
  return null;
}

export function formatWorkflowChainActionList(): string {
  const ids = WORKFLOW_CHAIN_TRANSITIONS.map((transition) => transition.id);
  const aliases = uniqueStrings(
    WORKFLOW_CHAIN_TRANSITIONS.map((transition) => workflowActionOf(transition))
      .filter((action): action is WorkflowCheckAction => Boolean(action)),
  ).filter((action) => !ids.includes(action as WorkflowChainTransitionId));
  return [...ids, ...aliases].join("|");
}

export function formatWorkflowChainStatus(report: WorkflowChainReport): string {
  return [
    "Shirube Workflow Chain",
    `  Schema: ${report.schema_version}`,
    `  Profile: ${report.profile}`,
    `  Status: ${report.status}`,
    `  Current transition: ${report.current_transition?.transition_id ?? "(none)"}`,
    `  Decisions: PASS ${report.decision_counts.PASS}, WARN ${report.decision_counts.WARN}, BLOCK ${report.decision_counts.BLOCK}, OBSERVE ${report.decision_counts.OBSERVE}`,
    "  Blocked actions:",
    ...formatActionRefs(report.blocked_actions),
  ].join("\n");
}

export function formatWorkflowChainCheck(
  report: WorkflowChainCheckReport,
): string {
  if (report.check.status === "passed") {
    return `Shirube Workflow Chain Check: passed (${report.check.target_transition})`;
  }
  return [
    `Shirube Workflow Chain Check: failed (${report.check.target_transition})`,
    `  Fail on: ${report.check.fail_on}`,
    `  Decisions: PASS ${report.check.scoped_decision_counts.PASS}, WARN ${report.check.scoped_decision_counts.WARN}, BLOCK ${report.check.scoped_decision_counts.BLOCK}, OBSERVE ${report.check.scoped_decision_counts.OBSERVE}`,
    "  Scoped decisions:",
    ...report.scoped_decisions.map(
      (decision) =>
        `  - ${decision.decision} ${decision.rule_id}: ${decision.message}`,
    ),
  ].join("\n");
}

function evaluateTransition(
  projectDir: string,
  state: WorkflowState,
  spec: WorkflowChainTransitionSpec,
): WorkflowChainTransition {
  const decisions: WorkflowChainDecision[] = [];
  for (const ruleId of spec.required_rule_ids) {
    const matches = state.gate_decisions.filter(
      (decision) => decision.rule_id === ruleId,
    );
    if (matches.length === 0) {
      decisions.push(missingRuleDecision(ruleId, spec, state.profile));
      continue;
    }
    decisions.push(...matches.map(toChainDecision));
  }

  for (const requirement of spec.required_artifacts ?? []) {
    decisions.push(evaluateArtifactRequirement(projectDir, state.profile, requirement));
  }

  return {
    id: spec.id,
    order: spec.order,
    label: spec.label,
    workflow_action: spec.workflow_action ?? null,
    status: worstDecision(decisions),
    authority: spec.authority,
    required_rule_ids: [...spec.required_rule_ids],
    required_artifacts: [...(spec.required_artifacts ?? [])],
    decisions,
  };
}

function evaluateArtifactRequirement(
  projectDir: string,
  profile: WorkflowProfile,
  requirement: WorkflowChainArtifactRequirement,
): WorkflowChainDecision {
  const artifact = findArtifact(projectDir, requirement.paths);
  if (!artifact) {
    const missing = missingDecision(profile);
    return {
      rule_id: requirement.rule_id,
      source: "chain_artifact",
      decision: missing.decision,
      severity: missing.severity,
      profile,
      message: `${requirement.label} is missing.`,
      evidence_refs: [],
      remediation: requirement.remediation,
      deterministic: true,
    };
  }

  return {
    rule_id: requirement.rule_id,
    source: "chain_artifact",
    decision: "PASS",
    severity: "info",
    profile,
    message: `${requirement.label} is present.`,
    evidence_refs: [artifact.id],
    remediation: "No action required.",
    deterministic: true,
  };
}

function toChainDecision(decision: WorkflowGateDecision): WorkflowChainDecision {
  return {
    rule_id: decision.rule_id,
    source: "workflow_state",
    decision: decision.decision,
    severity: decision.severity,
    profile: decision.profile,
    message: decision.message,
    evidence_refs: decision.evidence_refs,
    remediation: decision.remediation,
    deterministic: true,
  };
}

function missingRuleDecision(
  ruleId: string,
  spec: WorkflowChainTransitionSpec,
  profile: WorkflowProfile,
): WorkflowChainDecision {
  const missing = missingDecision(profile);
  return {
    rule_id: `G22.workflow_chain.required_rule.${spec.id}`,
    source: "chain_model",
    decision: missing.decision,
    severity: missing.severity,
    profile,
    message: `Required workflow rule ${ruleId} is not present in workflow-state/v1.`,
    evidence_refs: [],
    remediation: "Add or wire the deterministic workflow-state rule before relying on this chain transition.",
    deterministic: true,
  };
}

function missingDecision(profile: WorkflowProfile): {
  decision: WorkflowGateDecisionValue;
  severity: WorkflowGateSeverity;
} {
  if (profile === "strict") {
    return { decision: "BLOCK", severity: "error" };
  }
  return { decision: "WARN", severity: "warning" };
}

function countDecisions(
  decisions: readonly WorkflowChainDecision[],
): Record<WorkflowGateDecisionValue, number> {
  const counts: Record<WorkflowGateDecisionValue, number> = {
    PASS: 0,
    WARN: 0,
    BLOCK: 0,
    OBSERVE: 0,
  };
  for (const decision of decisions) {
    counts[decision.decision] += 1;
  }
  return counts;
}

function shouldFail(
  counts: Record<WorkflowGateDecisionValue, number>,
  failOn: WorkflowCheckFailOn,
): boolean {
  if (counts.BLOCK > 0) {
    return true;
  }
  if (failOn === "warn" && counts.WARN > 0) {
    return true;
  }
  if (failOn === "observe" && (counts.WARN > 0 || counts.OBSERVE > 0)) {
    return true;
  }
  return false;
}

function worstDecision(
  decisions: readonly WorkflowChainDecision[],
): WorkflowGateDecisionValue {
  if (decisions.some((decision) => decision.decision === "BLOCK")) {
    return "BLOCK";
  }
  if (decisions.some((decision) => decision.decision === "WARN")) {
    return "WARN";
  }
  if (decisions.some((decision) => decision.decision === "OBSERVE")) {
    return "OBSERVE";
  }
  return "PASS";
}

function deriveChainStatus(
  counts: Record<WorkflowGateDecisionValue, number>,
): WorkflowChainStatus {
  if (counts.BLOCK > 0) {
    return "blocked";
  }
  if (counts.WARN > 0 || counts.OBSERVE > 0) {
    return "attention_required";
  }
  return "complete";
}

function actionRef(
  transition: WorkflowChainTransition,
  reason: string,
): WorkflowChainActionRef {
  return {
    transition_id: transition.id,
    workflow_action: transition.workflow_action,
    reason,
  };
}

function artifactRequirement(
  ruleId: string,
  label: string,
  paths: readonly string[],
  remediation: string,
): WorkflowChainArtifactRequirement {
  return { rule_id: ruleId, label, paths, remediation };
}

function transitionAuthority(owner: string): WorkflowChainAuthority {
  return {
    owner,
    forbidden_authority: [
      "llm_transition_approval",
      "implicit_merge_authority",
      "implicit_phase_completion",
      "implicit_goal_completion",
    ],
  };
}

function workflowActionOf(
  transition: WorkflowChainTransitionSpec,
): WorkflowCheckAction | undefined {
  return transition.workflow_action;
}

function findArtifact(
  projectDir: string,
  relativePaths: readonly string[],
): { id: string; path: string } | null {
  for (const relativePath of relativePaths) {
    const artifactPath = path.join(projectDir, relativePath);
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      continue;
    }
    const raw = fs.readFileSync(artifactPath, "utf-8");
    if (raw.trim().length === 0) {
      continue;
    }
    return {
      id: `chain:${relativePath}:${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12)}`,
      path: relativePath,
    };
  }
  return null;
}

function formatActionRefs(actions: readonly WorkflowChainActionRef[]): string[] {
  if (actions.length === 0) {
    return ["  - (none)"];
  }
  return actions.map(
    (action) =>
      `  - ${action.transition_id}${action.workflow_action ? ` (${action.workflow_action})` : ""}: ${action.reason}`,
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
