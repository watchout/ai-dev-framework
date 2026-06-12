import {
  reconcileConveyor,
  type ConveyorMode,
  type ConveyorPullRequestSnapshot,
  type ConveyorReconcileInput,
  type ConveyorReconcileReport,
} from "./conveyor-reconciler.js";

export type ConveyorSyncSeverity = "INFO" | "WARN" | "BLOCK";

export interface ConveyorLabelSyncFinding {
  severity: ConveyorSyncSeverity;
  code: string;
  message: string;
}

export interface ConveyorLabelSyncAction {
  repo: string;
  pr: number;
  head: string;
  add: string[];
  remove: string[];
  blocked: boolean;
  findings: ConveyorLabelSyncFinding[];
}

export interface ConveyorLabelSyncPlan {
  schema: "shirube-conveyor-label-sync-plan/v1";
  mode: ConveyorMode;
  safe_to_apply: boolean;
  actions: ConveyorLabelSyncAction[];
  reconcile: ConveyorReconcileReport;
}

export function buildConveyorLabelSyncPlan(
  input: ConveyorReconcileInput,
  mode: ConveyorMode = "dry-run",
): ConveyorLabelSyncPlan {
  const reconcile = reconcileConveyor(input, mode);
  const originals = new Map(input.pull_requests.map((pr) => [prKey(pr.repo, pr.number), pr]));
  const actions = reconcile.prs.map((report) => {
    const original = originals.get(prKey(report.repo, report.pr));
    const findings = classifySyncFindings(report, original);
    return {
      repo: report.repo,
      pr: report.pr,
      head: report.head,
      add: report.changes.add,
      remove: report.changes.remove,
      blocked: findings.some((finding) => finding.severity === "BLOCK"),
      findings,
    };
  });

  return {
    schema: "shirube-conveyor-label-sync-plan/v1",
    mode,
    safe_to_apply: actions.every((action) => !action.blocked),
    actions,
    reconcile,
  };
}

function classifySyncFindings(
  report: ConveyorReconcileReport["prs"][number],
  original: ConveyorPullRequestSnapshot | undefined,
): ConveyorLabelSyncFinding[] {
  const findings: ConveyorLabelSyncFinding[] = [];
  const originalLabels = original?.labels ?? report.initial_labels;

  if (!originalLabels.some((label) => label.startsWith("state:"))) {
    findings.push(block("missing_canonical_state", "PR has no canonical state:* dispatch label."));
  }

  if (hasAuditPendingLabel(originalLabels) && !originalLabels.some((label) => label.startsWith("state:"))) {
    findings.push(block("audit_label_without_state", "Audit compatibility labels exist without a canonical state:* label."));
  }

  if (report.skipped.includes("head_mismatch")) {
    findings.push(block("head_mismatch", "Durable audit evidence head does not match the current PR head."));
  }

  if (report.skipped.includes("dirty_or_conflicting_pr")) {
    findings.push(block("dirty_or_conflicting_pr", "Dirty or conflicting PR cannot advance lanes."));
  }

  if (report.skipped.includes("missing_durable_audit_evidence")) {
    findings.push(block("missing_durable_audit_evidence", "Audit pass labels are not sufficient without PR-local evidence."));
  }

  if (report.findings.includes("label_only_pass_without_durable_evidence")) {
    findings.push(block("label_only_pass_without_durable_evidence", "Pass label exists without matching durable evidence."));
  }

  if (report.findings.includes("multiple_state_labels_normalized")) {
    findings.push(warn("multiple_state_labels_normalized", "Multiple state:* labels were normalized in the plan."));
  }

  if (report.findings.includes("multiple_needs_labels_normalized")) {
    findings.push(warn("multiple_needs_labels_normalized", "Multiple needs:* labels were normalized in the plan."));
  }

  if (originalLabels.includes("merge-ready") && !originalLabels.includes("audit:l3-passed")) {
    findings.push(block("merge_ready_without_l3_evidence", "merge-ready requires audit:l3-passed evidence."));
  }

  if (report.final_labels.includes("state:blocked")) {
    findings.push(warn("blocked_state", "PR remains blocked and must not be treated as auditable."));
  }

  if (report.final_labels.includes("dependency-blocked")) {
    findings.push(warn("dependency_blocked", "PR remains dependency-blocked until its immediate predecessor clears."));
  }

  if (findings.length === 0 && (report.changes.add.length > 0 || report.changes.remove.length > 0)) {
    findings.push(info("label_sync_required", "Safe label sync changes are available in the plan."));
  }

  return findings;
}

function hasAuditPendingLabel(labels: string[]): boolean {
  return labels.includes("audit-pending") || labels.some((label) => /^audit:l[123]-pending$/.test(label));
}

function info(code: string, message: string): ConveyorLabelSyncFinding {
  return { severity: "INFO", code, message };
}

function warn(code: string, message: string): ConveyorLabelSyncFinding {
  return { severity: "WARN", code, message };
}

function block(code: string, message: string): ConveyorLabelSyncFinding {
  return { severity: "BLOCK", code, message };
}

function prKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}
