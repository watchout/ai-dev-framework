import type {
  ConveyorPullRequestSnapshot,
  ConveyorReconcileInput,
} from "./conveyor-reconciler.js";

export interface ConveyorStackBlockedDependent {
  repo: string;
  pr: number;
  head: string;
  blocker_pr: number;
  blocker_labels: string[];
  current_state?: string;
  recommended_add: string[];
  recommended_remove: string[];
  blocked_final_signals: string[];
  reason: string;
}

export interface ConveyorStackGateReport {
  schema: "shirube-conveyor-stack-gate-report/v1";
  safe_to_advance_dependents: boolean;
  blocked_dependents: ConveyorStackBlockedDependent[];
  independent_stacks_clear: number;
}

const LOWER_BLOCKER_LABELS = ["foundation-blocker", "blocked-stop-lane"];
const FINAL_ADVANCEMENT_LABELS = [
  "merge-ready",
  "audit:l1-passed",
  "audit:l2-passed",
  "audit:l3-passed",
  "state:done",
];

export function buildConveyorStackGateReport(input: ConveyorReconcileInput): ConveyorStackGateReport {
  const byRepoAndNumber = new Map(input.pull_requests.map((pr) => [prKey(pr.repo, pr.number), pr]));
  const blockedDependents: ConveyorStackBlockedDependent[] = [];
  let independentStacksClear = 0;

  for (const [repo, stacks] of Object.entries(input.config?.dependencies ?? {})) {
    for (const stack of stacks) {
      const blockers = lowerBlockers(repo, stack, byRepoAndNumber);
      if (blockers.length === 0) {
        independentStacksClear += 1;
        continue;
      }
      for (const blocker of blockers) {
        for (const dependentNumber of stack.slice(stack.indexOf(blocker.number) + 1)) {
          const dependent = byRepoAndNumber.get(prKey(repo, dependentNumber));
          if (!dependent) continue;
          blockedDependents.push(blockedDependent(blocker, dependent));
        }
      }
    }
  }

  return {
    schema: "shirube-conveyor-stack-gate-report/v1",
    safe_to_advance_dependents: blockedDependents.length === 0,
    blocked_dependents: dedupeBlockedDependents(blockedDependents),
    independent_stacks_clear: independentStacksClear,
  };
}

function lowerBlockers(
  repo: string,
  stack: number[],
  byRepoAndNumber: Map<string, ConveyorPullRequestSnapshot>,
): ConveyorPullRequestSnapshot[] {
  return stack
    .map((number) => byRepoAndNumber.get(prKey(repo, number)))
    .filter((pr): pr is ConveyorPullRequestSnapshot => Boolean(pr))
    .filter((pr) => pr.labels.some((label) => LOWER_BLOCKER_LABELS.includes(label)));
}

function blockedDependent(
  blocker: ConveyorPullRequestSnapshot,
  dependent: ConveyorPullRequestSnapshot,
): ConveyorStackBlockedDependent {
  const finalSignals = dependent.labels.filter((label) => FINAL_ADVANCEMENT_LABELS.includes(label));
  return {
    repo: dependent.repo,
    pr: dependent.number,
    head: dependent.head,
    blocker_pr: blocker.number,
    blocker_labels: blocker.labels.filter((label) => LOWER_BLOCKER_LABELS.includes(label)).sort(),
    current_state: dependent.labels.find((label) => label.startsWith("state:")),
    recommended_add: dependent.labels.includes("dependency-blocked") ? [] : ["dependency-blocked"],
    recommended_remove: finalSignals,
    blocked_final_signals: finalSignals,
    reason: `lower dependency #${blocker.number} has ${blocker.labels.filter((label) => LOWER_BLOCKER_LABELS.includes(label)).join(",")}`,
  };
}

function dedupeBlockedDependents(dependents: ConveyorStackBlockedDependent[]): ConveyorStackBlockedDependent[] {
  const seen = new Set<string>();
  const result: ConveyorStackBlockedDependent[] = [];
  for (const dependent of dependents) {
    const key = `${dependent.repo}#${dependent.pr}#${dependent.blocker_pr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(dependent);
  }
  return result.sort((a, b) => (a.repo === b.repo ? a.pr - b.pr || a.blocker_pr - b.blocker_pr : a.repo.localeCompare(b.repo)));
}

function prKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}
