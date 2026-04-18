/**
 * Gate state model - Pre-Code Gate state persistence
 * Based on: CLAUDE.md §Pre-Code Gate (A/B/C)
 *
 * Manages gate passage state in .framework/gates.json.
 * Gates must all be "passed" before `framework run` can execute tasks.
 *
 * Gate A: Development environment ready
 * Gate B: Task decomposition / planning complete
 * Gate C: SSOT completeness (§3-E/F/G/H)
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type GateId = "A" | "B" | "C";
export type GateStatus = "passed" | "failed" | "pending";

/**
 * Per-check status. Distinct from `GateStatus` (which aggregates a whole gate).
 *
 * Four kinds — this is the SSOT for check severity across engine, state, and display:
 *
 * - "pass":    check succeeded
 * - "warning": advisory; does NOT fail the gate (e.g. missing DB migrations,
 *              per CEO 2026-04-13 directive — non-blocking pending audit)
 * - "skipped": check is not applicable to the active profile; not an evaluation
 *              result. Emitted with a human-readable reason for observability.
 * - "fail":    blocks the gate
 *
 * `passed` is retained as a boolean convenience mirror:
 *   passed === (status !== "fail")
 * Warning / skipped carry `passed: true` so gate aggregation (areAllGatesPassed /
 * updateGateA/B/C) stays non-blocking, while the status enum lets display,
 * persistence, and downstream aggregators distinguish each kind without
 * parsing message strings.
 */
export type CheckStatus = "pass" | "warning" | "skipped" | "fail";

export interface GateCheck {
  name: string;
  passed: boolean;
  status: CheckStatus;
  message: string;
}

export function passCheck(name: string, message: string): GateCheck {
  return { name, passed: true, status: "pass", message };
}

export function failCheck(name: string, message: string): GateCheck {
  return { name, passed: false, status: "fail", message };
}

export function warnCheck(name: string, message: string): GateCheck {
  return { name, passed: true, status: "warning", message };
}

export function skipCheck(name: string, reason: string): GateCheck {
  return { name, passed: true, status: "skipped", message: reason };
}

export function isWarning(check: GateCheck): boolean {
  return check.status === "warning";
}

export function isSkipped(check: GateCheck): boolean {
  return check.status === "skipped";
}

export interface SSOTCheck extends GateCheck {
  /** Path to the SSOT file */
  filePath: string;
  /** Which sections are missing */
  missingSections: string[];
}

export interface GateEntry {
  status: GateStatus;
  checks: GateCheck[];
  checkedAt: string;
}

export interface SSOTGateEntry {
  status: GateStatus;
  checks: SSOTCheck[];
  checkedAt: string;
}

export interface GateState {
  gateA: GateEntry;
  gateB: GateEntry;
  gateC: SSOTGateEntry;
  updatedAt: string;
}

export interface AllGatesResult {
  allPassed: boolean;
  gateA: GateEntry;
  gateB: GateEntry;
  gateC: SSOTGateEntry;
  failures: GateFailure[];
}

export interface GateFailure {
  gate: string;
  message: string;
  details: string[];
}

// ─────────────────────────────────────────────
// State Operations
// ─────────────────────────────────────────────

export function createGateState(): GateState {
  const now = new Date().toISOString();
  return {
    gateA: { status: "pending", checks: [], checkedAt: now },
    gateB: { status: "pending", checks: [], checkedAt: now },
    gateC: { status: "pending", checks: [], checkedAt: now },
    updatedAt: now,
  };
}

export function updateGateA(
  state: GateState,
  checks: GateCheck[],
): void {
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  state.gateA = {
    status: allPassed ? "passed" : "failed",
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export function updateGateB(
  state: GateState,
  checks: GateCheck[],
): void {
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  state.gateB = {
    status: allPassed ? "passed" : "failed",
    checks,
    checkedAt: new Date().toISOString(),
  };
}

export function updateGateC(
  state: GateState,
  checks: SSOTCheck[],
): void {
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  state.gateC = {
    status: allPassed ? "passed" : "failed",
    checks,
    checkedAt: new Date().toISOString(),
  };
}

/** @deprecated Gate reset is not applicable with check runs. See #62. */
export function resetGateState(state: GateState): void {
  const now = new Date().toISOString();
  state.gateA = { status: "pending", checks: [], checkedAt: now };
  state.gateB = { status: "pending", checks: [], checkedAt: now };
  state.gateC = { status: "pending", checks: [], checkedAt: now };
}

export function areAllGatesPassed(state: GateState): boolean {
  return (
    state.gateA.status === "passed" &&
    state.gateB.status === "passed" &&
    state.gateC.status === "passed"
  );
}

export function collectFailures(state: GateState): GateFailure[] {
  const failures: GateFailure[] = [];

  if (state.gateA.status !== "passed") {
    const failedChecks = state.gateA.checks.filter((c) => !c.passed);
    failures.push({
      gate: "Gate A (Environment)",
      message: "Development environment is not ready",
      details: failedChecks.map((c) => c.message),
    });
  }

  if (state.gateB.status !== "passed") {
    const failedChecks = state.gateB.checks.filter((c) => !c.passed);
    failures.push({
      gate: "Gate B (Planning)",
      message: "Task decomposition / planning is incomplete",
      details: failedChecks.map((c) => c.message),
    });
  }

  if (state.gateC.status !== "passed") {
    const failedChecks = state.gateC.checks.filter((c) => !c.passed);
    failures.push({
      gate: "Gate C (SSOT Completeness)",
      message: "SSOT §3-E/F/G/H sections are incomplete",
      details: failedChecks.map((c) => c.message),
    });
  }

  return failures;
}

export function buildAllGatesResult(state: GateState): AllGatesResult {
  return {
    allPassed: areAllGatesPassed(state),
    gateA: state.gateA,
    gateB: state.gateB,
    gateC: state.gateC,
    failures: collectFailures(state),
  };
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

const GATE_STATE_FILE = ".framework/gates.json";

/** @deprecated Use loadGateStatusFromCheckRuns() for GitHub Actions check runs. See #62. */
export function loadGateState(
  projectDir: string,
): GateState | null {
  const filePath = path.join(projectDir, GATE_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as GateState;
    // Backward-compat: pre-CheckStatus gates.json stored only `passed`.
    // Synthesize `status` for any legacy entry so downstream consumers
    // (print, aggregators, dashboards) can switch on the enum safely.
    // Old data never encoded warning/skipped, so pass↔fail mirror is sound.
    migrateLegacyChecks(parsed.gateA?.checks);
    migrateLegacyChecks(parsed.gateB?.checks);
    migrateLegacyChecks(parsed.gateC?.checks);
    return parsed;
  } catch {
    return null;
  }
}

function migrateLegacyChecks(checks: GateCheck[] | undefined): void {
  if (!checks) return;
  for (const c of checks) {
    if (c.status === undefined) {
      c.status = c.passed ? "pass" : "fail";
    }
  }
}

/** @deprecated Gate state is now managed by GitHub Actions check runs. See #62. */
export function saveGateState(
  projectDir: string,
  state: GateState,
): void {
  const filePath = path.join(projectDir, GATE_STATE_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

// ─────────────────────────────────────────────
// Check Runs API (#62 sub-PR 2/4)
// ─────────────────────────────────────────────

interface CheckRunResult {
  name: string;
  status: string;
  conclusion: string | null;
}

const GATE_WORKFLOW_NAMES: Record<GateId, string> = {
  A: "Gate A — Environment Readiness",
  B: "Gate B — Planning Completeness",
  C: "Gate C — SSOT Completeness",
};

function checkRunToGateStatus(conclusion: string | null): GateStatus {
  if (conclusion === "success") return "passed";
  if (conclusion === null) return "pending";
  // failure, cancelled, timed_out, startup_failure, action_required, stale
  return "failed";
}

export interface CheckRunLoadResult {
  state: GateState | null;
  error?: "gh_error" | "no_check_runs";
  errorMessage?: string;
}

export async function loadGateStatusFromCheckRuns(
  ref?: string,
): Promise<CheckRunLoadResult> {
  const { execGh } = await import("./github-engine.js");

  const targetRef = ref ?? "HEAD";
  let output: string;
  try {
    output = await execGh([
      "api",
      `repos/{owner}/{repo}/commits/${targetRef}/check-runs`,
      "--jq",
      ".check_runs[] | {name, status, conclusion}",
    ]);
  } catch (e) {
    return {
      state: null,
      error: "gh_error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const lines = output.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      return { state: null, error: "no_check_runs" };
    }
    const checkRuns: CheckRunResult[] = lines.map((line) =>
      JSON.parse(line) as CheckRunResult,
    );

    const now = new Date().toISOString();
    const state = createGateState();

    for (const [gateId, workflowName] of Object.entries(GATE_WORKFLOW_NAMES)) {
      const run = checkRuns.find((r) => r.name === workflowName);
      const status = run ? checkRunToGateStatus(run.conclusion) : "pending";
      const checks: GateCheck[] = run
        ? [
            {
              name: workflowName,
              passed: status === "passed",
              status: status === "passed" ? "pass" : status === "failed" ? "fail" : "skipped",
              message: run.conclusion
                ? `Check run: ${run.conclusion}`
                : `Check run: ${run.status}`,
            },
          ]
        : [];

      switch (gateId as GateId) {
        case "A":
          state.gateA = { status, checks, checkedAt: now };
          break;
        case "B":
          state.gateB = { status, checks, checkedAt: now };
          break;
        case "C":
          state.gateC = { status, checks: checks as SSOTCheck[], checkedAt: now };
          break;
      }
    }

    state.updatedAt = now;
    return { state };
  } catch (e) {
    return {
      state: null,
      error: "gh_error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

export { GATE_WORKFLOW_NAMES };
