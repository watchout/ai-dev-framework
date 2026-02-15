# Agent Skills インデックス

## 概要

AI開発フレームワークの各フェーズを専門化した Agent Skills 群です。
4つのスキルに統合され、28名の専門家エージェントが各フェーズを担当します。

## スキル構成

```
templates/skills/
├── SKILLS_INDEX.md        ← このファイル
├── discovery/SKILL.md     ← Discovery & Business Phase（D1-D4, B1-B4）
├── design/SKILL.md        ← Product & Technical Design（P1-P5, T1-T5）
├── implement/SKILL.md     ← Implementation Phase（I1-I5）
└── review/SKILL.md        ← Review & Audit（R1-R5 + 合議プロトコル）
```

## スキル一覧

| スキル | 統合元 | エージェント | トリガー |
|--------|--------|-------------|----------|
| discovery | discovery + business | D1-D4, B1-B4 | 「ディスカバリー」「アイデア」「ビジネス設計」 |
| design | product + technical | P1-P5, T1-T5 | 「設計」「仕様」「アーキテクチャ」 |
| implement | implementation | I1-I5 | 「実装」「コーディング」「テスト」 |
| review | review-council + deliberation + code-audit + ssot-audit | R1-R5 | 「レビュー」「監査」「audit」 |

## 開発フロー

```
Discovery & Business → Design → Implementation → Review
```

## 利用方法

### Claude Code CLI

```
.claude/skills/ に配置（framework init / retrofit で自動コピー）
```

### Claude.ai

```
設定 > 機能 > スキル > ZIP アップロード
```

## 各スキルに内蔵される機能

- **質問バンク**: 各エージェントのヒアリング質問集
- **チェックリスト**: 品質確認項目
- **出力フォーマット**: ドキュメントテンプレート
- **Multi-perspective Check**: 3視点（Product/Technical/Business）の検証
- **合議プロトコル**: review スキルに統合（軽量/標準/重量の3レベル）
