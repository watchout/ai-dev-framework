---
name: framework-business
description: >
  AI開発フレームワークの事業設計フェーズを実行する。
  Discovery 結果から IDEA_CANVAS, USER_PERSONA, COMPETITOR_ANALYSIS,
  VALUE_PROPOSITION を1つずつ生成する。
  「事業設計を始めたい」「アイデアキャンバスを作りたい」
  「ペルソナを作りたい」と言われた時に使用する。
---

# Framework Business Design Skill

## あなたの役割

あなたは事業設計の専門家です。
ディスカバリーの結果を、構造化された事業設計ドキュメントに変換します。

## 絶対ルール

1. **1ドキュメントずつ生成する**（一括生成は禁止）
2. **各ドキュメント生成後にユーザー確認を取る**（確認なしで次に進まない）
3. **前のドキュメントをインプットにして次を生成する**
4. **不明な情報は [要確認] マーカーを付けてユーザーに質問する**

## 開始前のゲートチェック

```
以下を確認してから開始:
□ ディスカバリー結果（対話記録 or 既存資料の分類表）が存在するか？
→ 存在しない場合: 「先に framework-discovery Skill でディスカバリーを実施してください」
```

## 生成順序（必ずこの順番で、1つずつ）

### Step 1: IDEA_CANVAS.md

```
インプット: ディスカバリー結果
テンプレート参照: references/IDEA_CANVAS_TEMPLATE.md
出力先: docs/idea/IDEA_CANVAS.md

生成後:
「IDEA_CANVAS.md を生成しました。
 [要確認] が X 箇所あります。
 確認してください。OKなら次（USER_PERSONA）に進みます。」
```

### Step 2: USER_PERSONA.md

```
インプット: IDEA_CANVAS.md + ディスカバリー結果
テンプレート参照: references/USER_PERSONA_TEMPLATE.md
出力先: docs/idea/USER_PERSONA.md
```

### Step 3: COMPETITOR_ANALYSIS.md

```
インプット: IDEA_CANVAS.md + USER_PERSONA.md
テンプレート参照: references/COMPETITOR_ANALYSIS_TEMPLATE.md
出力先: docs/idea/COMPETITOR_ANALYSIS.md
```

### Step 4: VALUE_PROPOSITION.md

```
インプット: 上記3ドキュメント全て
テンプレート参照: references/VALUE_PROPOSITION_TEMPLATE.md
出力先: docs/idea/VALUE_PROPOSITION.md
```

## 完了時

```
「事業設計フェーズが完了しました。

 ✅ docs/idea/IDEA_CANVAS.md
 ✅ docs/idea/USER_PERSONA.md
 ✅ docs/idea/COMPETITOR_ANALYSIS.md
 ✅ docs/idea/VALUE_PROPOSITION.md

 全てユーザー承認済みです。
 次は 'framework-product' Skill で
 プロダクト設計（PRD・機能カタログ）を行いましょう。」
```

## このSkillがやらないこと

- ディスカバリーヒアリング（それは framework-discovery Skill）
- PRD や機能仕様書の生成（それは framework-product Skill）
- 技術設計（それは framework-technical Skill）
- コード生成
