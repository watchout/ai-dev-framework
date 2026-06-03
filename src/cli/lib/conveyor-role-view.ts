import {
  buildConveyorTickManifest,
  type ConveyorManifestInput,
  type ConveyorRole,
  type ConveyorTarget,
} from "./conveyor-manifest.js";
import type { ConveyorMode, ConveyorPullRequestSnapshot } from "./conveyor-reconciler.js";

export type ConveyorActorRole = ConveyorRole | "checker" | "aun_mirror";

export interface ConveyorRoleViewTarget extends ConveyorTarget {
  reason_codes: string[];
}

export interface ConveyorRoleView {
  schema: "shirube-conveyor-role-view/v1";
  mode: ConveyorMode;
  role: ConveyorActorRole;
  query: string;
  writable_add_labels: string[];
  writable_remove_labels: string[];
  forbidden_add_labels: string[];
  targets: ConveyorRoleViewTarget[];
  excluded: Array<{
    repo: string;
    pr: number;
    head?: string;
    reason_codes: string[];
  }>;
  authority_notes: string[];
}

export interface ConveyorRoleAuthorityCheck {
  schema: "shirube-conveyor-role-authority-check/v1";
  role: ConveyorActorRole;
  authorized: boolean;
  add: string[];
  remove: string[];
  violations: Array<{ label: string; operation: "add" | "remove"; reason: string }>;
}

const ACTOR_ROLES: ConveyorActorRole[] = [
  "implementation",
  "l1",
  "l2",
  "l3",
  "ceo",
  "rework",
  "blocked",
  "checker",
  "aun_mirror",
];

const ROLE_QUERIES: Record<ConveyorActorRole, string> = {
  implementation: "state:open label:needs:implementation OR label:state:start OR label:state:rework",
  l1: "state:open label:state:impl-l1",
  l2: "state:open label:state:impl-l2 label:audit:l1-passed OR label:audit:l2-required",
  l3: "state:open label:state:impl-l3 with required prior audit pass",
  ceo: "state:open label:state:ceo-approval",
  rework: "state:open label:state:rework",
  blocked: "state:open label:state:blocked",
  checker: "state:open degraded/impossible conveyor state",
  aun_mirror: "state:open GitHub-referenced Conveyor work, read-only",
};

const WRITABLE_ADD: Record<ConveyorActorRole, string[]> = {
  implementation: [
    "implementing",
    "evidence-ready",
    "audit-pending",
    "rework-implementing",
    "state:start",
    "state:rework",
    "state:impl-l1",
    "audit:l1-pending",
    "needs:l1-audit",
  ],
  l1: [
    "audit:l1-passed",
    "changes-requested",
    "audit:l2-required",
    "blocked-stop-lane",
    "foundation-blocker",
    "state:impl-l2",
    "state:impl-l3",
    "state:rework",
    "audit:l2-pending",
    "audit:l3-pending",
    "needs:l2-audit",
    "needs:l3-review",
  ],
  l2: [
    "audit:l2-passed",
    "changes-requested",
    "audit:l3-required",
    "blocked-stop-lane",
    "foundation-blocker",
    "state:impl-l3",
    "state:rework",
    "audit:l3-pending",
    "needs:l3-review",
  ],
  l3: [
    "audit:l3-passed",
    "merge-ready",
    "changes-requested",
    "blocked-stop-lane",
    "foundation-blocker",
    "state:done",
    "state:rework",
  ],
  ceo: ["route:ceo-approved", "route:ceo-rejected", "state:impl-l3", "state:rework"],
  rework: ["state:impl-l1", "audit:l1-pending", "needs:l1-audit", "evidence-ready", "audit-pending"],
  blocked: ["state:rework", "changes-requested"],
  checker: ["changes-requested", "blocked-stop-lane", "foundation-blocker", "dependency-blocked"],
  aun_mirror: [],
};

const WRITABLE_REMOVE: Record<ConveyorActorRole, string[]> = {
  ...WRITABLE_ADD,
  checker: [
    "merge-ready",
    "audit:l1-passed",
    "audit:l2-passed",
    "audit:l3-passed",
    "state:done",
    "dependency-blocked",
  ],
  aun_mirror: [],
};

const FORBIDDEN_ADD: Record<ConveyorActorRole, string[]> = {
  implementation: ["audit:l1-passed", "audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  l1: ["audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  l2: ["audit:l1-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  l3: ["merged_closed"],
  ceo: ["audit:l1-passed", "audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  rework: ["audit:l1-passed", "audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  blocked: ["audit:l1-passed", "audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  checker: ["audit:l1-passed", "audit:l2-passed", "audit:l3-passed", "merge-ready", "merged_closed", "state:done"],
  aun_mirror: ["*"],
};

export function buildConveyorRoleView(
  input: ConveyorManifestInput,
  role: ConveyorActorRole,
  mode: ConveyorMode = "dry-run",
): ConveyorRoleView {
  const manifest = buildConveyorTickManifest(input, mode);
  const excluded: ConveyorRoleView["excluded"] = [];
  const targets = roleTargets(input, role, manifest)
    .map((target) => targetWithReasons(target, input))
    .filter((target) => {
      const reasonCodes = exclusionReasons(role, target);
      if (reasonCodes.length > 0) {
        excluded.push({ repo: target.repo, pr: target.number, head: target.head, reason_codes: reasonCodes });
        return false;
      }
      return true;
    })
    .sort(compareTargets);

  return {
    schema: "shirube-conveyor-role-view/v1",
    mode,
    role,
    query: ROLE_QUERIES[role],
    writable_add_labels: WRITABLE_ADD[role],
    writable_remove_labels: WRITABLE_REMOVE[role],
    forbidden_add_labels: FORBIDDEN_ADD[role],
    targets,
    excluded,
    authority_notes: authorityNotes(role),
  };
}

export function selectConveyorRoleNextTarget(view: ConveyorRoleView): ConveyorRoleViewTarget | undefined {
  return view.targets[0];
}

export function validateConveyorRoleLabelChange(input: {
  role: ConveyorActorRole;
  add?: string[];
  remove?: string[];
}): ConveyorRoleAuthorityCheck {
  const add = unique(input.add ?? []);
  const remove = unique(input.remove ?? []);
  const violations = [
    ...add.flatMap((label) => labelViolations(input.role, label, "add" as const)),
    ...remove.flatMap((label) => labelViolations(input.role, label, "remove" as const)),
  ];
  return {
    schema: "shirube-conveyor-role-authority-check/v1",
    role: input.role,
    authorized: violations.length === 0,
    add,
    remove,
    violations,
  };
}

export function isConveyorActorRole(value: string): value is ConveyorActorRole {
  return ACTOR_ROLES.includes(value as ConveyorActorRole);
}

function roleTargets(
  input: ConveyorManifestInput,
  role: ConveyorActorRole,
  manifest: ReturnType<typeof buildConveyorTickManifest>,
): ConveyorTarget[] {
  if (role === "checker") {
    return input.pull_requests.map((pr) => targetFromPr(pr, checkerReasonCodes(pr, manifest)));
  }
  if (role === "aun_mirror") {
    return [
      ...manifest.lanes.implementation.targets,
      ...manifest.lanes.l1.targets,
      ...manifest.lanes.l2.targets,
      ...manifest.lanes.l3.targets,
      ...manifest.lanes.ceo.targets,
      ...manifest.lanes.rework.targets,
      ...manifest.lanes.blocked.targets,
    ];
  }
  if (role === "implementation") {
    return [
      ...manifest.lanes.implementation.targets,
      ...manifest.lanes.rework.targets,
      ...input.pull_requests
        .filter((pr) => pr.labels.includes("state:start"))
        .map((pr) => targetFromPr(pr, ["state:start"])),
    ];
  }
  return manifest.lanes[role].targets;
}

function targetWithReasons(target: ConveyorTarget, input: ConveyorManifestInput): ConveyorRoleViewTarget {
  const source = input.pull_requests.find((pr) => pr.repo === target.repo && pr.number === target.number);
  const reasonCodes = unique([
    ...(target.reason ? [target.reason] : []),
    ...target.skipped,
    ...target.findings,
    ...(source ? checkerReasonCodes(source) : []),
  ]);
  return { ...target, reason_codes: reasonCodes };
}

function exclusionReasons(role: ConveyorActorRole, target: ConveyorRoleViewTarget): string[] {
  if (role === "checker") {
    return target.reason_codes.length > 0 ? [] : ["no_checker_action"];
  }
  if (role === "l2" && !target.labels.includes("audit:l1-passed") && !target.labels.includes("audit:l2-required")) {
    return ["l2_requires_l1_pass_or_route"];
  }
  if (role === "l3") {
    if (target.labels.includes("audit:l2-required") && !target.labels.includes("audit:l2-passed")) {
      return ["l3_requires_l2_pass"];
    }
    if (!target.labels.includes("audit:l1-passed") && !target.labels.includes("audit:l2-passed")) {
      return ["l3_requires_prior_audit_pass"];
    }
  }
  if ((role === "l2" || role === "l3") && isDirtyOrConflicting(target.merge_state)) {
    return ["dirty_or_conflicting_pr"];
  }
  return [];
}

function checkerReasonCodes(pr: ConveyorPullRequestSnapshot, manifest = buildConveyorTickManifest({ pull_requests: [pr] })): string[] {
  const report = manifest.reconcile.prs.find((item) => item.repo === pr.repo && item.pr === pr.number);
  return unique([
    ...(report?.skipped ?? []),
    ...(report?.findings ?? []),
    ...(isDirtyOrConflicting(pr.merge_state) && pr.labels.includes("audit-pending") ? ["dirty_audit_pending"] : []),
    ...(pr.labels.includes("audit-pending") && !hasConveyorEvidence(pr) ? ["missing_pr_conveyor_evidence"] : []),
  ]);
}

function labelViolations(
  role: ConveyorActorRole,
  label: string,
  operation: "add" | "remove",
): Array<{ label: string; operation: "add" | "remove"; reason: string }> {
  if (role === "aun_mirror") {
    return [{ label, operation, reason: "aun_mirror_is_read_only" }];
  }
  if (operation === "add" && (FORBIDDEN_ADD[role].includes("*") || FORBIDDEN_ADD[role].includes(label))) {
    return [{ label, operation, reason: "role_forbidden_final_or_foreign_authority_label" }];
  }
  const allowed = operation === "add" ? WRITABLE_ADD[role] : WRITABLE_REMOVE[role];
  if (!allowed.includes(label)) {
    return [{ label, operation, reason: "label_not_writable_by_role" }];
  }
  return [];
}

function targetFromPr(pr: ConveyorPullRequestSnapshot, reasonCodes: string[] = []): ConveyorRoleViewTarget {
  return {
    kind: "pr",
    repo: pr.repo,
    number: pr.number,
    url: pr.url,
    title: pr.title,
    head: pr.head,
    labels: unique(pr.labels).sort(),
    merge_state: pr.merge_state,
    skipped: [],
    findings: [],
    reason_codes: reasonCodes,
  };
}

function hasConveyorEvidence(pr: ConveyorPullRequestSnapshot): boolean {
  return [...(pr.comments ?? []), ...(pr.reviews ?? [])].some((source) =>
    source.body.includes("<!-- conveyor:audit-result/v1 -->"),
  );
}

function authorityNotes(role: ConveyorActorRole): string[] {
  if (role === "aun_mirror") return ["read_only_mirror", "github_labels_remain_ssot"];
  if (role === "checker") return ["metadata_only", "no_product_implementation", "no_merge_authority"];
  if (role === "implementation") return ["no_audit_pass", "no_merge_authority"];
  if (role === "l1" || role === "l2") return ["audit_only", "no_product_implementation", "no_merge_authority"];
  if (role === "l3") return ["merge_authority_only_after_unresolved_blockers_clear"];
  return [];
}

function isDirtyOrConflicting(value: string | undefined): boolean {
  return value === "DIRTY" || value === "CONFLICTING";
}

function compareTargets(left: ConveyorTarget, right: ConveyorTarget): number {
  return left.repo === right.repo ? left.number - right.number : left.repo.localeCompare(right.repo);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
