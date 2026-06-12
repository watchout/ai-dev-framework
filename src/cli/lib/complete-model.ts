/**
 * Types for the shirube complete command.
 * Ref: #367 — merge-vs-complete separation
 */

export type CompleteCheckName =
  | "deploy-confirmed"
  | "health-check"
  | "runtime-identity"
  | "smoke-test"
  | "error-rate-ok"
  | "slo-ok";

export interface CompleteCheck {
  name: CompleteCheckName | string;
  passed: boolean;
  detail?: string;
}

export interface CompleteEvidenceRecord {
  prNumber: string;
  sha: string;
  completedAt: string;
  checks: CompleteCheck[];
  forced: boolean;
}

export interface CompleteEvidenceStore {
  records: CompleteEvidenceRecord[];
}

export interface ShirubeProfileCiGate {
  required_checks: string[];
  exact_head_required?: boolean;
  integration_commands?: string[];
}

export interface ShirubeProfileCompleteEvidence {
  types: string[];
  health_endpoint?: string;
  smoke_command?: string;
}

export interface ShirubeProfile {
  repo_id: string;
  repo_type: string;
  runtime: boolean;
  protected_surfaces: string[];
  allowed_tier: string;
  ci_gate_0: ShirubeProfileCiGate;
  complete_evidence?: ShirubeProfileCompleteEvidence;
  audit_route?: "async" | "required" | "skip";
  rollback_owner?: string;
  implementation_bot?: string;
}

export type CompletionGateStageId =
  | "scope"
  | "contract"
  | "implementation_evidence"
  | "audit"
  | "qa_check"
  | "live_processing";

export type CompletionGateStageStatus =
  | "pass"
  | "fail"
  | "blocked"
  | "not_applicable";

export type CompletionGateDefectClassification =
  | "blocking"
  | "accepted_debt"
  | "out_of_scope";

export type CompletionGateVerdict =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "CONDITIONAL PASS";

export type CompletionGateFindingSeverity = "PASS" | "WARN" | "BLOCK";

export interface CompletionGateStageInput {
  status?: CompletionGateStageStatus;
  evidence_refs?: string[];
  detail?: string;
  required?: boolean;
}

export interface CompletionGateDefect {
  id?: string;
  classification?: CompletionGateDefectClassification | string;
  summary?: string;
  severity?: string;
  owner?: string;
  issue?: string;
  reason?: string;
  due?: string;
  follow_up_uri?: string;
  material?: boolean;
  evidence_refs?: string[];
}

export interface CompletionGateInput {
  schema?: "shirube-completion-gate-input/v1";
  subject?: string;
  work_order?: string;
  pr?: string;
  live_processing_applicable?: boolean;
  stages?: Partial<Record<CompletionGateStageId, CompletionGateStageInput>>;
  defects?: CompletionGateDefect[];
}

export interface CompletionGateFinding {
  severity: CompletionGateFindingSeverity;
  code: string;
  message: string;
  evidence_refs?: string[];
}

export interface CompletionGateStageReport {
  id: CompletionGateStageId;
  label: string;
  required: boolean;
  status: CompletionGateStageStatus;
  passed: boolean;
  evidence_refs: string[];
  detail?: string;
}

export interface CompletionGateAggregatorReport {
  stage: "completion_aggregator";
  verdict: CompletionGateVerdict;
  can_pass: boolean;
  blocking_defects: number;
  accepted_debt: number;
  out_of_scope: number;
  missing_evidence: number;
}

export interface CompletionGateReport {
  schema: "shirube-completion-gate-report/v1";
  subject: string;
  work_order?: string;
  pr?: string;
  verdict: CompletionGateVerdict;
  can_pass: boolean;
  required_stage_ids: CompletionGateStageId[];
  stages: CompletionGateStageReport[];
  defects: CompletionGateDefect[];
  aggregator: CompletionGateAggregatorReport;
  findings: CompletionGateFinding[];
  authority_notes: string[];
  next_required_review: string[];
}
