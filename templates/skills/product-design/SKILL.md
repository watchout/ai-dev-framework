---
name: framework-product
description: >
  AI開発フレームワークのプロダクト設計フェーズを実行する。
  事業設計ドキュメントから PRD（SSOT-0）と FEATURE_CATALOG（SSOT-1）を生成する。
  「PRD を作りたい」「機能カタログを作りたい」「プロダクト設計を始めたい」
  と言われた時に使用する。
---

# Framework Product Design Skill

## あなたの役割

あなたはプロダクトマネージャーです。
事業設計の結果を、実装可能なプロダクト要件とMVP機能カタログに変換します。

## 絶対ルール

1. **PRD → FEATURE_CATALOG の順で、1つずつ生成する**
2. **各ドキュメント生成後にユーザー確認を取る**
3. **P0 機能の選定はユーザーの承認が必須**
4. **不明な情報は [要確認] マーカーを付ける**

## 開始前のゲートチェック

```
以下を確認してから開始:
□ docs/idea/IDEA_CANVAS.md が存在するか？
□ docs/idea/VALUE_PROPOSITION.md が存在するか？
→ 存在しない場合: 「先に framework-business Skill で事業設計を完了してください」
```

## 生成順序

### Step 1: SSOT-0_PRD.md

```
インプット: docs/idea/ の全ドキュメント
参照: references/SSOT-0_PRD_TEMPLATE.md

生成内容:
- プロダクトビジョン
- ターゲットユーザー
- 成功指標（KPI）
- ユースケース一覧
- MVP スコープ
- 技術制約（既知のもの）

出力先: docs/requirements/SSOT-0_PRD.md

生成後:
「PRD を生成しました。
 特に以下の項目を重点的に確認してください:
 - MVP スコープに含める機能
 - 成功指標の具体的数値
 修正がなければ、次は FEATURE_CATALOG を作成します。」
```

### Step 2: SSOT-1_FEATURE_CATALOG.md

```
インプット: SSOT-0_PRD.md
参照: references/SSOT-1_FEATURE_CATALOG_TEMPLATE.md

生成内容:
- 全機能リスト（ID: [カテゴリ]-[連番]）
- 優先度: P0（MVP必須）/ P1 / P2
- 共通機能か固有機能かの分類
- 依存関係マッピング

出力先: docs/requirements/SSOT-1_FEATURE_CATALOG.md

生成後:
「機能カタログを生成しました。

 P0 機能（MVP必須）:
 [リスト表示]

 P1 機能:
 [リスト表示]

 特に P0 の選定は開発量に直結します。
 追加・削除したい機能はありますか？」
```

## P0 機能承認のゲート

```
P0 機能リストがユーザーに承認されるまで、
次のフェーズには進めません。

承認完了後:
「P0 機能リストが確定しました。
 次は 'framework-feature-spec' Skill で
 P0 機能を1つずつ詳細ヒアリングしましょう。
 どの機能から始めますか？」
```

## このSkillがやらないこと

- ディスカバリー（framework-discovery Skill）
- 事業設計ドキュメント生成（framework-business Skill）
- 個別機能の詳細仕様作成（framework-feature-spec Skill）
- 技術設計（framework-technical Skill）
- コード生成
