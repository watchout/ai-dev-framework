/**
 * LLM Control Design validator.
 *
 * Deterministic companion to the LLM Control Policy added to /design.
 * It checks automation-related design text for the required control sections
 * before /gate-design proceeds in strict mode. No LLM calls are made here.
 */

export type LlmControlDesignStatus = "PASS" | "WARNING" | "BLOCK";

export interface LlmControlDesignDocument {
  path: string;
  content: string;
}

export interface LlmControlDesignFinding {
  severity: "BLOCK" | "WARNING";
  path: string;
  type:
    | "missing_section"
    | "llm_owns_state_transition"
    | "llm_owns_finalization"
    | "llm_owns_delivery";
  message: string;
}

export interface LlmControlDesignResult {
  status: LlmControlDesignStatus;
  automationDetected: boolean;
  findings: LlmControlDesignFinding[];
  checkedDocuments: string[];
}

const AUTOMATION_TRIGGER =
  /\b(automation|automated|hook|memory|queue|pull request automation|runtime orchestration|orchestration|delivery automation|finalization|finalize|retry|runner|daemon|github actions|merge-authority|llm adapter|runtime adapter|github issues?\s+(?:generation|creation|create|sync)|issues?\s+(?:generation|creation|create|sync)|(?:generate|generates|generating|create|creates|creating|sync|syncs|syncing)\s+(?:github\s+)?issues?|pull requests?\s+(?:generation|creation|create)|pr\s+generation|(?:generate|generates|generating|create|creates|creating)\s+(?:pull requests?|prs?))\b|自動化|フック|記憶|メモリ|キュー|状態遷移|外部投稿|配信|完了処理|再試行|ランナー|オーケストレーション|アダプタ|Issue生成|Issue作成|PR生成|PR作成|Pull Request作成/i;

const REQUIRED_SECTIONS: { label: string; pattern: RegExp }[] = [
  {
    label: "Source of Truth",
    pattern: /^#{2,4}\s+.*(?:source\s+of\s+truth|single\s+source\s+of\s+truth|\bssot\b|信頼できる情報源|正本)/im,
  },
  {
    label: "deterministic control vs LLM judgment",
    pattern: /^#{2,4}\s+.*(?:deterministic\s+control|llm\s+judg(?:e)?ment|control\s+split|決定論的制御|機械制御|llm判断|制御分担)/im,
  },
  {
    label: "Hook usage and justification",
    pattern: /^#{2,4}\s+.*(?:hook\s+(?:usage|justification)|pretooluse|posttooluse|sessionstart|userpromptsubmit|stop\s+completion|フック.*根拠|hook.*根拠)/im,
  },
  {
    label: "runtime adapter boundary",
    pattern: /^#{2,4}\s+.*(?:runtime\s+adapter\s+boundary|adapter\s+boundary|runner.*adapter|llm\s+runtime\s+adapter|アダプタ.*境界|責務境界)/im,
  },
  {
    label: "startup/restart context",
    pattern: /^#{2,4}\s+.*(?:startup|restart|restart\s+pack|boot\s+context|起動時|再起動|復旧コンテキスト)/im,
  },
  {
    label: "mechanical gates",
    pattern: /^#{2,4}\s+.*(?:mechanical\s+gate|deterministic\s+gate|ci\s+gate|branch\s+protection|機械的ゲート|機械ゲート|検証ゲート)/im,
  },
  {
    label: "authority / approval requirements",
    pattern: /^#{2,4}\s+.*(?:authority|approval|required\s+approval|l3|cto|release_owner|human_approver|承認|権限|責任者)/im,
  },
];

const LLM_STATE_TRANSITION =
  /llm[^.\n]*(queue|state transition|状態遷移|キュー)|(?:queue|state transition|状態遷移|キュー)[^.\n]*llm/i;
const LLM_FINALIZATION =
  /llm[^.\n]*(finalize|finalization|完了処理|最終化)|(?:finalize|finalization|完了処理|最終化)[^.\n]*llm/i;
const LLM_DELIVERY =
  /llm[^.\n]*(delivery|external post|publish|外部投稿|配信)|(?:delivery|external post|publish|外部投稿|配信)[^.\n]*llm/i;
const NEGATED_LLM_OWNERSHIP =
  /\b(?:must\s+not|mustn't|does\s+not|doesn't|do\s+not|don't|never|cannot|can't|should\s+not|shouldn't)\b|してはいけない|しない|持たせない|任せない|禁止/i;

export function validateLlmControlDesign(
  documents: LlmControlDesignDocument[],
): LlmControlDesignResult {
  const checkedDocuments = documents.map((doc) => doc.path);
  const relevant = documents.filter((doc) => AUTOMATION_TRIGGER.test(doc.content));
  const automationDetected = relevant.length > 0;
  const findings: LlmControlDesignFinding[] = [];

  for (const doc of relevant) {
    for (const required of REQUIRED_SECTIONS) {
      if (!required.pattern.test(doc.content)) {
        findings.push({
          severity: "BLOCK",
          path: doc.path,
          type: "missing_section",
          message: `Missing LLM Control Design section: ${required.label}`,
        });
      }
    }

    if (hasNonNegatedMatch(doc.content, LLM_STATE_TRANSITION)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "llm_owns_state_transition",
        message:
          "LLM adapter must not own queue progress or state transitions; use a deterministic runner/service.",
      });
    }
    if (hasNonNegatedMatch(doc.content, LLM_FINALIZATION)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "llm_owns_finalization",
        message:
          "LLM adapter must not own finalization; use a deterministic runner/service.",
      });
    }
    if (hasNonNegatedMatch(doc.content, LLM_DELIVERY)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "llm_owns_delivery",
        message:
          "LLM adapter must not own delivery or external posting; use a deterministic runner/service.",
      });
    }
  }

  return {
    status: findings.some((finding) => finding.severity === "BLOCK")
      ? "BLOCK"
      : "PASS",
    automationDetected,
    findings,
    checkedDocuments,
  };
}

function hasNonNegatedMatch(content: string, pattern: RegExp): boolean {
  const sentences = content
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.some((sentence) => {
    if (!pattern.test(sentence)) return false;
    return !NEGATED_LLM_OWNERSHIP.test(sentence);
  });
}
