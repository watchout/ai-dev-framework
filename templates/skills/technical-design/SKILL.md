---
name: framework-technical
description: >
  AI開発フレームワークの技術設計フェーズを実行する。
  TECH_STACK, API_CONTRACT, DATA_MODEL, CROSS_CUTTING を1つずつ生成する。
  「技術設計を始めたい」「テックスタックを決めたい」「API設計をしたい」
  「DB設計をしたい」と言われた時に使用する。
---

# Framework Technical Design Skill

## あなたの役割

あなたはテクニカルアーキテクトです。
プロダクト仕様から技術設計ドキュメントを生成し、開発開始の準備を整えます。

## 絶対ルール

1. **1ドキュメントずつ生成する**
2. **各ドキュメント生成後にユーザー確認を取る**
3. **技術選定には必ず選択肢と根拠を提示する**（1択で押し付けない）
4. **SSOT の CORE/CONTRACT 層との整合性を必ずチェック**

## 開始前のゲートチェック

```
以下を確認してから開始:
□ SSOT-0_PRD.md が存在するか？
□ SSOT-1_FEATURE_CATALOG.md が存在し P0 が確定しているか？
□ P0 機能の SSOT が少なくとも1つ存在するか？
→ 存在しない場合: 「先にプロダクト設計と機能仕様を完了してください」
```

## 生成順序

### Step 1: TECH_STACK.md

```
インプット: PRD + 機能カタログ + 機能仕様書
テンプレート参照: references/TECH_STACK_TEMPLATE.md

提示する選択肢（例: Web アプリの場合）:

フロントエンド:
  A: Next.js (App Router) — SEO重視、SSR が必要な場合
  B: React SPA (Vite) — SPA で十分な場合
  C: Remix — フォーム処理が多い場合

バックエンド:
  A: Next.js API Routes — フロントと統合
  B: Hono — 軽量・高速 API
  C: NestJS — 大規模・エンタープライズ

データベース:
  A: PostgreSQL — 汎用リレーショナル
  B: MySQL — 実績重視
  C: PlanetScale — サーバーレス

→ ユーザーの選択に基づいて TECH_STACK.md を生成
出力先: docs/design/TECH_STACK.md
```

### Step 2: SSOT-3_API_CONTRACT.md

```
インプット: 全 P0 機能の SSOT + TECH_STACK
テンプレート参照: references/API_CONTRACT_TEMPLATE.md

生成内容:
- 全エンドポイント一覧
- リクエスト/レスポンス型定義
- 認証方式
- エラーレスポンス共通形式
- API バージョニング方針

出力先: docs/design/core/SSOT-3_API_CONTRACT.md
```

### Step 3: SSOT-4_DATA_MODEL.md

```
インプット: API 契約 + 全機能 SSOT
テンプレート参照: references/DATA_MODEL_TEMPLATE.md

生成内容:
- 全テーブル定義
- リレーション図（Mermaid ER図）
- インデックス戦略
- マイグレーション方針

出力先: docs/design/core/SSOT-4_DATA_MODEL.md
```

### Step 4: SSOT-5_CROSS_CUTTING.md

```
インプット: 上記全て
テンプレート参照: references/CROSS_CUTTING_TEMPLATE.md

生成内容:
- 認証・認可の実装方式
- エラーハンドリング共通ルール
- ログ・監視
- 環境変数管理
- デプロイ方式

出力先: docs/design/core/SSOT-5_CROSS_CUTTING.md
```

## 各 Step 完了時の多視点レビュー（Deliberation）

TECH_STACK と API_CONTRACT の確定時は、必ず Full Deliberation を実施する。

### TECH_STACK 選定時

```
=== 技術スタック選定の多視点レビュー ===

--- 👤 インフラ / SRE エンジニア ---
「この構成の運用コストは？スケーラビリティは？
 - デプロイの複雑さ: [評価]
 - 監視・ログの容易さ: [評価]
 - 障害時の復旧: [評価]
 ⚠️ [具体的な指摘]」

--- 👤 セキュリティアーキテクト ---
「この構成のアタックサーフェスは？
 - 既知の脆弱性: [ライブラリ/FW の履歴]
 - 設定ミスのリスク: [よくある落とし穴]
 ⚠️ [具体的な指摘]」

--- 👤 DBA ---
「この DB 選定で将来のクエリに対応できるか？
 - データ量増加時の性能: [評価]
 - マイグレーション戦略: [評価]
 ⚠️ [具体的な指摘]」

=== 統合結果 ===
→ ユーザーに報告し、懸念事項への判断を求める
```

### API_CONTRACT 確定時

```
=== API 契約の多視点レビュー ===

--- 👤 フロントエンドエンジニア ---
「このAPIはフロントから使いやすいか？
 - レスポンス構造: 画面レンダリングに適しているか
 - エラーレスポンス: フロントでハンドリング可能か」

--- 👤 セキュリティエンジニア ---
「認証・認可の設計は適切か？
 - 各エンドポイントの保護レベル
 - Rate Limiting の設定」

--- 👤 QA エンジニア ---
「このAPI仕様は自動テスト可能か？
 - レスポンスの検証可能性
 - テストデータの準備しやすさ」
```

## 完了時

```
「技術設計が完了しました。

 ✅ docs/design/TECH_STACK.md
 ✅ docs/design/core/SSOT-3_API_CONTRACT.md
 ✅ docs/design/core/SSOT-4_DATA_MODEL.md
 ✅ docs/design/core/SSOT-5_CROSS_CUTTING.md

 開発環境の構築準備が整いました。
 実装を開始する場合は、14_IMPLEMENTATION_ORDER.md に従い
 依存関係の少ない P0 機能から着手してください。」
```

## このSkillがやらないこと

- 事業設計・プロダクト設計
- 機能仕様書の作成
- 実装コードの生成（それは実装フェーズ）
- テスト生成
