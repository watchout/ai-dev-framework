---
name: product
description: |
  Product Phase専門家チーム。プロダクト設計と機能仕様を担当。
  「プロダクト設計を開始」「product」で実行。
  個別エージェント: 「P1」「P2」「P3」「P4」「P5」で個別実行可能。
---

# Product Phase Skill - プロダクト設計

## 概要

ビジネス要件をプロダクト仕様に落とし込み、
実装可能な機能定義を作成する専門家チーム。

## エージェント構成

```
Product Workflow
─────────────────────────────────────────────────────

P1: PRD Author（PRD作成者）
    ↓ プロダクト要件を定義
P2: Feature Cataloger（機能カタログ作成者）
    ↓ 機能を分類・優先度付け
P3: UI State Designer（UI状態設計者）
    ↓ 画面と状態遷移を設計
P4: Feature Spec Writer（機能仕様作成者）
    ↓ 各機能の詳細仕様を作成
P5: UX Validator（UX検証者）
    ↓ ユーザー体験を検証

→ SSOT-0_PRD.md + SSOT-1_FEATURE_CATALOG.md + SSOT-2_UI_STATE.md
→ 各機能SSOT（docs/project-features/）
```

## 各エージェントの役割

### P1: PRD Author（PRD作成者）

**役割**: プロダクト要件定義書を作成

**含む内容**:
- プロダクトビジョン
- ターゲットユーザー（ペルソナ参照）
- コア機能（MUST/SHOULD/COULD）
- 成功指標（KPI）
- 制約条件

**出力**: SSOT-0_PRD.md

詳細: `agents/p1-prd-author.md`

### P2: Feature Cataloger（機能カタログ作成者）

**役割**: 機能を体系的に分類し優先度付け

**分類**:
- 共通機能（認証、アカウント、エラー処理）
- 固有機能（プロジェクト特有）
- MVP / Post-MVP

**出力**: SSOT-1_FEATURE_CATALOG.md

詳細: `agents/p2-feature-cataloger.md`

### P3: UI State Designer（UI状態設計者）

**役割**: 画面一覧と状態遷移を設計

**設計内容**:
- 画面一覧
- 認証状態（S0-S4）ごとの表示
- 画面遷移図
- 主要コンポーネント

**出力**: SSOT-2_UI_STATE.md

詳細: `agents/p3-ui-state-designer.md`

### P4: Feature Spec Writer（機能仕様作成者）

**役割**: 各機能の詳細SSOTを作成

**11_FEATURE_SPEC_FLOW.md に従う**:
1. 共通質問（5項目）
2. 種別質問（機能種別ごと）
3. UI確認
4. 仕様確定
5. SSOT生成

**出力**: docs/project-features/{ID}_{name}.md

詳細: `agents/p4-feature-spec-writer.md`

### P5: UX Validator（UX検証者）

**役割**: ユーザー体験の観点から仕様を検証

**検証観点**:
- ユーザーフローの自然さ
- エラー時の体験
- アクセシビリティ
- モバイル対応

**出力**: UX改善提案、仕様へのフィードバック

詳細: `agents/p5-ux-validator.md`

## 実行方法

### フルワークフロー

```
「プロダクト設計を開始して」
「product」
```

### 個別エージェント

```
「P1を実行」→ PRD Authorのみ
「P2を実行」→ Feature Catalogerのみ
「P3を実行」→ UI State Designerのみ
「P4を実行」→ Feature Spec Writerのみ
「P5を実行」→ UX Validatorのみ
```

### 機能仕様の個別作成

```
「P4: AUTH-001を作成」→ 特定機能のSSOT作成
「P4: 予約機能を作成」→ 機能名からSSOT作成
```

## 合議ポイント

Product Phase完了時に以下の合議を行う：

1. **PRDの完全性**
   - 参加者: P1 + Business Expert + User Advocate
   - 判定: ビジネス要件が漏れなく反映されているか

2. **機能優先度の妥当性**
   - 参加者: P2 + Product Expert + Technical Expert
   - 判定: MVP機能の選定は適切か

3. **UI設計の一貫性**
   - 参加者: P3 + P5 + User Advocate
   - 判定: ユーザー体験に一貫性があるか

4. **機能仕様の実装可能性**
   - 参加者: P4 + Technical Expert
   - 判定: この仕様は実装可能か

## 成果物

| 成果物 | 完成度 | 次フェーズへの入力 |
|--------|--------|-------------------|
| SSOT-0_PRD.md | 90% | 全フェーズ |
| SSOT-1_FEATURE_CATALOG.md | 90% | Technical/Implementation |
| SSOT-2_UI_STATE.md | 80% | Implementation |
| 各機能SSOT | 100% | Implementation |

## Freeze 単位

- **Freeze 1: Domain** → P1, P2 完了後
- **Freeze 2: Contract** → P3, P4 完了後
- **Freeze 3: Exception** → P4, P5 完了後

## 次のフェーズ

Product完了後は `.claude/skills/technical/SKILL.md` へ移行。
