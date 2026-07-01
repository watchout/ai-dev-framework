#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  isMain,
  isObject,
  parseArgs,
} from "./lib.mjs";

const SCHEMA = "shirube-required-checks-ran/v1";
const DEFAULT_TIMEOUT_MINUTES = 30;

const FINDINGS = {
  "RCV-001": ["branch_not_protected", "Base branch is not protected; #527 activation proof cannot pass.", "branch_protection"],
  "RCV-002": ["missing_required_contexts", "Branch protection has no required status/check contexts.", "required_contexts"],
  "RCV-003": ["required_context_missing", "A required context/check is absent from the exact head.", "missing_contexts"],
  "RCV-004": ["required_context_stale", "A required check run is not tied to the exact head SHA.", "stale_contexts"],
  "RCV-005": ["required_context_skipped", "A required check run was skipped; skipped checks are not activation proof.", "skipped_contexts"],
  "RCV-006": ["required_context_failed", "A required context/check is not successful.", "failed_contexts"],
  "RCV-007": ["required_context_pending_timeout", "A required context/check stayed pending beyond the timeout policy.", "pending_contexts"],
  "RCV-008": ["github_api_error", "GitHub API read failed.", "github_api"],
  "RCV-009": ["missing_input", "repo, head-sha, and base-branch are required.", "input"],
};

export async function buildRequiredChecksRanReport(input) {
  const repo = stringValue(input.repo);
  const headSha = stringValue(input.headSha);
  const baseBranch = stringValue(input.baseBranch);
  const prNumber = stringValue(input.prNumber);
  const timeoutMinutes = Number(input.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES);
  const now = new Date(input.now ?? new Date().toISOString());
  const blockers = [];
  const warnings = [];
  const failures = [];

  if (!repo || !headSha || !baseBranch) {
    failures.push(finding("RCV-009"));
    return report({ repo, prNumber, headSha, baseBranch, blockers, warnings, failures });
  }

  let branchProtection;
  let checkRuns;
  let statuses;
  try {
    branchProtection = input.branchProtection ?? await fetchJson({
      repo,
      path: `/repos/${repo}/branches/${encodeURIComponent(baseBranch)}/protection`,
      token: input.token,
      accept: "application/vnd.github+json",
    });
    checkRuns = input.checkRuns ?? await fetchJson({
      repo,
      path: `/repos/${repo}/commits/${headSha}/check-runs?per_page=100`,
      token: input.token,
      accept: "application/vnd.github+json",
    });
    statuses = input.statuses ?? await fetchJson({
      repo,
      path: `/repos/${repo}/commits/${headSha}/status`,
      token: input.token,
      accept: "application/vnd.github+json",
    });
  } catch (error) {
    failures.push(finding("RCV-008", { message: errorMessage(error), path: "github_api" }));
    return report({ repo, prNumber, headSha, baseBranch, blockers, warnings, failures });
  }

  if (isBranchNotProtected(branchProtection)) {
    blockers.push(finding("RCV-001"));
    return report({
      repo,
      prNumber,
      headSha,
      baseBranch,
      blockers,
      warnings,
      failures,
      branchProtection,
      checkRuns,
      statuses,
    });
  }

  const requiredContexts = requiredContextsFromProtection(branchProtection);
  const observedContexts = observedContextsFromChecks({ checkRuns, statuses, headSha });
  const observedByName = new Map(observedContexts.map((context) => [context.name, context]));
  const missingContexts = [];
  const staleContexts = [];
  const skippedContexts = [];
  const failedContexts = [];
  const pendingContexts = [];

  if (requiredContexts.length === 0) {
    blockers.push(finding("RCV-002"));
  }

  for (const context of requiredContexts) {
    const observed = observedByName.get(context);
    if (!observed) {
      missingContexts.push(context);
      continue;
    }
    if (observed.head_sha && observed.head_sha !== headSha) {
      staleContexts.push({ name: context, observed_head_sha: observed.head_sha, expected_head_sha: headSha });
    }
    if (observed.status !== "completed" && observed.state !== "success") {
      if (isPendingTimedOut(observed, now, timeoutMinutes)) {
        pendingContexts.push(context);
      } else {
        warnings.push({
          item_id: "RCV-W001",
          code: "required_context_pending",
          message: "A required context/check is pending but has not exceeded the timeout policy.",
          path: context,
        });
      }
      continue;
    }
    if (observed.conclusion === "skipped") {
      skippedContexts.push(context);
    } else if (!isSuccessfulObservedContext(observed)) {
      failedContexts.push(context);
    }
  }

  for (const context of missingContexts) blockers.push(finding("RCV-003", { path: context }));
  for (const context of staleContexts) blockers.push(finding("RCV-004", { path: context.name, observed: context.observed_head_sha }));
  for (const context of skippedContexts) blockers.push(finding("RCV-005", { path: context }));
  for (const context of failedContexts) blockers.push(finding("RCV-006", { path: context }));
  for (const context of pendingContexts) blockers.push(finding("RCV-007", { path: context }));

  return report({
    repo,
    prNumber,
    headSha,
    baseBranch,
    blockers,
    warnings,
    failures,
    branchProtection,
    checkRuns,
    statuses,
    requiredContexts,
    observedContexts,
    missingContexts,
    staleContexts,
    skippedContexts,
    failedContexts,
    pendingContexts,
  });
}

function report({
  repo,
  prNumber,
  headSha,
  baseBranch,
  blockers,
  warnings,
  failures,
  branchProtection,
  requiredContexts,
  observedContexts,
  missingContexts,
  staleContexts,
  skippedContexts,
  failedContexts,
  pendingContexts,
}) {
  const uniqueFailures = uniqueFindings(failures);
  const uniqueBlockers = uniqueFindings(blockers);
  const uniqueWarnings = uniqueFindings(warnings);
  const verdict = uniqueFailures.length > 0 ? "FAILURE" : uniqueBlockers.length > 0 ? "BLOCKED" : "PASS";
  return {
    schema: SCHEMA,
    repo: repo ?? null,
    pr_number: prNumber ?? null,
    base_branch: baseBranch ?? null,
    head_sha: headSha ?? null,
    verdict,
    ci_should_fail: verdict !== "PASS",
    branch_protected: branchProtection ? !isBranchNotProtected(branchProtection) : null,
    required_contexts: (requiredContexts ?? []).slice().sort(),
    observed_contexts: (observedContexts ?? []).slice().sort(compareObservedContext),
    missing_contexts: (missingContexts ?? []).slice().sort(),
    stale_contexts: (staleContexts ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    skipped_contexts: (skippedContexts ?? []).slice().sort(),
    failed_contexts: (failedContexts ?? []).slice().sort(),
    pending_contexts: (pendingContexts ?? []).slice().sort(),
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    failures: uniqueFailures,
    required_next_actions: requiredNextActions([...uniqueFailures, ...uniqueBlockers]),
  };
}

function requiredContextsFromProtection(branchProtection) {
  const requiredStatusChecks = branchProtection?.required_status_checks;
  const contexts = [
    ...asArray(requiredStatusChecks?.contexts),
    ...asArray(requiredStatusChecks?.checks).map((check) => check?.context),
  ].filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  return [...new Set(contexts)].sort();
}

function observedContextsFromChecks({ checkRuns, statuses, headSha }) {
  const contexts = [];
  for (const run of asArray(checkRuns?.check_runs)) {
    if (!isObject(run)) continue;
    contexts.push({
      name: String(run.name ?? ""),
      source: "check_run",
      status: String(run.status ?? ""),
      conclusion: run.conclusion === null || run.conclusion === undefined ? null : String(run.conclusion),
      head_sha: String(run.head_sha ?? run.check_suite?.head_sha ?? ""),
      started_at: run.started_at ?? run.created_at ?? null,
      completed_at: run.completed_at ?? null,
      html_url: run.html_url ?? null,
    });
  }
  for (const status of asArray(statuses?.statuses)) {
    if (!isObject(status)) continue;
    contexts.push({
      name: String(status.context ?? ""),
      source: "status",
      state: String(status.state ?? ""),
      status: String(status.state ?? ""),
      conclusion: String(status.state ?? ""),
      head_sha: String(status.sha ?? headSha ?? ""),
      started_at: status.created_at ?? null,
      completed_at: status.updated_at ?? null,
      target_url: status.target_url ?? null,
    });
  }
  return contexts.filter((context) => context.name).sort(compareObservedContext);
}

function isSuccessfulObservedContext(context) {
  if (context.source === "status") return context.state === "success";
  return context.status === "completed" && context.conclusion === "success";
}

function isPendingTimedOut(context, now, timeoutMinutes) {
  const startedAt = Date.parse(context.started_at ?? "");
  if (Number.isNaN(startedAt)) return true;
  return now.getTime() - startedAt > timeoutMinutes * 60 * 1000;
}

async function fetchJson({ path, token, accept }) {
  if (!token) throw new Error("GitHub token is required unless fixture inputs are provided.");
  const response = await fetch(`https://api.github.com${path}`, {
    method: "GET",
    headers: {
      accept,
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "shirube-required-checks-ran",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (response.status === 404) return { status: 404, message: body.message ?? "Not Found" };
  if (!response.ok) throw new Error(`${response.status} ${body.message ?? response.statusText}`);
  return body;
}

function isBranchNotProtected(value) {
  return value?.status === 404 || /branch not protected|not found/i.test(String(value?.message ?? ""));
}

function readJsonOption(value) {
  return typeof value === "string" ? JSON.parse(readFileSync(value, "utf8")) : null;
}

function tokenFromOptions(options) {
  if (typeof options.token === "string") return options.token;
  const envName = typeof options["github-token-env"] === "string" ? options["github-token-env"] : null;
  if (envName) return process.env[envName];
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
}

function finding(itemId, overrides = {}) {
  const [code, message, defaultPath] = FINDINGS[itemId];
  return {
    item_id: itemId,
    code,
    message: overrides.message ?? message,
    path: overrides.path ?? defaultPath,
    observed: overrides.observed ?? undefined,
  };
}

function uniqueFindings(findings) {
  const seen = new Set();
  const unique = [];
  for (const item of findings) {
    const normalized = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique.sort((a, b) => `${a.path}\0${a.item_id}`.localeCompare(`${b.path}\0${b.item_id}`));
}

function requiredNextActions(findings) {
  return findings.map((item) => ({
    item_id: item.item_id,
    action: actionFor(item.item_id),
  }));
}

function actionFor(itemId) {
  const actions = {
    "RCV-001": "Configure branch protection on the base branch and require the script-control fitness checks.",
    "RCV-002": "Add required status/check contexts to branch protection.",
    "RCV-003": "Run every required check on the exact PR head before claiming activation proof.",
    "RCV-004": "Rerun stale checks against the exact PR head SHA.",
    "RCV-005": "Make skipped required checks execute deterministically or remove them from required contexts.",
    "RCV-006": "Fix failing required checks before activation proof.",
    "RCV-007": "Wait for pending required checks or investigate timeout.",
    "RCV-008": "Fix GitHub API access or token permissions and rerun.",
    "RCV-009": "Pass --repo, --head-sha, and --base-branch.",
  };
  return actions[itemId] ?? "Resolve required-check verifier finding.";
}

function compareObservedContext(a, b) {
  return `${a.name}\0${a.source}`.localeCompare(`${b.name}\0${b.source}`);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  if (value === undefined || value === null || value === true || value === false) return null;
  const string = String(value).trim();
  return string ? string : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const { options } = parseArgs(process.argv.slice(2));
  if (options.format !== "json") {
    process.stdout.write(`${JSON.stringify({
      schema: SCHEMA,
      verdict: "FAILURE",
      ci_should_fail: true,
      failures: [{ code: "unsupported_format", message: "--format json is required.", path: "format" }],
      blockers: [],
      warnings: [],
      required_next_actions: [{ code: "unsupported_format", action: "Run with --format json." }],
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const report = await buildRequiredChecksRanReport({
    repo: options.repo,
    prNumber: options["pr-number"],
    headSha: options["head-sha"],
    baseBranch: options["base-branch"],
    timeoutMinutes: options["timeout-minutes"],
    now: options.now,
    token: tokenFromOptions(options),
    branchProtection: readJsonOption(options["branch-protection-fixture"]),
    checkRuns: readJsonOption(options["check-runs-fixture"]),
    statuses: readJsonOption(options["statuses-fixture"]),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.ci_should_fail) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  await main();
}
