import {
  type FrameworkConfig,
  type RequiredRoleName,
  type RoleBinding,
} from "./workflow-config.js";

export type MergeAuthorityRole =
  | "l3_governance_owner"
  | "release_owner"
  | "human_approver";

export type MergeAuthorityAuditLevel = "minimal" | "standard" | "strict";

export type MergeAuthorityReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED";

export interface MergeAuthorityPullRequest {
  number: number;
  headRefOid: string;
  baseRefName: string;
  isDraft?: boolean;
  labels: string[];
}

export interface MergeAuthorityReview {
  author: string;
  state: MergeAuthorityReviewState;
  commitId: string;
  submittedAt: string;
  dismissed?: boolean;
}

export interface MergeAuthorityOwnerDecisionComment {
  author: string;
  body: string;
  createdAt: string;
  url?: string;
}

export interface MergeAuthorityOwnerDecisionEvidence {
  type: "owner_decision_comment";
  author: string;
  decision: "APPROVED" | "APPROVED_EXACT_HEAD";
  targetHead: string;
  targetPr?: number;
  submittedAt: string;
  url?: string;
}

export type MergeAuthorityEvidence =
  | MergeAuthorityReview
  | MergeAuthorityOwnerDecisionEvidence;

export interface MergeAuthorityInput {
  config: FrameworkConfig;
  pullRequest: MergeAuthorityPullRequest;
  reviews: MergeAuthorityReview[];
  ownerDecisionComments?: MergeAuthorityOwnerDecisionComment[];
  auditLevel: MergeAuthorityAuditLevel | string;
  teamMembers?: Record<string, string[]>;
}

export interface RequiredAuthorityEvidence {
  role: MergeAuthorityRole;
  binding?: RoleBinding;
  githubIdentity?: string;
  evidence?: MergeAuthorityEvidence;
}

export type MergeAuthorityDecision =
  | {
      status: "pass";
      required: RequiredAuthorityEvidence[];
      details: string[];
    }
  | {
      status: "block";
      reason: string;
      missing: RequiredAuthorityEvidence[];
      details: string[];
    };

const AUTHORITY_ROLES: MergeAuthorityRole[] = [
  "l3_governance_owner",
  "release_owner",
  "human_approver",
];

const PRODUCER_ROLES: RequiredRoleName[] = ["implementation_lead", "worker_pool"];

export function evaluateMergeAuthority(
  input: MergeAuthorityInput,
): MergeAuthorityDecision {
  const details: string[] = [];
  const missing: RequiredAuthorityEvidence[] = [];

  const route = resolveRoute(input.pullRequest.labels);
  if (route.status === "missing" || route.status === "ambiguous") {
    details.push(route.reason);
  }

  const auditLevel = parseAuditLevel(input.auditLevel);
  if (!auditLevel) {
    return block("unknown_audit_level", missing, [
      ...details,
      `Unknown audit level: ${input.auditLevel}`,
    ]);
  }

  const policy = input.config.workflow?.publishPolicy ?? "draft_only";
  if (policy === "draft_only") {
    return block("publish_policy_draft_only", missing, [
      ...details,
      "workflow.publishPolicy=draft_only blocks remote merge",
    ]);
  }
  if (policy !== "approval_required" && policy !== "auto_publish") {
    return block("unknown_publish_policy", missing, [
      ...details,
      `Unknown workflow.publishPolicy: ${String(policy)}`,
    ]);
  }

  const requiredRoles = requiredAuthorityRoles(route.route, policy, auditLevel);
  const producerActorKeys = resolveProducerActorKeys(input.config);
  const required: RequiredAuthorityEvidence[] = [];

  for (const role of requiredRoles) {
    const binding = input.config.roles?.bindings?.[role];
    if (!binding) {
      missing.push({ role });
      details.push(`${role}: missing role binding`);
      continue;
    }
    if (binding.placeholder) {
      missing.push({ role, binding });
      details.push(`${role}: placeholder role binding`);
      continue;
    }
    const identities = resolveGithubIdentities(binding, input.teamMembers);
    if (identities.length === 0) {
      missing.push({ role, binding });
      details.push(`${role}: role binding does not resolve to a GitHub identity`);
      continue;
    }
    if (identities.some((identity) => producerActorKeys.has(identity))) {
      missing.push({ role, binding });
      details.push(`${role}: producer actor cannot satisfy authority evidence`);
      continue;
    }

    const evidence = findRoleEvidence(
      input.pullRequest.number,
      input.pullRequest.headRefOid,
      input.reviews,
      input.ownerDecisionComments ?? [],
      identities,
    );
    if (!evidence) {
      missing.push({ role, binding, githubIdentity: identities.join(",") });
      details.push(
        `${role}: no current-head APPROVED review or owner_decision comment from configured actor`,
      );
      continue;
    }
    required.push({
      role,
      binding,
      githubIdentity: identities.join(","),
      evidence,
    });
  }

  if (route.status === "missing" || route.status === "ambiguous") {
    return block(route.status === "missing" ? "missing_route" : "ambiguous_route", missing, details);
  }
  if (missing.length > 0) {
    return block("missing_authority_evidence", missing, details);
  }

  return {
    status: "pass",
    required,
    details,
  };
}

function requiredAuthorityRoles(
  route: "fast" | "ceo",
  publishPolicy: "approval_required" | "auto_publish",
  auditLevel: MergeAuthorityAuditLevel,
): MergeAuthorityRole[] {
  const roles = new Set<MergeAuthorityRole>();

  if (route === "fast") {
    roles.add("l3_governance_owner");
  } else {
    roles.add("l3_governance_owner");
    roles.add("release_owner");
    roles.add("human_approver");
  }

  if (publishPolicy === "approval_required") {
    roles.add("human_approver");
  }

  if (auditLevel === "strict") {
    roles.add("l3_governance_owner");
  }
  if (auditLevel === "standard") {
    roles.add("release_owner");
    roles.add("l3_governance_owner");
  }

  return AUTHORITY_ROLES.filter((role) => roles.has(role));
}

function resolveRoute(labels: string[]):
  | { status: "ready"; route: "fast" | "ceo" }
  | { status: "missing"; route: "ceo"; reason: string }
  | { status: "ambiguous"; route: "ceo"; reason: string } {
  const routeLabels = labels.filter((label) => label.startsWith("route:"));
  if (routeLabels.length === 0) {
    return {
      status: "missing",
      route: "ceo",
      reason: "missing route label; treating required roles as route:ceo-approval",
    };
  }
  if (routeLabels.length > 1) {
    return {
      status: "ambiguous",
      route: "ceo",
      reason: `ambiguous route labels: ${routeLabels.join(", ")}`,
    };
  }
  if (routeLabels[0] === "route:fast-merge") {
    return { status: "ready", route: "fast" };
  }
  if (routeLabels[0] === "route:ceo-approval") {
    return { status: "ready", route: "ceo" };
  }
  return {
    status: "ambiguous",
    route: "ceo",
    reason: `unknown route label: ${routeLabels[0]}`,
  };
}

function parseAuditLevel(value: string): MergeAuthorityAuditLevel | null {
  if (value === "minimal" || value === "standard" || value === "strict") {
    return value;
  }
  return null;
}

function resolveGithubIdentities(
  binding: RoleBinding,
  teamMembers: Record<string, string[]> = {},
): string[] {
  if (binding.type === "github_user") {
    return [normalizeActor(binding.id)];
  }
  if (binding.type === "github_team") {
    return (teamMembers[normalizeTeam(binding.id)] ?? []).map(normalizeActor);
  }
  return [];
}

function resolveProducerActorKeys(config: FrameworkConfig): Set<string> {
  const keys = new Set<string>();
  const bindings = config.roles?.bindings ?? {};
  for (const role of PRODUCER_ROLES) {
    const binding = bindings[role];
    if (!binding || binding.placeholder) {
      continue;
    }
    keys.add(normalizeActor(binding.id));
  }
  return keys;
}

interface AuthorityCandidate {
  submittedAt: string;
  approved: boolean;
  evidence?: MergeAuthorityEvidence;
}

interface ParsedOwnerDecision {
  author: string;
  decision: string;
  targetHead: string;
  targetPr?: number;
  submittedAt: string;
  url?: string;
  mergeAuthorized?: boolean;
}

const OWNER_DECISION_SCHEMA = "shirube-owner-decision/v1";

function findRoleEvidence(
  prNumber: number,
  headRefOid: string,
  reviews: MergeAuthorityReview[],
  ownerDecisionComments: MergeAuthorityOwnerDecisionComment[],
  identities: string[],
): MergeAuthorityEvidence | null {
  const identitySet = new Set(identities.map(normalizeActor));
  const reviewCandidates: AuthorityCandidate[] = reviews
    .filter((review) => review.commitId === headRefOid)
    .filter((review) => !review.dismissed && review.state !== "DISMISSED")
    .filter((review) => identitySet.has(normalizeActor(review.author)))
    .map((review) => ({
      submittedAt: review.submittedAt,
      approved: review.state === "APPROVED",
      evidence: review,
    }));

  const ownerDecisionCandidates = ownerDecisionComments
    .flatMap(parseOwnerDecisionComment)
    .filter((decision) => identitySet.has(normalizeActor(decision.author)))
    .filter((decision) => decision.targetHead === normalizeSha(headRefOid))
    .filter((decision) => decision.targetPr === undefined || decision.targetPr === prNumber)
    .map((decision) => {
      const approvedDecision = normalizeOwnerDecisionApproval(decision.decision);
      return {
        submittedAt: decision.submittedAt,
        approved: approvedDecision !== null && decision.mergeAuthorized !== false,
        evidence: approvedDecision
          ? {
              type: "owner_decision_comment" as const,
              author: decision.author,
              decision: approvedDecision,
              targetHead: decision.targetHead,
              targetPr: decision.targetPr,
              submittedAt: decision.submittedAt,
              url: decision.url,
            }
          : undefined,
      };
    });

  const latest = [...reviewCandidates, ...ownerDecisionCandidates].sort(
    (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  )[0];

  if (!latest || !latest.approved || !latest.evidence) {
    return null;
  }
  return latest.evidence;
}

function parseOwnerDecisionComment(
  comment: MergeAuthorityOwnerDecisionComment,
): ParsedOwnerDecision[] {
  return extractYamlBlocks(comment.body)
    .map(parseOwnerDecisionBlock)
    .filter((decision): decision is Omit<ParsedOwnerDecision, "author" | "submittedAt" | "url"> =>
      decision !== null,
    )
    .map((decision) => ({
      ...decision,
      author: comment.author,
      submittedAt: comment.createdAt,
      url: comment.url,
    }));
}

function extractYamlBlocks(body: string): string[] {
  const blocks: string[] = [];
  const fencePattern = /```(?:ya?ml)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(body)) !== null) {
    const block = match[1] ?? "";
    if (block.includes(OWNER_DECISION_SCHEMA)) {
      blocks.push(block);
    }
  }
  if (blocks.length === 0 && body.includes(OWNER_DECISION_SCHEMA)) {
    blocks.push(body);
  }
  return blocks;
}

function parseOwnerDecisionBlock(
  block: string,
): Omit<ParsedOwnerDecision, "author" | "submittedAt" | "url"> | null {
  if (parseScalar(block, "schema_version") !== OWNER_DECISION_SCHEMA) {
    return null;
  }

  const targetHead = parseScalar(block, "target_head") ?? parseScalar(block, "exact_head_sha");
  const decision = parseScalar(block, "decision");
  if (!targetHead || !decision) {
    return null;
  }

  const targetPr = parseNumberScalar(block, "target_pr");
  return {
    decision: decision.toUpperCase(),
    targetHead: normalizeSha(targetHead),
    targetPr: targetPr ?? undefined,
    mergeAuthorized: parseBooleanScalar(block, "merge_authorized") ?? undefined,
  };
}

function normalizeOwnerDecisionApproval(
  decision: string,
): MergeAuthorityOwnerDecisionEvidence["decision"] | null {
  const normalized = decision.toUpperCase();
  if (normalized === "APPROVED" || normalized === "APPROVED_EXACT_HEAD") {
    return normalized;
  }
  return null;
}

function parseScalar(block: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = block.match(pattern);
  if (!match) {
    return null;
  }
  return cleanScalar(match[1] ?? "");
}

function parseNumberScalar(block: string, key: string): number | null {
  const value = parseScalar(block, key);
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBooleanScalar(block: string, key: string): boolean | null {
  const value = parseScalar(block, key)?.toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function cleanScalar(value: string): string {
  const withoutComment = value.replace(/\s+#.*$/, "").trim();
  if (
    (withoutComment.startsWith("\"") && withoutComment.endsWith("\"")) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1).trim();
  }
  return withoutComment.trim();
}

function normalizeSha(value: string): string {
  return value.trim().replace(/^`|`$/g, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function block(
  reason: string,
  missing: RequiredAuthorityEvidence[],
  details: string[],
): MergeAuthorityDecision {
  return {
    status: "block",
    reason,
    missing,
    details,
  };
}

function normalizeActor(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTeam(value: string): string {
  return value.trim().toLowerCase();
}
