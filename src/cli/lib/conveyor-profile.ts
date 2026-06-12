import { createHash } from "node:crypto";
import type { ConveyorManifestInput } from "./conveyor-manifest.js";
import {
  buildConveyorRoleView,
  isConveyorActorRole,
  type ConveyorActorRole,
  type ConveyorRoleView,
  type ConveyorRoleViewTarget,
} from "./conveyor-role-view.js";
import type { ConveyorMode } from "./conveyor-reconciler.js";

export type ConveyorProfileRole =
  | ConveyorActorRole
  | "implementation_runner"
  | "l1_auditor"
  | "l2_auditor"
  | "l3_merge_authority"
  | "shirube_checker"
  | "aun_mirror";

export interface ConveyorProfileRepository {
  full_name: string;
  profile: string;
  product?: string;
  wave?: string;
  enabled: boolean;
  added_reason?: string;
}

export interface ConveyorProfileRoleQuery {
  include_labels?: string[];
  exclude_labels?: string[];
  legacy_include_labels?: string[];
  description?: string;
}

export interface ConveyorProjectProfile {
  schema: "shirube-conveyor-project-profile/v1";
  profile_id: string;
  profile_version: string;
  repo_scope_id: string;
  repositories: ConveyorProfileRepository[];
  role_queries?: Partial<Record<ConveyorProfileRole, ConveyorProfileRoleQuery>>;
  wip_limits?: Partial<Record<ConveyorProfileRole, number>>;
  context_recovery?: {
    preferred?: "wasurezu" | "bounded_context_pack" | "off";
    fallback?: "bounded_context_pack" | "none";
    require_recovery_before_dispatch?: boolean;
  };
  mutation_authority?: {
    labels?: "authorized_only" | "off";
    comments?: "authorized_only" | "off";
    check_results?: "authorized_only" | "off";
    cross_repo_code_edits?: "forbidden_without_target_work_order" | "off";
  };
}

export interface ConveyorProfileScopeChange {
  kind: "added" | "removed" | "disabled" | "profile_changed";
  repo: string;
  profile?: string;
  previous_profile?: string;
  reason?: string;
}

export interface ConveyorProfileSummary {
  profile_id: string;
  profile_version: string;
  profile_hash: string;
  repo_scope_id: string;
  repositories: ConveyorProfileRepository[];
  scope_changes: ConveyorProfileScopeChange[];
  context_recovery: ConveyorProjectProfile["context_recovery"];
  mutation_authority: ConveyorProjectProfile["mutation_authority"];
}

export interface ConveyorProfiledRoleView extends ConveyorRoleView {
  profile: ConveyorProfileSummary;
  profile_role: ConveyorProfileRole;
  normalized_role: ConveyorActorRole;
  role_query?: ConveyorProfileRoleQuery;
  profile_scope_changed: boolean;
}

export function buildProfiledConveyorRoleView(input: {
  manifest: ConveyorManifestInput;
  profile: ConveyorProjectProfile;
  previousProfile?: ConveyorProjectProfile;
  role: ConveyorProfileRole;
  mode?: ConveyorMode;
}): ConveyorProfiledRoleView {
  assertValidConveyorProfile(input.profile);
  if (input.previousProfile) assertValidConveyorProfile(input.previousProfile);
  const normalizedRole = normalizeConveyorProfileRole(input.role);
  const roleQuery = resolveRoleQuery(input.profile, input.role, normalizedRole);
  const filteredManifest = filterManifestByProfile(input.manifest, input.profile);
  const roleView = buildConveyorRoleView(filteredManifest, normalizedRole, input.mode ?? "dry-run");
  const targets = roleQuery ? roleView.targets.filter((target) => matchesRoleQuery(target, roleQuery)) : roleView.targets;
  const excludedByQuery = roleQuery
    ? roleView.targets
        .filter((target) => !matchesRoleQuery(target, roleQuery))
        .map((target) => ({
          repo: target.repo,
          pr: target.number,
          head: target.head,
          reason_codes: ["profile_role_query_excluded"],
        }))
    : [];
  const summary = summarizeConveyorProfile(input.profile, input.previousProfile);
  return {
    ...roleView,
    query: roleQuery ? roleQueryText(roleQuery) : roleView.query,
    targets: annotateTargetsWithRepoProfile(targets, input.profile),
    excluded: [...roleView.excluded, ...excludedByQuery],
    profile: summary,
    profile_role: input.role,
    normalized_role: normalizedRole,
    role_query: roleQuery,
    profile_scope_changed: summary.scope_changes.length > 0,
  };
}

export function assertValidConveyorProfile(profile: ConveyorProjectProfile): void {
  if (profile.schema !== "shirube-conveyor-project-profile/v1") {
    throw new Error("Invalid Conveyor profile schema.");
  }
  if (!profile.profile_id) throw new Error("Conveyor profile missing profile_id.");
  if (!profile.profile_version) throw new Error("Conveyor profile missing profile_version.");
  if (!profile.repo_scope_id) throw new Error("Conveyor profile missing repo_scope_id.");
  if (!Array.isArray(profile.repositories) || profile.repositories.length === 0) {
    throw new Error("Conveyor profile must include at least one repository.");
  }
  for (const repository of profile.repositories) {
    if (!repository.full_name || !repository.full_name.includes("/")) {
      throw new Error(`Invalid Conveyor profile repository: ${repository.full_name ?? "<missing>"}.`);
    }
    if (!repository.profile) {
      throw new Error(`Conveyor profile repository ${repository.full_name} missing profile.`);
    }
  }
}

export function normalizeConveyorProfileRole(role: ConveyorProfileRole): ConveyorActorRole {
  if (isConveyorActorRole(role)) return role;
  if (role === "implementation_runner") return "implementation";
  if (role === "l1_auditor") return "l1";
  if (role === "l2_auditor") return "l2";
  if (role === "l3_merge_authority") return "l3";
  if (role === "shirube_checker") return "checker";
  if (role === "aun_mirror") return "aun_mirror";
  throw new Error(`Invalid Conveyor profile role: ${role}.`);
}

export function isConveyorProfileRole(value: string): value is ConveyorProfileRole {
  return isConveyorActorRole(value) || [
    "implementation_runner",
    "l1_auditor",
    "l2_auditor",
    "l3_merge_authority",
    "shirube_checker",
    "aun_mirror",
  ].includes(value);
}

export function hashConveyorProfile(profile: ConveyorProjectProfile): string {
  return createHash("sha256").update(stableJson(profile)).digest("hex");
}

export function summarizeConveyorProfile(
  profile: ConveyorProjectProfile,
  previousProfile?: ConveyorProjectProfile,
): ConveyorProfileSummary {
  return {
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    profile_hash: hashConveyorProfile(profile),
    repo_scope_id: profile.repo_scope_id,
    repositories: profile.repositories.filter((repository) => repository.enabled).sort(compareRepositories),
    scope_changes: previousProfile ? scopeChanges(profile, previousProfile) : [],
    context_recovery: profile.context_recovery,
    mutation_authority: profile.mutation_authority,
  };
}

export function filterManifestByProfile(
  input: ConveyorManifestInput,
  profile: ConveyorProjectProfile,
): ConveyorManifestInput {
  const enabledRepos = new Set(profile.repositories.filter((repository) => repository.enabled).map((repository) => repository.full_name));
  return {
    ...input,
    issues: input.issues?.filter((issue) => enabledRepos.has(issue.repo)),
    pull_requests: input.pull_requests.filter((pr) => enabledRepos.has(pr.repo)),
  };
}

function resolveRoleQuery(
  profile: ConveyorProjectProfile,
  profileRole: ConveyorProfileRole,
  normalizedRole: ConveyorActorRole,
): ConveyorProfileRoleQuery | undefined {
  return profile.role_queries?.[profileRole] ?? profile.role_queries?.[normalizedRole];
}

function matchesRoleQuery(target: ConveyorRoleViewTarget, query: ConveyorProfileRoleQuery): boolean {
  const labels = new Set(target.labels);
  const required = [...(query.include_labels ?? [])];
  const legacy = query.legacy_include_labels ?? [];
  const includeMatch = required.length === 0 || required.every((label) => labels.has(label));
  const legacyMatch = legacy.length > 0 && legacy.every((label) => labels.has(label));
  const excludeMatch = (query.exclude_labels ?? []).some((label) => labels.has(label));
  return (includeMatch || legacyMatch) && !excludeMatch;
}

function annotateTargetsWithRepoProfile(
  targets: ConveyorRoleViewTarget[],
  profile: ConveyorProjectProfile,
): ConveyorRoleViewTarget[] {
  const profileByRepo = new Map(profile.repositories.map((repository) => [repository.full_name, repository.profile]));
  return targets.map((target) => ({
    ...target,
    reason_codes: unique([
      ...target.reason_codes,
      `repo_profile:${profileByRepo.get(target.repo) ?? "unknown"}`,
    ]),
  }));
}

function scopeChanges(
  profile: ConveyorProjectProfile,
  previousProfile: ConveyorProjectProfile,
): ConveyorProfileScopeChange[] {
  const current = new Map(profile.repositories.map((repository) => [repository.full_name, repository]));
  const previous = new Map(previousProfile.repositories.map((repository) => [repository.full_name, repository]));
  const changes: ConveyorProfileScopeChange[] = [];
  for (const [repo, repository] of current) {
    const old = previous.get(repo);
    if (!old) {
      changes.push({ kind: "added", repo, profile: repository.profile, reason: repository.added_reason });
      continue;
    }
    if (old.enabled && !repository.enabled) {
      changes.push({ kind: "disabled", repo, profile: repository.profile });
    }
    if (old.profile !== repository.profile) {
      changes.push({ kind: "profile_changed", repo, profile: repository.profile, previous_profile: old.profile });
    }
  }
  for (const [repo, repository] of previous) {
    if (!current.has(repo)) {
      changes.push({ kind: "removed", repo, previous_profile: repository.profile });
    }
  }
  return changes.sort((a, b) => a.repo.localeCompare(b.repo) || a.kind.localeCompare(b.kind));
}

function roleQueryText(query: ConveyorProfileRoleQuery): string {
  const include = query.include_labels?.join(",") ?? "-";
  const legacy = query.legacy_include_labels?.join(",") ?? "-";
  const exclude = query.exclude_labels?.join(",") ?? "-";
  return `profile query include=[${include}] legacy=[${legacy}] exclude=[${exclude}]`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareRepositories(left: ConveyorProfileRepository, right: ConveyorProfileRepository): number {
  return left.full_name.localeCompare(right.full_name);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
