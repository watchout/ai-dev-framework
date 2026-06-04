import {
  collectConveyorAuditEvidence,
  type ConveyorMode,
  type ConveyorPullRequestSnapshot,
} from "./conveyor-reconciler.js";

export interface ConveyorLiveDeploymentProbe {
  component: string;
  repo: string;
  checkout_path: string;
  deployed_head?: string;
  observed_at?: string;
}

export interface ConveyorLiveStateInput {
  schema?: "shirube-conveyor-live-state-fixture/v1";
  deployments: ConveyorLiveDeploymentProbe[];
  merged_heads?: Record<string, string[]>;
  pull_requests?: ConveyorPullRequestSnapshot[];
}

export type ConveyorLiveDeploymentStatus =
  | "represented_by_merged_commit"
  | "represented_by_open_emergency_pr"
  | "unreviewed_deployed_commit"
  | "missing_deployed_head";

export interface ConveyorLiveDeploymentReport {
  component: string;
  repo: string;
  checkout_path: string;
  deployed_head?: string;
  status: ConveyorLiveDeploymentStatus;
  stop_lane: boolean;
  represented_by?: {
    kind: "merged_commit" | "open_emergency_pr";
    repo: string;
    pr?: number;
    head: string;
  };
  reason_codes: string[];
  next_actions: string[];
}

export interface ConveyorLiveStateReport {
  schema: "shirube-conveyor-live-state-report/v1";
  mode: ConveyorMode;
  safe_to_apply: false;
  deployments: ConveyorLiveDeploymentReport[];
  metrics: {
    total_deployments: number;
    unreviewed_deployed_commit_count: number;
    missing_deployed_head_count: number;
  };
  authority_notes: string[];
}

const EMERGENCY_LABELS = ["route:emergency", "emergency-pr", "emergency-regularization"];

export function buildConveyorLiveStateReport(
  input: ConveyorLiveStateInput,
  mode: ConveyorMode = "dry-run",
): ConveyorLiveStateReport {
  const deployments = input.deployments.map((deployment) => reconcileDeployment(deployment, input));
  return {
    schema: "shirube-conveyor-live-state-report/v1",
    mode,
    safe_to_apply: false,
    deployments,
    metrics: {
      total_deployments: deployments.length,
      unreviewed_deployed_commit_count: deployments.filter((deployment) => deployment.status === "unreviewed_deployed_commit").length,
      missing_deployed_head_count: deployments.filter((deployment) => deployment.status === "missing_deployed_head").length,
    },
    authority_notes: [
      "read_only_live_state_reconciliation",
      "no_rollback_restart_launchctl_or_db_mutation",
      "no_merge_approval_or_aun_dispatch_authority",
    ],
  };
}

function reconcileDeployment(
  deployment: ConveyorLiveDeploymentProbe,
  input: ConveyorLiveStateInput,
): ConveyorLiveDeploymentReport {
  if (!deployment.deployed_head) {
    return {
      component: deployment.component,
      repo: deployment.repo,
      checkout_path: deployment.checkout_path,
      status: "missing_deployed_head",
      stop_lane: true,
      reason_codes: ["missing_deployed_head"],
      next_actions: ["record_live_probe_head_before_reconcile"],
    };
  }

  if ((input.merged_heads?.[deployment.repo] ?? []).includes(deployment.deployed_head)) {
    return {
      component: deployment.component,
      repo: deployment.repo,
      checkout_path: deployment.checkout_path,
      deployed_head: deployment.deployed_head,
      status: "represented_by_merged_commit",
      stop_lane: false,
      represented_by: {
        kind: "merged_commit",
        repo: deployment.repo,
        head: deployment.deployed_head,
      },
      reason_codes: [],
      next_actions: [],
    };
  }

  const openPr = (input.pull_requests ?? []).find((pr) => pr.repo === deployment.repo && pr.head === deployment.deployed_head);
  if (openPr && isEmergencyPr(openPr) && hasExactAuditEvidence(openPr, deployment.deployed_head)) {
    return {
      component: deployment.component,
      repo: deployment.repo,
      checkout_path: deployment.checkout_path,
      deployed_head: deployment.deployed_head,
      status: "represented_by_open_emergency_pr",
      stop_lane: false,
      represented_by: {
        kind: "open_emergency_pr",
        repo: openPr.repo,
        pr: openPr.number,
        head: openPr.head,
      },
      reason_codes: [],
      next_actions: ["continue_emergency_pr_audit_to_merge_authority"],
    };
  }

  const reasonCodes = ["unreviewed_deployed_commit"];
  if (openPr && !isEmergencyPr(openPr)) {
    reasonCodes.push("open_pr_not_emergency_regularization");
  }
  if (openPr && isEmergencyPr(openPr) && !hasExactAuditEvidence(openPr, deployment.deployed_head)) {
    reasonCodes.push("open_emergency_pr_missing_exact_head_evidence");
  }
  if (!openPr) {
    reasonCodes.push("no_open_pr_for_deployed_head");
  }

  return {
    component: deployment.component,
    repo: deployment.repo,
    checkout_path: deployment.checkout_path,
    deployed_head: deployment.deployed_head,
    status: "unreviewed_deployed_commit",
    stop_lane: true,
    reason_codes: reasonCodes,
    next_actions: [
      "rollback_decision_required",
      "create_or_attach_emergency_pr_with_exact_head_evidence",
    ],
  };
}

function isEmergencyPr(pr: ConveyorPullRequestSnapshot): boolean {
  return pr.labels.some((label) => EMERGENCY_LABELS.includes(label));
}

function hasExactAuditEvidence(pr: ConveyorPullRequestSnapshot, head: string): boolean {
  return collectConveyorAuditEvidence(pr).some((evidence) => evidence.head === head);
}
