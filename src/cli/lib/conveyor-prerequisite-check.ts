export type ConveyorCheckVerdict = "PASS" | "PASS_WITH_WARN" | "BLOCKED";
export type ConveyorRiskTier = "R0" | "R1" | "R2" | "R3" | "UNKNOWN";

export interface ConveyorPrerequisiteCheckInput {
  schema?: "shirube-conveyor-check-fixture/v1";
  repo: string;
  pr: number;
  head_sha: string;
  title?: string;
  body?: string;
  labels?: string[];
  changed_files: string[];
  repo_files?: string[];
  checked_at_utc?: string;
}

export interface ConveyorCheckFinding {
  code: string;
  message: string;
  path?: string;
}

export interface ConveyorCheckEvidence {
  code: string;
  source: string;
  detail: string;
  path?: string;
}

export interface ConveyorPrerequisiteCheckReport {
  schema: "shirube-conveyor-check/v1";
  verdict: ConveyorCheckVerdict;
  repo: string;
  pr: number;
  head_sha: string;
  spec_ids: string[];
  cell_ids: string[];
  impl_ids: string[];
  risk_tier: ConveyorRiskTier;
  blockers: ConveyorCheckFinding[];
  warnings: ConveyorCheckFinding[];
  evidence: ConveyorCheckEvidence[];
}

interface ArtifactFacts {
  repoSpec: boolean;
  featureSpec: boolean;
  specAudit: boolean;
  cell: boolean;
  specToCellTrace: boolean;
  impl: boolean;
  implAudit: boolean;
  requiredTestMapping: boolean;
  executionContract: boolean;
}

const CHECK_SCHEMA = "shirube-conveyor-check/v1" as const;
const PLACEHOLDER_PATTERN = /^<[^>]+>$/;
const APPROVED_REPO_SPEC_BASELINE_PATHS = [
  ".shirube/repo-spec.yaml",
  ".shirube/repo-spec.yml",
  "repo-spec.yaml",
  "repo-spec.yml",
];

const DEFAULT_ALLOWED_PATHS = [
  "src/cli/**",
  "src/**/conveyor*/**",
  "src/**/gate*/**",
  "test/**",
  "tests/**",
  "docs/spec/**",
  "docs/impl/**",
  "docs/verify/**",
  "schemas/**",
  "templates/**",
  "rubrics/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
];

const DEFAULT_FORBIDDEN_PATHS = [
  ".github/workflows/**",
  "deploy/**",
  ".env",
  ".env.*",
  "secrets/**",
  "**/secrets/**",
  "**/branch-protection/**",
  "**/branch-protection*",
  "**/ruleset/**",
  "**/ruleset*",
];

export function buildConveyorPrerequisiteCheck(
  input: ConveyorPrerequisiteCheckInput,
): ConveyorPrerequisiteCheckReport {
  const normalizedInput = normalizeInput(input);
  const text = [
    normalizedInput.title ?? "",
    normalizedInput.body ?? "",
    ...(normalizedInput.labels ?? []),
  ].join("\n");
  const changedFiles = uniqueSorted(normalizedInput.changed_files);
  const repoFiles = uniqueSorted(normalizedInput.repo_files ?? []);
  const specIds = extractIds(text, "SPEC-ID");
  const cellIds = extractIds(text, "CELL-ID");
  const implIds = extractIds(text, "IMPL-ID");
  const riskTier = extractRiskTier(text);
  const artifacts = detectArtifacts({ text, changedFiles, repoFiles, specIds, cellIds, implIds });
  const allowedPaths = extractPathList(text, "allowed paths", "allowed_paths");
  const effectiveAllowedPaths = allowedPaths.length > 0 ? allowedPaths : DEFAULT_ALLOWED_PATHS;
  const forbiddenPaths = uniqueSorted([
    ...DEFAULT_FORBIDDEN_PATHS,
    ...extractPathList(text, "forbidden paths", "forbidden_paths"),
  ]);
  const runtimeFiles = changedFiles.filter(isRuntimePath);
  const docsOnlyFiles = changedFiles.filter(isDocsOrScaffoldPath);
  const testOnlyFiles = changedFiles.filter(isTestPath);
  const behaviorChanging = runtimeFiles.length > 0;
  const hasOnlyDocsScaffoldOrTests =
    changedFiles.length > 0 &&
    changedFiles.every((file) => isDocsOrScaffoldPath(file) || isTestPath(file));
  const claimsDocsOnly = hasClaim(text, ["docs-only", "docs only", "documentation only", "docs/spec only"]);
  const claimsScaffoldOnly = hasClaim(text, ["scaffold-only", "scaffold only", "warn-only/scaffold-only"]);
  const skippedRequiredGates = extractSkippedRequiredGates(text);
  const waiver = evaluateWaiver(text, normalizedInput.checked_at_utc);
  const blockers: ConveyorCheckFinding[] = [];
  const warnings: ConveyorCheckFinding[] = [];
  const evidence: ConveyorCheckEvidence[] = [];

  evidence.push({
    code: "changed_files",
    source: "pull_request.files",
    detail: `${changedFiles.length} changed file(s)`,
  });
  for (const id of specIds) evidence.push({ code: "spec_id", source: "pull_request.body", detail: id });
  for (const id of cellIds) evidence.push({ code: "cell_id", source: "pull_request.body", detail: id });
  for (const id of implIds) evidence.push({ code: "impl_id", source: "pull_request.body", detail: id });
  evidence.push({ code: "risk_tier", source: "pull_request.body", detail: riskTier });

  for (const file of changedFiles) {
    if (!matchesAnyGlob(file, effectiveAllowedPaths)) {
      blockers.push({
        code: "changed_file_outside_allowed_paths",
        path: file,
        message: `${file} is not covered by allowed_paths.`,
      });
    }
    if (matchesAnyGlob(file, forbiddenPaths)) {
      blockers.push({
        code: "forbidden_path_touched",
        path: file,
        message: `${file} matches forbidden_paths.`,
      });
    }
  }

  if (runtimeFiles.length > 0 && claimsDocsOnly) {
    blockers.push({
      code: "runtime_claimed_docs_only",
      path: runtimeFiles[0],
      message: "Runtime/code paths changed while the PR claims docs-only scope.",
    });
  }
  if (runtimeFiles.length > 0 && claimsScaffoldOnly) {
    blockers.push({
      code: "runtime_claimed_scaffold_only",
      path: runtimeFiles[0],
      message: "Runtime/code paths changed while the PR claims scaffold-only scope.",
    });
  }

  if (riskTier === "UNKNOWN") {
    if (behaviorChanging) {
      blockers.push({
        code: "missing_risk_tier",
        message: "Behavior-changing work must declare Risk Tier.",
      });
    } else {
      warnings.push({
        code: "unknown_risk_tier_non_behavioral",
        message: "Risk Tier is UNKNOWN for non-runtime work.",
      });
    }
  }

  if (behaviorChanging) {
    requireArtifact(blockers, artifacts.repoSpec, "missing_repo_spec", "repo-spec is required for governed behavior-changing work.");
    requireArtifact(blockers, artifacts.featureSpec, "missing_feature_spec", "Feature spec is required for governed behavior-changing work.");
    requireArtifact(blockers, artifacts.specAudit, "missing_spec_audit", "Spec audit is required for governed behavior-changing work.");
    requireArtifact(blockers, artifacts.cell, "missing_cell", "Cell record is required for governed behavior-changing work.");
    requireArtifact(
      blockers,
      artifacts.specToCellTrace,
      "missing_spec_to_cell_trace",
      "Spec-to-Cell trace is required for governed behavior-changing work.",
    );
  } else if (riskTier === "R1" && !hasOnlyDocsScaffoldOrTests) {
    requireArtifact(blockers, artifacts.featureSpec, "missing_feature_spec", "R1 governed work requires a feature spec.");
    requireArtifact(blockers, artifacts.cell, "missing_cell", "R1 governed work requires a Cell record.");
  }

  if (riskTier === "R2" || riskTier === "R3") {
    requireArtifact(blockers, artifacts.impl, "missing_impl", `${riskTier} work requires an Impl record.`);
    requireArtifact(blockers, artifacts.implAudit, "missing_impl_audit", `${riskTier} work requires an Impl audit.`);
    requireArtifact(
      blockers,
      artifacts.requiredTestMapping,
      "missing_required_test_mapping",
      `${riskTier} work requires required test mapping.`,
    );
    requireArtifact(
      blockers,
      artifacts.executionContract,
      "missing_execution_contract",
      `${riskTier} work requires an execution contract.`,
    );
  }

  if (skippedRequiredGates.length > 0) {
    if (!waiver.present) {
      blockers.push({
        code: "missing_waiver_for_skipped_gate",
        message: `Skipped required gate(s) need a waiver: ${skippedRequiredGates.join(", ")}.`,
      });
    } else {
      for (const finding of waiver.findings) blockers.push(finding);
    }
  }

  if (docsOnlyFiles.length > 0 && runtimeFiles.length === 0) {
    evidence.push({
      code: "docs_or_scaffold_scope",
      source: "pull_request.files",
      detail: `${docsOnlyFiles.length} docs/scaffold file(s) changed`,
    });
  }
  if (testOnlyFiles.length > 0 && runtimeFiles.length === 0) {
    evidence.push({
      code: "test_only_scope",
      source: "pull_request.files",
      detail: `${testOnlyFiles.length} test file(s) changed`,
    });
  }
  addArtifactEvidence(evidence, artifacts);

  return {
    schema: CHECK_SCHEMA,
    verdict: blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "PASS_WITH_WARN" : "PASS",
    repo: normalizedInput.repo,
    pr: normalizedInput.pr,
    head_sha: normalizedInput.head_sha,
    spec_ids: specIds,
    cell_ids: cellIds,
    impl_ids: implIds,
    risk_tier: riskTier,
    blockers: uniqueFindings(blockers),
    warnings: uniqueFindings(warnings),
    evidence: uniqueEvidence(evidence),
  };
}

function normalizeInput(input: ConveyorPrerequisiteCheckInput): ConveyorPrerequisiteCheckInput {
  if (!input.repo || !input.repo.includes("/")) {
    throw new Error("Conveyor check input missing repo owner/name.");
  }
  if (!Number.isInteger(input.pr) || input.pr <= 0) {
    throw new Error("Conveyor check input missing positive PR number.");
  }
  if (!input.head_sha) {
    throw new Error("Conveyor check input missing head_sha.");
  }
  if (!Array.isArray(input.changed_files)) {
    throw new Error("Conveyor check input missing changed_files.");
  }
  return {
    ...input,
    changed_files: input.changed_files.map(normalizePath).filter(Boolean),
    repo_files: input.repo_files?.map(normalizePath).filter(Boolean),
    labels: input.labels ?? [],
  };
}

function detectArtifacts(input: {
  text: string;
  changedFiles: string[];
  repoFiles: string[];
  specIds: string[];
  cellIds: string[];
  implIds: string[];
}): ArtifactFacts {
  return {
    repoSpec:
      input.changedFiles.some(isRepoSpecPath) ||
      hasApprovedRepoSpecBaseline(input.repoFiles) ||
      hasExplicitArtifactEvidence(input, ["Repo Spec", "repo-spec"], isRepoSpecPath),
    featureSpec:
      input.specIds.length > 0 ||
      input.changedFiles.some(isFeatureSpecPath) ||
      hasExplicitArtifactEvidence(input, ["Feature Spec", "feature-spec", "Spec Artifact"], isFeatureSpecPath),
    specAudit:
      input.changedFiles.some(isSpecAuditPath) ||
      hasExplicitArtifactEvidence(input, ["Spec Audit", "spec-audit"], isSpecAuditPath),
    cell:
      input.cellIds.length > 0 ||
      input.changedFiles.some(isCellPath) ||
      hasExplicitArtifactEvidence(input, ["Cell", "Cell Record", "Cell Artifact"], isCellPath),
    specToCellTrace:
      input.changedFiles.some(isSpecToCellTracePath) ||
      hasExplicitArtifactEvidence(
        input,
        ["Spec-to-Cell Trace", "Spec to Cell Trace", "Trace Matrix", "spec-to-cell-trace"],
        isSpecToCellTracePath,
      ),
    impl:
      input.implIds.length > 0 ||
      input.changedFiles.some(isImplPath) ||
      hasExplicitArtifactEvidence(input, ["Impl", "Implementation", "Impl Artifact", "Implementation Record"], isImplPath),
    implAudit:
      input.changedFiles.some(isImplAuditPath) ||
      hasExplicitArtifactEvidence(input, ["Impl Audit", "Implementation Audit", "impl-audit"], isImplAuditPath),
    requiredTestMapping:
      input.changedFiles.some(isRequiredTestMappingPath) ||
      hasExplicitArtifactEvidence(
        input,
        ["Required Test Mapping", "Test Mapping", "required-test-mapping"],
        (path) => isRequiredTestMappingPath(path) || isTestPath(path),
      ),
    executionContract:
      input.changedFiles.some(isExecutionContractPath) ||
      hasExplicitArtifactEvidence(
        input,
        ["Execution Contract", "Tool Execution Policy", "Agent Execution Contract", "agent-policy"],
        isExecutionContractPath,
      ),
  };
}

function extractIds(text: string, label: string): string[] {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escapeRegExp(label)}\\s*:\\s*([^\\n#]+)`, "gi");
  const ids: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const id = match[1]?.trim();
    if (!id || PLACEHOLDER_PATTERN.test(id)) continue;
    ids.push(id);
  }
  return uniqueSorted(ids);
}

function extractRiskTier(text: string): ConveyorRiskTier {
  const lineMatch = text.match(/(?:^|\n)\s*(?:[-*]\s*)?Risk Tier\s*:\s*(R0|R1|R2|R3|UNKNOWN)\b/i);
  if (lineMatch) return lineMatch[1].toUpperCase() as ConveyorRiskTier;
  const labelMatch = text.match(/\brisk[:/_-](R0|R1|R2|R3)\b/i);
  if (labelMatch) return labelMatch[1].toUpperCase() as ConveyorRiskTier;
  return "UNKNOWN";
}

function extractPathList(text: string, ...headings: string[]): string[] {
  const lines = text.split(/\r?\n/);
  const values: string[] = [];
  let collecting = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const normalized = trimmed.toLowerCase().replace(/[_-]/g, " ");
    const heading = headings.find((candidate) => normalized.startsWith(`${candidate.replace(/[_-]/g, " ")}:`));
    if (heading) {
      collecting = true;
      const inline = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (inline) values.push(...splitPathList(inline));
      continue;
    }
    if (!collecting) continue;
    if (!trimmed) {
      collecting = false;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed) || /^[A-Za-z][A-Za-z0-9 _/-]{1,48}:\s*$/.test(trimmed)) {
      collecting = false;
      continue;
    }
    const bullet = trimmed.replace(/^[-*]\s+/, "").trim();
    if (bullet) values.push(...splitPathList(bullet));
  }
  return uniqueSorted(values.map(stripInlineComment).map(normalizePath).filter(Boolean));
}

function splitPathList(value: string): string[] {
  return value.split(/[, ]+/).map((entry) => entry.trim()).filter(Boolean);
}

function stripInlineComment(value: string): string {
  return value.replace(/\s+#.*$/, "");
}

function hasApprovedRepoSpecBaseline(repoFiles: string[]): boolean {
  return APPROVED_REPO_SPEC_BASELINE_PATHS.some((path) => repoFiles.includes(path));
}

function hasExplicitArtifactEvidence(
  input: { text: string; changedFiles: string[]; repoFiles: string[] },
  labels: string[],
  pathPredicate: (path: string) => boolean,
): boolean {
  const changedFiles = new Set(input.changedFiles);
  const repoFiles = new Set(input.repoFiles);
  return extractLabelArtifactRefs(input.text, labels).some((ref) => {
    if (ref.kind === "url" || ref.kind === "structured_id") return true;
    return pathPredicate(ref.value) && (changedFiles.has(ref.value) || repoFiles.has(ref.value));
  });
}

function extractLabelArtifactRefs(text: string, labels: string[]): Array<{ kind: "url" | "structured_id" | "path"; value: string }> {
  const refs: Array<{ kind: "url" | "structured_id" | "path"; value: string }> = [];
  for (const value of extractLabelValues(text, labels)) {
    refs.push(...extractArtifactRefs(value));
  }
  return refs;
}

function extractLabelValues(text: string, labels: string[]): string[] {
  const values: string[] = [];
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escapeRegExp(label)}\\s*:\\s*([^\\n]+)`, "gi");
    for (const match of text.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (!value || /^(none|n\/a|null|pending|pass|passed)$/i.test(value)) continue;
      values.push(value);
    }
  }
  return values;
}

function extractArtifactRefs(value: string): Array<{ kind: "url" | "structured_id" | "path"; value: string }> {
  const refs: Array<{ kind: "url" | "structured_id" | "path"; value: string }> = [];
  const withoutUrls = value.replace(/https?:\/\/[^\s)]+/gi, (url) => {
    refs.push({ kind: "url", value: trimTrailingPunctuation(url) });
    return " ";
  });
  const structuredPattern =
    /\b(?:(?:AUDIT|EVIDENCE|TRACE|CONTRACT|TEST[-_]?MAP|SPEC|CELL|IMPL|REPO[-_]?SPEC|WAIVER|RECORD|GATE|CHECK)-ID\s*:\s*[A-Z0-9][A-Z0-9._:-]*|(?:AUDIT|EVIDENCE|TRACE|CONTRACT|TEST[-_]?MAP|SPEC|CELL|IMPL|REPO[-_]?SPEC|WAIVER|RECORD|GATE|CHECK)-[A-Z0-9][A-Z0-9._:-]*)\b/gi;
  for (const match of withoutUrls.matchAll(structuredPattern)) {
    refs.push({ kind: "structured_id", value: match[0].trim() });
  }
  const pathPattern = /(?:^|[\s([`"'])(\.?[\w.-]+(?:\/[\w.@+-]+)+\.[A-Za-z0-9]+)(?=$|[\s)\]`"',])/g;
  for (const match of withoutUrls.matchAll(pathPattern)) {
    refs.push({ kind: "path", value: normalizePath(match[1]) });
  }
  return refs;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/, "");
}

function hasClaim(text: string, claims: string[]): boolean {
  const lines = text.toLowerCase().split(/\r?\n/);
  return lines.some((rawLine) => {
    const line = rawLine.trim().replace(/^[-*]\s+/, "");
    if (!line) return false;
    return claims.some((claim) => {
      if (line === claim || line === `r0 ${claim}` || line === `r1 ${claim}`) return true;
      if (line.startsWith(`${claim}:`)) return true;
      if (!line.includes(claim)) return false;
      return /^(scope|change scope|risk scope|scope confirmation|risk classification|classification)\s*:/.test(line);
    });
  });
}

function extractSkippedRequiredGates(text: string): string[] {
  const gates: string[] = [];
  const pattern = /(?:^|\n)\s*(?:[-*]\s*)?(?:Skipped Required Gate|Required Gate Skipped|Skipped Gate)\s*:\s*([^\n]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value && !/^(none|n\/a|null)$/i.test(value)) gates.push(value);
  }
  return uniqueSorted(gates);
}

function evaluateWaiver(text: string, checkedAtUtc: string | undefined): { present: boolean; findings: ConveyorCheckFinding[] } {
  const present = /(?:^|\n)\s*(?:[-*]\s*)?Waiver\s*:/i.test(text) ||
    /(?:^|\n)\s*(?:[-*]\s*)?Waiver Owner\s*:/i.test(text);
  if (!present) return { present: false, findings: [] };

  const findings: ConveyorCheckFinding[] = [];
  const owner = extractLineValue(text, "Waiver Owner");
  const reason = extractLineValue(text, "Waiver Reason");
  const controls = extractLineValue(text, "Compensating Controls");
  const expiry = extractLineValue(text, "Waiver Expiry");
  if (!owner) findings.push({ code: "invalid_waiver", message: "Waiver missing owner." });
  if (!reason) findings.push({ code: "invalid_waiver", message: "Waiver missing reason." });
  if (!controls) findings.push({ code: "invalid_waiver", message: "Waiver missing compensating controls." });
  if (!expiry) {
    findings.push({ code: "invalid_waiver", message: "Waiver missing expiry." });
    return { present, findings };
  }
  const expiryTime = Date.parse(expiry);
  const checkedAtTime = Date.parse(checkedAtUtc ?? new Date().toISOString());
  if (Number.isNaN(expiryTime)) {
    findings.push({ code: "invalid_waiver_expiry", message: "Waiver expiry is not a valid date." });
  } else if (!Number.isNaN(checkedAtTime) && expiryTime <= checkedAtTime) {
    findings.push({ code: "expired_waiver", message: "Waiver expiry is not in the future." });
  }
  return { present, findings };
}

function extractLineValue(text: string, label: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${escapeRegExp(label)}\\s*:\\s*([^\\n]+)`, "i");
  const value = text.match(pattern)?.[1]?.trim();
  if (!value || /^(none|n\/a|null|pending)$/i.test(value)) return undefined;
  return value;
}

function requireArtifact(
  blockers: ConveyorCheckFinding[],
  present: boolean,
  code: string,
  message: string,
): void {
  if (!present) blockers.push({ code, message });
}

function addArtifactEvidence(evidence: ConveyorCheckEvidence[], artifacts: ArtifactFacts): void {
  const ordered: Array<[keyof ArtifactFacts, string]> = [
    ["repoSpec", "repo_spec_present"],
    ["featureSpec", "feature_spec_present"],
    ["specAudit", "spec_audit_present"],
    ["cell", "cell_present"],
    ["specToCellTrace", "spec_to_cell_trace_present"],
    ["impl", "impl_present"],
    ["implAudit", "impl_audit_present"],
    ["requiredTestMapping", "required_test_mapping_present"],
    ["executionContract", "execution_contract_present"],
  ];
  for (const [key, code] of ordered) {
    if (artifacts[key]) evidence.push({ code, source: "machine_facts", detail: "present" });
  }
}

function isRepoSpecPath(path: string): boolean {
  return /(^|\/)repo-spec(\.|\/|-)/i.test(path);
}

function isFeatureSpecPath(path: string): boolean {
  return path.startsWith(".shirube/specs/") ||
    /^docs\/spec\//.test(path) ||
    /(^|\/)feature-spec(\.|\/|-)/i.test(path);
}

function isSpecAuditPath(path: string): boolean {
  return /(^|\/)spec-audit(\.|\/|-)/i.test(path) ||
    /^\.shirube\/audits\/AUDIT-[^/]*SPEC[^/]*\.ya?ml$/i.test(path);
}

function isCellPath(path: string): boolean {
  return path.startsWith(".shirube/cells/") ||
    /(^|\/)(cell|cell-plan|cell-intake|membership-manifest)(\.|\/|-)/i.test(path);
}

function isSpecToCellTracePath(path: string): boolean {
  return /(^|\/)(spec-to-cell-trace|trace-matrix|trace)(\.|\/|-)/i.test(path);
}

function isImplPath(path: string): boolean {
  return path.startsWith(".shirube/impls/") ||
    /^docs\/impl\//.test(path) ||
    /(^|\/)impl(\.|\/|-)/i.test(path);
}

function isImplAuditPath(path: string): boolean {
  return /(^|\/)(impl-audit|implementation-audit)(\.|\/|-)/i.test(path) ||
    /^\.shirube\/audits\/AUDIT-[^/]*IMPL[^/]*\.ya?ml$/i.test(path);
}

function isRequiredTestMappingPath(path: string): boolean {
  return /(^|\/)(required-test-mapping|test-mapping)(\.|\/|-)/i.test(path);
}

function isExecutionContractPath(path: string): boolean {
  return /(^|\/)(execution-contract|agent-policy|tool-execution-policy)(\.|\/|-)/i.test(path);
}

function isRuntimePath(path: string): boolean {
  if (isDocsOrScaffoldPath(path) || isTestPath(path)) return false;
  return path.startsWith("src/") ||
    path.startsWith("lib/") ||
    path.startsWith("bin/") ||
    path.startsWith("scripts/") ||
    path === "package.json" ||
    path === "package-lock.json" ||
    path === "pnpm-lock.yaml";
}

function isDocsOrScaffoldPath(path: string): boolean {
  return path.startsWith("docs/") ||
    path.startsWith("templates/") ||
    path.startsWith("schemas/") ||
    path.startsWith("rubrics/") ||
    path.startsWith("golden-cases/") ||
    path.startsWith("workflows/") ||
    path === "README.md";
}

function isTestPath(path: string): boolean {
  return path.startsWith("test/") ||
    path.startsWith("tests/") ||
    /\.test\.[jt]sx?$/.test(path) ||
    /\.spec\.[jt]sx?$/.test(path);
}

function matchesAnyGlob(path: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }
    pattern += escapeRegExp(char);
  }
  return new RegExp(`^${pattern}$`);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function uniqueFindings(findings: ConveyorCheckFinding[]): ConveyorCheckFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path ?? ""}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueEvidence(evidence: ConveyorCheckEvidence[]): ConveyorCheckEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.code}\0${item.source}\0${item.detail}\0${item.path ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
