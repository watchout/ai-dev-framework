---
name: self-improve
description: |
  LEARNINGS.mdを分析し、CLAUDE.mdへの昇格提案を生成。
  「self-improve」「知見昇格」「ルール昇格」で実行。
---

# Self-Improve: 知見昇格提案

## 概要

.learnings/LEARNINGS.md を分析し、繰り返し出現するパターンをCLAUDE.mdへの昇格候補として特定する。CLAUDE.mdへの直接書き込みは行わず、提案のみ生成する。

## 実行フロー

```
1. LEARNINGS.md分析
   - エントリ数、カテゴリ別件数を集計
   - 各エントリの繰り返し回数を確認
   - promoted: true のエントリをスキップ

2. 昇格候補の特定
   条件（いずれか）:
   - 同一カテゴリ 3回以上出現
   - CRITICAL重要度 2回以上
   - Gate 2/3で同一パターン 2回以上

3. CLAUDE.md重複チェック
   - 既にCLAUDE.mdに類似ルールがないか確認
   - 重複する場合はスキップ

4. 昇格提案の生成
   → .learnings/PROMOTION_PROPOSALS.md に出力

5. CEO承認フロー
   - CEOにTelegram経由で昇格提案を報告
   - 承認されたらCLAUDE.mdに追記
   - LEARNINGS.mdの該当エントリに promoted: true を追記
```

## 昇格提案フォーマット

```markdown
# CLAUDE.md 昇格提案

## Date: {date}
## 提案数: {count}

### 提案 #1: [タイトル]
- **根拠**: LEARNINGS.mdの#XX, #XX, #XXで3回出現
- **カテゴリ**: [セキュリティ/パフォーマンス/テスト/コーディング規約/etc]
- **提案ルール**:
  ```
  - [CLAUDE.mdに追加するルールの文面]
  ```
- **CLAUDE.md重複チェック**: 重複なし / 既存ルール「XXX」と関連
- **推奨配置**: [CLAUDE.mdのどのセクションに追加すべきか]
```

## ルール

1. **CLAUDE.mdに直接書き込まない** — 提案のみ
2. **提案はPROMOTION_PROPOSALS.mdに出力** — CEO承認を待つ
3. **重複チェック必須** — 既存ルールとの重複を避ける
4. **INFOレベルは昇格対象外** — CRITICALとWARNINGのみ
