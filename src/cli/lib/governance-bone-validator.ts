export type GovernanceBoneMode = "warning" | "strict";
export type GovernanceBoneStatus = "PASS" | "WARNING" | "BLOCK";

export interface GovernanceBoneDocument {
  path: string;
  content: string;
}

export interface GovernanceBoneOptions {
  mode?: GovernanceBoneMode;
  requireGovernanceBone?: boolean;
}

export interface GovernanceBoneFinding {
  severity: "WARNING" | "BLOCK";
  path: string;
  type:
    | "missing_field"
    | "llm_owns_flow"
    | "llm_owns_tool_execution"
    | "silent_fallback";
  field?: string;
  message: string;
}

export interface GovernanceBoneResult {
  status: GovernanceBoneStatus;
  mode: GovernanceBoneMode;
  governanceDetected: boolean;
  findings: GovernanceBoneFinding[];
  checkedDocuments: string[];
}

export const GOVERNANCE_BONE_FIELDS = [
  "Goal",
  "Phase",
  "Work Order",
  "PR slice",
  "Script/gate owner",
  "Action tools",
  "Context evidence",
  "Memory/recovery evidence",
  "Approval policy",
  "Audit evidence",
  "Rollback/replay",
] as const;

const GOVERNANCE_TRIGGER =
  /\b(work\s*order|goal\s*contract|governance\s*bone|action\s*tools?|tool\s*execution|approval\s*policy|audit\s*evidence|rollback|replay|customer\s*data|tenant\s*data|mutation|external\s*state|scripted\s*step|script\s*control|gate\s*owner)\b|作業指示|ワークオーダー|承認|監査|外部操作|状態変更|顧客データ|スクリプト制御|ゲート/i;

const LLM_OWNS_FLOW =
  /llm[^.\n]*(owns|controls|decides|advances)[^.\n]*(goal|phase|work\s*order|state|gate|approval|flow)|(?:goal|phase|work\s*order|state|gate|approval|flow)[^.\n]*(owned|controlled|decided|advanced)[^.\n]*llm/i;

const LLM_OWNS_TOOL_EXECUTION =
  /llm[^.\n]*(owns|approves|executes|authorizes)[^.\n]*(tool\s*execution|action\s*tool|external\s*mutation|customer\s*data\s*mutation)|(?:tool\s*execution|action\s*tool|external\s*mutation|customer\s*data\s*mutation)[^.\n]*(owned|approved|executed|authorized)[^.\n]*llm/i;

const SILENT_FALLBACK =
  /silent\s*fallback|fallback\s*silently|missing\s+(?:approval|context|audit|evidence)[^.\n]*(?:continue|proceed)|(?:approval|context|audit|evidence)[^.\n]*optional\s+fallback/i;

const NEGATED_OWNERSHIP =
  /\b(?:must\s+not|mustn't|does\s+not|doesn't|do\s+not|don't|never|cannot|can't|should\s+not|shouldn't)\b|してはいけない|しない|持たせない|任せない|禁止/i;

export function validateGovernanceBone(
  documents: GovernanceBoneDocument[],
  options: GovernanceBoneOptions = {},
): GovernanceBoneResult {
  const mode = options.mode ?? "warning";
  const checkedDocuments = documents.map((doc) => doc.path);
  const relevant = documents.filter(
    (doc) =>
      options.requireGovernanceBone === true ||
      GOVERNANCE_TRIGGER.test(doc.content),
  );
  const governanceDetected = relevant.length > 0;
  const findings: GovernanceBoneFinding[] = [];

  for (const doc of relevant) {
    for (const field of GOVERNANCE_BONE_FIELDS) {
      if (!hasGovernanceField(doc.content, field)) {
        findings.push({
          severity: mode === "strict" ? "BLOCK" : "WARNING",
          path: doc.path,
          type: "missing_field",
          field,
          message: `Missing governance bone field: ${field}`,
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
    governanceDetected,
    findings,
    checkedDocuments,
  };
}

function hasGovernanceField(content: string, field: string): boolean {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldPattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:`,
    "i",
  );
  if (!fieldPattern.test(content)) return false;

  const valuePattern = new RegExp(
    `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(?:not applicable|n/a|tbd|.+)`,
    "i",
  );
  return valuePattern.test(content);
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
