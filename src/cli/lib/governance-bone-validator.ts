export type GovernanceBoneMode = "warning" | "strict";
export type GovernanceBoneProfile = "default" | "infrastructure" | "hotel";
export type GovernanceBoneRisk = "low" | "medium" | "high" | "critical";
export type GovernanceBoneStatus = "PASS" | "WARNING" | "BLOCK";

export interface GovernanceBoneDocument {
  path: string;
  content: string;
}

export interface GovernanceBoneOptions {
  mode?: GovernanceBoneMode;
  profile?: GovernanceBoneProfile;
  risk?: GovernanceBoneRisk;
  requireGovernanceBone?: boolean;
}

export interface GovernanceBoneFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "missing_field"
    | "llm_owns_flow"
    | "llm_owns_tool_execution"
    | "ownership_boundary"
    | "reference_implementation_boundary"
    | "silent_fallback";
  field?: string;
  message: string;
}

export interface GovernanceBoneResult {
  status: GovernanceBoneStatus;
  mode: GovernanceBoneMode;
  profile: GovernanceBoneProfile;
  risk: GovernanceBoneRisk;
  governanceDetected: boolean;
  findings: GovernanceBoneFinding[];
  checkedDocuments: string[];
}

interface GovernanceBoneFieldDefinition {
  field: string;
  aliases: string[];
  requiresConcreteValue?: boolean;
}

const GOVERNANCE_BONE_FIELD_DEFINITIONS: GovernanceBoneFieldDefinition[] = [
  { field: "Goal", aliases: ["Goal"] },
  { field: "Phase", aliases: ["Phase"] },
  { field: "Work Order", aliases: ["Work Order"] },
  { field: "Risk classification", aliases: ["Risk classification", "Risk And Scope"] },
  { field: "PR slice", aliases: ["PR slice", "PR / Change Slice"] },
  { field: "Script/gate owner", aliases: ["Script/gate owner", "Scripted Step"] },
  { field: "Action tools", aliases: ["Action tools", "Tool Execution", "Tool execution policy"] },
  { field: "Context evidence", aliases: ["Context evidence", "Context pack"] },
  { field: "Memory/recovery evidence", aliases: ["Memory/recovery evidence", "Recovery pack"] },
  { field: "Approval policy", aliases: ["Approval policy", "Human approval"] },
  { field: "Audit evidence", aliases: ["Audit evidence", "Audit refs", "Evidence / Audit Record"] },
  { field: "Rollback/replay", aliases: ["Rollback/replay"] },
  {
    field: "Architecture owner",
    aliases: ["Architecture owner", "architecture_owner", "Design owner"],
    requiresConcreteValue: true,
  },
  {
    field: "Implementation owner",
    aliases: ["Implementation owner", "implementation_owner", "Implementation lead"],
    requiresConcreteValue: true,
  },
  {
    field: "Review owner",
    aliases: ["Review owner", "review_owner", "Reviewer owner"],
    requiresConcreteValue: true,
  },
  {
    field: "Merge authority",
    aliases: ["Merge authority", "merge_authority"],
    requiresConcreteValue: true,
  },
  {
    field: "Audit owner",
    aliases: ["Audit owner", "audit_owner"],
    requiresConcreteValue: true,
  },
];

export const GOVERNANCE_BONE_FIELDS = GOVERNANCE_BONE_FIELD_DEFINITIONS.map(
  (definition) => definition.field,
);

export const GOVERNANCE_BONE_PROFILES: Record<
  GovernanceBoneProfile,
  { label: string; trigger: RegExp; strictRisks: GovernanceBoneRisk[] }
> = {
  default: {
    label: "Default product governance",
    trigger: /$a/,
    strictRisks: ["high", "critical"],
  },
  infrastructure: {
    label: "Infrastructure and agent-runtime products",
    trigger:
      /\b(aun|shirube|kodama|wasurezu|mcp|runtime|queue|agent|context\s*pack|recovery\s*pack|memory|structured\s*content|output\s*schema|tool\s*contract)\b/i,
    strictRisks: ["high", "critical"],
  },
  hotel: {
    label: "Hotel and customer-data products",
    trigger:
      /\b(hotel|guest|reservation|booking|pms|crm|concierge|tenant|customer\s*data|payment|folio|room\s*assignment)\b/i,
    strictRisks: ["high", "critical"],
  },
};

const GOVERNANCE_TRIGGER =
  /\b(work\s*order|goal\s*contract|governance\s*bone|action\s*tools?|tool\s*execution|approval\s*policy|audit\s*evidence|rollback|replay|customer\s*data|tenant\s*data|mutation|external\s*state|scripted\s*step|script\s*control|gate\s*owner|architecture\s*owner|implementation\s*owner|merge\s*authority|audit\s*owner|reference\s*implementation)\b|作業指示|ワークオーダー|承認|監査|外部操作|状態変更|顧客データ|スクリプト制御|ゲート|参考実装/i;

const LLM_OWNS_FLOW =
  /llm[^.\n]*(owns|controls|decides|advances)[^.\n]*(goal|phase|work\s*order|state|gate|approval|flow)|(?:goal|phase|work\s*order|state|gate|approval|flow)[^.\n]*(owned|controlled|decided|advanced)[^.\n]*llm/i;

const LLM_OWNS_TOOL_EXECUTION =
  /llm[^.\n]*(owns|approves|executes|authorizes)[^.\n]*(tool\s*execution|action\s*tool|external\s*mutation|customer\s*data\s*mutation)|(?:tool\s*execution|action\s*tool|external\s*mutation|customer\s*data\s*mutation)[^.\n]*(owned|approved|executed|authorized)[^.\n]*llm/i;

const SILENT_FALLBACK =
  /silent\s*fallback|fallback\s*silently|missing\s+(?:approval|context|audit|evidence)[^.\n]*(?:continue|proceed)|(?:approval|context|audit|evidence)[^.\n]*optional\s+fallback/i;

const ARC_IMPLEMENTATION_OR_MERGE_AUTHORITY =
  /(?:implementation\s+owner|implementation_owner|implementation\s+lead|merge\s+authority|merge_authority)\s*:\s*(?:iyasaka\s+)?arc\b|(?:iyasaka\s+)?arc[^.\n]*(?:owns|implements|approves|decides|merges)[^.\n]*(?:implementation|production\s+code|dependency|ci|merge)/i;

const REPOSITORY_OWNER_DELEGATION_FIELD_ALIASES = [
  "Explicit delegation",
  "explicit_delegation",
  "Repository owner delegation",
  "Repository-owner delegation",
  "Repo owner delegation",
  "Repo-owner delegation",
];

const REPOSITORY_OWNER_DELEGATION_ACTOR =
  /\b(?:repo(?:sitory)?\s+(?:owner|maintainer)|repo-owner|repository-owner|maintainer)\b|リポジトリ(?:所有者|オーナー|メンテナ)|repo\s*owner/i;

const REPOSITORY_OWNER_DELEGATION_ACTION =
  /\b(?:delegat(?:e|ed|ion)|authori[sz](?:e|ed|ation)|approv(?:e|ed|al)|grant(?:ed)?)\b|委任|承認|許可/i;

const NON_DELEGATION_VALUE =
  /^(?:no|not|without|missing|absent|unavailable)\b|\b(?:no|without)\s+(?:explicit\s+)?(?:repo(?:sitory)?[-\s]*owner\s+)?delegation\b|\bdelegation\s+(?:not\s+)?(?:required|provided|present|granted)\b|\b(?:approval|delegation)\s+(?:pending|requested)\b/i;

const REFERENCE_IMPLEMENTATION_CLAIM =
  /\breference\s+implementation\b|参考実装/i;

const REFERENCE_IMPLEMENTATION_IDENTIFIED =
  /\bdraft\b|\blabel\s*:\s*(?:reference|proposal|arc-reference|reference-implementation)\b|ドラフト|参考実装ラベル|proposal\s+label/i;

const NEGATED_OWNERSHIP =
  /\b(?:must\s+not|mustn't|does\s+not|doesn't|do\s+not|don't|never|cannot|can't|should\s+not|shouldn't)\b|してはいけない|しない|持たせない|任せない|禁止/i;

const PLACEHOLDER_VALUE =
  /^(?:tbd|todo|pending|unknown|not\s+applicable|n\/a|na|none|null|-)(?:[\s.。,:;_-]|$)/i;

export function validateGovernanceBone(
  documents: GovernanceBoneDocument[],
  options: GovernanceBoneOptions = {},
): GovernanceBoneResult {
  const profile = options.profile ?? "default";
  const risk = options.risk ?? "low";
  const mode = resolveGovernanceMode(options);
  const checkedDocuments = documents.map((doc) => doc.path);
  const relevant = documents.filter(
    (doc) =>
      options.requireGovernanceBone === true ||
      hasGovernanceTrigger(doc.content, profile),
  );
  const governanceDetected = relevant.length > 0;
  const findings: GovernanceBoneFinding[] = [];

  for (const doc of relevant) {
    for (const definition of GOVERNANCE_BONE_FIELD_DEFINITIONS) {
      if (!hasGovernanceField(doc.content, definition)) {
        findings.push({
          severity: mode === "strict" ? "BLOCK" : "WARNING",
          path: doc.path,
          type: "missing_field",
          field: definition.field,
          message: `Missing governance bone field: ${definition.field}`,
        });
      }
    }

    if (hasNonNegatedMatch(doc.content, LLM_OWNS_FLOW)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "llm_owns_flow",
        message:
          "LLM output must not own Goal, Phase, Work Order, gate, approval, or state transitions; use script-controlled flow.",
      });
    }

    if (hasNonNegatedMatch(doc.content, LLM_OWNS_TOOL_EXECUTION)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "llm_owns_tool_execution",
        message:
          "LLM output must not own action-tool approval or external/customer-data mutation authority.",
      });
    }

    if (
      hasArcImplementationOrMergeAuthority(doc.content) &&
      !hasConcreteRepositoryOwnerDelegation(doc.content)
    ) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "ownership_boundary",
        message:
          "ARC/design roles may own architecture evidence, but implementation ownership and merge authority require explicit repository-owner delegation.",
      });
    }

    if (
      REFERENCE_IMPLEMENTATION_CLAIM.test(doc.content) &&
      !REFERENCE_IMPLEMENTATION_IDENTIFIED.test(doc.content)
    ) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "reference_implementation_boundary",
        message:
          "Reference implementation PRs must be identifiable as Draft or by an explicit reference/proposal label.",
      });
    }

    if (SILENT_FALLBACK.test(doc.content)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "silent_fallback",
        message:
          "Missing approval, context, audit, or evidence must not silently fall back to execution.",
      });
    }
  }

  return {
    status: toStatus(findings),
    mode,
    profile,
    risk,
    governanceDetected,
    findings,
    checkedDocuments,
  };
}

function resolveGovernanceMode(
  options: GovernanceBoneOptions,
): GovernanceBoneMode {
  if (options.mode) return options.mode;
  const profile = options.profile ?? "default";
  const risk = options.risk ?? "low";
  return GOVERNANCE_BONE_PROFILES[profile].strictRisks.includes(risk)
    ? "strict"
    : "warning";
}

function hasGovernanceTrigger(
  content: string,
  profile: GovernanceBoneProfile,
): boolean {
  return GOVERNANCE_TRIGGER.test(content) || GOVERNANCE_BONE_PROFILES[profile].trigger.test(content);
}

function hasGovernanceField(
  content: string,
  definition: GovernanceBoneFieldDefinition,
): boolean {
  return definition.aliases.some((alias) =>
    hasFieldAlias(content, alias, definition.requiresConcreteValue ?? false),
  );
}

function hasFieldAlias(content: string, field: string, requiresConcreteValue: boolean): boolean {
  const values = getFieldAliasValues(content, field);
  if (values.length === 0) return false;
  if (!requiresConcreteValue) return true;
  return values.some(isConcreteValue);
}

function getFieldAliasValues(content: string, field: string): string[] {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const valuePattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*([^\\n]+)`,
    "gi",
  );
  return [...content.matchAll(valuePattern)].map((match) => match[1]);
}

function hasNonNegatedMatch(content: string, pattern: RegExp): boolean {
  const sentences = content
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.some((sentence) => {
    if (!pattern.test(sentence)) return false;
    return !NEGATED_OWNERSHIP.test(sentence);
  });
}

function toStatus(findings: GovernanceBoneFinding[]): GovernanceBoneStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}

function isConcreteValue(value: string): boolean {
  const normalized = normalizeFieldValue(value);
  if (!normalized) return false;
  return !PLACEHOLDER_VALUE.test(normalized);
}

function hasArcImplementationOrMergeAuthority(content: string): boolean {
  return (
    hasArcFieldValue(content, [
      "Implementation owner",
      "implementation_owner",
      "Implementation lead",
    ]) ||
    hasArcFieldValue(content, ["Merge authority", "merge_authority"]) ||
    hasNonNegatedMatch(content, ARC_IMPLEMENTATION_OR_MERGE_AUTHORITY)
  );
}

function hasArcFieldValue(content: string, aliases: string[]): boolean {
  return aliases
    .flatMap((alias) => getFieldAliasValues(content, alias))
    .some((value) => /\b(?:iyasaka\s+)?arc\b/i.test(value));
}

function hasConcreteRepositoryOwnerDelegation(content: string): boolean {
  return REPOSITORY_OWNER_DELEGATION_FIELD_ALIASES.flatMap((alias) =>
    getFieldAliasValues(content, alias),
  ).some(isConcreteRepositoryOwnerDelegation);
}

function isConcreteRepositoryOwnerDelegation(value: string): boolean {
  const normalized = normalizeFieldValue(value);
  if (!normalized) return false;
  if (PLACEHOLDER_VALUE.test(normalized)) return false;
  if (NON_DELEGATION_VALUE.test(normalized)) return false;
  return (
    REPOSITORY_OWNER_DELEGATION_ACTOR.test(normalized) &&
    REPOSITORY_OWNER_DELEGATION_ACTION.test(normalized)
  );
}

function normalizeFieldValue(value: string): string {
  const normalized = value
    .replace(/[*`_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}
