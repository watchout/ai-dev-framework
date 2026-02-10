---
name: technical
description: |
  Technical Phase専門家チーム。技術設計とアーキテクチャを担当。
  「技術設計を開始」「technical」で実行。
  個別エージェント: 「T1」「T2」「T3」「T4」「T5」で個別実行可能。
---

# Technical Phase Skill - 技術設計

## 概要

プロダクト仕様を実装可能な技術設計に落とし込む専門家チーム。
アーキテクチャ、API、データモデル、横断的関心事を設計する。

## エージェント構成

```
Technical Workflow
─────────────────────────────────────────────────────

T1: Tech Stack Selector（技術選定者）
    ↓ 技術スタック選定
T2: API Architect（API設計者）
    ↓ API契約を設計
T3: Data Modeler（データモデラー）
    ↓ データモデルを設計
T4: Cross-Cutting Designer（横断設計者）
    ↓ 認証・エラー・ログを設計
T5: Security Reviewer（セキュリティレビュアー）
    ↓ セキュリティを検証

→ SSOT-3_API_CONTRACT.md + SSOT-4_DATA_MODEL.md + SSOT-5_CROSS_CUTTING.md
```

## 各エージェントの役割

### T1: Tech Stack Selector（技術選定者）

**役割**: プロジェクトに最適な技術スタックを選定

**選定基準**:
- プロジェクトタイプ（app/api/lp/hp/cli）
- チーム経験
- 長期保守性
- エコシステム

**出力**: TECH_STACK.md（または PRDに統合）

詳細: `agents/t1-tech-stack-selector.md`

### T2: API Architect（API設計者）

**役割**: API契約を設計（RESTful / GraphQL）

**設計内容**:
- エンドポイント一覧
- リクエスト/レスポンス形式
- 認証・認可
- エラーレスポンス
- OpenAPI仕様

**出力**: SSOT-3_API_CONTRACT.md

詳細: `agents/t2-api-architect.md`

### T3: Data Modeler（データモデラー）

**役割**: データベース設計とマイグレーション計画

**設計内容**:
- ER図
- テーブル定義
- インデックス戦略
- マイグレーション順序

**出力**: SSOT-4_DATA_MODEL.md

詳細: `agents/t3-data-modeler.md`

### T4: Cross-Cutting Designer（横断設計者）

**役割**: 横断的関心事（認証・エラー・ログ）を設計

**設計内容**:
- 認証フロー（S0-S4状態管理）
- エラーコード体系
- ログ設計
- 監視・アラート

**出力**: SSOT-5_CROSS_CUTTING.md

詳細: `agents/t4-cross-cutting-designer.md`

### T5: Security Reviewer（セキュリティレビュアー）

**役割**: セキュリティ観点から設計をレビュー

**レビュー観点**:
- OWASP Top 10
- 認証・認可の堅牢性
- データ保護
- 入力検証
- 依存関係の脆弱性

**出力**: SECURITY_REVIEW.md、設計へのフィードバック

詳細: `agents/t5-security-reviewer.md`

## 実行方法

### フルワークフロー

```
「技術設計を開始して」
「technical」
```

### 個別エージェント

```
「T1を実行」→ Tech Stack Selectorのみ
「T2を実行」→ API Architectのみ
「T3を実行」→ Data Modelerのみ
「T4を実行」→ Cross-Cutting Designerのみ
「T5を実行」→ Security Reviewerのみ
```

## 合議ポイント

Technical Phase完了時に以下の合議を行う：

1. **技術スタックの妥当性**
   - 参加者: T1 + Product Expert + Quality Expert
   - 判定: この技術スタックで要件を満たせるか

2. **API設計の一貫性**
   - 参加者: T2 + Product Expert
   - 判定: API設計はUI設計と整合しているか

3. **データモデルの拡張性**
   - 参加者: T3 + T2
   - 判定: 将来の機能拡張に対応できるか

4. **セキュリティの堅牢性**
   - 参加者: T5 + Quality Expert
   - 判定: セキュリティリスクは許容範囲か

## 成果物

| 成果物 | 完成度 | 次フェーズへの入力 |
|--------|--------|-------------------|
| TECH_STACK.md | 100% | Implementation |
| SSOT-3_API_CONTRACT.md | 90% | Implementation |
| SSOT-4_DATA_MODEL.md | 90% | Implementation |
| SSOT-5_CROSS_CUTTING.md | 90% | Implementation |
| SECURITY_REVIEW.md | 80% | 継続的レビュー |

## Freeze 単位

- **Freeze 2: Contract** → T2, T3 完了後（実装開始可能）
- **Freeze 3: Exception** → T4 完了後（テスト可能）
- **Freeze 4: Non-functional** → T5 完了後（リリース準備）

## TDD条件

Technical Phaseの成果物はCORE/CONTRACT層に該当するため、
**TDD強制**の対象となる。

```
SSOT → テスト作成 → 実装 → コード監査
```

## 次のフェーズ

Technical完了後は `.claude/skills/implementation/SKILL.md` へ移行。
