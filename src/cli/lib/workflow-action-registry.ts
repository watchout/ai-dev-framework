export type WorkflowWrapperKind =
  | "projection"
  | "diagnostic"
  | "enforcement"
  | "explanation";

export interface WorkflowActionRegistryEntry {
  action: string;
  target_gate: string;
  description: string;
  rule_ids: readonly string[];
}

export interface WorkflowWrapperRegistryEntry {
  command: string;
  kind: WorkflowWrapperKind;
  exits_non_zero_on: readonly string[];
  must_not_be_used_for: readonly string[];
}

export const WORKFLOW_ACTION_REGISTRY = [
  {
    action: "audit_ledger",
    target_gate: "audit_ledger",
    description: "Validate audit-ledger/v1 evidence shape and next action derivation.",
    rule_ids: [
      "G19.audit_ledger.record.present",
      "G19.audit_ledger.required_fields",
      "G19.audit_ledger.record_shape",
      "G19.audit_ledger.next_action_derivable",
    ],
  },
  {
    action: "design_draft",
    target_gate: "design",
    description: "Validate role and hearing readiness before design drafting.",
    rule_ids: [
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G2.hearing.required_confirmation",
    ],
  },
  {
    action: "implementation_start",
    target_gate: "implementation_start",
    description: "Validate strict dogfood start evidence before implementation.",
    rule_ids: [
      "G0.start_boundary.project_applied",
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G2.hearing.required_confirmation",
      "G10.goal_contract.approved",
      "G10.phase_plan.present",
      "G10.task_trace.present",
      "G10.doc4l.readiness",
      "G11.pre_impl_audit.disposition",
      "G18.admin_notice.sink_ready",
    ],
  },
  {
    action: "implementation_split",
    target_gate: "implementation_split",
    description: "Validate readiness before splitting implementation work.",
    rule_ids: [
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G2.hearing.required_confirmation",
    ],
  },
  {
    action: "phase_closure",
    target_gate: "phase_closure",
    description: "Validate phase-closure/v1 evidence and carryover disposition.",
    rule_ids: [
      "G12.phase_closure.record.present",
      "G12.phase_closure.required_fields",
      "G12.phase_closure.blockers_cleared",
      "G12.phase_closure.carryovers_justified",
      "G12.phase_closure.postmerge_evidence",
      "G12.phase_closure.audit_ledger_refs",
    ],
  },
  {
    action: "runtime_step",
    target_gate: "runtime_step",
    description: "Validate runtime adapter, injection policy, and step contract.",
    rule_ids: [
      "G20.runtime_step.adapter.present",
      "G20.runtime_step.injection_policy.present",
      "G20.runtime_step.step_contract.present",
      "G20.runtime_step.adapter.contract",
      "G20.runtime_step.shell_interpolation",
      "G20.runtime_step.injection_policy.contract",
      "G20.runtime_step.step_contract.shape",
      "G20.runtime_step.output_schema",
      "G20.runtime_step.permission_scope",
    ],
  },
  {
    action: "work_order",
    target_gate: "work_order",
    description: "Validate work-order/v1 dispatch contract migration readiness.",
    rule_ids: [
      "G21.work_order.record.present",
      "G21.work_order.required_fields",
      "G21.work_order.delivery_profile_defaults",
      "G21.work_order.dispatch_contract",
      "G21.work_order.runtime_contract",
      "G21.work_order.context_pack_boundary",
      "G21.work_order.authority_boundary",
      "G21.work_order.promotion_path",
    ],
  },
  {
    action: "remote_publish",
    target_gate: "publish",
    description: "Validate remote publish readiness and role constraints.",
    rule_ids: [
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G4.publish.remote",
    ],
  },
  {
    action: "merge",
    target_gate: "merge_authority",
    description: "Validate merge authority evidence and role constraints.",
    rule_ids: [
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G9.merge_authority.evidence",
    ],
  },
  {
    action: "release",
    target_gate: "release",
    description: "Validate release readiness, remote publish, and merge authority.",
    rule_ids: [
      "G1.roles.required_bindings",
      "G1.roles.separation",
      "G4.publish.remote",
      "G9.merge_authority.evidence",
    ],
  },
] as const satisfies readonly WorkflowActionRegistryEntry[];

export type WorkflowCheckAction =
  (typeof WORKFLOW_ACTION_REGISTRY)[number]["action"];

export const WORKFLOW_WRAPPER_REGISTRY = [
  {
    command: "workflow status",
    kind: "projection",
    exits_non_zero_on: [],
    must_not_be_used_for: ["enforcement", "merge authority", "phase transition"],
  },
  {
    command: "workflow doctor",
    kind: "diagnostic",
    exits_non_zero_on: [],
    must_not_be_used_for: ["enforcement", "merge authority", "phase transition"],
  },
  {
    command: "workflow check",
    kind: "enforcement",
    exits_non_zero_on: ["scoped BLOCK", "scoped WARN when --fail-on warn"],
    must_not_be_used_for: ["diagnostic-only reporting"],
  },
  {
    command: "workflow explain",
    kind: "explanation",
    exits_non_zero_on: ["unknown query"],
    must_not_be_used_for: ["enforcement", "merge authority", "phase transition"],
  },
] as const satisfies readonly WorkflowWrapperRegistryEntry[];

export function getWorkflowActionRuleIds(
  action: WorkflowCheckAction,
): readonly string[] {
  return getWorkflowActionRegistryEntry(action).rule_ids;
}

export function getWorkflowActionRegistryEntry(
  action: WorkflowCheckAction,
): (typeof WORKFLOW_ACTION_REGISTRY)[number] {
  const entry = WORKFLOW_ACTION_REGISTRY.find((item) => item.action === action);
  if (!entry) {
    throw new Error(`Unknown workflow action: ${action}`);
  }
  return entry;
}

export function parseWorkflowCheckAction(
  value: string | undefined,
): WorkflowCheckAction | null {
  if (!value) {
    return null;
  }
  return WORKFLOW_ACTION_REGISTRY.some((entry) => entry.action === value)
    ? (value as WorkflowCheckAction)
    : null;
}

export function formatWorkflowActionRegistryList(): string {
  return WORKFLOW_ACTION_REGISTRY.map((entry) => entry.action).join("|");
}
