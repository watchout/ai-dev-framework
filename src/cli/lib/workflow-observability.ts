import type {
  WorkflowAction,
  WorkflowEvidenceRecord,
  WorkflowGateDecision,
  WorkflowGateDecisionValue,
  WorkflowState,
} from "./workflow-state.js";

export interface WorkflowDecisionCounts {
  PASS: number;
  WARN: number;
  BLOCK: number;
  OBSERVE: number;
}

export type WorkflowCheckAction =
  | "design_draft"
  | "implementation_start"
  | "implementation_split"
  | "remote_publish"
  | "merge"
  | "release";

export type WorkflowCheckFailOn = "block" | "warn" | "observe";

export interface WorkflowDoctorReport {
  status: "ready" | "attention_required" | "blocked";
  schema_version: WorkflowState["schema_version"];
  profile: WorkflowState["profile"];
  phase: WorkflowState["phase"];
  source: WorkflowState["source"];
  roles: WorkflowState["roles"];
  decision_counts: WorkflowDecisionCounts;
  blocking_decisions: WorkflowGateDecision[];
  warning_decisions: WorkflowGateDecision[];
  observed_decisions: WorkflowGateDecision[];
  allowed_actions: WorkflowAction[];
  blocked_actions: WorkflowAction[];
  evidence_count: number;
  remediation: string[];
}

export interface WorkflowCheckReport extends WorkflowDoctorReport {
  check: {
    status: "passed" | "failed";
    action: WorkflowCheckAction;
    fail_on: WorkflowCheckFailOn;
    applicable_rule_ids: string[];
    scoped_decision_counts: WorkflowDecisionCounts;
  };
  scoped_decisions: WorkflowGateDecision[];
}

export interface WorkflowExplanation {
  query: string;
  found: boolean;
  gate_decisions: WorkflowGateDecision[];
  allowed_actions: WorkflowAction[];
  blocked_actions: WorkflowAction[];
  evidence: WorkflowEvidenceRecord[];
}

export function createWorkflowDoctorReport(
  state: WorkflowState,
): WorkflowDoctorReport {
  const decisionCounts = countDecisions(state.gate_decisions);
  const blockingDecisions = state.gate_decisions.filter(
    (decision) => decision.decision === "BLOCK",
  );
  const warningDecisions = state.gate_decisions.filter(
    (decision) => decision.decision === "WARN",
  );
  const observedDecisions = state.gate_decisions.filter(
    (decision) => decision.decision === "OBSERVE",
  );
  const remediation = uniqueStrings([
    ...blockingDecisions.map((decision) => decision.remediation),
    ...warningDecisions.map((decision) => decision.remediation),
  ]);

  return {
    status: deriveDoctorStatus(decisionCounts),
    schema_version: state.schema_version,
    profile: state.profile,
    phase: state.phase,
    source: state.source,
    roles: state.roles,
    decision_counts: decisionCounts,
    blocking_decisions: blockingDecisions,
    warning_decisions: warningDecisions,
    observed_decisions: observedDecisions,
    allowed_actions: state.allowed_actions,
    blocked_actions: state.blocked_actions,
    evidence_count: state.evidence.length,
    remediation,
  };
}

export function createWorkflowCheckReport(
  state: WorkflowState,
  action: WorkflowCheckAction,
  failOn: WorkflowCheckFailOn,
): WorkflowCheckReport {
  const doctorReport = createWorkflowDoctorReport(state);
  const applicableRuleIds = ACTION_RULE_IDS[action];
  const scopedDecisions = state.gate_decisions.filter((decision) =>
    applicableRuleIds.includes(decision.rule_id),
  );
  const scopedDecisionCounts = countDecisions(scopedDecisions);
  const failed = shouldFail(scopedDecisionCounts, failOn);

  return {
    ...doctorReport,
    check: {
      status: failed ? "failed" : "passed",
      action,
      fail_on: failOn,
      applicable_rule_ids: applicableRuleIds,
      scoped_decision_counts: scopedDecisionCounts,
    },
    scoped_decisions: scopedDecisions,
  };
}

export function explainWorkflowQuery(
  state: WorkflowState,
  query: string,
): WorkflowExplanation {
  const normalized = query.trim();
  const normalizedSearch = normalized.toLowerCase();
  const matchesQuery = (value: string): boolean =>
    normalizedSearch.length > 0 &&
    value.toLowerCase().includes(normalizedSearch);
  const gateDecisions = state.gate_decisions.filter(
    (decision) =>
      matchesQuery(decision.rule_id) ||
      matchesQuery(decision.gate) ||
      decision.decision === normalized,
  );
  const allowedActions = state.allowed_actions.filter(
    (action) =>
      matchesQuery(action.action) || matchesQuery(action.rule_id),
  );
  const blockedActions = state.blocked_actions.filter(
    (action) =>
      matchesQuery(action.action) || matchesQuery(action.rule_id),
  );
  const evidenceIds = new Set(
    gateDecisions.flatMap((decision) => decision.evidence_refs),
  );
  const evidence = state.evidence.filter((record) => evidenceIds.has(record.id));

  return {
    query: normalized,
    found:
      gateDecisions.length > 0 ||
      allowedActions.length > 0 ||
      blockedActions.length > 0,
    gate_decisions: gateDecisions,
    allowed_actions: allowedActions,
    blocked_actions: blockedActions,
    evidence,
  };
}

export function formatWorkflowStatus(state: WorkflowState): string {
  const decisionCounts = countDecisions(state.gate_decisions);
  return [
    "Shirube Workflow",
    `  Schema: ${state.schema_version}`,
    `  Profile: ${state.profile}`,
    `  Phase: ${state.phase}`,
    `  Source: ${state.source.kind}${state.source.uri ? ` (${state.source.uri})` : ""}`,
    `  Roles: ${state.roles.status}`,
    `  Evidence: ${state.evidence.length}`,
    `  Decisions: PASS ${decisionCounts.PASS}, WARN ${decisionCounts.WARN}, BLOCK ${decisionCounts.BLOCK}, OBSERVE ${decisionCounts.OBSERVE}`,
    `  Allowed actions: ${formatActions(state.allowed_actions)}`,
    `  Blocked actions: ${formatActions(state.blocked_actions)}`,
  ].join("\n");
}

export function formatWorkflowDoctor(report: WorkflowDoctorReport): string {
  const lines = [
    "Shirube Workflow Doctor",
    `  Status: ${report.status}`,
    `  Profile: ${report.profile}`,
    `  Phase: ${report.phase}`,
    `  Roles: ${report.roles.status}`,
    `  Evidence: ${report.evidence_count}`,
    `  Decisions: PASS ${report.decision_counts.PASS}, WARN ${report.decision_counts.WARN}, BLOCK ${report.decision_counts.BLOCK}, OBSERVE ${report.decision_counts.OBSERVE}`,
    "",
    "Blocking decisions:",
    ...formatDecisionList(report.blocking_decisions),
    "",
    "Warning decisions:",
    ...formatDecisionList(report.warning_decisions),
    "",
    "Observed decisions:",
    ...formatDecisionList(report.observed_decisions),
    "",
    "Remediation:",
    ...formatTextList(report.remediation),
  ];

  return lines.join("\n");
}

export function formatWorkflowExplanation(
  explanation: WorkflowExplanation,
): string {
  if (!explanation.found) {
    return `No workflow explanation found for: ${explanation.query}`;
  }

  return [
    `Workflow Explanation: ${explanation.query}`,
    "",
    "Gate decisions:",
    ...formatDecisionList(explanation.gate_decisions),
    "",
    "Allowed actions:",
    ...formatActionList(explanation.allowed_actions),
    "",
    "Blocked actions:",
    ...formatActionList(explanation.blocked_actions),
    "",
    "Evidence:",
    ...formatEvidenceList(explanation.evidence),
  ].join("\n");
}

const ACTION_RULE_IDS: Record<WorkflowCheckAction, string[]> = {
  design_draft: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G2.hearing.required_confirmation",
  ],
  implementation_start: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G2.hearing.required_confirmation",
  ],
  implementation_split: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G2.hearing.required_confirmation",
  ],
  remote_publish: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G4.publish.remote",
  ],
  merge: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G9.merge_authority.evidence",
  ],
  release: [
    "G1.roles.required_bindings",
    "G1.roles.separation",
    "G4.publish.remote",
    "G9.merge_authority.evidence",
  ],
};

function countDecisions(
  decisions: WorkflowGateDecision[],
): WorkflowDecisionCounts {
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
  counts: WorkflowDecisionCounts,
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

function deriveDoctorStatus(
  counts: WorkflowDecisionCounts,
): WorkflowDoctorReport["status"] {
  if (counts.BLOCK > 0) {
    return "blocked";
  }
  if (counts.WARN > 0 || counts.OBSERVE > 0) {
    return "attention_required";
  }
  return "ready";
}

function formatActions(actions: WorkflowAction[]): string {
  if (actions.length === 0) {
    return "none";
  }
  return actions.map((action) => action.action).join(", ");
}

function formatDecisionList(decisions: WorkflowGateDecision[]): string[] {
  if (decisions.length === 0) {
    return ["  none"];
  }
  return decisions.map(
    (decision) =>
      `  - ${decision.rule_id}: ${decision.decision} (${decision.message})`,
  );
}

function formatActionList(actions: WorkflowAction[]): string[] {
  if (actions.length === 0) {
    return ["  none"];
  }
  return actions.map(
    (action) => `  - ${action.action}: ${action.reason} [${action.rule_id}]`,
  );
}

function formatEvidenceList(evidence: WorkflowEvidenceRecord[]): string[] {
  if (evidence.length === 0) {
    return ["  none"];
  }
  return evidence.map(
    (record) =>
      `  - ${record.id}: ${record.kind} (${record.summary})`,
  );
}

function formatTextList(items: string[]): string[] {
  if (items.length === 0) {
    return ["  none"];
  }
  return items.map((item) => `  - ${item}`);
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.length > 0)));
}
