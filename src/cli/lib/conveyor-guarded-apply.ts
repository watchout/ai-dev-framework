import {
  buildConveyorLabelSyncPlan,
  type ConveyorLabelSyncAction,
  type ConveyorLabelSyncPlan,
} from "./conveyor-label-sync.js";
import type { ConveyorReconcileInput } from "./conveyor-reconciler.js";

export type ConveyorGuardedApplyMode = "dry-run" | "apply";

export interface ConveyorGuardedApplyOptions {
  mode?: ConveyorGuardedApplyMode;
  confirmLiveGithub?: boolean;
  actor?: string;
}

export interface ConveyorGuardedApplyOperation {
  kind: "pr_label_and_comment_sync";
  repo: string;
  pr: number;
  expected_head: string;
  add_labels: string[];
  remove_labels: string[];
  comment_body: string;
  reason_codes: string[];
}

export interface ConveyorGuardedApplyBlockedOperation {
  repo: string;
  pr: number;
  expected_head: string;
  reason_codes: string[];
  findings: ConveyorLabelSyncAction["findings"];
}

export interface ConveyorGuardedApplyPlan {
  schema: "shirube-conveyor-guarded-apply-plan/v1";
  mode: ConveyorGuardedApplyMode;
  dry_run: boolean;
  safe_to_apply: boolean;
  confirmation_required: boolean;
  exact_head_required: true;
  allowed_operations: string[];
  forbidden_operations: string[];
  operations: ConveyorGuardedApplyOperation[];
  blocked_operations: ConveyorGuardedApplyBlockedOperation[];
  label_sync: ConveyorLabelSyncPlan;
  authority_notes: string[];
}

export interface ConveyorGuardedApplyAdapter {
  readPullRequestHead(operation: ConveyorGuardedApplyOperation): string;
  applyPullRequestLabels(operation: ConveyorGuardedApplyOperation): void;
  postPullRequestComment(operation: ConveyorGuardedApplyOperation): void;
}

export interface ConveyorGuardedApplyExecution {
  schema: "shirube-conveyor-guarded-apply-execution/v1";
  mode: "apply";
  applied: ConveyorGuardedApplyOperation[];
  blocked: ConveyorGuardedApplyBlockedOperation[];
  safe_to_apply: boolean;
}

const FORBIDDEN_OPERATIONS = [
  "merge",
  "approve",
  "draft_remove",
  "deploy",
  "restart",
  "launchctl",
  "production_db_mutation",
  "queue_drain",
  "discord_send",
  "aun_dispatch",
];

export function buildConveyorGuardedApplyPlan(
  input: ConveyorReconcileInput,
  options: ConveyorGuardedApplyOptions = {},
): ConveyorGuardedApplyPlan {
  const mode = options.mode ?? "dry-run";
  const labelSync = buildConveyorLabelSyncPlan(input, "dry-run");
  const operations: ConveyorGuardedApplyOperation[] = [];
  const blockedOperations: ConveyorGuardedApplyBlockedOperation[] = [];

  for (const action of labelSync.actions) {
    if (action.add.length === 0 && action.remove.length === 0) continue;
    if (action.blocked) {
      blockedOperations.push(blockedOperation(action));
      continue;
    }
    operations.push(operationFromAction(action, options.actor ?? "conveyor"));
  }

  return {
    schema: "shirube-conveyor-guarded-apply-plan/v1",
    mode,
    dry_run: mode !== "apply",
    safe_to_apply: labelSync.safe_to_apply && blockedOperations.length === 0 && operations.length > 0,
    confirmation_required: mode === "apply" && !options.confirmLiveGithub,
    exact_head_required: true,
    allowed_operations: ["pr_label_add", "pr_label_remove", "pr_comment"],
    forbidden_operations: FORBIDDEN_OPERATIONS,
    operations,
    blocked_operations: blockedOperations,
    label_sync: labelSync,
    authority_notes: [
      "dry_run_by_default",
      "live_apply_requires_confirm_live_github",
      "exact_head_checked_immediately_before_mutation",
      "no_merge_approval_draft_remove_deploy_restart_db_queue_discord_or_aun_dispatch",
    ],
  };
}

export function executeConveyorGuardedApplyPlan(
  plan: ConveyorGuardedApplyPlan,
  adapter: ConveyorGuardedApplyAdapter,
  options: { confirmLiveGithub?: boolean } = {},
): ConveyorGuardedApplyExecution {
  if (plan.mode !== "apply") {
    throw new Error("Guarded apply execution requires mode=apply.");
  }
  if (!options.confirmLiveGithub) {
    throw new Error("Missing --confirm-live-github for guarded live apply.");
  }
  if (!plan.safe_to_apply) {
    throw new Error("Guarded apply plan is not safe to apply.");
  }

  const applied: ConveyorGuardedApplyOperation[] = [];
  const blocked: ConveyorGuardedApplyBlockedOperation[] = [];
  for (const operation of plan.operations) {
    const currentHead = adapter.readPullRequestHead(operation);
    if (currentHead !== operation.expected_head) {
      blocked.push({
        repo: operation.repo,
        pr: operation.pr,
        expected_head: operation.expected_head,
        reason_codes: ["live_head_mismatch"],
        findings: [],
      });
    }
  }
  if (blocked.length > 0) {
    return {
      schema: "shirube-conveyor-guarded-apply-execution/v1",
      mode: "apply",
      applied,
      blocked,
      safe_to_apply: false,
    };
  }

  for (const operation of plan.operations) {
    adapter.applyPullRequestLabels(operation);
    adapter.postPullRequestComment(operation);
    applied.push(operation);
  }

  return {
    schema: "shirube-conveyor-guarded-apply-execution/v1",
    mode: "apply",
    applied,
    blocked,
    safe_to_apply: blocked.length === 0,
  };
}

function operationFromAction(action: ConveyorLabelSyncAction, actor: string): ConveyorGuardedApplyOperation {
  return {
    kind: "pr_label_and_comment_sync",
    repo: action.repo,
    pr: action.pr,
    expected_head: action.head,
    add_labels: action.add,
    remove_labels: action.remove,
    comment_body: [
      "<!-- conveyor:guarded-apply/v1 -->",
      `repo: ${action.repo}`,
      `pr: ${action.pr}`,
      `head: ${action.head}`,
      `actor: ${actor}`,
      `add_labels: ${action.add.join(",") || "-"}`,
      `remove_labels: ${action.remove.join(",") || "-"}`,
      "authority: labels/comments only; no merge/approval/deploy/aun/db/queue/discord",
    ].join("\n"),
    reason_codes: action.findings.map((finding) => finding.code),
  };
}

function blockedOperation(action: ConveyorLabelSyncAction): ConveyorGuardedApplyBlockedOperation {
  return {
    repo: action.repo,
    pr: action.pr,
    expected_head: action.head,
    reason_codes: action.findings.map((finding) => finding.code),
    findings: action.findings,
  };
}
