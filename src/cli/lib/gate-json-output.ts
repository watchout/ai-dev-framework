/**
 * Structured (JSON) output formatters for Gate results.
 *
 * Based on docs/specs/06_CODE_QUALITY.md §6.1 (code-quality audit report)
 * and §6.2 (test-quality audit report). Human-readable Markdown and
 * machine-readable JSON are produced from the same data.
 *
 * Used by `framework gate quality --output json` and
 * `framework gate release --output json`.
 */
import type { QualitySweepResult } from "./gate-quality-engine.js";

export type Severity = "CRITICAL" | "WARNING" | "INFO";

export interface GateFinding {
  id: string;
  severity: Severity;
  category: string;
  message: string;
  file?: string;
  line?: number;
}

export interface GateValidatorBlock {
  name: string;
  status: "PASS" | "BLOCK";
  critical: number;
  warning: number;
  info: number;
  elapsedMs: number;
  findings: GateFinding[];
  error?: string;
}

export interface GateResultJSON {
  gate: "design" | "quality" | "release";
  verdict: "PASS" | "BLOCK" | "SHIP" | "SHIP_WITH_CONDITIONS";
  timestamp: string;
  provider: string;
  elapsedMs: number;
  summary: {
    critical: number;
    warning: number;
    info: number;
    score?: number;
  };
  validators: GateValidatorBlock[];
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// Finding parsing
// ─────────────────────────────────────────────

/**
 * Parse "[CATEGORY-ID] Message (file:line)" finding strings produced by
 * validators into structured GateFinding objects. Accepts any form — the
 * raw string is used as the message when parsing fails.
 */
export function parseFindingString(raw: string, severity: Severity): GateFinding {
  const trimmed = raw.trim().replace(/^-\s+/, "").replace(/^\|\s*/, "");

  let id = "UNKNOWN";
  let category = "general";
  let rest = trimmed;

  const idMatch = trimmed.match(/^\[([A-Z]+-\d+|[A-Z-]+)\]\s*(.*)$/);
  if (idMatch) {
    id = idMatch[1];
    category = id.split("-")[0].toLowerCase();
    rest = idMatch[2];
  }

  let file: string | undefined;
  let line: number | undefined;
  const locMatch = rest.match(/\(([^:)]+):(\d+)\)\s*$/);
  if (locMatch) {
    file = locMatch[1];
    line = parseInt(locMatch[2], 10);
    rest = rest.replace(locMatch[0], "").trim();
  }

  return { id, severity, category, message: rest, file, line };
}

// ─────────────────────────────────────────────
// QualitySweepResult → JSON
// ─────────────────────────────────────────────

export function qualitySweepToJSON(
  result: QualitySweepResult,
  provider: string,
): GateResultJSON {
  const validators: GateValidatorBlock[] = result.validators.map((v) => ({
    name: v.name,
    status: (v.critical > 0 ? "BLOCK" : "PASS") as "PASS" | "BLOCK",
    critical: v.critical,
    warning: v.warning,
    info: v.info,
    elapsedMs: v.elapsedMs,
    findings: [
      ...v.criticalFindings.map((f) => parseFindingString(f, "CRITICAL")),
      ...v.warningFindings.map((f) => parseFindingString(f, "WARNING")),
    ],
    error: v.error,
  }));

  return {
    gate: "quality",
    verdict: result.verdict,
    timestamp: new Date().toISOString(),
    provider,
    elapsedMs: result.elapsedMs,
    summary: {
      critical: result.totalCritical,
      warning: result.totalWarning,
      info: result.totalInfo,
    },
    validators,
    meta: {
      warningThreshold: result.warningThreshold,
    },
  };
}

// ─────────────────────────────────────────────
// Gate 3 verdict → JSON
// ─────────────────────────────────────────────

export interface Gate3VerdictInput {
  verdict: "SHIP" | "SHIP_WITH_CONDITIONS" | "BLOCK";
  provider: string;
  elapsedMs: number;
  rawReport: string;
  prosecutorCritical?: number;
  prosecutorWarning?: number;
  conditions?: string[];
}

export function gate3VerdictToJSON(input: Gate3VerdictInput): GateResultJSON {
  const validators: GateValidatorBlock[] = [];
  if (
    input.prosecutorCritical !== undefined ||
    input.prosecutorWarning !== undefined
  ) {
    validators.push({
      name: "Prosecutor",
      status: (input.prosecutorCritical && input.prosecutorCritical > 0
        ? "BLOCK"
        : "PASS") as "PASS" | "BLOCK",
      critical: input.prosecutorCritical ?? 0,
      warning: input.prosecutorWarning ?? 0,
      info: 0,
      elapsedMs: 0,
      findings: [],
    });
  }

  return {
    gate: "release",
    verdict: input.verdict,
    timestamp: new Date().toISOString(),
    provider: input.provider,
    elapsedMs: input.elapsedMs,
    summary: {
      critical: input.prosecutorCritical ?? 0,
      warning: input.prosecutorWarning ?? 0,
      info: 0,
    },
    validators,
    meta: {
      conditions: input.conditions ?? [],
    },
  };
}
