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
