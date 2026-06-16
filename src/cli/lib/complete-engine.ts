/**
 * Engine for the shirube complete command.
 * Ref: #367 — merge-vs-complete separation
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CompleteCheck,
  CompleteEvidenceRecord,
  CompleteEvidenceStore,
  CompletionGateDefect,
  CompletionGateFinding,
  CompletionGateReport,
  CompletionGateStageId,
  CompletionGateStageInput,
  CompletionGateStageReport,
  CompletionGateVerdict,
  ShirubeProfile,
} from "./complete-model.js";

const EVIDENCE_FILE = ".framework/complete-evidence.json";
const PROFILE_FILE = ".shirube/profile.json";

const COMPLETION_GATE_STAGES: Array<{
  id: CompletionGateStageId;
  label: string;
}> = [
  { id: "scope", label: "Scope Gate" },
  { id: "contract", label: "Contract Gate" },
  { id: "implementation_evidence", label: "Implementation Evidence Gate" },
  { id: "audit", label: "Audit Gate" },
  { id: "qa_check", label: "QA/Check Gate" },
  { id: "live_processing", label: "Live Processing Gate" },
];

const PLACEHOLDER_TEXT = new Set([
  "n/a",
  "na",
  "none",
  "not applicable",
  "pending",
  "tbd",
  "todo",
  "unknown",
]);

export function loadCompleteEvidence(projectDir: string): CompleteEvidenceStore {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CompleteEvidenceStore;
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { records: [] };
  }
}

export function saveCompleteEvidence(
  projectDir: string,
  store: CompleteEvidenceStore,
): void {
  const filePath = path.join(projectDir, EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

export function loadShirubeProfile(projectDir: string): ShirubeProfile | null {
  const filePath = path.join(projectDir, PROFILE_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ShirubeProfile;
  } catch {
    return null;
  }
}

export function buildRecord(opts: {
  prNumber: string;
  sha: string;
  checks: CompleteCheck[];
  forced: boolean;
}): CompleteEvidenceRecord {
  return {
    prNumber: opts.prNumber,
    sha: opts.sha,
    completedAt: new Date().toISOString(),
    checks: opts.checks,
    forced: opts.forced,
  };
}

export function isCompleted(
  prNumber: string,
  store: CompleteEvidenceStore,
): CompleteEvidenceRecord | null {
  return store.records.find((r) => r.prNumber === prNumber) ?? null;
}

export function renderStatus(
  store: CompleteEvidenceStore,
  profile: ShirubeProfile | null,
): string {
  const lines: string[] = ["Complete Evidence Status", "─".repeat(40)];

  if (profile) {
    const runtimeLabel = profile.runtime ? "runtime (live evidence required)" : "non-runtime";
    lines.push(`Repo:    ${profile.repo_id}`);
    lines.push(`Type:    ${runtimeLabel}`);
    lines.push("");
  }

  if (store.records.length === 0) {
    lines.push("No complete records found.");
    return lines.join("\n");
  }

  for (const record of store.records) {
    const allPassed = record.checks.every((c) => c.passed);
    const icon = record.forced ? "⚠" : allPassed ? "✓" : "✗";
    lines.push(
      `${icon} PR #${record.prNumber}  ${record.sha}  ${record.completedAt.slice(0, 16)}`,
    );
    for (const check of record.checks) {
      const ci = check.passed ? "  ✓" : "  ✗";
      lines.push(`${ci} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
    }
    if (record.forced) {
      lines.push("  ⚠ Marked complete with --force");
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function evaluateCompletionGate(input: {
  subject?: string;
  work_order?: string;
  pr?: string;
  live_processing_applicable?: boolean;
  stages?: Partial<Record<CompletionGateStageId, CompletionGateStageInput>>;
  defects?: CompletionGateDefect[];
}): CompletionGateReport {
  const findings: CompletionGateFinding[] = [];
  const liveRequired =
    input.live_processing_applicable === true ||
    input.stages?.live_processing?.required === true;

  const stages = COMPLETION_GATE_STAGES.map((definition) =>
    evaluateStage(
      definition.id,
      definition.label,
      definition.id === "live_processing" ? liveRequired : true,
      input.stages?.[definition.id],
      findings,
    ),
  );

  const defects = Array.isArray(input.defects) ? input.defects : [];
  evaluateDefects(defects, findings);

  if (defects.length === 0) {
    findings.push({
      severity: "PASS",
      code: "no_residual_defects",
      message: "No residual defects were reported for the completion gate.",
    });
  }

  const blockingDefects = defects.filter((defect) => defect.classification === "blocking").length;
  const acceptedDebt = defects.filter((defect) => defect.classification === "accepted_debt").length;
  const outOfScope = defects.filter((defect) => defect.classification === "out_of_scope").length;
  const missingEvidence = findings.filter((finding) => finding.code.includes("missing")).length;
  const hasBlockFinding = findings.some((finding) => finding.severity === "BLOCK");
  const verdict = aggregateCompletionVerdict({
    hasBlockFinding,
    blockingDefects,
    acceptedDebt,
    outOfScope,
  });
  const canPass = verdict === "PASS" || verdict === "CONDITIONAL PASS";

  return {
    schema: "shirube-completion-gate-report/v1",
    subject: concreteText(input.subject) ?? "work-order-or-pr",
    work_order: concreteText(input.work_order),
    pr: concreteText(input.pr),
    verdict,
    can_pass: canPass,
    required_stage_ids: stages.filter((stage) => stage.required).map((stage) => stage.id),
    stages,
    defects,
    aggregator: {
      stage: "completion_aggregator",
      verdict,
      can_pass: canPass,
      blocking_defects: blockingDefects,
      accepted_debt: acceptedDebt,
      out_of_scope: outOfScope,
      missing_evidence: missingEvidence,
    },
    findings,
    authority_notes: [
      "green_ci_alone_is_not_completion_evidence",
      "aun_ack_or_queue_id_is_not_completion_evidence",
      "blocking_defects_prevent_pass",
      "accepted_debt_requires_owner_reason_follow_up_and_due",
      "implementation_role_must_not_self_approve_audit_qa_or_cto",
    ],
    next_required_review: ["l1-audit", "qa-check", "codex-cto-when-policy-adoption-or-protected-surface"],
  };
}

export function renderCompletionGateReport(report: CompletionGateReport): string {
  const lines: string[] = [
    "Completion Gate Report",
    "----------------------",
    `Subject: ${report.subject}`,
  ];

  if (report.work_order) lines.push(`Work Order: ${report.work_order}`);
  if (report.pr) lines.push(`PR: ${report.pr}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Can pass: ${report.can_pass ? "yes" : "no"}`);
  lines.push("");
  lines.push("Stages:");

  for (const stage of report.stages) {
    const marker = stage.passed ? "PASS" : stage.required ? "BLOCK" : "N/A";
    const required = stage.required ? "required" : "optional";
    lines.push(`- ${stage.label}: ${marker} (${required}, ${stage.status})`);
    if (stage.detail) lines.push(`  detail: ${stage.detail}`);
    if (stage.evidence_refs.length > 0) {
      lines.push(`  evidence: ${stage.evidence_refs.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Defects:");
  if (report.defects.length === 0) {
    lines.push("- none");
  } else {
    for (const defect of report.defects) {
      lines.push(
        `- ${defect.id ?? "unidentified"}: ${defect.classification ?? "unclassified"} — ${defect.summary ?? "missing summary"}`,
      );
    }
  }

  lines.push("");
  lines.push("Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.severity} ${finding.code}: ${finding.message}`);
  }

  lines.push("");
  lines.push(`Next required review: ${report.next_required_review.join(" -> ")}`);
  return lines.join("\n");
}

function evaluateStage(
  id: CompletionGateStageId,
  label: string,
  required: boolean,
  stage: CompletionGateStageInput | undefined,
  findings: CompletionGateFinding[],
): CompletionGateStageReport {
  if (!required && !stage) {
    return {
      id,
      label,
      required,
      status: "not_applicable",
      passed: true,
      evidence_refs: [],
    };
  }

  const status = stage?.status ?? "blocked";
  const evidenceRefs = concreteList(stage?.evidence_refs);
  const passed = !required
    ? status === "not_applicable" || status === "pass"
    : status === "pass" && evidenceRefs.length > 0;

  if (required && !stage) {
    findings.push(block(`missing_${id}_stage`, `${label} evidence is required.`));
  } else if (required && status !== "pass") {
    findings.push(block(`${id}_stage_not_passed`, `${label} status must be pass before completion.`));
  }

  if (required && evidenceRefs.length === 0) {
    findings.push(block(`missing_${id}_evidence`, `${label} requires at least one evidence reference.`));
  }

  if (passed) {
    findings.push(pass(`${id}_stage_passed`, `${label} passed with evidence.`));
  }

  return {
    id,
    label,
    required,
    status,
    passed,
    evidence_refs: evidenceRefs,
    detail: concreteText(stage?.detail),
  };
}

function evaluateDefects(
  defects: CompletionGateDefect[],
  findings: CompletionGateFinding[],
): void {
  for (const defect of defects) {
    const id = concreteText(defect.id) ?? "unidentified_defect";
    const evidenceRefs = concreteList(defect.evidence_refs);

    if (!concreteText(defect.summary)) {
      findings.push(block(`missing_${id}_summary`, `Defect ${id} requires a summary.`));
    }

    if (defect.classification === "blocking") {
      findings.push(block(
        `blocking_defect_${id}`,
        `Blocking defect ${id} prevents completion PASS.`,
        evidenceRefs,
      ));
      continue;
    }

    if (defect.classification === "accepted_debt") {
      validateAcceptedDebt(defect, id, evidenceRefs, findings);
      continue;
    }

    if (defect.classification === "out_of_scope") {
      validateOutOfScope(defect, id, evidenceRefs, findings);
      continue;
    }

    findings.push(block(
      `unknown_defect_classification_${id}`,
      `Defect ${id} must be classified as blocking, accepted_debt, or out_of_scope.`,
    ));
  }
}

function validateAcceptedDebt(
  defect: CompletionGateDefect,
  id: string,
  evidenceRefs: string[],
  findings: CompletionGateFinding[],
): void {
  const missing: string[] = [];
  if (!concreteText(defect.owner)) missing.push("owner");
  if (!concreteText(defect.issue)) missing.push("issue");
  if (!concreteText(defect.severity)) missing.push("severity");
  if (!concreteText(defect.reason)) missing.push("reason");
  if (!concreteText(defect.due)) missing.push("due");
  if (evidenceRefs.length === 0) missing.push("evidence_refs");

  if (missing.length > 0) {
    findings.push(block(
      `accepted_debt_${id}_missing_metadata`,
      `Accepted debt ${id} is missing ${missing.join(", ")}.`,
    ));
    return;
  }

  findings.push(warn(
    `accepted_debt_${id}_recorded`,
    `Accepted debt ${id} is recorded with owner, reason, follow-up issue, severity, due condition/date, and evidence.`,
    evidenceRefs,
  ));
}

function validateOutOfScope(
  defect: CompletionGateDefect,
  id: string,
  evidenceRefs: string[],
  findings: CompletionGateFinding[],
): void {
  const missing: string[] = [];
  if (evidenceRefs.length === 0) missing.push("evidence_refs");
  if (defect.material === true && !concreteText(defect.follow_up_uri) && !concreteText(defect.issue)) {
    missing.push("follow_up_uri_or_issue");
  }

  if (missing.length > 0) {
    findings.push(block(
      `out_of_scope_${id}_missing_metadata`,
      `Out-of-scope defect ${id} is missing ${missing.join(", ")}.`,
    ));
    return;
  }

  findings.push(warn(
    `out_of_scope_${id}_recorded`,
    `Out-of-scope defect ${id} is recorded with evidence${defect.material === true ? " and follow-up" : ""}.`,
    evidenceRefs,
  ));
}

function aggregateCompletionVerdict(input: {
  hasBlockFinding: boolean;
  blockingDefects: number;
  acceptedDebt: number;
  outOfScope: number;
}): CompletionGateVerdict {
  if (input.blockingDefects > 0) return "FAIL";
  if (input.hasBlockFinding) return "BLOCKED";
  if (input.acceptedDebt > 0 || input.outOfScope > 0) return "CONDITIONAL PASS";
  return "PASS";
}

function concreteText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (PLACEHOLDER_TEXT.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function concreteList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const concrete = concreteText(value);
    return concrete ? [concrete] : [];
  });
}

function pass(code: string, message: string): CompletionGateFinding {
  return { severity: "PASS", code, message };
}

function warn(
  code: string,
  message: string,
  evidenceRefs?: string[],
): CompletionGateFinding {
  return {
    severity: "WARN",
    code,
    message,
    evidence_refs: evidenceRefs && evidenceRefs.length > 0 ? evidenceRefs : undefined,
  };
}

function block(
  code: string,
  message: string,
  evidenceRefs?: string[],
): CompletionGateFinding {
  return {
    severity: "BLOCK",
    code,
    message,
    evidence_refs: evidenceRefs && evidenceRefs.length > 0 ? evidenceRefs : undefined,
  };
}
