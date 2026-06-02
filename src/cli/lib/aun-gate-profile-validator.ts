import {
  validateGovernanceBone,
  type GovernanceBoneDocument,
  type GovernanceBoneMode,
  type GovernanceBoneRisk,
} from "./governance-bone-validator.js";

export type AunGateMode = "warning" | "strict";
export type AunGateStatus = "PASS" | "WARNING" | "BLOCK";
export type AunGatePrClass =
  | "schema_migration"
  | "policy_evaluator"
  | "approval_lifecycle"
  | "execution_ledger"
  | "projection"
  | "product_demo";

export interface AunGateDocument {
  path: string;
  content: string;
}

export interface AunGateProfileOptions {
  prClass: AunGatePrClass;
  mode?: AunGateMode;
  requireGovernanceBone?: boolean;
}

export interface AunGateFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "governance_bone"
    | "missing_field"
    | "forbidden_authority"
    | "live_execution_without_stability"
    | "silent_fallback";
  field?: string;
  message: string;
}

export interface AunGateProfileResult {
  status: AunGateStatus;
  mode: AunGateMode;
  prClass: AunGatePrClass;
  risk: GovernanceBoneRisk;
  findings: AunGateFinding[];
  checkedDocuments: string[];
}

interface AunGateFieldDefinition {
  field: string;
  aliases: string[];
}

interface AunGateClassDefinition {
  label: string;
  defaultMode: AunGateMode;
  risk: GovernanceBoneRisk;
  requiredFields: AunGateFieldDefinition[];
}

const COMMON_FIELDS: AunGateFieldDefinition[] = [
  { field: "Aun Gate PR class", aliases: ["Aun Gate PR class", "PR class"] },
  { field: "Work Order", aliases: ["Work Order"] },
  { field: "Risk classification", aliases: ["Risk classification", "Risk"] },
  { field: "Live execution boundary", aliases: ["Live execution boundary", "No live execution"] },
];

export const AUN_GATE_PR_CLASSES: Record<AunGatePrClass, AunGateClassDefinition> = {
  schema_migration: {
    label: "PR-1 schema/migration",
    defaultMode: "warning",
    risk: "medium",
    requiredFields: [
      ...COMMON_FIELDS,
      {
        field: "Schema/migration evidence",
        aliases: ["Schema/migration evidence", "Migration evidence", "Schema evidence"],
      },
      {
        field: "Migration rollback",
        aliases: ["Migration rollback", "Rollback/replay", "Rollback plan"],
      },
    ],
  },
  policy_evaluator: {
    label: "PR-2 policy evaluator",
    defaultMode: "strict",
    risk: "high",
    requiredFields: [
      ...COMMON_FIELDS,
      {
        field: "Deterministic test evidence",
        aliases: ["Deterministic test evidence", "Test evidence", "Policy test evidence"],
      },
      {
        field: "Policy fixtures",
        aliases: ["Policy fixtures", "Policy fixture matrix"],
      },
      {
        field: "Deny/allow decisions",
        aliases: ["Deny/allow decisions", "Decision matrix", "Policy decision matrix"],
      },
    ],
  },
  approval_lifecycle: {
    label: "PR-3 approval lifecycle",
    defaultMode: "strict",
    risk: "high",
    requiredFields: [
      ...COMMON_FIELDS,
      { field: "Approval policy", aliases: ["Approval policy", "Human approval"] },
      {
        field: "Approval state model",
        aliases: ["Approval state model", "Approval lifecycle"],
      },
      {
        field: "Approval evidence",
        aliases: ["Approval evidence", "Approval refs", "Human approval evidence"],
      },
      { field: "Audit evidence", aliases: ["Audit evidence", "Audit refs"] },
      {
        field: "Recovery refs",
        aliases: ["Recovery refs", "Memory/recovery evidence", "Wasurezu recovery refs"],
      },
    ],
  },
  execution_ledger: {
    label: "PR-4 execution ledger/broker",
    defaultMode: "strict",
    risk: "critical",
    requiredFields: [
      ...COMMON_FIELDS,
      {
        field: "Runtime stability prerequisite",
        aliases: ["Runtime stability prerequisite", "AUN stability gate", "Runtime prerequisite"],
      },
      {
        field: "Execution attempt ledger",
        aliases: ["Execution attempt ledger", "Execution ledger", "Attempt ledger"],
      },
      {
        field: "Approval evidence",
        aliases: ["Approval evidence", "Approval refs", "Human approval evidence"],
      },
      { field: "Audit evidence", aliases: ["Audit evidence", "Audit refs"] },
      { field: "Rollback/replay", aliases: ["Rollback/replay", "Rollback plan"] },
    ],
  },
  projection: {
    label: "PR-5 operator projection",
    defaultMode: "warning",
    risk: "medium",
    requiredFields: [
      ...COMMON_FIELDS,
      {
        field: "Read-only projection",
        aliases: ["Read-only projection", "Read only projection", "Projection read-only"],
      },
      {
        field: "Stale/missing projection behavior",
        aliases: [
          "Stale/missing projection behavior",
          "Missing projection behavior",
          "Stale projection",
        ],
      },
      {
        field: "Projection audit evidence",
        aliases: ["Projection audit evidence", "Audit evidence", "Audit refs"],
      },
      {
        field: "No execution authority",
        aliases: ["No execution authority", "Execution authority"],
      },
    ],
  },
  product_demo: {
    label: "PR-6 product demo",
    defaultMode: "strict",
    risk: "high",
    requiredFields: [
      ...COMMON_FIELDS,
      {
        field: "Product Work Order",
        aliases: ["Product Work Order", "Work Order"],
      },
      { field: "Context evidence", aliases: ["Context evidence", "Context refs"] },
      {
        field: "Memory/recovery evidence",
        aliases: ["Memory/recovery evidence", "Recovery refs"],
      },
      { field: "Approval policy", aliases: ["Approval policy", "Human approval"] },
      { field: "Audit evidence", aliases: ["Audit evidence", "Audit refs"] },
      { field: "Rollback/replay", aliases: ["Rollback/replay", "Rollback plan"] },
    ],
  },
};

const LIVE_EXECUTION_WITHOUT_STABILITY =
  /\b(live\s+action\s+execution|live\s+execution|execute\s+live\s+tools?|enable\s+execution)\b[^.\n]*(?:without|before|despite)[^.\n]*(runtime\s+stability|stability\s+gate|aun\s+stability)/i;

const FORBIDDEN_AUTHORITY =
  /\b(?:aun\s+platform|kodama|wasurezu|shirube|hotel\s+product)[^.\n]*(owns|authorizes|approves|decides)[^.\n]*(execution|approval|policy\s+decision|tool\s+dispatch)|(?:execution|approval|policy\s+decision|tool\s+dispatch)[^.\n]*(owned|authorized|approved|decided)[^.\n]*(?:aun\s+platform|kodama|wasurezu|shirube|hotel\s+product)/i;

const SILENT_FALLBACK =
  /silent\s+fallback|fallback\s+silently|missing\s+(?:approval|context|audit|recovery|policy)[^.\n]*(?:continue|proceed|execute)/i;

const NEGATED =
  /\b(?:must\s+not|does\s+not|do\s+not|never|cannot|should\s+not|not\s+an\s+authority|no\s+execution\s+authority)\b|しない|禁止/i;

export function validateAunGateProfile(
  documents: AunGateDocument[],
  options: AunGateProfileOptions,
): AunGateProfileResult {
  const classDefinition = AUN_GATE_PR_CLASSES[options.prClass];
  const mode = options.mode ?? classDefinition.defaultMode;
  const checkedDocuments = documents.map((document) => document.path);
  const findings: AunGateFinding[] = [];

  const governanceResult = validateGovernanceBone(
    documents.map((document): GovernanceBoneDocument => ({
      path: document.path,
      content: document.content,
    })),
    {
      mode: mode as GovernanceBoneMode,
      profile: "infrastructure",
      risk: classDefinition.risk,
      requireGovernanceBone: options.requireGovernanceBone ?? true,
    },
  );

  for (const governanceFinding of governanceResult.findings) {
    findings.push({
      severity: governanceFinding.severity,
      path: governanceFinding.path,
      type: "governance_bone",
      field: governanceFinding.field,
      message: governanceFinding.message,
    });
  }

  for (const document of documents) {
    for (const field of classDefinition.requiredFields) {
      if (!hasFieldAlias(document.content, field.aliases)) {
        findings.push({
          severity: mode === "strict" ? "BLOCK" : "WARNING",
          path: document.path,
          type: "missing_field",
          field: field.field,
          message: `${classDefinition.label} requires ${field.field}.`,
        });
      }
    }

    if (hasNonNegatedMatch(document.content, LIVE_EXECUTION_WITHOUT_STABILITY)) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "live_execution_without_stability",
        message:
          "Live action execution cannot be enabled before AUN runtime stability prerequisites pass.",
      });
    }

    if (hasNonNegatedMatch(document.content, FORBIDDEN_AUTHORITY)) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "forbidden_authority",
        message:
          "AUN Platform, Kodama, Wasurezu, Shirube, and product repos must not redefine each other's execution or approval authority.",
      });
    }

    if (SILENT_FALLBACK.test(document.content)) {
      findings.push({
        severity: "BLOCK",
        path: document.path,
        type: "silent_fallback",
        message:
          "Missing approval, context, recovery, policy, or audit evidence must not silently fall back to execution.",
      });
    }
  }

  return {
    status: toStatus(findings),
    mode,
    prClass: options.prClass,
    risk: classDefinition.risk,
    findings,
    checkedDocuments,
  };
}

function hasFieldAlias(content: string, aliases: string[]): boolean {
  return aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(?:not applicable|n/a|tbd|.+)`,
      "i",
    );
    return pattern.test(content);
  });
}

function hasNonNegatedMatch(content: string, pattern: RegExp): boolean {
  const sentences = content
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.some((sentence) => {
    if (!pattern.test(sentence)) return false;
    return !NEGATED.test(sentence);
  });
}

function toStatus(findings: AunGateFinding[]): AunGateStatus {
  if (findings.some((finding) => finding.severity === "BLOCK")) return "BLOCK";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}
