export type UserOutcomeVerdict = "PASS" | "FAIL" | "NEEDS_INFO" | "WAIVED";
export type UserOutcomeFindingSeverity = "PASS" | "WARN" | "BLOCK";

export interface UserOutcomeProof {
  schema?: "shirube-user-outcome-proof/v1";
  expected_user_outcome?: string;
  outcome_evidence_uri?: string;
  outcome_verdict?: UserOutcomeVerdict;
  negative_controls_checked?: string[];
  waiver_actor?: string;
  waiver_reason?: string;
}

export interface UserOutcomeGateInput {
  schema?: "shirube-user-outcome-gate-fixture/v1";
  subject: string;
  claim_text?: string;
  claims?: string[];
  proof?: UserOutcomeProof;
}

export interface UserOutcomeFinding {
  severity: UserOutcomeFindingSeverity;
  code: string;
  message: string;
}

export interface UserOutcomeGateReport {
  schema: "shirube-user-outcome-gate-report/v1";
  subject: string;
  claim_terms_detected: string[];
  outcome_satisfied: boolean;
  claim_blocked: boolean;
  verdict: "PASS" | "BLOCK";
  required_fields: string[];
  findings: UserOutcomeFinding[];
  authority_notes: string[];
}

const COMPLETION_CLAIM_PATTERNS: Array<{ term: string; pattern: RegExp }> = [
  { term: "done", pattern: /\bdone\b/i },
  { term: "complete", pattern: /\bcomplete(?:d|ly)?\b/i },
  { term: "recovered", pattern: /\brecover(?:ed|y)?\b/i },
  { term: "usable", pattern: /\busable\b/i },
];

const REQUIRED_FIELDS = [
  "expected_user_outcome",
  "outcome_evidence_uri",
  "outcome_verdict",
  "negative_controls_checked",
];

export function evaluateUserOutcomeGate(input: UserOutcomeGateInput): UserOutcomeGateReport {
  const findings: UserOutcomeFinding[] = [];
  const claimTerms = detectedClaimTerms([input.claim_text, ...(input.claims ?? [])].filter(Boolean).join("\n"));
  const proof = input.proof;

  if (claimTerms.length === 0) {
    findings.push(pass("no_completion_claim_detected", "No done/recovered/usable/complete claim was detected."));
  }

  const requiresOutcomeProof = claimTerms.length > 0;
  const missingFields = requiresOutcomeProof ? missingProofFields(proof) : [];
  if (requiresOutcomeProof) {
    for (const field of missingFields) {
      findings.push(block(`missing_${field}`, `${field} is required before a completion or usability claim.`));
    }

    if (proof?.outcome_verdict === "FAIL") {
      findings.push(block("outcome_verdict_fail", "User outcome evidence reports FAIL."));
    }
    if (proof?.outcome_verdict === "NEEDS_INFO") {
      findings.push(block("outcome_verdict_needs_info", "User outcome evidence needs more information."));
    }
    if (proof?.outcome_verdict === "WAIVED") {
      if (!proof.waiver_actor) findings.push(block("missing_waiver_actor", "WAIVED outcome requires waiver_actor."));
      if (!proof.waiver_reason) findings.push(block("missing_waiver_reason", "WAIVED outcome requires waiver_reason."));
      if (proof.waiver_actor && proof.waiver_reason) {
        findings.push(warn("outcome_waived", "User outcome was waived by an explicit actor and reason."));
      }
    }
    if (proof?.outcome_verdict === "PASS") {
      findings.push(pass("outcome_verdict_pass", "User outcome evidence reports PASS."));
    }
  }

  const outcomeSatisfied = missingFields.length === 0 &&
    (proof?.outcome_verdict === "PASS" ||
      (proof?.outcome_verdict === "WAIVED" && Boolean(proof.waiver_actor && proof.waiver_reason)));
  const claimBlocked = claimTerms.length > 0 && !outcomeSatisfied;
  if (claimBlocked) {
    findings.push(block(
      "completion_claim_without_user_outcome",
      "Done/recovered/usable/complete claims require outcome PASS evidence or an explicit waiver.",
    ));
  }

  return {
    schema: "shirube-user-outcome-gate-report/v1",
    subject: input.subject,
    claim_terms_detected: claimTerms,
    outcome_satisfied: outcomeSatisfied,
    claim_blocked: claimBlocked,
    verdict: findings.some((finding) => finding.severity === "BLOCK") ? "BLOCK" : "PASS",
    required_fields: REQUIRED_FIELDS,
    findings,
    authority_notes: [
      "ci_audit_queue_or_script_output_is_not_user_outcome_evidence",
      "completion_or_recovery_claim_requires_outcome_pass_or_waiver",
      "negative_controls_are_required",
    ],
  };
}

function detectedClaimTerms(text: string): string[] {
  return COMPLETION_CLAIM_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.term);
}

function missingProofFields(proof: UserOutcomeProof | undefined): string[] {
  if (!proof) return REQUIRED_FIELDS;
  const missing: string[] = [];
  if (!proof.expected_user_outcome) missing.push("expected_user_outcome");
  if (!proof.outcome_evidence_uri) missing.push("outcome_evidence_uri");
  if (!proof.outcome_verdict) missing.push("outcome_verdict");
  if (!Array.isArray(proof.negative_controls_checked) || proof.negative_controls_checked.length === 0) {
    missing.push("negative_controls_checked");
  }
  return missing;
}

function pass(code: string, message: string): UserOutcomeFinding {
  return { severity: "PASS", code, message };
}

function warn(code: string, message: string): UserOutcomeFinding {
  return { severity: "WARN", code, message };
}

function block(code: string, message: string): UserOutcomeFinding {
  return { severity: "BLOCK", code, message };
}
