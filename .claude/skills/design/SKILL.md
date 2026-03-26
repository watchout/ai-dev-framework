---
name: design
description: |
  Product & Technical Design Phase。プロダクト設計と技術設計を担当。
  「設計」「design」「仕様」「プロダクト設計」「技術設計」「アーキテクチャ」で実行。
---

# Design Skill (Product + Technical)

## 概要

ビジネス要件をプロダクト仕様に変換し（P1-P5）、
それを実装可能な技術設計に落とし込む（T1-T5）専門家チーム。

## Agents（参照）

### Product Design
1. @agents/producers/design/p1-prd-author.md → SSOT-0_PRD.md
2. @agents/producers/design/p2-feature-cataloger.md → SSOT-1_FEATURE_CATALOG.md
3. @agents/producers/design/p3-ui-state-designer.md → SSOT-2_UI_STATE.md
4. @agents/producers/design/p4-feature-spec-writer.md → 機能SSOT (§3-E/F/G/H)
5. @agents/producers/design/p5-ux-validator.md → UX検証

### Technical Design
6. @agents/producers/design/t1-tech-stack-selector.md → TECH_STACK
7. @agents/producers/design/t2-api-architect.md → SSOT-3_API_CONTRACT.md
8. @agents/producers/design/t3-data-modeler.md → SSOT-4_DATA_MODEL.md
9. @agents/producers/design/t4-cross-cutting-designer.md → SSOT-5_CROSS_CUTTING.md
10. @agents/validators/security-reviewer.md → セキュリティレビュー

## ワークフロー

```
Product Design                     Technical Design
──────────────                     ────────────────
P1: PRD Author                     T1: Tech Stack Selector
    ↓ プロダクト要件を定義              ↓ 技術スタック選定
P2: Feature Cataloger              T2: API Architect
    ↓ 機能を分類・優先度付け            ↓ API契約を設計
P3: UI State Designer              T3: Data Modeler
    ↓ 画面と状態遷移を設計              ↓ データモデルを設計
P4: Feature Spec Writer            T4: Cross-Cutting Designer
    ↓ 各機能の詳細仕様を作成            ↓ 認証・エラー・ログを設計
P5: UX Validator                   T5: Security Reviewer
    ↓ ユーザー体験を検証               ↓ セキュリティを検証

→ PRD + Feature Catalog            → API_CONTRACT + DATA_MODEL
  + UI_STATE + 各機能SSOT             + CROSS_CUTTING + SECURITY
```

## 実行ルール

- ドキュメント生成は**1つずつ**、ユーザー承認を挟む
- 仕様ヒアリングは**1回の発言で1つだけ質問**する
- 不明な情報は推測で埋めず「[要確認]」マーカーを付ける
- Freeze 2（Contract）完了で実装開始可能

## Freeze 単位

```
Freeze 1: Domain  → P1, P2 完了後（用語・スコープ確定）
Freeze 2: Contract → P3, P4, T2, T3 完了後（実装開始可能）
Freeze 3: Exception → T4 完了後（テスト・監査可能）
Freeze 4: Non-functional → T5 完了後（リリース準備完了）
```

## 成果物一覧

| 成果物 | 完成度 | 担当 |
|--------|--------|------|
| SSOT-0_PRD.md | 90% | P1 |
| SSOT-1_FEATURE_CATALOG.md | 90% | P2 |
| SSOT-2_UI_STATE.md | 80% | P3 |
| 各機能SSOT | 100% | P4 |
| SSOT-3_API_CONTRACT.md | 90% | T2 |
| SSOT-4_DATA_MODEL.md | 90% | T3 |
| SSOT-5_CROSS_CUTTING.md | 90% | T4 |

## Multi-perspective Check

出力を確定する前に、以下の視点を検討:
- **Product**: ユーザーニーズを満たす設計か？使いやすいか？
- **Technical**: 実装可能で保守しやすいか？技術的負債を生まないか？
- **Business**: ビジネスモデルを支えるか？スケーラブルか？

視点間の緊張があれば、それを明記して解決策を示す。

## TDD条件

Technical Phaseの成果物はCORE/CONTRACT層に該当するため、
プロジェクトタイプが api/cli の場合は **TDD強制** の対象。

```
SSOT → テスト作成 → 実装 → コード監査
```

## Post-Design Gate（Gate 1: Design Validation）

設計完了後、Planning前にGate 1を通すこと:

```
1. framework gate design        ← コンテキスト収集（CLI）
2. /gate-design                  ← Validator実行（スキル）
3. PASS → framework plan に進む
   BLOCK → 設計書を修正 → 1に戻る
```

### BLOCKルール
- **1回目BLOCK**: 指摘事項に基づき設計書を修正して再実行
- **2回目連続BLOCK**: 設計アプローチ自体を見直す（場当たり的修正禁止）
- **3回目BLOCK**: CEOにエスカレーション

## 次のフェーズ

Design 完了後:
1. Gate 1（Design Validation）をPASS
2. 設計成果物をユーザーに提示して確認
3. `framework plan` で実装計画を生成
4. 「実装フェーズ（/implement）に進みますか？」と提案
5. 承認されたら Skill ツールで /implement を起動
