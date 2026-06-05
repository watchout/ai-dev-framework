import {
  reconcileConveyor,
  type ConveyorMode,
  type ConveyorEvidenceSource,
  type ConveyorReconcilerConfig,
  type ConveyorPullRequestSnapshot,
  type ConveyorReconcileInput,
  type ConveyorReconcileReport,
} from "./conveyor-reconciler.js";

export type ConveyorRole = "implementation" | "l1" | "l2" | "l3" | "ceo" | "rework" | "blocked";

export interface ConveyorIssueSnapshot {
  repo: string;
  number: number;
  url?: string;
  title?: string;
  labels: string[];
  comments?: ConveyorEvidenceSource[];
}

export interface ConveyorManifestInput extends ConveyorReconcileInput {
  issues?: ConveyorIssueSnapshot[];
}

export interface ConveyorTarget {
  kind: "issue" | "pr";
  repo: string;
  number: number;
  url?: string;
  title?: string;
  head?: string;
  labels: string[];
  merge_state?: string;
  skipped: string[];
  findings: string[];
  reason?: string;
}

export interface ConveyorLaneManifest {
  role: ConveyorRole;
  query: string;
  targets: ConveyorTarget[];
}

export interface ConveyorTickManifest {
  schema: "shirube-conveyor-tick-manifest/v1";
  mode: ConveyorMode;
  execution_mode: "batch";
  judgment_unit: "pull_request";
  dependency_order: string[][];
  lanes: Record<ConveyorRole, ConveyorLaneManifest>;
  reconcile: ConveyorReconcileReport;
}

const ROLE_STATE: Partial<Record<ConveyorRole, string>> = {
  l1: "state:impl-l1",
  l2: "state:impl-l2",
  l3: "state:impl-l3",
  ceo: "state:ceo-approval",
  rework: "state:rework",
  blocked: "state:blocked",
};

const ROLE_QUERY: Record<ConveyorRole, string> = {
  implementation: "state:open label:needs:implementation",
  l1: "state:open label:state:impl-l1",
  l2: "state:open label:state:impl-l2",
  l3: "state:open label:state:impl-l3",
  ceo: "state:open label:state:ceo-approval",
  rework: "state:open label:state:rework",
  blocked: "state:open label:state:blocked",
};

export function buildConveyorTickManifest(input: ConveyorManifestInput, mode: ConveyorMode = "dry-run"): ConveyorTickManifest {
  const reconcile = reconcileConveyor(input, mode);
  const pullRequestsByKey = new Map(input.pull_requests.map((pr) => [targetKey(pr.repo, pr.number), pr]));
  const lanes = emptyLanes();

  for (const issue of input.issues ?? []) {
    if (issue.labels.includes("needs:implementation")) {
      lanes.implementation.targets.push(issueTarget(issue));
    }
  }

  for (const report of reconcile.prs) {
    const original = pullRequestsByKey.get(targetKey(report.repo, report.pr));
    const target = prTarget(report, original);
    for (const role of ["l1", "l2", "l3", "ceo", "rework", "blocked"] as const) {
      const state = ROLE_STATE[role];
      if (state && report.final_labels.includes(state)) {
        target.reason = reasonForTarget(target, role);
        lanes[role].targets.push(target);
        break;
      }
    }
  }

  for (const lane of Object.values(lanes)) {
    lane.targets.sort(compareTargets);
  }

  return {
    schema: "shirube-conveyor-tick-manifest/v1",
    mode,
    execution_mode: "batch",
    judgment_unit: "pull_request",
    dependency_order: dependencyOrder(input.config?.dependencies),
    lanes,
    reconcile,
  };
}

export function selectConveyorNextTarget(manifest: ConveyorTickManifest, role: ConveyorRole): ConveyorTarget | undefined {
  return manifest.lanes[role].targets[0];
}

export function isConveyorRole(value: string): value is ConveyorRole {
  return ["implementation", "l1", "l2", "l3", "ceo", "rework", "blocked"].includes(value);
}

function emptyLanes(): Record<ConveyorRole, ConveyorLaneManifest> {
  return {
    implementation: lane("implementation"),
    l1: lane("l1"),
    l2: lane("l2"),
    l3: lane("l3"),
    ceo: lane("ceo"),
    rework: lane("rework"),
    blocked: lane("blocked"),
  };
}

function lane(role: ConveyorRole): ConveyorLaneManifest {
  return {
    role,
    query: ROLE_QUERY[role],
    targets: [],
  };
}

function issueTarget(issue: ConveyorIssueSnapshot): ConveyorTarget {
  return {
    kind: "issue",
    repo: issue.repo,
    number: issue.number,
    url: issue.url,
    title: issue.title,
    labels: unique(issue.labels).sort(),
    skipped: [],
    findings: [],
  };
}

function prTarget(
  report: ConveyorReconcileReport["prs"][number],
  original: ConveyorPullRequestSnapshot | undefined,
): ConveyorTarget {
  return {
    kind: "pr",
    repo: report.repo,
    number: report.pr,
    url: original?.url,
    title: original?.title,
    head: report.head,
    labels: report.final_labels,
    merge_state: original?.merge_state,
    skipped: report.skipped,
    findings: report.findings,
  };
}

function reasonForTarget(target: ConveyorTarget, role: ConveyorRole): string | undefined {
  if (target.skipped.length > 0) return target.skipped.join(",");
  if (target.labels.includes("dependency-blocked")) return "dependency-blocked";
  if (role === "ceo") return "state:ceo-approval";
  if (role === "rework") return "state:rework";
  if (role === "blocked") return "state:blocked";
  return undefined;
}

function compareTargets(left: ConveyorTarget, right: ConveyorTarget): number {
  return left.repo === right.repo ? left.number - right.number : left.repo.localeCompare(right.repo);
}

function targetKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

function dependencyOrder(dependencies: ConveyorReconcilerConfig["dependencies"] | undefined): string[][] {
  const order: string[][] = [];
  for (const [repo, stacks] of Object.entries(dependencies ?? {})) {
    for (const stack of stacks) {
      order.push(stack.map((pr) => `${repo}#${pr}`));
    }
  }
  return order;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
