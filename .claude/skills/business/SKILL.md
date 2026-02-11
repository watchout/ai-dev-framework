---
name: business
description: |
  Business Phase専門家チーム。事業設計と価値提案を担当。
  「ビジネス設計を開始」「business」で実行。
  個別エージェント: 「B1」「B2」「B3」「B4」で個別実行可能。
---

# Business Phase Skill - 事業設計

## 概要

Discoveryで発見したアイデアを、持続可能なビジネスモデルに
落とし込むための専門家チーム。

## エージェント構成

```
Business Workflow
─────────────────────────────────────────────────────

B1: Value Architect（価値設計者）
    ↓ 価値提案を設計
B2: Competitor Analyst（競合分析者）
    ↓ 競合と差別化を分析
B3: Revenue Designer（収益設計者）
    ↓ マネタイズモデルを設計
B4: Go-to-Market Planner（市場投入計画者）
    ↓ 市場投入戦略を策定

→ VALUE_PROPOSITION.md + COMPETITOR_ANALYSIS.md 完成
```

## 各エージェントの役割

### B1: Value Architect（価値設計者）

**役割**: ユーザーに提供する価値を明確に言語化

**フレームワーク**:
- バリュープロポジションキャンバス
- Jobs to be Done
- ゲインクリエイター / ペインリリーバー

**出力**: VALUE_PROPOSITION.md

詳細: `agents/b1-value-architect.md`

### B2: Competitor Analyst（競合分析者）

**役割**: 競合状況を分析し、差別化ポイントを明確化

**分析観点**:
- 直接競合 / 間接競合 / 代替手段
- 機能比較マトリクス
- ポジショニングマップ

**出力**: COMPETITOR_ANALYSIS.md

詳細: `agents/b2-competitor-analyst.md`

### B3: Revenue Designer（収益設計者）

**役割**: 持続可能な収益モデルを設計

**検討事項**:
- 課金モデル（サブスク/従量/フリーミアム）
- 価格設定戦略
- LTV/CAC 試算

**出力**: BUSINESS_MODEL.md（PRDに統合）

詳細: `agents/b3-revenue-designer.md`

### B4: Go-to-Market Planner（市場投入計画者）

**役割**: 市場投入戦略を策定

**検討事項**:
- ローンチ戦略（PLF/Build in Public）
- チャネル戦略
- 初期ユーザー獲得計画

**出力**: GTM_STRATEGY.md（または LP_SPEC.md への入力）

詳細: `agents/b4-gtm-planner.md`

## 実行方法

### フルワークフロー

```
「ビジネス設計を開始して」
「business」
```

### 個別エージェント

```
「B1を実行」→ Value Architectのみ
「B2を実行」→ Competitor Analystのみ
「B3を実行」→ Revenue Designerのみ
「B4を実行」→ Go-to-Market Plannerのみ
```

## 合議ポイント

Business Phase完了時に以下の合議を行う：

1. **価値提案の妥当性**
   - 参加者: B1 + Product Expert + User Advocate
   - 判定: この価値提案はユーザーに響くか

2. **差別化の持続可能性**
   - 参加者: B2 + Technical Expert
   - 判定: この差別化は技術的に維持可能か

3. **収益モデルの実現性**
   - 参加者: B3 + Product Expert
   - 判定: このモデルでユーザーは払うか

4. **GTM戦略の実行可能性**
   - 参加者: B4 + Business Expert
   - 判定: リソース内で実行可能か

## 成果物

| 成果物 | 完成度 | 次フェーズへの入力 |
|--------|--------|-------------------|
| VALUE_PROPOSITION.md | 80% | Product Phase |
| COMPETITOR_ANALYSIS.md | 80% | Product Phase |
| BUSINESS_MODEL.md | 60% | PRD統合 |
| GTM_STRATEGY.md | 40% | LP_SPEC.md |

## マーケティングフレームワーク参照

07_MARKETING_FRAMEWORK.md の原則を適用：
- ジェイ・エイブラハム: 3軸成長、リスクリバーサル
- DRM: PASONA、2ステップ
- ローンチ戦略: PLF、Build in Public

## 次のフェーズ

Business完了後は `.claude/skills/product/SKILL.md` へ移行。
