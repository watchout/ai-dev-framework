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

export interface MergeAuthorityInput {
  config: FrameworkConfig;
  pullRequest: MergeAuthorityPullRequest;
  reviews: MergeAuthorityReview[];
  auditLevel: MergeAuthorityAuditLevel | string;
  teamMembers?: Record<string, string[]>;
}

export interface RequiredAuthorityEvidence {
  role: MergeAuthorityRole;
  binding?: RoleBinding;
  githubIdentity?: string;
  evidence?: MergeAuthorityReview;
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

    const evidence = findRoleEvidence(input.pullRequest.headRefOid, input.reviews, identities);
    if (!evidence) {
      missing.push({ role, binding, githubIdentity: identities.join(",") });
      details.push(`${role}: no current-head APPROVED review from configured actor`);
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

function findRoleEvidence(
  headRefOid: string,
  reviews: MergeAuthorityReview[],
  identities: string[],
): MergeAuthorityReview | null {
  const identitySet = new Set(identities.map(normalizeActor));
  const latest = reviews
    .filter((review) => review.commitId === headRefOid)
    .filter((review) => !review.dismissed && review.state !== "DISMISSED")
    .filter((review) => identitySet.has(normalizeActor(review.author)))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];

  if (!latest || latest.state !== "APPROVED") {
    return null;
  }
  return latest;
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
