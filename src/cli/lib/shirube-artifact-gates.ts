import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export type ShirubeGateVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED" | "FAILURE";

export interface ShirubeGateFinding {
  code: string;
  message: string;
  path?: string;
  field?: string;
}

export interface ShirubeGateEvidence {
  code: string;
  source: string;
  detail: string;
  path?: string;
}

export interface ShirubeGateReport {
  schema: string;
  verdict: ShirubeGateVerdict;
  would_block: boolean;
  blockers: ShirubeGateFinding[];
  warnings: ShirubeGateFinding[];
  evidence: ShirubeGateEvidence[];
}

export interface ArtifactConsistencyContext {
  expectedHead?: string;
  expectedBase?: string;
}

export interface EvidenceCheckInput extends ArtifactConsistencyContext {
  files: string[];
}

export interface WaiverCheckInput {
  files: string[];
  targetCell?: string;
  targetCheck?: string;
  checkedAtUtc?: string;
}

export interface AuthorityCheckInput {
  implementation_actor?: string;
  implementation?: {
    actor?: string;
    role?: string;
  };
  approvals?: AuthorityApproval[];
  approval_chain?: AuthorityApproval[];
}

export interface AuthorityApproval {
  authority?: string;
  actor?: string;
  role?: string;
}

const EVIDENCE_REQUIRED_FIELDS = [
  "schema_version",
  "EVIDENCE-ID",
  "SPEC-ID",
  "CELL-ID",
  "IMPL-ID",
  "PR-ID",
  "commit_sha",
  "audit_results",
  "ci_runs",
  "artifact_locations",
  "post_merge_verification",
  "release_or_rollback_decision",
];

const WAIVER_REQUIRED_FIELDS = [
  "schema_version",
  "WAIVER-ID",
  "target_cell",
  "target_check",
  "reason",
  "risk_accepted",
  "compensating_controls",
  "approver",
  "expiry_date",
  "follow_up_issue",
];

const CANONICAL_AUTHORITY_ROLES = new Set([
  "repo_owner",
  "release_owner",
  "security_owner",
  "evidence_owner",
  "domain_designer",
  "shirube_command_owner",
]);

const REQUIRED_AUTHORITIES = ["audit", "merge", "release"];
const REAL_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const PLACEHOLDER_PATTERN = /^<[^>]+>$|placeholder/i;
const PENDING_PATTERN = /\bpending(?:[-_][a-z0-9-]+)?\b/i;

export function buildEvidenceCheck(input: EvidenceCheckInput): ShirubeGateReport {
  const blockers: ShirubeGateFinding[] = [];
  const warnings: ShirubeGateFinding[] = [];
  const evidence: ShirubeGateEvidence[] = [];

  if (input.files.length === 0) {
    blockers.push({
      code: "missing_evidence_artifact",
      message: "No evidence artifact was found.",
    });
  }

  for (const file of input.files) {
    const record = readRecord(file);
    evidence.push({ code: "evidence_artifact", source: "file", detail: file, path: file });
    requireFields(record, file, EVIDENCE_REQUIRED_FIELDS, blockers);
    const schemaVersion = stringField(record, "schema_version");
    if (schemaVersion !== undefined && schemaVersion !== "shirube-evidence/v1") {
      blockers.push({
        code: "invalid_evidence_schema_version",
        message: "Evidence artifact must use schema_version shirube-evidence/v1.",
        path: file,
        field: "schema_version",
      });
    }
    blockers.push(...checkArtifactConsistency(record, { path: file, ...input }));
  }

  return buildGateReport("shirube-evidence-check/v1", blockers, warnings, evidence);
}

export function buildWaiverCheck(input: WaiverCheckInput): ShirubeGateReport {
  const blockers: ShirubeGateFinding[] = [];
  const warnings: ShirubeGateFinding[] = [];
  const evidence: ShirubeGateEvidence[] = [];

  if (input.files.length === 0) {
    evidence.push({
      code: "no_waiver_artifact",
      source: "file_scan",
      detail: "No waiver artifact found; no waiver is being applied.",
    });
    return buildGateReport("shirube-waiver-check/v1", blockers, warnings, evidence);
  }

  for (const file of input.files) {
    const record = readRecord(file);
    evidence.push({ code: "waiver_artifact", source: "file", detail: file, path: file });
    requireFields(record, file, WAIVER_REQUIRED_FIELDS, blockers);
    const schemaVersion = stringField(record, "schema_version");
    if (schemaVersion !== undefined && schemaVersion !== "shirube-waiver/v1") {
      blockers.push({
        code: "invalid_waiver_schema_version",
        message: "Waiver artifact must use schema_version shirube-waiver/v1.",
        path: file,
        field: "schema_version",
      });
    }
    const targetCell = stringField(record, "target_cell");
    if (input.targetCell && targetCell !== input.targetCell) {
      blockers.push({
        code: "waiver_scope_mismatch",
        message: `Waiver target_cell ${targetCell ?? "<missing>"} does not match ${input.targetCell}.`,
        path: file,
        field: "target_cell",
      });
    }
    const targetCheck = stringField(record, "target_check");
    if (input.targetCheck && targetCheck !== input.targetCheck) {
      blockers.push({
        code: "waiver_scope_mismatch",
        message: `Waiver target_check ${targetCheck ?? "<missing>"} does not match ${input.targetCheck}.`,
        path: file,
        field: "target_check",
      });
    }
    const expiryDate = stringField(record, "expiry_date");
    const checkedAt = Date.parse(input.checkedAtUtc ?? new Date().toISOString());
    const expiry = expiryDate ? Date.parse(`${expiryDate}T23:59:59Z`) : Number.NaN;
    if (expiryDate && Number.isNaN(expiry)) {
      blockers.push({
        code: "invalid_waiver_expiry",
        message: "Waiver expiry_date is not a valid ISO date.",
        path: file,
        field: "expiry_date",
      });
    } else if (expiryDate && !Number.isNaN(checkedAt) && expiry <= checkedAt) {
      blockers.push({
        code: "expired_waiver",
        message: "Waiver expiry_date is not in the future.",
        path: file,
        field: "expiry_date",
      });
    }
    if (stringField(record, "status") === "expired") {
      blockers.push({
        code: "expired_waiver",
        message: "Waiver status is expired.",
        path: file,
        field: "status",
      });
    }
    blockers.push(...checkNoPlaceholderOrPending(record, file));
  }

  return buildGateReport("shirube-waiver-check/v1", blockers, warnings, evidence);
}

export function buildAuthorityCheck(input: AuthorityCheckInput): ShirubeGateReport {
  const blockers: ShirubeGateFinding[] = [];
  const warnings: ShirubeGateFinding[] = [];
  const evidence: ShirubeGateEvidence[] = [];
  const implementationActor = input.implementation_actor ?? input.implementation?.actor;
  const approvals = input.approvals ?? input.approval_chain ?? [];

  if (!presentString(implementationActor)) {
    blockers.push({
      code: "missing_implementation_actor",
      message: "Authority check requires implementation_actor.",
      field: "implementation_actor",
    });
  } else {
    evidence.push({
      code: "implementation_actor",
      source: "authority_input",
      detail: implementationActor,
    });
  }

  for (const authority of REQUIRED_AUTHORITIES) {
    const approval = approvals.find((candidate) => candidate.authority === authority);
    if (!approval) {
      blockers.push({
        code: "missing_authority_approval",
        message: `${authority} approval is required.`,
        field: authority,
      });
      continue;
    }
    if (!presentString(approval.actor)) {
      blockers.push({
        code: "missing_authority_actor",
        message: `${authority} approval is missing actor.`,
        field: `${authority}.actor`,
      });
    }
    if (!approval.role || !CANONICAL_AUTHORITY_ROLES.has(approval.role)) {
      blockers.push({
        code: "noncanonical_authority_role",
        message: `${authority} approval must use a canonical scaffold role.`,
        field: `${authority}.role`,
      });
    }
    if (approval.actor && implementationActor && approval.actor === implementationActor) {
      blockers.push({
        code: "maker_checker_violation",
        message: `${authority} approver must differ from implementation actor.`,
        field: `${authority}.actor`,
      });
    }
    if (approval.actor && approval.role) {
      evidence.push({
        code: "authority_approval",
        source: "authority_input",
        detail: `${authority}:${approval.role}:${approval.actor}`,
      });
    }
  }

  return buildGateReport("shirube-authority-check/v1", blockers, warnings, evidence);
}

export function checkArtifactConsistency(
  record: Record<string, unknown>,
  context: ArtifactConsistencyContext & { path?: string },
): ShirubeGateFinding[] {
  const blockers: ShirubeGateFinding[] = [];
  const commitSha = findStringField(record, "commit_sha");

  if (!commitSha || !REAL_SHA_PATTERN.test(commitSha)) {
    blockers.push({
      code: "invalid_commit_sha",
      message: "commit_sha must be a real git SHA.",
      path: context.path,
      field: "commit_sha",
    });
  } else if (context.expectedHead && commitSha !== context.expectedHead) {
    blockers.push({
      code: "head_mismatch",
      message: `commit_sha ${commitSha} does not match expected head ${context.expectedHead}.`,
      path: context.path,
      field: "commit_sha",
    });
  }

  if (context.expectedBase) {
    const baseRef = findStringField(record, "base_ref") ?? findStringField(record, "base");
    if (!baseRef) {
      blockers.push({
        code: "missing_base_ref",
        message: "Expected base verification requires base_ref or base.",
        path: context.path,
        field: "base_ref",
      });
    } else if (baseRef !== context.expectedBase) {
      blockers.push({
        code: "base_mismatch",
        message: `base_ref ${baseRef} does not match expected base ${context.expectedBase}.`,
        path: context.path,
        field: "base_ref",
      });
    }
  }

  blockers.push(...checkNoPlaceholderOrPending(record, context.path));

  const ratifyStatus = findStringField(record, "ratify_status") ?? findStringField(record, "ceo_approval");
  if (ratifyStatus && /ratified/i.test(ratifyStatus)) {
    const hasRef = /\bref\b/i.test(ratifyStatus) ||
      presentString(findStringField(record, "ratify_ref")) ||
      presentString(findStringField(record, "ceo_approval_ref"));
    if (!hasRef) {
      blockers.push({
        code: "ratify_record_missing_ref",
        message: "RATIFIED status must include a durable reference.",
        path: context.path,
      });
    }
  }

  return blockers;
}

export function readRecord(file: string): Record<string, unknown> {
  if (!existsSync(file)) {
    throw new Error(`Artifact not found: ${file}`);
  }
  const text = readFileSync(file, "utf8");
  const parsed = extname(file) === ".json" ? JSON.parse(text) : parseYamlWithRuby(text);
  if (!isRecord(parsed)) {
    throw new Error(`Artifact must be an object: ${file}`);
  }
  return parsed;
}

export function findArtifactFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...findArtifactFiles(fullPath));
      continue;
    }
    if (/\.ya?ml$|\.json$/i.test(fullPath)) {
      files.push(relative(process.cwd(), fullPath).replace(/\\/g, "/"));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function buildFailureReport(message: string): ShirubeGateReport {
  return {
    schema: "shirube-artifact-gate-failure/v1",
    verdict: "FAILURE",
    would_block: false,
    blockers: [],
    warnings: [{
      code: "gate_execution_failure",
      message,
    }],
    evidence: [],
  };
}

function buildGateReport(
  schema: string,
  blockers: ShirubeGateFinding[],
  warnings: ShirubeGateFinding[],
  evidence: ShirubeGateEvidence[],
): ShirubeGateReport {
  return {
    schema,
    verdict: blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS",
    would_block: blockers.length > 0,
    blockers,
    warnings,
    evidence,
  };
}

function requireFields(
  record: Record<string, unknown>,
  path: string,
  fields: string[],
  blockers: ShirubeGateFinding[],
): void {
  for (const field of fields) {
    if (!present(record[field])) {
      blockers.push({
        code: "missing_required_field",
        message: `${field} is required.`,
        path,
        field,
      });
    }
  }
}

function checkNoPlaceholderOrPending(value: unknown, path?: string): ShirubeGateFinding[] {
  const findings: ShirubeGateFinding[] = [];
  walkStrings(value, (text, fieldPath) => {
    if (PLACEHOLDER_PATTERN.test(text) || PENDING_PATTERN.test(text)) {
      findings.push({
        code: "placeholder_or_pending_value",
        message: `${fieldPath} contains placeholder or pending value.`,
        path,
        field: fieldPath,
      });
    }
  });
  return findings;
}

function walkStrings(value: unknown, visit: (text: string, fieldPath: string) => void, fieldPath = "$"): void {
  if (typeof value === "string") {
    visit(value, fieldPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, `${fieldPath}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      walkStrings(item, visit, `${fieldPath}.${key}`);
    }
  }
}

function findStringField(record: Record<string, unknown>, key: string): string | undefined {
  const direct = stringField(record, key);
  if (direct !== undefined) return direct;
  for (const value of Object.values(record)) {
    if (isRecord(value)) {
      const nested = findStringField(value, key);
      if (nested !== undefined) return nested;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const nested = findStringField(item, key);
        if (nested !== undefined) return nested;
      }
    }
  }
  return undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function present(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return presentString(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function presentString(value: string | undefined): value is string {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== "" &&
    !["null", "none", "n/a", "pending", "placeholder", "<pending>"].includes(trimmed.toLowerCase()) &&
    !PLACEHOLDER_PATTERN.test(trimmed);
}

function parseYamlWithRuby(text: string): unknown {
  const json = execFileSync("ruby", [
    "-ryaml",
    "-rjson",
    "-rdate",
    "-e",
    [
      "body = YAML.safe_load(STDIN.read, permitted_classes: [Date, Time], aliases: true)",
      "puts JSON.generate(body)",
    ].join("; "),
  ], { input: text, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(json);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
