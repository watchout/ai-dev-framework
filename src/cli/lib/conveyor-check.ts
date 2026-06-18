import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRepoSlug } from "./github-model.js";

export type ConveyorCheckVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED";
export type DiffScopeClassification =
  | "docs_only"
  | "fixtures"
  | "runtime"
  | "db"
  | "queue"
  | "agent_routing"
  | "scheduler"
  | "permission"
  | "ci"
  | "deploy"
  | "mixed"
  | "unknown";

export interface PullRequestTarget {
  repo: string;
  pr: number;
  pr_url: string;
}

export interface ConveyorCheckComment {
  body: string;
  url?: string;
}

export interface ConveyorCheckDocument {
  path: string;
  body: string;
  url?: string;
}

export interface ConveyorCheckStatusSummary {
  name: string;
  status: string | null;
  conclusion: string | null;
  workflow_name?: string;
  details_url?: string;
}

export interface ConveyorCheckSnapshot {
  repo?: string | null;
  pr?: number | null;
  pr_url?: string | null;
  body?: string | null;
  head_sha?: string | null;
  base_branch?: string | null;
  base_sha?: string | null;
  state?: string | null;
  draft?: boolean | null;
  merged?: boolean | null;
  mergeable?: boolean | null;
  changed_files?: string[] | null;
  labels?: string[] | null;
  comments?: ConveyorCheckComment[] | null;
  documents?: ConveyorCheckDocument[] | null;
  checks?: ConveyorCheckStatusSummary[] | null;
}

export interface DiffScopeForbiddenHit {
  path: string;
  class: Exclude<DiffScopeClassification, "docs_only" | "fixtures" | "mixed" | "unknown">;
}

export interface DiffScopeReport {
  classification: DiffScopeClassification;
  changed_files: string[];
  forbidden_hits: DiffScopeForbiddenHit[];
}

export interface ShirubeConveyorCheckReport {
  schema_version: "shirube-conveyor-check/v1";
  gate_version: "gate-completion-barrier/v1";
  repo: string;
  pr: number;
  pr_url: string;
  observed_at: string;
  head_sha: string | null;
  base_branch: string | null;
  base_sha: string | null;
  pr_state: {
    state: string | null;
    draft: boolean | null;
    merged: boolean | null;
    mergeable: boolean | null;
  };
  diff_scope: DiffScopeReport;
  github_checks: {
    available: boolean;
    required_checks_ok: boolean | null;
    summary: ConveyorCheckStatusSummary[];
  };
  conveyor_state: {
    labels: string[];
    state_label: string | null;
    impossible_state: boolean;
  };
  evidence_blocks: {
    available: boolean;
    markers: string[];
    required_present: boolean;
    sources_checked: number;
  };
  executor: {
    release_owner: string | null;
    release_executor: string | null;
    fallback_executor: string | null;
    evidence_sink: string | null;
    executor_bound: boolean;
  };
  legacy_flow: {
    detected: boolean;
    invalid_release_owner: boolean;
    machine_gate_evidence_exact_head: boolean;
    completion_claim_without_exact_head_machine_gate: boolean;
    can_proceed_by_machine_evidence: boolean;
    findings: ConveyorCheckTextFinding[];
  };
  verdict: ConveyorCheckVerdict;
  blockers: string[];
  warnings: string[];
}

export interface ConveyorCheckTextFinding {
  source: "pr_body" | "comment" | "document" | "executor";
  reason: "legacy_review_flow" | "invalid_release_owner" | "completion_claim_without_exact_head_machine_gate";
  line?: number;
  path?: string;
  url?: string;
  field?: string;
  excerpt: string;
}

interface BuildConveyorCheckOptions {
  observedAt?: string;
}

interface GhPullRequestView {
  number?: number;
  url?: string;
  body?: string;
  headRefOid?: string;
  baseRefName?: string;
  baseRefOid?: string;
  state?: string;
  isDraft?: boolean;
  mergedAt?: string | null;
  mergeable?: string;
  files?: Array<{ path?: string }>;
  labels?: Array<{ name?: string }>;
  comments?: Array<{ body?: string; url?: string }>;
  statusCheckRollup?: GhStatusCheck[];
}

interface GhStatusCheck {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  state?: string;
  conclusion?: string;
  workflowName?: string;
  detailsUrl?: string;
  targetUrl?: string;
}

const FORBIDDEN_CLASSES = new Set<DiffScopeForbiddenHit["class"]>([
  "runtime",
  "db",
  "queue",
  "agent_routing",
  "scheduler",
  "permission",
  "ci",
  "deploy",
]);

const REQUIRED_EVIDENCE_MARKERS = new Set([
  "conveyor:audit-result/v1",
  "conveyor:qa-result/v1",
  "conveyor:check-result/v1",
  "conveyor:cto-gate/v1",
  "shirube:implementation-handoff/v1",
  "shirube:arc-implementation-instruction-gate-core-pr2-5/v1",
]);

export function parsePullRequestTarget(value: string, defaultRepo?: string | null): PullRequestTarget {
  const input = value.trim();
  const urlMatch = input.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (urlMatch) {
    return target(urlMatch[1], urlMatch[2], Number(urlMatch[3]));
  }

  const repoHashMatch = input.match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/);
  if (repoHashMatch) {
    return target(repoHashMatch[1], repoHashMatch[2], Number(repoHashMatch[3]));
  }

  const repoPullMatch = input.match(/^([^/\s#]+)\/([^/\s#]+)\/pull\/(\d+)$/);
  if (repoPullMatch) {
    return target(repoPullMatch[1], repoPullMatch[2], Number(repoPullMatch[3]));
  }

  const localMatch = input.match(/^#?(\d+)$/);
  if (localMatch && defaultRepo) {
    const [owner, repo] = defaultRepo.split("/");
    if (owner && repo) {
      return target(owner, repo, Number(localMatch[1]));
    }
  }

  throw new Error("Invalid PR target. Expected a GitHub PR URL, owner/repo#123, owner/repo/pull/123, or a local PR number.");
}

export function readConveyorCheckSnapshotWithGh(prTarget: string, cwd = process.cwd()): ConveyorCheckSnapshot {
  const defaultRepo = detectDefaultRepo(cwd);
  const parsed = parsePullRequestTarget(prTarget, defaultRepo);
  const raw = execFileSync("gh", [
    "pr",
    "view",
    String(parsed.pr),
    "--repo",
    parsed.repo,
    "--json",
    [
      "number",
      "url",
      "body",
      "headRefOid",
      "baseRefName",
      "baseRefOid",
      "state",
      "isDraft",
      "mergedAt",
      "mergeable",
      "files",
      "labels",
      "comments",
      "statusCheckRollup",
    ].join(","),
  ], { cwd, encoding: "utf8" });
  const view = JSON.parse(raw) as GhPullRequestView;
  return snapshotFromGhView(parsed, view, cwd);
}

export function buildConveyorCheckReport(
  snapshot: ConveyorCheckSnapshot,
  options: BuildConveyorCheckOptions = {},
): ShirubeConveyorCheckReport {
  const repo = snapshot.repo ?? "unknown";
  const pr = snapshot.pr ?? 0;
  const prUrl = snapshot.pr_url ?? (repo !== "unknown" && pr > 0 ? `https://github.com/${repo}/pull/${pr}` : "unknown");
  const labels = sortedStrings(snapshot.labels ?? []);
  const changedFiles = snapshot.changed_files === undefined || snapshot.changed_files === null
    ? null
    : sortedStrings(snapshot.changed_files);
  const comments = snapshot.comments ?? [];
  const documents = snapshot.documents ?? [];
  const textSources = collectTextSources(snapshot.body, comments, documents);
  const bodySources = textSources.map((source) => source.body);
  const diffScope = classifyDiffScope(changedFiles ?? []);
  const stateLabels = labels.filter((label) => label.startsWith("state:"));
  const executor = extractExecutor(bodySources);
  const evidenceBlocks = extractEvidenceBlocks(bodySources);
  const legacyFlow = analyzeLegacyFlow(textSources, executor.release_owner, snapshot.head_sha ?? null);

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!snapshot.head_sha) addBlocker(blockers, "missing_pr_head_sha");
  if (!changedFiles) addBlocker(blockers, "missing_changed_files");
  if (diffScope.forbidden_hits.length > 0 && detectsDocsOrFixtureIntent(bodySources, labels)) {
    addBlocker(blockers, "docs_or_fixture_scope_contains_forbidden_path_classes");
  }
  if (detectsReleaseReadiness(bodySources, labels) && (!executor.release_executor || !executor.evidence_sink)) {
    addBlocker(blockers, "release_readiness_missing_release_executor_or_evidence_sink");
  }
  if (legacyFlow.detected) {
    addBlocker(blockers, "legacy_review_flow_detected");
  }
  if (legacyFlow.invalid_release_owner) {
    addBlocker(blockers, "invalid_release_owner_review_queue");
  }
  if (legacyFlow.completion_claim_without_exact_head_machine_gate) {
    addBlocker(blockers, "missing_exact_head_machine_gate_evidence");
  }

  if (diffScope.forbidden_hits.length > 0) warnings.push("protected_path_classes_present");
  if (stateLabels.length > 1) warnings.push("multiple_conveyor_state_labels");
  if (!snapshot.checks) warnings.push("github_check_summary_unavailable");
  if (evidenceBlocks.markers.length === 0) warnings.push("required_evidence_block_not_detected");
  if (snapshot.mergeable === null) warnings.push("mergeability_unknown");

  return {
    schema_version: "shirube-conveyor-check/v1",
    gate_version: "gate-completion-barrier/v1",
    repo,
    pr,
    pr_url: prUrl,
    observed_at: options.observedAt ?? new Date().toISOString(),
    head_sha: snapshot.head_sha ?? null,
    base_branch: snapshot.base_branch ?? null,
    base_sha: snapshot.base_sha ?? null,
    pr_state: {
      state: normalizeState(snapshot.state),
      draft: snapshot.draft ?? null,
      merged: snapshot.merged ?? null,
      mergeable: snapshot.mergeable ?? null,
    },
    diff_scope: diffScope,
    github_checks: {
      available: Boolean(snapshot.checks),
      required_checks_ok: null,
      summary: snapshot.checks ?? [],
    },
    conveyor_state: {
      labels,
      state_label: stateLabels.length === 1 ? stateLabels[0] : null,
      impossible_state: stateLabels.length > 1,
    },
    evidence_blocks: evidenceBlocks,
    executor,
    legacy_flow: {
      ...legacyFlow,
      can_proceed_by_machine_evidence: blockers.length === 0,
    },
    verdict: blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS",
    blockers,
    warnings,
  };
}

export function classifyDiffScope(paths: string[]): DiffScopeReport {
  const changedFiles = sortedStrings(paths);
  if (changedFiles.length === 0) {
    return { classification: "unknown", changed_files: [], forbidden_hits: [] };
  }

  const classes = changedFiles.map((filePath) => classifyPath(filePath));
  const uniqueClasses = Array.from(new Set(classes));
  const forbiddenHits = changedFiles
    .map((filePath, index) => ({ path: filePath, class: classes[index] }))
    .filter((hit): hit is DiffScopeForbiddenHit => FORBIDDEN_CLASSES.has(hit.class as DiffScopeForbiddenHit["class"]));

  if (uniqueClasses.every((entry) => entry === "docs_only" || entry === "fixtures")) {
    return {
      classification: uniqueClasses.includes("fixtures") ? "fixtures" : "docs_only",
      changed_files: changedFiles,
      forbidden_hits: forbiddenHits,
    };
  }

  return {
    classification: uniqueClasses.length === 1 ? uniqueClasses[0] : "mixed",
    changed_files: changedFiles,
    forbidden_hits: forbiddenHits,
  };
}

function snapshotFromGhView(parsed: PullRequestTarget, view: GhPullRequestView, cwd: string): ConveyorCheckSnapshot {
  const changedFiles = (view.files ?? []).map((file) => file.path).filter((filePath): filePath is string => Boolean(filePath));
  return {
    repo: parsed.repo,
    pr: view.number ?? parsed.pr,
    pr_url: view.url ?? parsed.pr_url,
    body: view.body ?? null,
    head_sha: view.headRefOid ?? null,
    base_branch: view.baseRefName ?? null,
    base_sha: view.baseRefOid ?? null,
    state: normalizeState(view.state),
    draft: view.isDraft ?? null,
    merged: Boolean(view.mergedAt),
    mergeable: normalizeMergeable(view.mergeable),
    changed_files: changedFiles,
    labels: (view.labels ?? []).map((label) => label.name).filter((label): label is string => Boolean(label)),
    comments: (view.comments ?? [])
      .map((comment) => ({ body: comment.body ?? "", url: comment.url }))
      .filter((comment) => comment.body.length > 0),
    documents: readChangedDocumentSources(changedFiles, cwd),
    checks: (view.statusCheckRollup ?? []).map(normalizeStatusCheck),
  };
}

function normalizeStatusCheck(check: GhStatusCheck): ConveyorCheckStatusSummary {
  return {
    name: check.name ?? check.context ?? "unknown",
    status: normalizeNullable(check.status ?? check.state),
    conclusion: normalizeNullable(check.conclusion),
    workflow_name: check.workflowName,
    details_url: check.detailsUrl ?? check.targetUrl,
  };
}

function normalizeMergeable(value: string | undefined): boolean | null {
  if (value === "MERGEABLE") return true;
  if (value === "CONFLICTING") return false;
  return null;
}

function normalizeState(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function normalizeNullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function detectDefaultRepo(cwd: string): string | null {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" }).trim();
    return parseRepoSlug(remote);
  } catch {
    return null;
  }
}

function target(owner: string, repo: string, pr: number): PullRequestTarget {
  return {
    repo: `${owner}/${repo}`,
    pr,
    pr_url: `https://github.com/${owner}/${repo}/pull/${pr}`,
  };
}

function classifyPath(filePath: string): DiffScopeClassification {
  const normalized = filePath.toLowerCase();
  if (isCiPath(normalized)) return "ci";
  if (isFixturePath(normalized)) return "fixtures";
  if (isDocsPath(normalized)) return "docs_only";
  if (isDbPath(normalized)) return "db";
  if (isAgentRoutingPath(normalized)) return "agent_routing";
  if (isSchedulerPath(normalized)) return "scheduler";
  if (isQueuePath(normalized)) return "queue";
  if (isPermissionPath(normalized)) return "permission";
  if (isDeployPath(normalized)) return "deploy";
  if (isRuntimePath(normalized)) return "runtime";
  return "unknown";
}

function isDocsPath(filePath: string): boolean {
  return filePath.startsWith("docs/") || filePath.endsWith(".md") || filePath.endsWith(".mdx");
}

function isFixturePath(filePath: string): boolean {
  return filePath.includes("/fixtures/") ||
    filePath.includes("/__fixtures__/") ||
    filePath.includes(".fixture.") ||
    filePath.endsWith(".example.json") ||
    filePath.endsWith(".example.yml") ||
    filePath.endsWith(".example.yaml");
}

function isRuntimePath(filePath: string): boolean {
  return filePath.startsWith("src/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith("bin/") ||
    filePath.endsWith(".ts") ||
    filePath.endsWith(".tsx") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx") ||
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs");
}

function isDbPath(filePath: string): boolean {
  return filePath.includes("migration") ||
    filePath.includes("prisma/") ||
    filePath.includes("schema.sql") ||
    filePath.includes("/db/") ||
    filePath.includes("database") ||
    filePath.endsWith(".sql") ||
    filePath.endsWith(".sqlite") ||
    filePath.endsWith(".db");
}

function isQueuePath(filePath: string): boolean {
  return filePath.includes("queue") ||
    filePath.includes("dispatch") ||
    filePath.includes("worker") ||
    filePath.includes("aun");
}

function isAgentRoutingPath(filePath: string): boolean {
  return filePath.includes("agent-routing") ||
    filePath.includes("agent_routing") ||
    filePath.includes("runner-policy") ||
    filePath.includes("runner_policy") ||
    filePath.includes("handoff") ||
    filePath.includes("dispatch");
}

function isSchedulerPath(filePath: string): boolean {
  return filePath.includes("scheduler") ||
    filePath.includes("cron") ||
    filePath.includes("launchagent");
}

function isPermissionPath(filePath: string): boolean {
  return filePath.includes("auth") ||
    filePath.includes("permission") ||
    filePath.includes("rbac") ||
    filePath.includes("role") ||
    filePath.includes("policy") ||
    filePath.includes("secret");
}

function isCiPath(filePath: string): boolean {
  return filePath.startsWith(".github/") ||
    filePath.includes("github/workflows") ||
    filePath.includes("ci/") ||
    filePath.includes("eslint") ||
    filePath.includes("vitest") ||
    filePath.includes("tsconfig") ||
    filePath === "package.json" ||
    filePath.includes("package-lock.json") ||
    filePath.includes("bun.lock") ||
    filePath.includes("pnpm-lock.yaml");
}

function isDeployPath(filePath: string): boolean {
  return filePath.includes("deploy") ||
    filePath.includes("dockerfile") ||
    filePath.includes("docker-compose") ||
    filePath.includes("terraform") ||
    filePath.includes("k8s/") ||
    filePath.includes("helm/") ||
    filePath.includes("vercel") ||
    filePath.includes("fly.toml") ||
    filePath.includes("render.yaml") ||
    filePath.includes("railway");
}

interface ConveyorCheckTextSource {
  source: "pr_body" | "comment" | "document";
  body: string;
  path?: string;
  url?: string;
}

interface LegacyFlowAnalysis {
  detected: boolean;
  invalid_release_owner: boolean;
  machine_gate_evidence_exact_head: boolean;
  completion_claim_without_exact_head_machine_gate: boolean;
  can_proceed_by_machine_evidence: boolean;
  findings: ConveyorCheckTextFinding[];
}

function collectTextSources(
  body: string | null | undefined,
  comments: ConveyorCheckComment[],
  documents: ConveyorCheckDocument[],
): ConveyorCheckTextSource[] {
  const sources: ConveyorCheckTextSource[] = [];
  if (body) sources.push({ source: "pr_body", body });
  for (const comment of comments) {
    sources.push({ source: "comment", body: comment.body, url: comment.url });
  }
  for (const document of documents) {
    sources.push({
      source: "document" as const,
      body: document.body,
      path: document.path,
      url: document.url,
    });
  }
  return sources.filter((source) => source.body.trim().length > 0);
}

function readChangedDocumentSources(changedFiles: string[], cwd: string): ConveyorCheckDocument[] {
  return changedFiles
    .filter((filePath) => filePath.startsWith("docs/") || filePath.endsWith(".md") || filePath.endsWith(".mdx"))
    .flatMap((filePath) => {
      const fullPath = join(cwd, filePath);
      if (!existsSync(fullPath)) return [];
      try {
        return [{ path: filePath, body: readFileSync(fullPath, "utf8") }];
      } catch {
        return [];
      }
    });
}

function analyzeLegacyFlow(
  sources: ConveyorCheckTextSource[],
  releaseOwner: string | null,
  headSha: string | null,
): LegacyFlowAnalysis {
  const findings: ConveyorCheckTextFinding[] = [];
  let detected = false;
  let completionClaimDetected = false;
  const machineGateEvidenceExactHead = hasExactHeadMachineGateEvidence(sources, headSha);

  for (const source of sources) {
    const skipLegacyRouteDetection = isArcInstructionSource(source.body);
    const lines = source.body.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!skipLegacyRouteDetection && isLegacyPrimaryGateLine(line)) {
        detected = true;
        findings.push(textFinding(source, "legacy_review_flow", line, index + 1));
      }
      if (!skipLegacyRouteDetection && isCompletionClaimLine(line)) {
        completionClaimDetected = true;
      }
    });
  }

  const invalidReleaseOwner = Boolean(releaseOwner && isReviewQueueValue(releaseOwner));
  if (releaseOwner && invalidReleaseOwner) {
    detected = true;
    findings.push({
      source: "executor",
      reason: "invalid_release_owner",
      field: "release_owner",
      excerpt: releaseOwner,
    });
  }

  const completionClaimWithoutExactHeadMachineGate = completionClaimDetected && !machineGateEvidenceExactHead;
  if (completionClaimWithoutExactHeadMachineGate) {
    findings.push({
      source: "pr_body",
      reason: "completion_claim_without_exact_head_machine_gate",
      excerpt: "completion claim requires shirube-conveyor-check/v1 evidence at the current head SHA",
    });
  }

  return {
    detected,
    invalid_release_owner: invalidReleaseOwner,
    machine_gate_evidence_exact_head: machineGateEvidenceExactHead,
    completion_claim_without_exact_head_machine_gate: completionClaimWithoutExactHeadMachineGate,
    can_proceed_by_machine_evidence: false,
    findings,
  };
}

function isArcInstructionSource(body: string): boolean {
  return body.includes("shirube:arc-rework-instruction/gate-completion-barrier") ||
    body.includes("shirube:arc-implementation-instruction-gate-completion-barrier");
}

function hasExactHeadMachineGateEvidence(sources: ConveyorCheckTextSource[], headSha: string | null): boolean {
  if (!headSha) return false;
  return sources.some((source) => {
    const normalized = source.body.toLowerCase();
    return source.body.includes(headSha) &&
      (normalized.includes("shirube-conveyor-check/v1") ||
        normalized.includes("shirube conveyor check") ||
        normalized.includes("machine_gate_evidence") ||
        normalized.includes("machine gate evidence"));
  });
}

function isLegacyPrimaryGateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!hasReviewQueueLanguage(trimmed) || isNegatedOrAdvisoryLine(trimmed)) return false;
  return /^\s*(?:[-*]\s*)?(?:next required review|next required route|next route|required review|review route|acceptance route|release route|primary next gate)\s*[:：]/i.test(trimmed) ||
    /\bPR2\.5\s+requires\b/i.test(trimmed) ||
    /\brequires\s+.*(?:before|after|then)\b/i.test(trimmed) ||
    /\broute(?:s|d)?\s+(?:to|through|into)\b/i.test(trimmed) ||
    /\bsend\s+.*\s+to\s+/i.test(trimmed);
}

function isCompletionClaimLine(line: string): boolean {
  const trimmed = line.trim();
  if (isNegatedOrAdvisoryLine(trimmed)) return false;
  return /\b(completion|complete|completed|ready to proceed|can proceed|ready for merge|merge[-_\s]?ready|merge readiness|release readiness|acceptance endpoint)\b/i.test(trimmed);
}

function hasReviewQueueLanguage(value: string): boolean {
  return isReviewQueueValue(value);
}

function isReviewQueueValue(value: string): boolean {
  return /\bL1\s*\/\s*L2\s*(?:re-)?audit\b/i.test(value) ||
    /\bL1\s+and\s+L2\s*(?:re-)?audit\b/i.test(value) ||
    /\bQA\s*\/\s*check\b/i.test(value) ||
    /\baudit\s*(?:then|->|→|and)\s*QA(?:\s*\/\s*check)?\b/i.test(value) ||
    /\blegacy\s+(?:audit|review)\s+(?:conveyor|flow|queue)\b/i.test(value);
}

function isNegatedOrAdvisoryLine(value: string): boolean {
  return /\b(do not|don't|must not|not\s+(?:route|send|restart|accept|approve|become|the primary)|rejected|superseded|advisory only|limited to verifying|cannot|should not|without|blocks with|returns? BLOCKED)\b/i.test(value);
}

function textFinding(
  source: ConveyorCheckTextSource,
  reason: ConveyorCheckTextFinding["reason"],
  line: string,
  lineNumber: number,
): ConveyorCheckTextFinding {
  return {
    source: source.source,
    reason,
    line: lineNumber,
    path: source.path,
    url: source.url,
    excerpt: line.trim(),
  };
}

function addBlocker(blockers: string[], blocker: string): void {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

function extractEvidenceBlocks(sources: string[]): ShirubeConveyorCheckReport["evidence_blocks"] {
  const markers = sortedStrings(
    sources.flatMap((source) => Array.from(source.matchAll(/<!--\s*([^>]+?)\s*-->/g), (match) => match[1].trim())),
  );
  return {
    available: markers.length > 0,
    markers,
    required_present: markers.some((marker) => REQUIRED_EVIDENCE_MARKERS.has(marker)),
    sources_checked: sources.length,
  };
}

function extractExecutor(sources: string[]): ShirubeConveyorCheckReport["executor"] {
  const releaseOwner = extractField(sources, ["release_owner", "release owner"]);
  const releaseExecutor = extractField(sources, ["release_executor", "release executor"]);
  const fallbackExecutor = extractField(sources, ["fallback_executor", "fallback executor"]);
  const evidenceSink = extractField(sources, ["evidence_sink", "evidence sink"]);
  return {
    release_owner: releaseOwner,
    release_executor: releaseExecutor,
    fallback_executor: fallbackExecutor,
    evidence_sink: evidenceSink,
    executor_bound: Boolean(releaseExecutor && evidenceSink),
  };
}

function extractField(sources: string[], names: string[]): string | null {
  for (const source of sources) {
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ _-]+");
      const match = source.match(new RegExp(`^\\s*(?:[-*]\\s*)?${escaped}\\s*[:：]\\s*(.+?)\\s*$`, "im"));
      const value = sanitizeFieldValue(match?.[1]);
      if (value) return value;
    }
  }
  return null;
}

function sanitizeFieldValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "null" || trimmed === "none" || /^<.*>$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function detectsDocsOrFixtureIntent(sources: string[], labels: string[]): boolean {
  if (labels.some((label) => ["docs-only", "fixture-only", "fixtures-only", "scope:docs-only", "scope:fixtures-only"].includes(label))) {
    return true;
  }
  return sources.some((source) => source.split(/\r?\n/).some(isDocsOrFixtureScopeLine));
}

function isDocsOrFixtureScopeLine(line: string): boolean {
  return /^\s*(?:[-*]\s*)?(?:scope|diff[_ -]?scope|change[_ -]?type|implementation[_ -]?class|pr[_ -]?scope|pr[_ -]?type)\s*[:：]\s*(?:docs[-_\s/]*(?:only|spec[-_\s/]*only)|fixtures?[-_\s/]*only|docs[-_\s/]*fixtures?[-_\s/]*only)\s*$/i.test(line);
}

function detectsReleaseReadiness(sources: string[], labels: string[]): boolean {
  const joined = [...sources, ...labels].join("\n").toLowerCase();
  return joined.includes("merge-ready") ||
    joined.includes("merge_ready") ||
    joined.includes("release readiness") ||
    joined.includes("merge readiness") ||
    joined.includes("cto verdict: go") ||
    joined.includes("verdict: go");
}

function sortedStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}
