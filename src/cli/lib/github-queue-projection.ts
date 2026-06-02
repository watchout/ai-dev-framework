export type GithubQueueMode = "warning" | "strict";
export type GithubQueueStatus = "PASS" | "WARNING" | "BLOCK";

export interface GithubQueueDocument {
  path: string;
  content: string;
}

export interface GithubQueueOptions {
  mode?: GithubQueueMode;
}

export interface GithubQueueFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "parse_error"
    | "missing_field"
    | "missing_label"
    | "invalid_field"
    | "wip_over_limit"
    | "stop_lane_without_approval";
  field?: string;
  repository?: string;
  message: string;
}

export interface GithubQueueWipSummary {
  repository: string;
  fastLanePrs: number;
  governedDraftPrs: number;
  reworkPrs: number;
  stopLaneWithoutApproval: number;
  limits: GithubQueueWipPolicy;
}

export interface GithubQueueResult {
  status: GithubQueueStatus;
  mode: GithubQueueMode;
  findings: GithubQueueFinding[];
  checkedDocuments: string[];
  checkedItems: number;
  repositories: GithubQueueWipSummary[];
}

interface GithubQueueWipPolicy {
  fastLanePrsPerRepo: number;
  governedDraftPrsPerRepo: number;
  reworkPrsPerRepo: number;
  stopLanePrsWithoutApproval: number;
}

type JsonObject = Record<string, unknown>;

const PROJECTION_VERSION = "github-queue-projection/v1";

const REQUIRED_FIELDS = [
  "projection_version",
  "repository",
  "labels",
  "wip_policy",
  "items",
] as const;

const REQUIRED_QUEUE_LABELS = [
  ["ready-for-implementation", "ready_for_implementation"],
  ["implementing", "implementing"],
  ["evidence-ready", "pr_opened_evidence_ready"],
  ["audit-pending", "audit_pending"],
  ["changes-requested", "changes_requested"],
  ["rework-implementing", "rework_implementing"],
  ["audit-passed", "audit_passed"],
  ["merge-ready", "merge_ready"],
  ["blocked-stop-lane", "blocked_stop_lane"],
] as const;

const WIP_POLICY_FIELDS = [
  "fast_lane_prs_per_repo",
  "governed_draft_prs_per_repo",
  "rework_prs_per_repo",
  "stop_lane_prs_without_approval",
] as const;

const EMPTY_VALUE =
  /^(?:tbd|todo|pending|unknown|not\s+applicable|n\/a|na|none|null|-)(?:[\s.。,:;_-]|$)/i;

export function validateGithubQueueProjections(
  documents: GithubQueueDocument[],
  options: GithubQueueOptions = {},
): GithubQueueResult {
  const mode = options.mode ?? "warning";
  const findings: GithubQueueFinding[] = [];
  const repositories: GithubQueueWipSummary[] = [];
  let checkedItems = 0;

  for (const document of documents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document.content);
    } catch (error) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "parse_error",
        message: `GitHub queue projection JSON could not be parsed: ${error}`,
      });
      continue;
    }

    if (!isObject(parsed)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "$",
        message: "GitHub queue projection root must be a JSON object.",
      });
      continue;
    }

    validateRequiredFields(findings, mode, document.path, parsed);
    validateProjectionVersion(findings, mode, document.path, parsed);
    validateLabels(findings, mode, document.path, parsed.labels);

    const policy = parseWipPolicy(findings, mode, document.path, parsed.wip_policy);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    checkedItems += items.length;

    if (!Array.isArray(parsed.items)) {
      pushModeFinding(findings, mode, {
        path: document.path,
        type: "invalid_field",
        field: "items",
        message: "items must be an array of GitHub issue/PR queue items.",
      });
    }

    if (policy) {
      repositories.push(
        ...summarizeAndValidateWip(
          findings,
          mode,
          document.path,
          String(parsed.repository ?? "unknown"),
          items,
          policy,
        ),
      );
    }
  }

  return {
    status: toStatus(findings),
    mode,
    findings,
    checkedDocuments: documents.map((document) => document.path),
    checkedItems,
    repositories,
  };
}

function validateRequiredFields(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  path: string,
  projection: JsonObject,
): void {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in projection)) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_field",
        field,
        message: `Missing GitHub queue projection field: ${field}`,
      });
    }
  }
}

function validateProjectionVersion(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  path: string,
  projection: JsonObject,
): void {
  if (!("projection_version" in projection)) return;
  if (projection.projection_version !== PROJECTION_VERSION) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "projection_version",
      message: `projection_version must be ${PROJECTION_VERSION}.`,
    });
  }
}

function validateLabels(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  path: string,
  labels: unknown,
): void {
  if (!Array.isArray(labels)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "labels",
      message: "labels must be an array of label names or label objects.",
    });
    return;
  }

  const labelsByName = new Map<string, JsonObject | null>();
  for (const label of labels) {
    if (typeof label === "string") {
      labelsByName.set(normalizeLabel(label), null);
      continue;
    }
    if (isObject(label) && typeof label.name === "string") {
      labelsByName.set(normalizeLabel(label.name), label);
    }
  }

  for (const [requiredLabel, expectedState] of REQUIRED_QUEUE_LABELS) {
    const normalizedLabel = normalizeLabel(requiredLabel);
    const label = labelsByName.get(normalizedLabel);
    if (label === undefined) {
      pushModeFinding(findings, mode, {
        path,
        type: "missing_label",
        field: "labels",
        message: `Missing PR Conveyor queue label: ${requiredLabel}`,
      });
      continue;
    }

    if (
      label &&
      typeof label.queue_state === "string" &&
      normalizeState(label.queue_state) !== expectedState
    ) {
      pushModeFinding(findings, mode, {
        path,
        type: "invalid_field",
        field: `labels.${requiredLabel}.queue_state`,
        message: `${requiredLabel} must project queue_state=${expectedState}.`,
      });
    }
  }
}

function parseWipPolicy(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  path: string,
  value: unknown,
): GithubQueueWipPolicy | null {
  if (!isObject(value)) {
    pushModeFinding(findings, mode, {
      path,
      type: "invalid_field",
      field: "wip_policy",
      message: "wip_policy must be an object.",
    });
    return null;
  }

  for (const field of WIP_POLICY_FIELDS) {
    if (!isNonNegativeNumber(value[field])) {
      pushModeFinding(findings, mode, {
        path,
        type: "invalid_field",
        field: `wip_policy.${field}`,
        message: `${field} must be a non-negative number.`,
      });
    }
  }

  return {
    fastLanePrsPerRepo: numberOrZero(value.fast_lane_prs_per_repo),
    governedDraftPrsPerRepo: numberOrZero(value.governed_draft_prs_per_repo),
    reworkPrsPerRepo: numberOrZero(value.rework_prs_per_repo),
    stopLanePrsWithoutApproval: numberOrZero(value.stop_lane_prs_without_approval),
  };
}

function summarizeAndValidateWip(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  path: string,
  defaultRepository: string,
  items: unknown[],
  limits: GithubQueueWipPolicy,
): GithubQueueWipSummary[] {
  const summaries = new Map<string, GithubQueueWipSummary>();

  for (const item of items) {
    if (!isObject(item) || !isOpenPullRequest(item)) continue;
    const repository = typeof item.repository === "string" ? item.repository : defaultRepository;
    const summary = getSummary(summaries, repository, limits);
    const riskClass = normalizeRisk(item.risk_class ?? item.risk);
    const lane = normalizeState(item.lane);
    const queueState = inferQueueState(item);

    if (isFastLane(lane, riskClass)) {
      summary.fastLanePrs++;
    }
    if (isGovernedDraft(item, lane, riskClass)) {
      summary.governedDraftPrs++;
    }
    if (queueState === "rework_implementing") {
      summary.reworkPrs++;
    }
    if (isStopLane(lane, riskClass, queueState) && !hasApprovalEvidence(item)) {
      summary.stopLaneWithoutApproval++;
    }
  }

  for (const summary of summaries.values()) {
    if (summary.fastLanePrs > limits.fastLanePrsPerRepo) {
      pushModeFinding(findings, mode, {
        path,
        repository: summary.repository,
        type: "wip_over_limit",
        field: "fast_lane_prs_per_repo",
        message: `Fast Lane PR WIP ${summary.fastLanePrs} exceeds limit ${limits.fastLanePrsPerRepo}.`,
      });
    }
    if (summary.governedDraftPrs > limits.governedDraftPrsPerRepo) {
      findings.push({
        severity: "BLOCK",
        path,
        repository: summary.repository,
        type: "wip_over_limit",
        field: "governed_draft_prs_per_repo",
        message: `Governed Draft PR WIP ${summary.governedDraftPrs} exceeds limit ${limits.governedDraftPrsPerRepo}.`,
      });
    }
    if (summary.reworkPrs > limits.reworkPrsPerRepo) {
      pushModeFinding(findings, mode, {
        path,
        repository: summary.repository,
        type: "wip_over_limit",
        field: "rework_prs_per_repo",
        message: `Rework PR WIP ${summary.reworkPrs} exceeds limit ${limits.reworkPrsPerRepo}.`,
      });
    }
    if (summary.stopLaneWithoutApproval > limits.stopLanePrsWithoutApproval) {
      findings.push({
        severity: "BLOCK",
        path,
        repository: summary.repository,
        type: "stop_lane_without_approval",
        field: "stop_lane_prs_without_approval",
        message: `Stop Lane PRs without approval ${summary.stopLaneWithoutApproval} exceeds limit ${limits.stopLanePrsWithoutApproval}.`,
      });
    }
  }

  return [...summaries.values()].sort((a, b) => a.repository.localeCompare(b.repository));
}

function getSummary(
  summaries: Map<string, GithubQueueWipSummary>,
  repository: string,
  limits: GithubQueueWipPolicy,
): GithubQueueWipSummary {
  let summary = summaries.get(repository);
  if (!summary) {
    summary = {
      repository,
      fastLanePrs: 0,
      governedDraftPrs: 0,
      reworkPrs: 0,
      stopLaneWithoutApproval: 0,
      limits,
    };
    summaries.set(repository, summary);
  }
  return summary;
}

function isOpenPullRequest(item: JsonObject): boolean {
  const type = normalizeState(item.type);
  const state = normalizeState(item.state);
  return (
    (type === "pull_request" || type === "pr") &&
    (state === "open" || state === "")
  );
}

function isFastLane(lane: string, riskClass: string): boolean {
  return lane === "fast" || ["r0", "r1", "r2"].includes(riskClass);
}

function isGovernedDraft(item: JsonObject, lane: string, riskClass: string): boolean {
  return Boolean(item.draft) && (lane === "governed" || riskClass === "r3");
}

function isStopLane(lane: string, riskClass: string, queueState: string): boolean {
  return lane === "stop" || riskClass === "r4" || queueState === "blocked_stop_lane";
}

function inferQueueState(item: JsonObject): string {
  const explicit = normalizeState(item.queue_state ?? item.queueState ?? item.queue);
  if (explicit) return explicit;

  for (const label of readLabelNames(item.labels)) {
    const queueState = queueStateForLabel(label);
    if (queueState) return queueState;
  }
  return "";
}

function queueStateForLabel(label: string): string | null {
  const normalized = normalizeLabel(label);
  for (const [requiredLabel, state] of REQUIRED_QUEUE_LABELS) {
    if (normalizeLabel(requiredLabel) === normalized) return state;
  }
  return null;
}

function hasApprovalEvidence(item: JsonObject): boolean {
  if (hasConcreteValue(item.approval_refs)) return true;
  if (hasConcreteValue(item.approvalRefs)) return true;
  if (hasConcreteValue(item.approval)) return true;
  return readLabelNames(item.labels).some((label) => /approval|approved|ceo|cto/.test(label));
}

function hasConcreteValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasConcreteValue(item));
  if (typeof value !== "string") return false;
  const normalized = value.replace(/[*`_~]/g, "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 && !EMPTY_VALUE.test(normalized);
}

function readLabelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.flatMap((label) => {
    if (typeof label === "string") return [normalizeLabel(label)];
    if (isObject(label) && typeof label.name === "string") {
      return [normalizeLabel(label.name)];
    }
    return [];
  });
}

function normalizeRisk(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeState(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function numberOrZero(value: unknown): number {
  return isNonNegativeNumber(value) ? value : 0;
}

function pushModeFinding(
  findings: GithubQueueFinding[],
  mode: GithubQueueMode,
  finding: Omit<GithubQueueFinding, "severity">,
): void {
  findings.push({
    ...finding,
    severity: mode === "strict" ? "BLOCK" : "WARNING",
  });
}

function toStatus(findings: GithubQueueFinding[]): GithubQueueStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
