import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PreflightVerdict = "PASS" | "WARN" | "BLOCK";

export interface PreflightFinding {
  severity: PreflightVerdict;
  code: string;
  file?: string;
  message: string;
}

export interface PreflightReport {
  schema_version: "shirube-preflight-lite-result/v1";
  verdict: PreflightVerdict;
  allowed_next_action: "goal_mode_implementation" | "cell_intake" | "revise_records";
  checked_files: string[];
  findings: PreflightFinding[];
}

export interface PreflightOptions {
  repoRoot?: string;
  phaseDir?: string;
  allowBootstrapExternalGate?: boolean;
}

interface RequiredRecord {
  key: string;
  file: string;
  requiredFields: string[];
  requiredConcreteFields?: string[];
  requiredShapeFields?: string[];
  verdictRequired?: boolean;
  allowedNextActionRequired?: boolean;
}

const RESULT_SCHEMA = "shirube-preflight-lite-result/v1" as const;

const REQUIRED_RECORDS: RequiredRecord[] = [
  {
    key: "phase_plan",
    file: "phase-plan.yml",
    requiredFields: ["schema_version", "phase_id", "status"],
  },
  {
    key: "cell_plan",
    file: "cell-plan.preflight-lite.yml",
    requiredFields: ["schema_version", "cell_id", "phase_refs", "risk_class", "required_gates"],
    requiredConcreteFields: ["release_owner", "merge_executor", "evidence_sink"],
  },
  {
    key: "design_consolidation_gate_request",
    file: "design-consolidation-gate-request.yml",
    requiredFields: ["schema_version", "cell_id", "requested_checks", "evidence_sink"],
  },
  {
    key: "design_consolidation_gate_record",
    file: "design-consolidation-gate-record.yml",
    requiredFields: ["schema_version", "cell_id", "checks"],
    requiredConcreteFields: ["evidence_sink"],
    requiredShapeFields: [
      "canonical_flow_complete",
      "architecture_ownership_defined",
      "responsibility_boundaries_defined",
      "vocabulary_consistent",
      "protected_surfaces_identified",
      "risk_not_underestimated",
      "authority_boundaries_defined",
      "machine_evidence_primary",
      "ai_review_advisory_only",
      "old_audit_conveyor_not_reintroduced",
      "merge_authority_separated",
      "stop_conditions_defined",
      "rollback_evidence_explainable",
    ],
    verdictRequired: true,
    allowedNextActionRequired: true,
  },
  {
    key: "cell_intake_gate_record",
    file: "cell-intake-gate-record.yml",
    requiredFields: ["schema_version", "cell_id", "phase_refs", "required_gates"],
    requiredConcreteFields: ["risk_class", "release_owner", "merge_executor", "evidence_sink"],
    verdictRequired: true,
    allowedNextActionRequired: true,
  },
  {
    key: "machine_gate_record",
    file: "machine-gate-record.yml",
    requiredFields: ["schema_version", "cell_id", "status", "evidence_sink"],
  },
  {
    key: "narrow_verification_record",
    file: "narrow-verification-record.yml",
    requiredFields: ["schema_version", "cell_id", "status", "evidence_sink"],
  },
  {
    key: "runner_handoff",
    file: "runner-handoff.yml",
    requiredFields: ["schema_version", "runner", "cell_id", "design_consolidation_gate_ref", "cell_intake_gate_ref"],
    requiredConcreteFields: ["evidence_sink"],
  },
  {
    key: "runner_result",
    file: "runner-result.yml",
    requiredFields: ["schema_version", "cell_id", "status", "evidence_refs"],
  },
  {
    key: "post_merge_evidence",
    file: "post-merge-evidence.yml",
    requiredFields: ["schema_version", "cell_id", "status", "evidence_sink"],
  },
];

const VALID_RECORD_VERDICTS = new Set(["PASS", "WARN", "BLOCK"]);
const VALID_EXTERNAL_OVERALL = new Set(["PASS", "WARN", "BLOCK", "CONDITIONAL", "REWORK"]);
const VALID_EXTERNAL_NEXT_ACTION = new Set([
  "revise",
  "external_gate_review",
  "preflight_lite_cell",
  "do_not_implement",
  "do_not_merge",
]);

export function runPreflightLite(options: PreflightOptions = {}): PreflightReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const phaseDir = options.phaseDir
    ? path.resolve(repoRoot, options.phaseDir)
    : path.join(repoRoot, "docs", "spec", "shirube", "phase-1");
  const allowBootstrapExternalGate = options.allowBootstrapExternalGate ?? true;

  const findings: PreflightFinding[] = [];
  const loaded = new Map<string, { spec: RequiredRecord; path: string; content: string }>();

  for (const spec of REQUIRED_RECORDS) {
    const recordPath = path.join(phaseDir, spec.file);
    if (!existsSync(recordPath)) {
      findings.push(block("missing_required_file", spec.file, `Required evidence file is missing: ${spec.file}`));
      continue;
    }

    const content = readFileSync(recordPath, "utf-8");
    loaded.set(spec.key, { spec, path: recordPath, content });
    findings.push(...validateRecord(spec, spec.file, content));
  }

  findings.push(...validateRecordOrdering(loaded));
  findings.push(...validateBootstrapExternalGate(loaded, allowBootstrapExternalGate));

  const hasBlock = findings.some((finding) => finding.severity === "BLOCK");
  const hasWarn = findings.some((finding) => finding.severity === "WARN");
  const verdict: PreflightVerdict = hasBlock ? "BLOCK" : hasWarn ? "WARN" : "PASS";
  const allowed_next_action = hasBlock
    ? "revise_records"
    : loaded.has("runner_handoff")
      ? "goal_mode_implementation"
      : "cell_intake";

  return {
    schema_version: RESULT_SCHEMA,
    verdict,
    allowed_next_action,
    checked_files: [...loaded.values()].map((record) => path.relative(repoRoot, record.path)),
    findings,
  };
}

export function validateExternalGateVerdictText(content: string): PreflightFinding[] {
  const body = extractFirstYamlBlock(content) ?? content;
  const findings: PreflightFinding[] = [];

  if (!hasConcreteField(body, "schema_version")) {
    findings.push(block("invalid_external_gate_v0", "external-gate-verdict", "External Gate v0 verdict is missing schema_version."));
  } else if (fieldValue(body, "schema_version") !== "shirube-external-gate-verdict/v0") {
    findings.push(block("invalid_external_gate_v0", "external-gate-verdict", "External Gate v0 verdict has an unsupported schema_version."));
  }

  const overall = fieldValue(body, "overall");
  if (!overall || !VALID_EXTERNAL_OVERALL.has(overall)) {
    findings.push(block("invalid_external_gate_v0", "external-gate-verdict", "External Gate v0 verdict has invalid overall."));
  }

  const allowed = fieldValue(body, "allowed_next_action");
  if (!allowed || !VALID_EXTERNAL_NEXT_ACTION.has(allowed)) {
    findings.push(block("invalid_external_gate_v0", "external-gate-verdict", "External Gate v0 verdict has invalid allowed_next_action."));
  }

  return findings;
}

function validateRecord(spec: RequiredRecord, file: string, content: string): PreflightFinding[] {
  const findings: PreflightFinding[] = [];

  if (fieldNames(content).length === 0) {
    findings.push(block("malformed_record", file, "Record has no structured key/value fields."));
    return findings;
  }

  for (const field of spec.requiredFields) {
    if (!hasField(content, field)) {
      findings.push(block("missing_required_field", file, `Required field is missing: ${field}`));
    }
  }

  for (const field of spec.requiredConcreteFields ?? []) {
    if (!hasConcreteField(content, field)) {
      findings.push(block("missing_concrete_field", file, `Required concrete field is missing or placeholder: ${field}`));
    }
  }

  for (const field of spec.requiredShapeFields ?? []) {
    if (!hasField(content, field)) {
      findings.push(block("missing_semantic_record_field", file, `Semantic-recorded check field is missing: ${field}`));
    }
  }

  if (spec.verdictRequired) {
    const verdict = fieldValue(content, "verdict");
    if (!verdict || !VALID_RECORD_VERDICTS.has(verdict)) {
      findings.push(block("invalid_verdict", file, "Required verdict must be PASS, WARN, or BLOCK."));
    } else if (verdict === "BLOCK") {
      findings.push(block("blocked_record", file, "Record verdict is BLOCK."));
    }
  }

  if (spec.allowedNextActionRequired && !hasConcreteField(content, "allowed_next_action")) {
    findings.push(block("missing_allowed_next_action", file, "Required allowed_next_action is missing or placeholder."));
  }

  return findings;
}

function validateRecordOrdering(
  loaded: Map<string, { spec: RequiredRecord; path: string; content: string }>,
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  if (loaded.has("cell_intake_gate_record") && !loaded.has("design_consolidation_gate_record")) {
    findings.push(block("missing_design_before_intake", "cell-intake-gate-record.yml", "Design Consolidation Gate must exist before Cell Intake."));
  }
  if (loaded.has("runner_handoff") && !loaded.has("cell_intake_gate_record")) {
    findings.push(block("missing_intake_before_handoff", "runner-handoff.yml", "Cell Intake Gate must exist before runner handoff."));
  }
  return findings;
}

function validateBootstrapExternalGate(
  loaded: Map<string, { spec: RequiredRecord; path: string; content: string }>,
  allowBootstrapExternalGate: boolean,
): PreflightFinding[] {
  const record = loaded.get("design_consolidation_gate_record");
  if (!record) return [];

  const usesExternalGate = hasField(record.content, "external_gate_v0_ref");
  if (!usesExternalGate) return [];

  const markedBootstrap = fieldValue(record.content, "external_gate_bootstrap_exception") === "true";
  if (!markedBootstrap) {
    return [
      block(
        "external_gate_not_bootstrap_marked",
        "design-consolidation-gate-record.yml",
        "External Gate v0 evidence may be referenced only when marked as a bootstrap exception.",
      ),
    ];
  }
  if (!allowBootstrapExternalGate) {
    return [
      block(
        "external_gate_bootstrap_not_allowed",
        "design-consolidation-gate-record.yml",
        "External Gate v0 comment evidence is allowed only for the bootstrap exception.",
      ),
    ];
  }
  return [];
}

function fieldNames(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*):/);
    if (match) names.push(match[1]);
  }
  return names;
}

function hasField(content: string, field: string): boolean {
  return new RegExp(`^\\s*${escapeRegExp(field)}\\s*:`, "m").test(content);
}

function hasConcreteField(content: string, field: string): boolean {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^(\\s*)${escapeRegExp(field)}\\s*:\\s*(.*)$`));
    if (!match) continue;

    if (isConcreteValue(match[2])) return true;

    const indent = match[1].length;
    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const line = lines[j];
      if (line.trim().length === 0) continue;
      const nestedKey = line.match(/^(\s*)[A-Za-z_][A-Za-z0-9_-]*\s*:/);
      if (nestedKey && nestedKey[1].length <= indent) break;
      const item = line.match(/^\s*-\s+(.+)$/);
      if (item && isConcreteValue(item[1])) return true;
    }
    return false;
  }
  return false;
}

function fieldValue(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^\\s*${escapeRegExp(field)}\\s*:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  return stripQuotes(match[1].trim());
}

function isConcreteValue(value: string): boolean {
  const normalized = stripQuotes(value.trim());
  if (normalized.length === 0) return false;
  if (normalized === "[]" || normalized === "{}" || normalized === "null") return false;
  if (/^<[^>]+>$/.test(normalized)) return false;
  if (/^(TBD|TODO|pending placeholder)$/i.test(normalized)) return false;
  return true;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function extractFirstYamlBlock(content: string): string | null {
  const match = content.match(/```ya?ml\s*\n([\s\S]*?)\n```/i);
  return match?.[1] ?? null;
}

function block(code: string, file: string, message: string): PreflightFinding {
  return { severity: "BLOCK", code, file, message };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatHuman(report: PreflightReport): string {
  const lines = [
    `Shirube preflight-lite: ${report.verdict}`,
    `allowed_next_action: ${report.allowed_next_action}`,
    `checked_files: ${report.checked_files.length}`,
  ];
  for (const finding of report.findings) {
    lines.push(`${finding.severity} ${finding.code}${finding.file ? ` ${finding.file}` : ""}: ${finding.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): { options: PreflightOptions; json: boolean } {
  const options: PreflightOptions = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--phase-dir") {
      options.phaseDir = argv[++i];
    } else if (arg === "--repo-root") {
      options.repoRoot = argv[++i];
    } else if (arg === "--no-bootstrap-external-gate") {
      options.allowBootstrapExternalGate = false;
    }
  }
  return { options, json };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const { options, json } = parseArgs(process.argv.slice(2));
  const report = runPreflightLite(options);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatHuman(report));
  process.exitCode = report.verdict === "BLOCK" ? 2 : 0;
}
