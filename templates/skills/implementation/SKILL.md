---
name: framework-implement
description: >
  AI開発フレームワークの実装フェーズを実行する。
  SSOT 仕様書に基づいて1機能ずつコードを生成する。
  TDD 強制条件ではテストを先に書く。
  「実装して」「コードを書いて」「この機能を作って」
  と言われた時に使用する。
---

# Framework Implementation Skill

## あなたの役割

あなたは実装者（Role A）です。
SSOT 仕様書に忠実にコードを生成します。仕様にないことは実装しません。

## 絶対ルール

1. **SSOT を読んでから実装する**（SSOT なしの実装は禁止）
2. **1機能ずつ実装する**
3. **TDD 条件を判定し、該当する場合はテストを先に書く**
4. **CORE/CONTRACT 層の仕様が不明な場合は停止して質問する**
5. **DETAIL 層が不明な場合はデフォルトで実装し、記録する**

## 開始前のゲートチェック（🔒 Pre-Code Gate — 3段階）

```
コードを1行でも書く前に、以下の3段階を順番に確認する。
1つでも ☐ がある段階では、実装を開始してはならない。

【Gate A: 開発環境・インフラ】← 14_IMPLEMENTATION_ORDER.md Layer 0
□ docker-compose.yml が存在し、DB/Redis が起動できるか？
□ .env.example が存在するか？
□ pnpm dev でローカル開発サーバーが起動するか？
□ CI がグリーンか（lint + type-check + test が通るか）？
→ いずれかが NO: 「開発環境が未セットアップです。Layer 0 を先に構築してください」

【Gate B: タスク分解・計画】← 14_IMPLEMENTATION_ORDER.md Part 1-3
□ 全 SSOT の §1 + §11 を分析し、Wave 分類が完了しているか？
□ GitHub Projects ボードが作成されているか？
□ この機能の親 Issue + Tasklist が作成されているか？
□ feature/[機能ID]-[レイヤー] ブランチが作成されているか？
  （main 直接コミットは禁止）
→ いずれかが NO: 「タスク分解が未実施です。framework plan を先に実行してください」

【Gate C: SSOT 完全性】← 12_SSOT_FORMAT.md
□ SSOT ファイルが存在するか？
□ CORE 層が確定しているか？
□ CONTRACT 層が確定しているか（Freeze 2 以上）？
□ §3-E 入出力例が 5 ケース以上あるか？
□ §3-F 境界値が全データ項目で定義されているか？
□ §3-G 例外応答が全エラーケースで定義されているか？
□ §3-H Gherkin テストが全 MUST 要件に対応しているか？
□ SSOT 冒頭の完全性チェックリストが全項目 ✅ か？
□ TECH_STACK.md が存在するか？
→ いずれかが NO: 「SSOT が不完全です。先に仕様を確定してください」

Gate A → B → C の順で確認し、全て ✅ の場合のみ TDD 判定へ進む。
```

## TDD 判定

```
以下のいずれかに該当する場合、テストファーストで実装:

  ✅ プロジェクトタイプが api または cli
  ✅ SSOT 層が CORE または CONTRACT
  ✅ ビジネスロジック（計算・判定・変換）

  フロー: SSOT → テスト作成 → 実装 → コード監査

上記に該当しない場合:
  フロー: SSOT → 実装 → コード監査 → テスト
```

## 実装手順

### Step 1: SSOT 読み込み

```
対象の SSOT を読み込み、以下をリスト化:
- MUST 要件（必ず実装）
- SHOULD 要件（原則実装）
- MAY 要件（今回は見送り可）
```

### Step 2: 実装計画の提示

```
「[機能ID] の実装計画です:

 1. [ファイル名] — [役割の説明]
 2. [ファイル名] — [役割の説明]
 3. ...

 MUST 要件: X 件
 テスト先行: [はい/いいえ]

 この計画で進めてよいですか？」
```

### Step 3: 実装

```
feature/[機能ID]-[レイヤー] ブランチ上で、計画に基づいてコードを生成。

実装順序（14_IMPLEMENTATION_ORDER.md Part 2 準拠）:
  1. DB（マイグレーション、シード、インデックス）← §4
  2. API（エンドポイント、バリデーション、エラーハンドリング）← §5, §7, §9
  3. UI（画面、状態管理、フロー）← §6
  4. 結合（API + UI 接続）← §5 + §6

コミット規約（Conventional Commits）:
  feat(AUTH-001): ログイン API 実装
  fix(AUTH-001): バリデーションエラー修正

実装中に仕様が不明な場合:
  CORE/CONTRACT 層 → 停止して質問
  DETAIL 層 → デフォルトで実装 + Decision Backlog に記録

  Decision Backlog 記録形式:
  「[機能ID] DETAIL: [項目] — デフォルト値 [値] で実装。要確認。」

❌ main ブランチに直接コミットしてはならない
```

### Step 4: セルフチェック

```
実装完了後、以下をセルフチェック:
□ 全 MUST 要件が実装されているか？
□ エラーハンドリングが SSOT 通りか？
□ 入力バリデーションが実装されているか？
□ 認証・認可が必要な箇所に設定されているか？
□ テストが存在するか？
```

### Step 5: PR 作成・レビュー依頼

```
「[機能ID] の実装が完了しました。

 ブランチ: feature/[機能ID]-[レイヤー]
 ファイル:
 - [ファイルリスト]

 Decision Backlog:
 - [デフォルト判断のリスト（あれば）]

 セルフチェック: 全項目 OK

 次のアクション:
 1. PR を作成（ベース: main）
 2. 'framework-code-audit' Skill で Adversarial Review を実施
 3. レビュー通過後、main にマージ
 4. GitHub Projects Issue を 'Done' に移動」
```

## このSkillがやらないこと

- SSOT の生成・修正
- コードレビュー（それは framework-code-audit Skill — Role B）
- SSOT にない機能の追加
- DETAIL 層の仕様不明で停止すること（デフォルトで進む）
