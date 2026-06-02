export type ActionSurfaceMode = "warning" | "strict";
export type ActionSurfaceStage = "inventory" | "profile";
export type ActionSurfaceStatus = "PASS" | "WARNING" | "BLOCK";
export type ActionSurfaceRisk = "low" | "medium" | "high" | "critical";
export type ActionSurfaceCapability =
  | "read"
  | "reveal"
  | "write"
  | "delete"
  | "action"
  | "external_send"
  | "admin"
  | "execute_code";

export interface ActionSurfaceDocument {
  path: string;
  content: string;
}

export interface ActionSurfaceProfileOptions {
  mode?: ActionSurfaceMode;
  stage?: ActionSurfaceStage;
  requireProfiles?: boolean;
}

export interface ActionSurfaceFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  surfaceId?: string;
  type:
    | "parse_error"
    | "missing_profile"
    | "missing_field"
    | "invalid_value"
    | "unknown_risk_for_risky_capability"
    | "missing_approval_policy"
    | "missing_audit_policy"
    | "missing_rollback_policy"
    | "missing_execution_policy";
  field?: string;
  message: string;
}

export interface ActionSurfaceProfileResult {
  status: ActionSurfaceStatus;
  mode: ActionSurfaceMode;
  stage: ActionSurfaceStage;
  profileDetected: boolean;
  surfacesChecked: number;
  findings: ActionSurfaceFinding[];
  checkedDocuments: string[];
}

interface ParsedSurface {
  path: string;
  data: Record<string, unknown>;
}

interface FieldDefinition {
  field: string;
  aliases: string[];
}

const RISK_LEVELS = new Set<ActionSurfaceRisk>([
  "low",
  "medium",
  "high",
  "critical",
]);

const CAPABILITY_CLASSES = new Set<ActionSurfaceCapability>([
  "read",
  "reveal",
  "write",
  "delete",
  "action",
  "external_send",
  "admin",
  "execute_code",
]);

const RISKY_CAPABILITIES = new Set<ActionSurfaceCapability>([
  "write",
  "delete",
  "action",
  "external_send",
  "admin",
  "execute_code",
]);

const APPROVAL_BY_DEFAULT_CAPABILITIES = new Set<ActionSurfaceCapability>([
  "delete",
  "action",
  "external_send",
  "admin",
  "execute_code",
]);

const STAGE_0_FIELDS: FieldDefinition[] = [
  { field: "surface_id", aliases: ["surface_id", "surface id", "id"] },
  { field: "surface_type", aliases: ["surface_type", "surface type", "type"] },
  {
    field: "capability_classes",
    aliases: ["capability_classes", "capability", "capabilities", "capability class"],
  },
  { field: "risk_level", aliases: ["risk_level", "risk", "risk level"] },
  { field: "owner_repo", aliases: ["owner_repo", "owner repo", "repo"] },
];

const STAGE_1_FIELDS: FieldDefinition[] = [
  ...STAGE_0_FIELDS,
  { field: "product", aliases: ["product"] },
  { field: "display_name", aliases: ["display_name", "display name", "name"] },
  { field: "description", aliases: ["description"] },
  { field: "resource_scope", aliases: ["resource_scope", "resource scope"] },
  {
    field: "identity_requirements",
    aliases: ["identity_requirements", "identity requirements"],
  },
  {
    field: "context_requirements",
    aliases: ["context_requirements", "context requirements"],
  },
  {
    field: "memory_requirements",
    aliases: ["memory_requirements", "memory requirements", "recovery requirements"],
  },
  { field: "approval_policy", aliases: ["approval_policy", "approval policy"] },
  { field: "audit_policy", aliases: ["audit_policy", "audit policy"] },
  { field: "rollback_policy", aliases: ["rollback_policy", "rollback policy"] },
  { field: "execution_policy", aliases: ["execution_policy", "execution policy"] },
];

const PROFILE_TRIGGER =
  /\b(action\s*surface|governed\s*action|surface_id|surface\s*id|capability\s*class|risk\s*level|approval\s*policy|audit\s*policy|rollback\s*policy|external_send|execute_code|mcp\s*tool|api\s*endpoint|ui\s*action|webhook|agent\s*action)\b/i;

export function validateActionSurfaceProfiles(
  documents: ActionSurfaceDocument[],
  options: ActionSurfaceProfileOptions = {},
): ActionSurfaceProfileResult {
  const mode = options.mode ?? "warning";
  const stage = options.stage ?? "profile";
  const checkedDocuments = documents.map((doc) => doc.path);
  const findings: ActionSurfaceFinding[] = [];
  const surfaces: ParsedSurface[] = [];
  let profileDetected = false;

  for (const document of documents) {
    const parsed = parseActionSurfaceDocument(document);
    if (parsed.kind === "error") {
      profileDetected = true;
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "parse_error",
        message: parsed.message,
      });
      continue;
    }

    if (parsed.detected) profileDetected = true;
    surfaces.push(...parsed.surfaces);
  }

  if (surfaces.length === 0 && (profileDetected || options.requireProfiles)) {
    for (const document of documents) {
      findings.push({
        severity: mode === "strict" ? "BLOCK" : "WARNING",
        path: document.path,
        type: "missing_profile",
        message: "No governed action surface profile entries were found.",
      });
    }
  }

  for (const surface of surfaces) {
    findings.push(...validateSurface(surface, mode, stage));
  }

  return {
    status: toStatus(findings),
    mode,
    stage,
    profileDetected,
    surfacesChecked: surfaces.length,
    findings,
    checkedDocuments,
  };
}

function validateSurface(
  surface: ParsedSurface,
  mode: ActionSurfaceMode,
  stage: ActionSurfaceStage,
): ActionSurfaceFinding[] {
  const findings: ActionSurfaceFinding[] = [];
  const surfaceId = stringField(surface.data, ["surface_id", "surface id", "id"]);
  const requiredFields = stage === "inventory" ? STAGE_0_FIELDS : STAGE_1_FIELDS;

  for (const definition of requiredFields) {
    if (!hasNonEmptyField(surface.data, definition.aliases)) {
      findings.push(
        finding(surface, mode, "missing_field", {
          surfaceId,
          field: definition.field,
          message: `Missing action surface profile field: ${definition.field}`,
        }),
      );
    }
  }

  const risk = normalizedString(
    getField(surface.data, ["risk_level", "risk", "risk level"]),
  );
  if (risk && !RISK_LEVELS.has(risk as ActionSurfaceRisk)) {
    findings.push(
      finding(surface, mode, "invalid_value", {
        surfaceId,
        field: "risk_level",
        message: `Invalid action surface risk level: ${risk}`,
      }),
    );
  }

  const capabilities = capabilityValues(surface.data);
  for (const capability of capabilities.raw) {
    if (!CAPABILITY_CLASSES.has(capability as ActionSurfaceCapability)) {
      findings.push(
        finding(surface, mode, "invalid_value", {
          surfaceId,
          field: "capability_classes",
          message: `Invalid action surface capability class: ${capability}`,
        }),
      );
    }
  }

  const validCapabilities = capabilities.valid;
  const hasRiskyCapability = validCapabilities.some((capability) =>
    RISKY_CAPABILITIES.has(capability),
  );
  const isHighRisk = risk === "high" || risk === "critical";
  const requiresApprovalByDefault =
    isHighRisk ||
    validCapabilities.some((capability) =>
      APPROVAL_BY_DEFAULT_CAPABILITIES.has(capability),
    );

  if (!risk && hasRiskyCapability) {
    findings.push(
      finding(surface, mode, "unknown_risk_for_risky_capability", {
        surfaceId,
        field: "risk_level",
        message:
          "Unknown risk must not be treated as safe for write, delete, action, external_send, admin, or execute_code surfaces.",
      }),
    );
  }

  if (requiresApprovalByDefault && !hasApprovalOrAllowlist(surface.data)) {
    findings.push(
      finding(surface, mode, "missing_approval_policy", {
        surfaceId,
        field: "approval_policy",
        message:
          "High/critical or approval-by-default action surfaces require approval policy evidence or an explicit allowlist.",
      }),
    );
  }

  if (hasRiskyCapability && !hasAuditCoverage(surface.data, validCapabilities)) {
    findings.push(
      finding(surface, mode, "missing_audit_policy", {
        surfaceId,
        field: "audit_policy",
        message:
          "Risky action surfaces require audit policy coverage for inputs, outputs, mutations, egress, and redaction where applicable.",
      }),
    );
  }

  if (hasRiskyCapability && !hasRollbackCoverage(surface.data)) {
    findings.push(
      finding(surface, mode, "missing_rollback_policy", {
        surfaceId,
        field: "rollback_policy",
        message:
          "Risky action surfaces require rollback, replay, compensating action, manual reconcile, or explicit non-reversibility policy.",
      }),
    );
  }

  if (
    validCapabilities.includes("execute_code") &&
    !hasExecutionCoverage(surface.data)
  ) {
    findings.push(
      finding(surface, mode, "missing_execution_policy", {
        surfaceId,
        field: "execution_policy",
        message:
          "execute_code surfaces require sandbox, timeout, dry-run, or idempotency execution policy evidence.",
      }),
    );
  }

  return findings;
}

function parseActionSurfaceDocument(document: ActionSurfaceDocument):
  | { kind: "ok"; detected: boolean; surfaces: ParsedSurface[] }
  | { kind: "error"; message: string } {
  const content = document.content.trim();
  if (!content) {
    return { kind: "ok", detected: false, surfaces: [] };
  }

  if (content.startsWith("{") || content.startsWith("[")) {
    try {
      const parsed = JSON.parse(content) as unknown;
      return {
        kind: "ok",
        detected: true,
        surfaces: extractJsonSurfaces(parsed).map((data) => ({
          path: document.path,
          data,
        })),
      };
    } catch (error) {
      return {
        kind: "error",
        message: `Invalid JSON action surface profile: ${(error as Error).message}`,
      };
    }
  }

  const markdownSurfaces = parseMarkdownSurfaces(document);
  return {
    kind: "ok",
    detected: PROFILE_TRIGGER.test(document.content) || markdownSurfaces.length > 0,
    surfaces: markdownSurfaces,
  };
}

function extractJsonSurfaces(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) return [];

  for (const key of ["surfaces", "action_surfaces", "profiles", "items"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  return hasNonEmptyField(value, ["surface_id", "surface id", "id"])
    ? [value]
    : [];
}

function parseMarkdownSurfaces(document: ActionSurfaceDocument): ParsedSurface[] {
  const tableSurfaces = parseMarkdownSurfaceTables(document);
  if (tableSurfaces.length > 0) return tableSurfaces;

  const fieldSurface = parseMarkdownFieldSurface(document);
  return fieldSurface ? [fieldSurface] : [];
}

function parseMarkdownFieldSurface(
  document: ActionSurfaceDocument,
): ParsedSurface | null {
  const data: Record<string, unknown> = {};
  const allFields = [...STAGE_1_FIELDS, { field: "allowlist_ref", aliases: ["allowlist_ref", "allowlist"] }];

  for (const definition of allFields) {
    const value = markdownFieldValue(document.content, definition.aliases);
    if (value !== null) {
      data[definition.field] =
        definition.field === "capability_classes"
          ? splitListValue(value)
          : value;
    }
  }

  return Object.keys(data).length > 0 ? { path: document.path, data } : null;
}

function parseMarkdownSurfaceTables(
  document: ActionSurfaceDocument,
): ParsedSurface[] {
  const lines = document.content.split(/\r?\n/);
  const surfaces: ParsedSurface[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isMarkdownTableLine(lines[index]) || !isMarkdownDividerLine(lines[index + 1])) {
      continue;
    }

    const headers = splitMarkdownTableLine(lines[index]).map(normalizeHeader);
    if (!headers.some((header) => ["surface_id", "surface id", "id"].includes(header))) {
      continue;
    }

    let rowIndex = index + 2;
    while (rowIndex < lines.length && isMarkdownTableLine(lines[rowIndex])) {
      const cells = splitMarkdownTableLine(lines[rowIndex]);
      const data: Record<string, unknown> = {};
      for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
        const field = canonicalMarkdownField(headers[cellIndex]);
        if (!field) continue;
        const value = cells[cellIndex]?.trim() ?? "";
        data[field] =
          field === "capability_classes" ? splitListValue(value) : value;
      }
      if (Object.keys(data).length > 0) {
        surfaces.push({ path: document.path, data });
      }
      rowIndex += 1;
    }
  }

  return surfaces;
}

function markdownFieldValue(content: string, aliases: string[]): string | null {
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+)`,
      "i",
    );
    const match = content.match(pattern);
    if (match?.[1]) {
      return stripMarkdownValue(match[1]);
    }
  }
  return null;
}

function isMarkdownTableLine(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isMarkdownDividerLine(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

function splitMarkdownTableLine(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(stripMarkdownValue);
}

function stripMarkdownValue(value: string): string {
  return value.trim().replace(/^`+|`+$/g, "").replace(/\*\*/g, "");
}

function normalizeHeader(value: string): string {
  return normalizeKey(value.replace(/\//g, " "));
}

function canonicalMarkdownField(header: string): string | null {
  const allFields = STAGE_1_FIELDS;
  for (const definition of allFields) {
    if (definition.aliases.map(normalizeKey).includes(header)) {
      return definition.field;
    }
  }
  return null;
}

function finding(
  surface: ParsedSurface,
  mode: ActionSurfaceMode,
  type: ActionSurfaceFinding["type"],
  input: {
    surfaceId?: string | null;
    field?: string;
    message: string;
  },
): ActionSurfaceFinding {
  return {
    severity: mode === "strict" ? "BLOCK" : "WARNING",
    path: surface.path,
    surfaceId: input.surfaceId ?? undefined,
    type,
    field: input.field,
    message: input.message,
  };
}

function capabilityValues(data: Record<string, unknown>): {
  raw: string[];
  valid: ActionSurfaceCapability[];
} {
  const raw = primitiveStringArray(
    getField(data, ["capability_classes", "capability", "capabilities", "capability class"]),
  ).map(normalizeCapability);
  return {
    raw,
    valid: raw.filter((value): value is ActionSurfaceCapability =>
      CAPABILITY_CLASSES.has(value as ActionSurfaceCapability),
    ),
  };
}

function hasApprovalOrAllowlist(data: Record<string, unknown>): boolean {
  const policy = getField(data, ["approval_policy", "approval policy"]);
  if (!isRecord(policy)) {
    return hasNonEmptyField(data, ["approval_policy", "approval policy", "allowlist_ref", "allowlist"]);
  }

  return (
    booleanField(policy, ["approval_required"]) === true ||
    hasNonEmptyField(policy, ["approver_role", "approval_ref", "allowlist_ref", "allowlist"])
  );
}

function hasAuditCoverage(
  data: Record<string, unknown>,
  capabilities: ActionSurfaceCapability[],
): boolean {
  const policy = getField(data, ["audit_policy", "audit policy"]);
  if (!isRecord(policy)) return hasNonEmptyField(data, ["audit_policy", "audit policy"]);

  if (booleanField(policy, ["audit_required"]) !== true) return false;
  if (booleanField(policy, ["input_summary_required"]) === false) return false;
  if (booleanField(policy, ["output_summary_required"]) === false) return false;
  if (
    capabilities.some((capability) =>
      ["write", "delete", "action", "admin", "execute_code"].includes(capability),
    ) &&
    booleanField(policy, ["mutation_summary_required"]) !== true
  ) {
    return false;
  }
  if (
    capabilities.includes("external_send") &&
    booleanField(policy, ["egress_summary_required"]) !== true
  ) {
    return false;
  }
  if (
    capabilities.includes("reveal") &&
    booleanField(policy, ["redaction_required"]) !== true
  ) {
    return false;
  }
  return true;
}

function hasRollbackCoverage(data: Record<string, unknown>): boolean {
  const policy = getField(data, ["rollback_policy", "rollback policy"]);
  if (!isRecord(policy)) return hasNonEmptyField(data, ["rollback_policy", "rollback policy"]);

  const rollbackKind = normalizedString(
    getField(policy, ["rollback_kind", "kind", "rollback"]),
  );
  return (
    booleanField(policy, ["rollback_required"]) === true ||
    booleanField(policy, ["replay_supported"]) === true ||
    [
      "compensating_action",
      "restore_snapshot",
      "manual_reconcile",
      "not_reversible",
    ].includes(rollbackKind)
  );
}

function hasExecutionCoverage(data: Record<string, unknown>): boolean {
  const policy = getField(data, ["execution_policy", "execution policy"]);
  if (!isRecord(policy)) return hasNonEmptyField(data, ["execution_policy", "execution policy"]);

  return (
    booleanField(policy, ["dry_run_supported"]) === true ||
    booleanField(policy, ["idempotency_key_required"]) === true ||
    hasNonEmptyField(policy, ["sandbox_policy", "egress_policy", "timeout_seconds"])
  );
}

function hasNonEmptyField(data: Record<string, unknown>, aliases: string[]): boolean {
  const value = getField(data, aliases);
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0 && !isPlaceholder(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function getField(data: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(data)) {
    if (normalizedAliases.includes(normalizeKey(key))) {
      return value;
    }
  }
  return undefined;
}

function stringField(data: Record<string, unknown>, aliases: string[]): string | null {
  const value = getField(data, aliases);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanField(data: Record<string, unknown>, aliases: string[]): boolean | null {
  const value = getField(data, aliases);
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = normalizedString(value);
  if (normalized === "true" || normalized === "yes" || normalized === "required") return true;
  if (normalized === "false" || normalized === "no" || normalized === "none") return false;
  return null;
}

function primitiveStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof item),
      )
      .map((item) => String(item));
  }
  if (typeof value === "string") return splitListValue(value);
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

function splitListValue(value: string): string[] {
  return value
    .split(/[,/]|(?:\s+and\s+)/i)
    .map(stripMarkdownValue)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCapability(value: string): string {
  return normalizeKey(value).replace(/externalsend/g, "external_send").replace(/executecode/g, "execute_code");
}

function normalizedString(value: unknown): string {
  return typeof value === "string" ? normalizeKey(value) : "";
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[`*_:-]/g, " ").replace(/\s+/g, " ").trim().replace(/\s/g, "_");
}

function isPlaceholder(value: string): boolean {
  return ["tbd", "todo", "unknown", "pending", "n/a", "na"].includes(
    normalizedString(value),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStatus(findings: ActionSurfaceFinding[]): ActionSurfaceStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
