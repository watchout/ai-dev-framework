---
name: discovery
description: |
  Discovery & Business Phase。アイデア検証・事業設計を担当。
  「ディスカバリー」「discovery」「アイデア」「ビジネス設計」「business」で実行。
---

# Discovery & Business Skill

## 概要

プロジェクト初期段階のアイデア発掘から事業設計までを一貫して担当。
Discovery（D1-D4）で課題を検証し、Business（B1-B4）で持続可能なビジネスモデルに落とし込む。

## Agents（参照）

このスキルは以下のエージェントを順次呼び出す:

### Discovery
1. @agents/producers/discovery/d1-excavator.md → アイデアの核心を抽出
2. @agents/producers/discovery/d2-validator.md → 課題の実在性を検証
3. @agents/producers/discovery/d3-profiler.md → ターゲットユーザーを特定
4. @agents/producers/discovery/d4-scout.md → 市場機会を評価

### Business
5. @agents/producers/discovery/b1-value-architect.md → 価値提案を設計
6. @agents/producers/discovery/b2-competitor-analyst.md → 競合と差別化を分析
7. @agents/producers/discovery/b3-revenue-designer.md → マネタイズモデルを設計
8. @agents/producers/discovery/b4-gtm-planner.md → 市場投入戦略を策定

## ワークフロー

```
Discovery                          Business
──────────                         ──────────
D1: Idea Excavator                 B1: Value Architect
    ↓ アイデアの核心を抽出              ↓ 価値提案を設計
D2: Problem Validator              B2: Competitor Analyst
    ↓ 課題の実在性を検証               ↓ 競合と差別化を分析
D3: User Profiler                  B3: Revenue Designer
    ↓ ターゲットユーザーを特定          ↓ マネタイズモデルを設計
D4: Market Scout                   B4: Go-to-Market Planner
    ↓ 市場機会を評価                   ↓ 市場投入戦略を策定

→ IDEA_CANVAS + USER_PERSONA       → VALUE_PROPOSITION + COMPETITOR_ANALYSIS
  + COMPETITOR_ANALYSIS(初版)         + BUSINESS_MODEL + GTM_STRATEGY
```

## 実行ルール

1. **1回の発言で1つだけ質問する**（まとめて聞かない）
2. **必ず具体例を添える**（回答のハードルを下げる）
3. **各Stage完了時に整理・確認する**（認識ズレを防ぐ）
4. **「まとまっていなくてOK」と伝える**（完璧を求めない）
5. **ドキュメント生成は1つずつ、ユーザー承認を挟む**

## 成果物一覧

| 成果物 | 完成度 | 担当 | 次フェーズ入力 |
|--------|--------|------|---------------|
| IDEA_CANVAS.md | 80% | D1-D4 | Business全体 |
| USER_PERSONA.md | 50% | D3 | Product Phase |
| COMPETITOR_ANALYSIS.md | 80% | D4+B2 | Product Phase |
| VALUE_PROPOSITION.md | 80% | B1 | Product Phase |
| BUSINESS_MODEL | 60% | B3 | PRD統合 |
| GTM_STRATEGY | 40% | B4 | LP_SPEC.md |

## Multi-perspective Check

出力を確定する前に、以下の視点を検討:
- **Product**: ユーザーニーズに合致するか？ペルソナは実在するか？
- **Technical**: 技術的に実現可能か？開発コストは妥当か？
- **Business**: ビジネスモデルは持続可能か？市場は十分か？

視点間の緊張があれば、それを明記して解決策を示す。

## 次のフェーズ

Discovery & Business 完了後:
1. 成果物一覧をユーザーに提示して確認
2. 「設計フェーズ（/design）に進みますか？」と提案
3. 承認されたら Skill ツールで /design を起動
