export type ShirubePhase =
  | "INTAKE"
  | "REPO_SPEC_DRAFTED"
  | "REPO_SPEC_CONFIRMED"
  | "PREMISE_SPEC_REQUIRED"
  | "PREMISE_SPEC_DRAFTED"
  | "PREMISE_SPEC_CONFIRMED"
  | "INVENTORY_REQUIRED"
  | "INVENTORY_DRAFTED"
  | "INVENTORY_CONFIRMED"
  | "CELL_DRAFTED"
  | "CELL_TRACE_PASSED"
  | "IMPL_DRAFTED"
  | "IMPL_AUDITED"
  | "EXECUTION_READY"
  | "IMPLEMENTED"
  | "CI_PASSED"
  | "CODE_AUDITED"
  | "MERGED"
  | "POST_MERGE_VERIFIED"
  | "RELEASED"
  | "BLOCKED"
  | "HUMAN_DECISION_REQUIRED"
  | "WAIVER_REQUIRED";

export type ShirubePhaseVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED";

export interface ShirubePhaseArtifact {
  path: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface ShirubePhaseCheckInput {
  schema?: "shirube-phase-check-fixture/v1";
  repo: string;
  pr: number;
  head_sha: string;
  title?: string;
  body?: string;
  labels?: string[];
  changed_files: string[];
  repo_files?: string[];
  artifacts?: ShirubePhaseArtifact[];
  checked_at_utc?: string;
}

export interface ShirubePhaseFinding {
  code: string;
  message: string;
  path?: string;
  phase?: ShirubePhase;
}

export interface ShirubePhaseEvidence {
  code: string;
  status: "present" | "missing" | "not_required" | "narrative_only";
  source: string;
  detail: string;
  path?: string;
  phase?: ShirubePhase;
}

export interface ShirubePhaseCheckReport {
  schema: "shirube-phase-check/v1";
  repo: string;
  pr: number;
  head_sha: string;
  current_phase: ShirubePhase;
  allowed_next_phases: ShirubePhase[];
  verdict: ShirubePhaseVerdict;
  blockers: ShirubePhaseFinding[];
  warnings: ShirubePhaseFinding[];
  required_evidence: ShirubePhaseEvidence[];
  observed_evidence: ShirubePhaseEvidence[];
}

interface StructuredFacts {
  repoSpecPresent: boolean;
  ownerConfirmationRequired: boolean;
  ownerConfirmationPresent: boolean;
  ownerConfirmationRef?: string;
  premiseRequired: boolean;
  premiseRef?: string;
  premiseConfirmed: boolean;
  inventoryRequired: boolean;
  inventoryRef?: string;
  inventoryConfirmed: boolean;
  cellPresent: boolean;
  cellTracePresent: boolean;
  implPresent: boolean;
  implAuditPresent: boolean;
  narrativeConfirmationClaims: string[];
  observed: ShirubePhaseEvidence[];
  required: ShirubePhaseEvidence[];
}

interface StructuredField {
  key: string;
  value: string;
  source: string;
  path?: string;
}

const PHASE_SCHEMA = "shirube-phase-check/v1" as const;
const PLACEHOLDER_PATTERN = /^<[^>]+>$/;
const APPROVED_REPO_SPEC_BASELINE_PATHS = [
  ".shirube/repo-spec.yaml",
  ".shirube/repo-spec.yml",
  "repo-spec.yaml",
  "repo-spec.yml",
];

const PHASE_ORDER: ShirubePhase[] = [
  "INTAKE",
  "REPO_SPEC_DRAFTED",
  "REPO_SPEC_CONFIRMED",
  "PREMISE_SPEC_REQUIRED",
  "PREMISE_SPEC_DRAFTED",
  "PREMISE_SPEC_CONFIRMED",
  "INVENTORY_REQUIRED",
  "INVENTORY_DRAFTED",
  "INVENTORY_CONFIRMED",
  "CELL_DRAFTED",
  "CELL_TRACE_PASSED",
  "IMPL_DRAFTED",
  "IMPL_AUDITED",
  "EXECUTION_READY",
  "IMPLEMENTED",
  "CI_PASSED",
  "CODE_AUDITED",
  "MERGED",
  "POST_MERGE_VERIFIED",
  "RELEASED",
];

export function buildShirubePhaseCheck(input: ShirubePhaseCheckInput): ShirubePhaseCheckReport {
  const normalizedInput = normalizeInput(input);
  const facts = collectStructuredFacts(normalizedInput);
  const blockers: ShirubePhaseFinding[] = [];
  const warnings: ShirubePhaseFinding[] = [];

  if (facts.ownerConfirmationRequired && !facts.ownerConfirmationPresent) {
    blockers.push({
      code: "missing_owner_confirmation",
      phase: "REPO_SPEC_DRAFTED",
      message: "Owner/domain-designer confirmation is required but no structured confirmation evidence was found.",
    });
  }

  if (facts.premiseRequired && !facts.premiseRef) {
    blockers.push({
      code: "missing_premise_ref",
      phase: "PREMISE_SPEC_REQUIRED",
      message: "premise_required is true, but no structured premise_ref was found.",
    });
  }

  if (facts.premiseRef && !facts.premiseConfirmed) {
    blockers.push({
      code: "missing_premise_confirmation",
      phase: "PREMISE_SPEC_DRAFTED",
      message: "A premise_ref exists, but no structured premise confirmation evidence was found.",
    });
  }

  if (facts.inventoryRequired && !facts.inventoryRef) {
    blockers.push({
      code: "missing_inventory_ref",
      phase: "INVENTORY_REQUIRED",
      message: "inventory_required is true, but no structured inventory_ref was found.",
    });
  }

  if (facts.inventoryRef && !facts.inventoryConfirmed) {
    blockers.push({
      code: "missing_inventory_confirmation",
      phase: "INVENTORY_DRAFTED",
      message: "An inventory_ref exists, but no structured inventory confirmation evidence was found.",
    });
  }

  if ((facts.cellPresent || facts.implPresent) && facts.premiseRequired && !facts.premiseConfirmed) {
    blockers.push({
      code: "cell_or_impl_before_premise_confirmation",
      phase: facts.premiseRef ? "PREMISE_SPEC_DRAFTED" : "PREMISE_SPEC_REQUIRED",
      message: "Cell/Impl artifacts exist before required parent premise confirmation.",
    });
  }

  if ((facts.cellPresent || facts.implPresent) && facts.inventoryRequired && !facts.inventoryConfirmed) {
    blockers.push({
      code: "cell_or_impl_before_inventory_confirmation",
      phase: facts.inventoryRef ? "INVENTORY_DRAFTED" : "INVENTORY_REQUIRED",
      message: "Cell/Impl artifacts exist before required inventory confirmation.",
    });
  }

  if (facts.narrativeConfirmationClaims.length > 0) {
    blockers.push({
      code: "narrative_confirmation_without_structured_evidence",
      message: `Narrative confirmation claim(s) are not machine evidence: ${facts.narrativeConfirmationClaims.join(", ")}.`,
    });
  }

  if (!facts.repoSpecPresent) {
    warnings.push({
      code: "repo_spec_not_observed",
      phase: "INTAKE",
      message: "No repo-spec baseline or explicit repo-spec artifact was observed.",
    });
  }

  const currentPhase = determineCurrentPhase(facts);
  const allowedNextPhases = determineAllowedNextPhases(currentPhase, facts, blockers);
  const verdict = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS";

  return {
    schema: PHASE_SCHEMA,
    repo: normalizedInput.repo,
    pr: normalizedInput.pr,
    head_sha: normalizedInput.head_sha,
    current_phase: currentPhase,
    allowed_next_phases: allowedNextPhases,
    verdict,
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
    required_evidence: uniqueEvidence(facts.required),
    observed_evidence: uniqueEvidence(facts.observed),
  };
}

function normalizeInput(input: ShirubePhaseCheckInput): ShirubePhaseCheckInput {
  if (!input.repo || !input.repo.includes("/")) {
    throw new Error("Phase check input missing repo owner/name.");
  }
  if (!Number.isInteger(input.pr) || input.pr <= 0) {
    throw new Error("Phase check input missing positive PR number.");
  }
  if (!input.head_sha) {
    throw new Error("Phase check input missing head_sha.");
  }
  if (!Array.isArray(input.changed_files)) {
    throw new Error("Phase check input missing changed_files.");
  }
  return {
    ...input,
    changed_files: input.changed_files.map(normalizePath).filter(Boolean),
    repo_files: input.repo_files?.map(normalizePath).filter(Boolean),
    labels: input.labels ?? [],
    artifacts: (input.artifacts ?? []).map((artifact) => ({
      ...artifact,
      path: normalizePath(artifact.path),
    })).filter((artifact) => artifact.path),
  };
}

function collectStructuredFacts(input: ShirubePhaseCheckInput): StructuredFacts {
  const changedFiles = uniqueSorted(input.changed_files);
  const repoFiles = uniqueSorted(input.repo_files ?? []);
  const artifacts = input.artifacts ?? [];
  const prText = [
    input.title ?? "",
    input.body ?? "",
    ...(input.labels ?? []),
  ].join("\n");
  const fields = [
    ...parseStructuredFields(prText, "pull_request.metadata"),
    ...artifacts.flatMap((artifact) => [
      ...parseMetadataFields(artifact.metadata, artifact.path),
      ...parseStructuredFields(artifact.body ?? "", `artifact:${artifact.path}`, artifact.path),
    ]),
  ];

  const repoSpecPresent =
    changedFiles.some(isRepoSpecPath) ||
    artifacts.some((artifact) => isRepoSpecPath(artifact.path)) ||
    APPROVED_REPO_SPEC_BASELINE_PATHS.some((path) => repoFiles.includes(path)) ||
    hasStructuredArtifactRef(prText, ["Repo Spec", "repo-spec"], isRepoSpecPath);
  const ownerConfirmationRequired =
    getBooleanField(fields, "owner_confirmation_required") === true ||
    getBooleanField(fields, "domain_designer_confirmation_required") === true;
  const ownerConfirmationRef =
    getStringField(fields, "owner_confirmation_ref") ??
    getStringField(fields, "domain_designer_confirmation_ref") ??
    extractStructuredLineRef(prText, ["Owner Confirmation", "Domain Designer Confirmation"]);
  const ownerConfirmationPresent = Boolean(ownerConfirmationRef);
  const premiseRequired = getBooleanField(fields, "premise_required") === true;
  const premiseRef = getStringField(fields, "premise_ref") ?? extractStructuredLineRef(prText, ["Premise Spec", "Premise"]);
  const premiseConfirmed =
    getBooleanField(fields, "premise_confirmed") === true ||
    Boolean(getStringField(fields, "premise_confirmation_ref")) ||
    Boolean(extractStructuredLineRef(prText, ["Premise Confirmation"]));
  const inventoryRequired = getBooleanField(fields, "inventory_required") === true;
  const inventoryRef =
    getStringField(fields, "inventory_ref") ??
    extractStructuredLineRef(prText, ["Inventory", "Inventory Evidence"]);
  const inventoryConfirmed =
    getBooleanField(fields, "inventory_confirmed") === true ||
    Boolean(getStringField(fields, "inventory_confirmation_ref")) ||
    Boolean(extractStructuredLineRef(prText, ["Inventory Confirmation"]));
  const cellPresent =
    extractIds(prText, "CELL-ID").length > 0 ||
    changedFiles.some(isCellPath) ||
    artifacts.some((artifact) => isCellPath(artifact.path));
  const cellTracePresent =
    changedFiles.some(isTracePath) ||
    artifacts.some((artifact) => isTracePath(artifact.path)) ||
    hasStructuredArtifactRef(prText, ["Spec-to-Cell Trace", "Spec to Cell Trace", "Trace Matrix"], isTracePath);
  const implPresent =
    extractIds(prText, "IMPL-ID").length > 0 ||
    changedFiles.some(isImplPath) ||
    artifacts.some((artifact) => isImplPath(artifact.path));
  const implAuditPresent =
    changedFiles.some((path) => isImplAuditPath(path)) ||
    artifacts.some((artifact) => isImplAuditPath(artifact.path, artifact.body)) ||
    hasStructuredArtifactRef(prText, ["Impl Audit", "Implementation Audit"], (path) => isImplAuditPath(path));
  const narrativeConfirmationClaims = detectNarrativeConfirmationClaims(prText, {
    ownerConfirmationPresent,
    premiseConfirmed,
    inventoryConfirmed,
  });

  const observed: ShirubePhaseEvidence[] = [];
  const required: ShirubePhaseEvidence[] = [];

  addObserved(observed, repoSpecPresent, "repo_spec", "repo baseline or explicit PR artifact", firstMatchingPath([
    ...changedFiles,
    ...artifacts.map((artifact) => artifact.path),
    ...repoFiles.filter((path) => APPROVED_REPO_SPEC_BASELINE_PATHS.includes(path)),
  ], isRepoSpecPath));
  addObserved(observed, ownerConfirmationPresent, "owner_confirmation", ownerConfirmationRef ?? "structured owner/domain-designer confirmation");
  addObserved(observed, Boolean(premiseRef), "premise_ref", premiseRef ?? "structured premise reference");
  addObserved(observed, premiseConfirmed, "premise_confirmation", "structured premise confirmation");
  addObserved(observed, Boolean(inventoryRef), "inventory_ref", inventoryRef ?? "structured inventory reference");
  addObserved(observed, inventoryConfirmed, "inventory_confirmation", "structured inventory confirmation");
  addObserved(observed, cellPresent, "cell_record", "CELL-ID or changed Cell artifact", firstMatchingPath(changedFiles, isCellPath));
  addObserved(observed, cellTracePresent, "spec_to_cell_trace", "structured trace reference or changed trace artifact");
  addObserved(observed, implPresent, "impl_record", "IMPL-ID or changed Impl artifact", firstMatchingPath(changedFiles, isImplPath));
  addObserved(observed, implAuditPresent, "impl_audit", "structured Impl audit reference or changed audit artifact");
  for (const claim of narrativeConfirmationClaims) {
    observed.push({
      code: "narrative_confirmation_claim",
      status: "narrative_only",
      source: "pull_request.metadata",
      detail: claim,
    });
  }

  addRequired(required, true, repoSpecPresent, "repo_spec", "Repo-spec baseline or explicit repo-spec artifact is needed to leave INTAKE.");
  addRequired(
    required,
    ownerConfirmationRequired,
    ownerConfirmationPresent,
    "owner_confirmation",
    "Owner/domain-designer confirmation is required by planning_hierarchy.",
  );
  addRequired(
    required,
    premiseRequired,
    Boolean(premiseRef),
    "premise_ref",
    "premise_required requires premise_ref before Cell Intake.",
  );
  addRequired(
    required,
    premiseRequired || Boolean(premiseRef),
    premiseConfirmed,
    "premise_confirmation",
    "Required premise specs must be confirmed before Cell/Impl execution.",
  );
  addRequired(
    required,
    inventoryRequired,
    Boolean(inventoryRef),
    "inventory_ref",
    "inventory_required requires inventory_ref before Cell Intake.",
  );
  addRequired(
    required,
    inventoryRequired || Boolean(inventoryRef),
    inventoryConfirmed,
    "inventory_confirmation",
    "Required inventory must be confirmed before Cell/Impl execution.",
  );

  return {
    repoSpecPresent,
    ownerConfirmationRequired,
    ownerConfirmationPresent,
    ownerConfirmationRef,
    premiseRequired,
    premiseRef,
    premiseConfirmed,
    inventoryRequired,
    inventoryRef,
    inventoryConfirmed,
    cellPresent,
    cellTracePresent,
    implPresent,
    implAuditPresent,
    narrativeConfirmationClaims,
    observed,
    required,
  };
}

function determineCurrentPhase(facts: StructuredFacts): ShirubePhase {
  if (!facts.repoSpecPresent) return "INTAKE";
  if (facts.ownerConfirmationRequired && !facts.ownerConfirmationPresent) return "REPO_SPEC_DRAFTED";
  if (facts.premiseRequired && !facts.premiseRef) return "PREMISE_SPEC_REQUIRED";
  if (facts.premiseRef && !facts.premiseConfirmed) return "PREMISE_SPEC_DRAFTED";
  if (facts.inventoryRequired && !facts.inventoryRef) return "INVENTORY_REQUIRED";
  if (facts.inventoryRef && !facts.inventoryConfirmed) return "INVENTORY_DRAFTED";
  if (facts.implPresent && facts.implAuditPresent && parentsSatisfied(facts)) return "EXECUTION_READY";
  if (facts.implAuditPresent) return "IMPL_AUDITED";
  if (facts.implPresent) return "IMPL_DRAFTED";
  if (facts.cellTracePresent) return "CELL_TRACE_PASSED";
  if (facts.cellPresent) return "CELL_DRAFTED";
  if (facts.inventoryRequired && facts.inventoryConfirmed) return "INVENTORY_CONFIRMED";
  if (facts.premiseRequired && facts.premiseConfirmed) return "PREMISE_SPEC_CONFIRMED";
  return "REPO_SPEC_CONFIRMED";
}

function determineAllowedNextPhases(
  currentPhase: ShirubePhase,
  facts: StructuredFacts,
  blockers: ShirubePhaseFinding[],
): ShirubePhase[] {
  if (blockers.length > 0) {
    if (currentPhase === "REPO_SPEC_DRAFTED") return ["REPO_SPEC_CONFIRMED"];
    if (currentPhase === "PREMISE_SPEC_REQUIRED") return ["PREMISE_SPEC_DRAFTED"];
    if (currentPhase === "PREMISE_SPEC_DRAFTED") return ["PREMISE_SPEC_CONFIRMED"];
    if (currentPhase === "INVENTORY_REQUIRED") return ["INVENTORY_DRAFTED"];
    if (currentPhase === "INVENTORY_DRAFTED") return ["INVENTORY_CONFIRMED"];
    return ["HUMAN_DECISION_REQUIRED"];
  }

  if (currentPhase === "REPO_SPEC_CONFIRMED") {
    if (facts.premiseRequired) return ["PREMISE_SPEC_REQUIRED", "PREMISE_SPEC_DRAFTED"];
    if (facts.inventoryRequired) return ["INVENTORY_REQUIRED", "INVENTORY_DRAFTED"];
    return ["CELL_DRAFTED"];
  }
  if (currentPhase === "PREMISE_SPEC_CONFIRMED") {
    return facts.inventoryRequired ? ["INVENTORY_REQUIRED", "INVENTORY_DRAFTED"] : ["CELL_DRAFTED"];
  }
  if (currentPhase === "INVENTORY_CONFIRMED") return ["CELL_DRAFTED"];
  if (currentPhase === "CELL_DRAFTED") return facts.cellTracePresent ? ["IMPL_DRAFTED"] : ["CELL_TRACE_PASSED", "IMPL_DRAFTED"];
  if (currentPhase === "CELL_TRACE_PASSED") return ["IMPL_DRAFTED"];
  if (currentPhase === "IMPL_DRAFTED") return ["IMPL_AUDITED"];
  if (currentPhase === "IMPL_AUDITED") return ["EXECUTION_READY"];
  if (currentPhase === "EXECUTION_READY") return ["IMPLEMENTED"];

  const index = PHASE_ORDER.indexOf(currentPhase);
  return index >= 0 && index < PHASE_ORDER.length - 1 ? [PHASE_ORDER[index + 1]] : [];
}

function parentsSatisfied(facts: StructuredFacts): boolean {
  return (!facts.ownerConfirmationRequired || facts.ownerConfirmationPresent) &&
    (!facts.premiseRequired && !facts.premiseRef || facts.premiseConfirmed) &&
    (!facts.inventoryRequired && !facts.inventoryRef || facts.inventoryConfirmed);
}

function parseStructuredFields(text: string, source: string, path?: string): StructuredField[] {
  const fields: StructuredField[] = [];
  const lines = text.split(/\r?\n/);
  let planningIndent: number | undefined;
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim().replace(/^[-*]\s+/, "");
    if (/^planning_hierarchy\s*:\s*$/i.test(trimmed)) {
      planningIndent = indent;
      continue;
    }
    if (planningIndent !== undefined && indent <= planningIndent && !/^\s/.test(rawLine)) {
      planningIndent = undefined;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = normalizeKey(match[1]);
    if (!isPlanningField(key)) continue;
    fields.push({ key, value: stripQuotes(match[2]), source, path });
  }
  return fields;
}

function parseMetadataFields(metadata: Record<string, unknown> | undefined, path: string): StructuredField[] {
  if (!metadata) return [];
  const fields: StructuredField[] = [];
  const flattened = {
    ...metadata,
    ...(isRecord(metadata.planning_hierarchy) ? metadata.planning_hierarchy : {}),
  };
  for (const [rawKey, rawValue] of Object.entries(flattened)) {
    const key = normalizeKey(rawKey);
    if (!isPlanningField(key)) continue;
    if (typeof rawValue === "string" || typeof rawValue === "boolean" || typeof rawValue === "number") {
      fields.push({ key, value: String(rawValue), source: `artifact:${path}`, path });
    }
  }
  return fields;
}

function isPlanningField(key: string): boolean {
  return [
    "premise_required",
    "premise_ref",
    "premise_confirmed",
    "premise_confirmation_ref",
    "inventory_required",
    "inventory_ref",
    "inventory_confirmed",
    "inventory_confirmation_ref",
    "owner_confirmation_required",
    "owner_confirmation_ref",
    "domain_designer_confirmation_required",
    "domain_designer_confirmation_ref",
  ].includes(key);
}

function getBooleanField(fields: StructuredField[], key: string): boolean | undefined {
  const field = fields.find((candidate) => candidate.key === key);
  if (!field) return undefined;
  const normalized = field.value.trim().toLowerCase();
  if (["true", "yes", "required"].includes(normalized)) return true;
  if (["false", "no", "not_required", "not required"].includes(normalized)) return false;
  return undefined;
}

function getStringField(fields: StructuredField[], key: string): string | undefined {
  const value = fields.find((candidate) => candidate.key === key)?.value;
  return normalizeStructuredValue(value);
}

function normalizeStructuredValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripQuotes(value).trim();
  if (!normalized || PLACEHOLDER_PATTERN.test(normalized)) return undefined;
  if (/^(none|n\/a|null|pending|false|no)$/i.test(normalized)) return undefined;
  return normalized;
}

function extractIds(text: string, label: string): string[] {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escapeRegExp(label)}\\s*:\\s*([^\\n#]+)`, "gi");
  const ids: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const id = normalizeStructuredValue(match[1]?.trim());
    if (!id) continue;
    ids.push(id);
  }
  return uniqueSorted(ids);
}

function extractStructuredLineRef(text: string, labels: string[]): string | undefined {
  for (const value of extractLabelValues(text, labels)) {
    if (hasStructuredRef(value)) return value;
  }
  return undefined;
}

function hasStructuredArtifactRef(text: string, labels: string[], pathPredicate: (path: string) => boolean): boolean {
  return extractLabelValues(text, labels).some((value) => {
    if (hasStructuredRef(value)) return true;
    return extractPathRefs(value).some(pathPredicate);
  });
}

function extractLabelValues(text: string, labels: string[]): string[] {
  const values: string[] = [];
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escapeRegExp(label)}\\s*:\\s*([^\\n]+)`, "gi");
    for (const match of text.matchAll(pattern)) {
      const value = normalizeStructuredValue(match[1]?.trim());
      if (!value || /^(pass|passed)$/i.test(value)) continue;
      values.push(value);
    }
  }
  return values;
}

function hasStructuredRef(value: string): boolean {
  return /https?:\/\/[^\s)]+/i.test(value) ||
    /\b(?:AUDIT|EVIDENCE|TRACE|CONTRACT|TEST[-_]?MAP|SPEC|CELL|IMPL|REPO[-_]?SPEC|WAIVER|RECORD|GATE|CHECK)-ID\s*:/i.test(value) ||
    /\b(?:AUDIT|EVIDENCE|TRACE|CONTRACT|TEST[-_]?MAP|SPEC|CELL|IMPL|REPO[-_]?SPEC|WAIVER|RECORD|GATE|CHECK)-[A-Z0-9][A-Z0-9._:-]*\b/i.test(value) ||
    extractPathRefs(value).length > 0;
}

function extractPathRefs(value: string): string[] {
  const refs: string[] = [];
  const withoutUrls = value.replace(/https?:\/\/[^\s)]+/gi, " ");
  const pathPattern = /(?:^|[\s([`"'])(\.?[\w.-]+(?:\/[\w.@+-]+)+\.[A-Za-z0-9]+)(?=$|[\s)\]`"',])/g;
  for (const match of withoutUrls.matchAll(pathPattern)) {
    refs.push(normalizePath(match[1]));
  }
  return uniqueSorted(refs);
}

function detectNarrativeConfirmationClaims(
  text: string,
  confirmations: {
    ownerConfirmationPresent: boolean;
    premiseConfirmed: boolean;
    inventoryConfirmed: boolean;
  },
): string[] {
  const claims: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/^[-*]\s+/, "");
    if (/:\s*(https?:\/\/|\.?[\w.-]+\/|(?:audit|evidence|trace|contract|spec|cell|impl|record|gate|check)-id\s*:|(?:audit|evidence|trace|contract|spec|cell|impl|record|gate|check)-)/i.test(line)) {
      continue;
    }
    if (!confirmations.ownerConfirmationPresent && /(owner|domain designer).{0,40}(confirmed|approved|confirmation)/.test(normalized)) {
      claims.push(line);
      continue;
    }
    if (!confirmations.premiseConfirmed && /premise.{0,40}(confirmed|approved|confirmation)/.test(normalized)) {
      claims.push(line);
      continue;
    }
    if (!confirmations.inventoryConfirmed && /inventory.{0,40}(confirmed|approved|confirmation)/.test(normalized)) {
      claims.push(line);
    }
  }
  return uniqueSorted(claims);
}

function addObserved(
  evidence: ShirubePhaseEvidence[],
  present: boolean,
  code: string,
  detail: string,
  path?: string,
): void {
  if (!present) return;
  evidence.push({
    code,
    status: "present",
    source: path ? "pull_request.files" : "machine_facts",
    detail,
    path,
  });
}

function addRequired(
  evidence: ShirubePhaseEvidence[],
  required: boolean,
  present: boolean,
  code: string,
  detail: string,
): void {
  evidence.push({
    code,
    status: required ? present ? "present" : "missing" : "not_required",
    source: "phase_policy",
    detail,
  });
}

function isRepoSpecPath(path: string): boolean {
  return APPROVED_REPO_SPEC_BASELINE_PATHS.includes(path) || /(^|\/)repo-spec\.ya?ml$/i.test(path);
}

function isCellPath(path: string): boolean {
  return /^\.shirube\/cells\/[^/]+\.ya?ml$/i.test(path) || /(^|\/)(cell|cell-plan|cell-intake)(\.|\/|-)/i.test(path);
}

function isTracePath(path: string): boolean {
  return /(^|\/)(spec-to-cell-trace|trace-matrix|trace)(\.|\/|-)/i.test(path);
}

function isImplPath(path: string): boolean {
  return /^\.shirube\/impls\/[^/]+\.md$/i.test(path) || /^docs\/impl\//.test(path) || /(^|\/)impl(\.|\/|-)/i.test(path);
}

function isImplAuditPath(path: string, body?: string): boolean {
  if (/^\.shirube\/audits\/[^/]*impl[^/]*\.ya?ml$/i.test(path)) return true;
  if (/(^|\/)(impl-audit|implementation-audit)(\.|\/|-)/i.test(path)) return true;
  return /^\.shirube\/audits\/[^/]+\.ya?ml$/i.test(path) && /audit_type\s*:\s*impl-audit/i.test(body ?? "");
}

function normalizePath(path: string | undefined): string {
  return (path ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeKey(key: string): string {
  return key.trim().replace(/-/g, "_").toLowerCase();
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function firstMatchingPath(paths: string[], predicate: (path: string) => boolean): string | undefined {
  return paths.find(predicate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueFindings(findings: ShirubePhaseFinding[]): ShirubePhaseFinding[] {
  const seen = new Set<string>();
  const result: ShirubePhaseFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.code}:${finding.path ?? ""}:${finding.phase ?? ""}:${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

function uniqueEvidence(evidence: ShirubePhaseEvidence[]): ShirubePhaseEvidence[] {
  const seen = new Set<string>();
  const result: ShirubePhaseEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.code}:${item.status}:${item.source}:${item.path ?? ""}:${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
