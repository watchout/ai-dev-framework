/**
 * claudemd-updater.ts - CLAUDE.md section replacement engine
 *
 * Replaces the skill/workflow section in CLAUDE.md during `shirube update`.
 * Only touches the skill section — all other sections are preserved.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/** Result of a CLAUDE.md update operation */
export interface ClaudeMdUpdateResult {
  updated: boolean;
  reason: string;
}

/**
 * Regex patterns that match known skill section headers.
 *
 * Covers 4 known variants across applied projects:
 * - "## 🧠 スキル（専門家チーム）"                (hotel-kanri)
 * - "## 🧠 スキル（専門家チーム）による合議制開発"  (haishin-plus-hub, wbs)
 * - "## スキル（専門家チーム）による合議制開発"      (iyasaka, no emoji)
 * - "## Workflow Orchestration"                     (v4.0 new projects)
 */
const SKILL_SECTION_HEADER_PATTERN =
  /^## (?:🧠\s*)?(?:スキル.*専門家|Workflow Orchestration)/;

/** Matches a horizontal rule on its own line */
const SECTION_SEPARATOR_PATTERN = /^---\s*$/;

/**
 * The replacement content for the skill section (v4.0 Workflow Orchestration).
 * This is the canonical content that `shirube update` installs.
 */
export function getWorkflowOrchestrationContent(): string {
  return `## Workflow Orchestration

このプロジェクトには4つの専門スキルが .claude/skills/ に配置されている。
各スキルには専門エージェントが定義されており、品質の高い成果物を生成する。

### スキル起動ルール

**明示的なフェーズ指示**（以下のキーワード）→ 即座に Skill ツールで対応スキルを起動:

| キーワード | 起動スキル |
|-----------|-----------|
| 「ディスカバリー」「何を作りたい？」「アイデア」 | /discovery |
| 「設計」「仕様を作って」「スペック」「アーキテクチャ」 | /design |
| 「実装開始」「コードを書いて」「タスク分解」 | /implement |
| 「レビュー」「監査」「audit」 | /review |

**タスク指示**（「DEV-XXXを実装して」「〇〇機能を作って」等）→ 適切なスキルの起動を提案:
- 新機能の場合: 「/design で設計してから /implement で実装しますか？」
- 既存機能の修正: 「/implement で実装しますか？」
- 品質確認: 「/review で監査しますか？」
ユーザーが承認したら Skill ツールで起動。不要と判断されたらスキップ。

**軽微な作業**（typo修正、設定変更、1ファイルの小修正等）→ スキル不要。直接作業。

### フェーズ遷移
各スキル完了後、次のフェーズを提案する:
discovery → design → implement → review
ユーザー承認後に次スキルを Skill ツールで起動。

### Pre-Code Gate 連携
「実装開始」の場合:
1. Skill ツールで /implement を起動
2. /implement スキル内で \`shirube gate check\` と \`shirube trace verify\` を確認
3. 全Gate passed なら実装開始。未通過なら BLOCK 理由を報告。`;
}

/**
 * Find the skill/workflow section in CLAUDE.md content.
 *
 * Returns the start line index (inclusive) and end line index (exclusive)
 * of the section to replace, or null if no section found.
 *
 * The section is defined as:
 * - Starts at a line matching SKILL_SECTION_HEADER_PATTERN
 * - Ends at the next separator (---) or next H2 (## ...) after the header
 *   (the boundary line itself is NOT included in the replacement range)
 */
export function findSkillSection(
  lines: string[],
): { start: number; end: number } | null {
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (SKILL_SECTION_HEADER_PATTERN.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return null;
  }

  // Find the next section boundary after the header. Older generated files do
  // not always include --- separators, so stop at the next H2 to avoid deleting
  // unrelated sections like "Knowledge & Memory".
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (SECTION_SEPARATOR_PATTERN.test(lines[i]) || /^##\s+/.test(lines[i])) {
      return { start: headerIndex, end: i };
    }
  }

  // No --- found after header: section extends to end of file
  return { start: headerIndex, end: lines.length };
}

/**
 * Update the skill section in a CLAUDE.md file.
 *
 * @param projectDir  Root of the target project
 * @returns Result indicating whether the update was performed
 */
export function updateClaudeMdSkillSection(
  projectDir: string,
): ClaudeMdUpdateResult {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");

  if (!fs.existsSync(claudeMdPath)) {
    return { updated: false, reason: "CLAUDE.md not found" };
  }

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const lines = content.split("\n");

  const section = findSkillSection(lines);

  if (section === null) {
    return appendSkillSection(lines, claudeMdPath);
  }

  // Replace the section
  const newContentLines = getWorkflowOrchestrationContent().split("\n");

  const updatedLines = [
    ...lines.slice(0, section.start),
    ...newContentLines,
    "",
    ...lines.slice(section.end),
  ];

  const updatedContent = updatedLines.join("\n");

  // Only write if content actually changed
  if (updatedContent === content) {
    return { updated: false, reason: "Already up to date" };
  }

  fs.writeFileSync(claudeMdPath, updatedContent, "utf-8");
  return {
    updated: true,
    reason: "Skill section replaced with Workflow Orchestration",
  };
}

/**
 * Append the skill section when no existing section is found.
 * Attempts to insert after the Pre-Code Gate section, otherwise at the end.
 */
function appendSkillSection(
  lines: string[],
  claudeMdPath: string,
): ClaudeMdUpdateResult {
  const preCodeGatePattern = /^## .*Pre-Code Gate/;
  let insertAfterIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (preCodeGatePattern.test(lines[i])) {
      // Find the next --- after Pre-Code Gate
      for (let j = i + 1; j < lines.length; j++) {
        if (SECTION_SEPARATOR_PATTERN.test(lines[j])) {
          insertAfterIndex = j + 1;
          break;
        }
      }
      break;
    }
  }

  const newContentLines = getWorkflowOrchestrationContent().split("\n");
  const insertBlock = ["", ...newContentLines, "", "---"];

  let updatedLines: string[];
  if (insertAfterIndex >= 0) {
    updatedLines = [
      ...lines.slice(0, insertAfterIndex),
      ...insertBlock,
      ...lines.slice(insertAfterIndex),
    ];
  } else {
    updatedLines = [...lines, ...insertBlock];
  }

  fs.writeFileSync(claudeMdPath, updatedLines.join("\n"), "utf-8");
  return {
    updated: true,
    reason: "Workflow Orchestration section appended",
  };
}
