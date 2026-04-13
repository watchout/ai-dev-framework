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
 * - "skip":    check is not applicable to the active profile; not an evaluation
 *              result. Emitted with a human-readable reason for observability.
 * - "fail":    blocks the gate
 *
 * `passed` is retained as a boolean convenience mirror:
 *   passed === (status !== "fail")
 * Warning / skip carry `passed: true` so gate aggregation (areAllGatesPassed /
 * updateGateA/B/C) stays non-blocking, while the status enum lets display,
 * persistence, and downstream aggregators distinguish each kind without
 * parsing message strings.
 */
export type CheckStatus = "pass" | "warning" | "skip" | "fail";

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
  return { name, passed: true, status: "skip", message: reason };
}

export function isWarning(check: GateCheck): boolean {
  return check.status === "warning";
}

export function isSkipped(check: GateCheck): boolean {
  return check.status === "skip";
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

export function loadGateState(
  projectDir: string,
): GateState | null {
  const filePath = path.join(projectDir, GATE_STATE_FILE);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as GateState;
  } catch {
    return null;
  }
}

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
