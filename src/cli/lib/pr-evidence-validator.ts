export type PrEvidenceMode = "warning" | "strict";
export type PrEvidenceStatus = "PASS" | "WARNING" | "BLOCK";

export interface PrEvidenceDocument {
  path: string;
  content: string;
}

export interface PrEvidenceOptions {
  mode?: PrEvidenceMode;
}

export interface PrEvidenceFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "missing_field"
    | "invalid_field"
    | "unsafe_audit_timing"
    | "unsafe_merge_ready_claim";
  field?: string;
  message: string;
}

export interface PrEvidenceResult {
  status: PrEvidenceStatus;
  mode: PrEvidenceMode;
  findings: PrEvidenceFinding[];
  checkedDocuments: string[];
}

type PrRiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
type ParsedEvidence = Record<string, string>;

const REQUIRED_FIELDS = [
  "work_order",
  "delivery_strategy",
  "lane",
  "risk_class",
  "audit_timing",
  "queue_state",
  "runner_identity",
  "runtime_mode",
  "implementation_owner",
  "review_owner",
  "audit_owner",
  "merge_authority",
  "changed_files",
  "verification_commands",
  "verification_results",
  "residual_risk",
  "stop_conditions_encountered",
] as const;

const EMPTY_VALUE =
  /^(?:tbd|todo|pending|unknown|not\s+applicable|n\/a|na|none|null|-)(?:[\s.。,:;_-]|$)/i;
const EMPTY_VALUE_ALLOWING_NONE =
  /^(?:tbd|todo|pending|unknown|not\s+applicable|n\/a|na|null|-)(?:[\s.。,:;_-]|$)/i;

const MERGE_READY = /\bmerge[-_\s]?ready\b|ready\s+to\s+merge|ready\/merge|マージ可能|merge可能/i;
const APPROVAL_PRESENT = /\b(approved|approval|ceo|cto|merge authority|承認|approval_ref)\b/i;
const AUDIT_PRESENT = /\b(audit|auditor|L1|L2|L3|監査)\b/i;
const CONCRETE_REF_PRESENT =
  /https?:\/\/|issuecomment-\d+|comment-\d+|#[0-9]+|\b[a-f0-9]{7,40}\b|\bpass(?:ed)?\b|\bevidence\b|\brecord\b|\breport\b/i;
const GENERIC_NON_CONCRETE_REF =
  /^(?:not\s+required|not\s+needed|not\s+applicable|without\s+evidence|missing|absent|none)(?:[\s.。,:;_/-]|$)/i;
const AUDIT_NON_CONCRETE_REF =
  /^(?:no\s+(?:audit|audits|audit\s+refs?|audit\s+evidence)|without\s+(?:audit|audits|audit\s+refs?|audit\s+evidence)|(?:audit|audits|audit\s+refs?|audit\s+evidence)\s+(?:not\s+required|not\s+needed|missing|absent))(?:[\s.。,:;_/-]|$)/i;
const APPROVAL_NON_CONCRETE_REF =
  /^(?:no\s+(?:approval|approvals|approval\s+refs?|approval\s+evidence)|without\s+(?:approval|approvals|approval\s+refs?|approval\s+evidence)|(?:approval|approvals|approval\s+refs?|approval\s+evidence)\s+(?:not\s+required|not\s+needed|missing|absent))(?:[\s.。,:;_/-]|$)/i;

export function validatePrEvidence(
  documents: PrEvidenceDocument[],
  options: PrEvidenceOptions = {},
): PrEvidenceResult {
  const mode = options.mode ?? "warning";
  const findings: PrEvidenceFinding[] = [];

  for (const document of documents) {
    const evidence = parseEvidence(document.content);
    for (const field of REQUIRED_FIELDS) {
      if (!hasConcreteField(evidence, field)) {
        pushModeFinding(findings, mode, {
          path: document.path,
          type: "missing_field",
          field,
          message: `Missing PR Conveyor evidence field: ${field}`,
        });
      }
    }

    validateRiskAndTiming(findings, mode, document.path, evidence);
  }

  return {
    status: toStatus(findings),
    mode,
    findings,
    checkedDocuments: documents.map((document) => document.path),
  };
}

function validateRiskAndTiming(
  findings: PrEvidenceFinding[],
  mode: PrEvidenceMode,
  path: string,
  evidence: ParsedEvidence,
): void {
  const risk = normalizeRisk(evidence.risk_class ?? evidence.risk ?? "");
  const auditTiming = normalizeValue(evidence.audit_timing ?? "");
  const queueState = normalizeValue(evidence.queue_state ?? evidence.queue ?? "");
  const mergeReadiness = [
    evidence.merge_readiness,
    evidence.queue_state,
    evidence.status,
  ].filter(Boolean).join("\n");

  if (!risk) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "risk_class",
      message: "risk_class must be one of R0, R1, R2, R3, or R4.",
    });
    return;
  }

  if (["R0", "R1", "R2"].includes(risk)) {
    if (auditTiming && auditTiming !== "after_pr") {
      pushModeFinding(findings, mode, {
        path,
        type: "invalid_field",
        field: "audit_timing",
        message: "R0-R2 PR Conveyor evidence should use audit_timing=after_pr.",
      });
    }
    if (queueState && queueState !== "audit_pending") {
      pushModeFinding(findings, mode, {
        path,
        type: "invalid_field",
        field: "queue_state",
        message: "R0-R2 PR Conveyor evidence should move to audit_pending after PR creation.",
      });
    }
    return;
  }

  if (risk === "R3" && auditTiming === "after_pr") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_audit_timing",
      field: "audit_timing",
      message: "R3 evidence must require audit before merge or owner adoption, not after PR creation.",
    });
  }

  if (risk === "R4" && auditTiming !== "before_execution") {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_audit_timing",
      field: "audit_timing",
      message: "R4 evidence must require approval/audit before execution.",
    });
  }

  if (!MERGE_READY.test(mergeReadiness)) return;

  const auditEvidence = evidence.audit_refs ?? evidence.audit_evidence ?? "";
  const approvalEvidence = evidence.approval_refs ?? evidence.approval_evidence ?? "";
  if (risk === "R3" && !hasConcreteAuditRef(auditEvidence)) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_merge_ready_claim",
      field: "audit_refs",
      message: "R3 PR evidence cannot claim merge-ready without audit refs.",
    });
  }

  if (
    risk === "R4" &&
    (!hasConcreteAuditRef(auditEvidence) ||
      !hasConcreteApprovalRef(approvalEvidence))
  ) {
    findings.push({
      severity: "BLOCK",
      path,
      type: "unsafe_merge_ready_claim",
      field: "approval_refs",
      message: "R4 PR evidence cannot claim merge-ready without concrete audit and approval refs.",
    });
  }
}

function parseEvidence(content: string): ParsedEvidence {
  const evidence: ParsedEvidence = {};
  const fieldPattern = /^\s*(?:[-*]\s*)?(?:\*\*)?([A-Za-z0-9_. /-]+)(?:\*\*)?\s*:\s*(.+?)\s*$/gm;
  for (const match of content.matchAll(fieldPattern)) {
    const key = normalizeKey(match[1]);
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    evidence[key] = value;
  }
  return evidence;
}

function hasConcreteField(evidence: ParsedEvidence, field: string): boolean {
  return hasConcreteText(evidence[field], {
    allowNone: field === "stop_conditions_encountered",
  });
}

function hasConcreteText(
  value: string | undefined,
  options: { allowNone?: boolean } = {},
): boolean {
  if (!value) return false;
  const normalized = value.replace(/[*`_~]/g, "").replace(/\s+/g, " ").trim();
  const emptyValue = options.allowNone ? EMPTY_VALUE_ALLOWING_NONE : EMPTY_VALUE;
  return normalized.length > 0 && !emptyValue.test(normalized);
}

function hasConcreteAuditRef(value: string | undefined): boolean {
  return hasConcreteReference(value, AUDIT_PRESENT, AUDIT_NON_CONCRETE_REF);
}

function hasConcreteApprovalRef(value: string | undefined): boolean {
  return hasConcreteReference(value, APPROVAL_PRESENT, APPROVAL_NON_CONCRETE_REF);
}

function hasConcreteReference(
  value: string | undefined,
  expectedRef: RegExp,
  nonConcreteRef: RegExp,
): boolean {
  if (!value) return false;
  if (!hasConcreteText(value)) return false;
  const normalized = normalizeEvidenceText(value);
  if (
    GENERIC_NON_CONCRETE_REF.test(normalized) ||
    nonConcreteRef.test(normalized)
  ) {
    return false;
  }
  return expectedRef.test(normalized) || CONCRETE_REF_PRESENT.test(normalized);
}

function normalizeEvidenceText(value: string): string {
  return value.replace(/[*`_~]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeRisk(value: string): PrRiskClass | null {
  const normalized = value.trim().toUpperCase();
  if (["R0", "R1", "R2", "R3", "R4"].includes(normalized)) {
    return normalized as PrRiskClass;
  }
  return null;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pushModeFinding(
  findings: PrEvidenceFinding[],
  mode: PrEvidenceMode,
  finding: Omit<PrEvidenceFinding, "severity">,
): void {
  findings.push({
    ...finding,
    severity: mode === "strict" ? "BLOCK" : "WARNING",
  });
}

function toStatus(findings: PrEvidenceFinding[]): PrEvidenceStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
