export type ConveyorAuditRole = "l1" | "l2" | "l3";
export type ConveyorAuditVerdict = "PASS" | "BLOCK" | "CHANGES_REQUESTED" | "HOLD";
export type ConveyorMode = "dry-run" | "apply";

export interface ConveyorAuditEvidence {
  schema: "conveyor:audit-result/v1";
  repo: string;
  pr: number;
  role: ConveyorAuditRole;
  verdict: ConveyorAuditVerdict;
  head: string;
  reported_by?: string;
  recorded_at?: string;
  source?: string;
}

export interface ConveyorEvidenceSource {
  body: string;
  url?: string;
  kind?: "comment" | "review";
}

export interface ConveyorPullRequestSnapshot {
  repo: string;
  number: number;
  url?: string;
  title?: string;
  head: string;
  merge_state?: string;
  labels: string[];
  comments?: ConveyorEvidenceSource[];
  reviews?: ConveyorEvidenceSource[];
}

export interface ConveyorReconcilerConfig {
  dependencies?: Record<string, number[][]>;
}

export interface ConveyorReconcileInput {
  pull_requests: ConveyorPullRequestSnapshot[];
  config?: ConveyorReconcilerConfig;
}

export interface ConveyorLabelChange {
  repo: string;
  pr: number;
  add: string[];
  remove: string[];
}

export interface ConveyorPrReport {
  repo: string;
  pr: number;
  head: string;
  initial_labels: string[];
  final_labels: string[];
  changes: ConveyorLabelChange;
  accepted_evidence: ConveyorAuditEvidence[];
  skipped: string[];
  findings: string[];
}

export interface ConveyorDependencyRelease {
  repo: string;
  predecessor: number;
  released: number;
  state: string;
  reason: string;
}

export interface ConveyorReconcileReport {
  schema: "shirube-conveyor-reconcile-report/v1";
  mode: ConveyorMode;
  changed: boolean;
  prs: ConveyorPrReport[];
  dependency_releases: ConveyorDependencyRelease[];
  skipped: Array<{ repo: string; pr: number; reason: string }>;
}

const STATE_PREFIX = "state:";
const NEEDS_PREFIX = "needs:";
const AUDIT_PENDING = ["audit:l1-pending", "audit:l2-pending", "audit:l3-pending"];
const AUDIT_NEEDS = ["needs:l1-audit", "needs:l2-audit", "needs:l3-review"];
const ACTIVE_STATES = [
  "state:impl-l1",
  "state:impl-l2",
  "state:impl-l3",
  "state:ceo-approval",
  "state:rework",
  "state:blocked",
  "state:start",
  "state:impl",
  "state:done",
];

const LANE_LABELS: Record<string, string[]> = {
  "state:impl-l1": ["audit-pending", "audit:l1-pending", "needs:l1-audit"],
  "state:impl-l2": ["audit-pending", "audit:l2-pending", "needs:l2-audit"],
  "state:impl-l3": ["audit-pending", "audit:l3-pending", "needs:l3-review"],
  "state:ceo-approval": ["needs:ceo-approval"],
  "state:rework": ["needs:rework"],
  "state:blocked": [],
  "state:done": [],
};

const PASS_LABEL_BY_ROLE: Record<ConveyorAuditRole, string> = {
  l1: "audit:l1-passed",
  l2: "audit:l2-passed",
  l3: "audit:l3-passed",
};

const STATE_ROLE: Record<string, ConveyorAuditRole> = {
  "state:impl-l1": "l1",
  "state:impl-l2": "l2",
  "state:impl-l3": "l3",
};

export function parseConveyorAuditEvidence(source: ConveyorEvidenceSource): ConveyorAuditEvidence | null {
  if (!source.body.includes("<!-- conveyor:audit-result/v1 -->")) {
    return null;
  }
  const fields = new Map<string, string>();
  for (const line of source.body.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z_]+):\s*(.+?)\s*$/i);
    if (match) {
      fields.set(match[1].toLowerCase(), match[2]);
    }
  }

  const repo = fields.get("repo");
  const prRaw = fields.get("pr");
  const roleRaw = fields.get("role");
  const verdictRaw = fields.get("verdict");
  const head = fields.get("head");
  if (!repo || !prRaw || !roleRaw || !verdictRaw || !head) {
    return null;
  }

  const pr = Number(prRaw);
  const role = roleRaw.toLowerCase();
  const verdict = verdictRaw.toUpperCase();
  if (!Number.isInteger(pr)) return null;
  if (!isAuditRole(role)) return null;
  if (!isAuditVerdict(verdict)) return null;

  return {
    schema: "conveyor:audit-result/v1",
    repo,
    pr,
    role,
    verdict,
    head,
    reported_by: fields.get("reported_by"),
    recorded_at: fields.get("recorded_at"),
    source: source.url,
  };
}

export function collectConveyorAuditEvidence(pr: ConveyorPullRequestSnapshot): ConveyorAuditEvidence[] {
  return [...(pr.comments ?? []), ...(pr.reviews ?? [])]
    .map((source) => parseConveyorAuditEvidence(source))
    .filter((evidence): evidence is ConveyorAuditEvidence => Boolean(evidence))
    .filter((evidence) => evidence.repo === pr.repo && evidence.pr === pr.number);
}

export function reconcileConveyor(input: ConveyorReconcileInput, mode: ConveyorMode = "dry-run"): ConveyorReconcileReport {
  const working = input.pull_requests.map((pr) => ({
    ...pr,
    labels: unique(pr.labels),
  }));
  const byRepoAndNumber = new Map(working.map((pr) => [prKey(pr.repo, pr.number), pr]));
  const reports = new Map<string, ConveyorPrReport>();
  const acceptedPasses: Array<{ repo: string; pr: number; role: ConveyorAuditRole }> = [];

  for (const pr of working) {
    const initial = pr.labels.slice();
    const labels = new Set(pr.labels);
    const skipped: string[] = [];
    const findings: string[] = [];
    const acceptedEvidence: ConveyorAuditEvidence[] = [];
    const state = normalizeActiveState(labels, findings);
    const role = state ? STATE_ROLE[state] : undefined;

    if (!state) {
      skipped.push("missing_active_state");
    }

    if (state && role) {
      const evidence = selectEvidence(pr, role);
      const labelOnlyPass = labels.has(PASS_LABEL_BY_ROLE[role]) && !evidence.matchingHead;
      if (labelOnlyPass) {
        findings.push("label_only_pass_without_durable_evidence");
      }

      if (evidence.anyVerdict && !evidence.matchingHead) {
        skipped.push("head_mismatch");
      } else if (evidence.matchingHead && isDirtyOrConflicting(pr.merge_state)) {
        skipped.push("dirty_or_conflicting_pr");
      } else if (evidence.matchingHead) {
        applyVerdict(labels, state, evidence.matchingHead, acceptedEvidence);
        if (evidence.matchingHead.verdict === "PASS") {
          acceptedPasses.push({ repo: pr.repo, pr: pr.number, role });
        }
      } else if (labels.has(PASS_LABEL_BY_ROLE[role])) {
        skipped.push("missing_durable_audit_evidence");
      }
    }

    normalizeLabelsForState(labels, activeState(labels) ?? state, findings);
    const final = Array.from(labels).sort();
    const changes = labelChangeFor(pr.repo, pr.number, initial, final);
    if (mode === "apply") {
      pr.labels = final;
    }
    reports.set(prKey(pr.repo, pr.number), {
      repo: pr.repo,
      pr: pr.number,
      head: pr.head,
      initial_labels: initial.sort(),
      final_labels: final,
      changes,
      accepted_evidence: acceptedEvidence,
      skipped: unique(skipped),
      findings: unique(findings),
    });
  }

  const dependencyReleases = releaseImmediateDependencies({
    config: input.config,
    prsByKey: byRepoAndNumber,
    acceptedPasses,
    mode,
    reports,
  });

  const prReports = Array.from(reports.values()).sort((a, b) =>
    a.repo === b.repo ? a.pr - b.pr : a.repo.localeCompare(b.repo),
  );
  return {
    schema: "shirube-conveyor-reconcile-report/v1",
    mode,
    changed: prReports.some((report) => report.changes.add.length > 0 || report.changes.remove.length > 0),
    prs: prReports,
    dependency_releases: dependencyReleases,
    skipped: prReports.flatMap((report) =>
      report.skipped.map((reason) => ({ repo: report.repo, pr: report.pr, reason })),
    ),
  };
}

function normalizeActiveState(labels: Set<string>, findings: string[]): string | undefined {
  const states = Array.from(labels).filter((label) => label.startsWith(STATE_PREFIX));
  if (states.length === 0) return undefined;
  const active = states.find((state) => ACTIVE_STATES.includes(state)) ?? states[0];
  for (const state of states) {
    if (state !== active) {
      labels.delete(state);
      findings.push("multiple_state_labels_normalized");
    }
  }
  return active;
}

function normalizeLabelsForState(labels: Set<string>, state: string | undefined, findings: string[]): void {
  if (!state) return;
  const wanted = new Set(LANE_LABELS[state] ?? []);
  for (const label of wanted) labels.add(label);

  if (state === "state:blocked" && !labels.has("dependency-blocked") && !labels.has("blocked-stop-lane")) {
    labels.add("blocked-stop-lane");
  }

  if (state !== "state:impl-l1") labels.delete("audit:l1-pending");
  if (state !== "state:impl-l2") labels.delete("audit:l2-pending");
  if (state !== "state:impl-l3") labels.delete("audit:l3-pending");
  if (!state.startsWith("state:impl-l")) labels.delete("audit-pending");

  for (const need of AUDIT_NEEDS) {
    if (!wanted.has(need)) labels.delete(need);
  }
  if (state !== "state:ceo-approval") labels.delete("needs:ceo-approval");
  if (state !== "state:rework") labels.delete("needs:rework");

  const needs = Array.from(labels).filter((label) => label.startsWith(NEEDS_PREFIX));
  const keep = needs[0];
  for (const need of needs.slice(1)) {
    labels.delete(need);
    findings.push("multiple_needs_labels_normalized");
  }
  if (keep) labels.add(keep);

  for (const pending of AUDIT_PENDING) {
    const shouldKeep = wanted.has(pending);
    if (!shouldKeep) labels.delete(pending);
  }
}

function selectEvidence(pr: ConveyorPullRequestSnapshot, role: ConveyorAuditRole): {
  anyVerdict?: ConveyorAuditEvidence;
  matchingHead?: ConveyorAuditEvidence;
} {
  const roleEvidence = collectConveyorAuditEvidence(pr).filter((evidence) => evidence.role === role);
  const anyVerdict = roleEvidence.find((evidence) => evidence.verdict !== "HOLD");
  return {
    anyVerdict,
    matchingHead: roleEvidence.find((evidence) => evidence.head === pr.head && evidence.verdict !== "HOLD"),
  };
}

function applyVerdict(
  labels: Set<string>,
  state: string,
  evidence: ConveyorAuditEvidence,
  acceptedEvidence: ConveyorAuditEvidence[],
): void {
  acceptedEvidence.push(evidence);
  const role = STATE_ROLE[state];
  if (!role) return;
  labels.delete(state);
  labels.delete(`audit:${role}-pending`);
  labels.delete(role === "l3" ? "needs:l3-review" : `needs:${role}-audit`);

  if (evidence.verdict === "PASS") {
    labels.add(PASS_LABEL_BY_ROLE[role]);
    if (role === "l1") {
      labels.add(labels.has("audit:l2-required") ? "state:impl-l2" : "state:impl-l3");
      return;
    }
    if (role === "l2") {
      labels.add("state:impl-l3");
      return;
    }
    labels.add("state:done");
    labels.add("merge-ready");
    return;
  }

  if (evidence.verdict === "BLOCK") {
    labels.add("audit:blocked");
  } else if (evidence.verdict === "CHANGES_REQUESTED") {
    labels.add("audit:changes-requested");
  }
  labels.add("state:rework");
}

function releaseImmediateDependencies(input: {
  config: ConveyorReconcilerConfig | undefined;
  prsByKey: Map<string, ConveyorPullRequestSnapshot>;
  acceptedPasses: Array<{ repo: string; pr: number; role: ConveyorAuditRole }>;
  mode: ConveyorMode;
  reports: Map<string, ConveyorPrReport>;
}): ConveyorDependencyRelease[] {
  const releases: ConveyorDependencyRelease[] = [];
  const dependencies = input.config?.dependencies ?? {};
  for (const pass of input.acceptedPasses) {
    for (const stack of dependencies[pass.repo] ?? []) {
      const index = stack.indexOf(pass.pr);
      if (index < 0 || index >= stack.length - 1) continue;
      const nextNumber = stack[index + 1];
      const next = input.prsByKey.get(prKey(pass.repo, nextNumber));
      if (!next) continue;
      if (!next.labels.includes("dependency-blocked") && !next.labels.includes("state:blocked")) continue;
      const final = new Set(next.labels);
      final.delete("state:blocked");
      final.delete("dependency-blocked");
      final.delete("blocked-stop-lane");
      final.add(`state:impl-${pass.role}`);
      normalizeLabelsForState(final, `state:impl-${pass.role}`, []);
      const releaseLabels = Array.from(final).sort();
      const report = input.reports.get(prKey(pass.repo, nextNumber));
      if (report) {
        const changes = labelChangeFor(pass.repo, nextNumber, report.initial_labels, releaseLabels);
        report.final_labels = releaseLabels;
        report.changes = changes;
      }
      if (input.mode === "apply") {
        next.labels = releaseLabels;
      }
      releases.push({
        repo: pass.repo,
        predecessor: pass.pr,
        released: nextNumber,
        state: `state:impl-${pass.role}`,
        reason: `${pass.role}_pass_immediate_dependency_release`,
      });
      break;
    }
  }
  return releases;
}

function labelChangeFor(repo: string, pr: number, initial: string[], final: string[]): ConveyorLabelChange {
  const before = new Set(initial);
  const after = new Set(final);
  return {
    repo,
    pr,
    add: final.filter((label) => !before.has(label)).sort(),
    remove: initial.filter((label) => !after.has(label)).sort(),
  };
}

function activeState(labels: Set<string>): string | undefined {
  return Array.from(labels).find((label) => label.startsWith(STATE_PREFIX));
}

function isDirtyOrConflicting(mergeState: string | undefined): boolean {
  return mergeState === "DIRTY" || mergeState === "CONFLICTING";
}

function isAuditRole(value: string): value is ConveyorAuditRole {
  return value === "l1" || value === "l2" || value === "l3";
}

function isAuditVerdict(value: string): value is ConveyorAuditVerdict {
  return value === "PASS" || value === "BLOCK" || value === "CHANGES_REQUESTED" || value === "HOLD";
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function prKey(repo: string, pr: number): string {
  return `${repo}#${pr}`;
}
