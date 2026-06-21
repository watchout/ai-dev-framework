import { existsSync } from "node:fs";
import { buildResult, isMain, parseArgs, readJsonFile, readStructuredFile, safeRun } from "./lib.mjs";

export function runPhaseCheck(options = {}) {
  const config = readJsonFile(options.config ?? "scripts/shirube/phases.config.json");
  const state = options.fixture
    ? readStructuredFile(options.fixture)
    : options.state
      ? readStructuredFile(options.state)
      : existsSync(".shirube/phase-state.json")
        ? readStructuredFile(".shirube/phase-state.json")
        : {};
  return evaluatePhase(state, config);
}

export function evaluatePhase(state, config) {
  const current = state.current_phase ?? state.phase ?? null;
  const target = state.target_phase ?? state.next_phase ?? null;
  const findings = [];

  if (!current) {
    findings.push({ severity: "BLOCK", code: "phase_undeclared", message: "current_phase is required." });
  } else if (!config.phases.includes(current)) {
    findings.push({ severity: "BLOCK", code: "unknown_current_phase", phase: current, message: `${current} is not a known phase.` });
  }

  const allowedNext = current && config.allowed_transitions[current] ? config.allowed_transitions[current] : [];
  if (target && !allowedNext.includes(target)) {
    findings.push({
      severity: "BLOCK",
      code: "invalid_phase_transition",
      current_phase: current,
      target_phase: target,
      allowed_next_phases: allowedNext,
      message: `${current} cannot transition to ${target}.`,
    });
  }

  const verdict = findings.some((finding) => finding.severity === "BLOCK") ? "BLOCK" : "PASS";
  return buildResult({
    gate: "phase",
    verdict,
    reasons: findings,
    remediation: {
      what: verdict === "PASS" ? "No remediation required." : "Declare a valid current_phase and use only transitions listed in scripts/shirube/phases.config.json.",
      doc_ref: "scripts/shirube/phases.config.json",
    },
    current_phase: current,
    allowed_next_phases: allowedNext,
    target_phase: target,
  });
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  safeRun(() => runPhaseCheck(options));
}
