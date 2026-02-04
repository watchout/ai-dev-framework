# 新規プロジェクト ガイド

> ゼロからプロダクトを作る場合の詳細手順。

---

## 全体フロー

```
Step 1: 初期化          framework init --type=app
Step 2: 知識データ準備    docs/knowledge/ に事前情報を配置（任意）
Step 3: ディスカバリー    framework discover
Step 4: 事業設計         framework generate business
Step 5: プロダクト設計    framework generate product
Step 6: 技術設計         framework generate technical
Step 7: 実装計画         framework plan
Step 8: 開発＆監査       framework run --auto && framework audit all
```

---

## Step 1: プロジェクト初期化

```bash
framework init my-project --type=app
cd my-project
```

### プロジェクトタイプの選択

| やりたいこと | タイプ | コマンド |
|------------|--------|---------|
| SaaS、業務システム | `app` | `framework init my-app` |
| β募集LP、キャンペーンLP | `lp` | `framework init my-lp --type=lp` |
| 会社紹介サイト | `hp` | `framework init my-hp --type=hp` |
| REST API、マイクロサービス | `api` | `framework init my-api --type=api` |
| 開発者向けCLI | `cli` | `framework init my-cli --type=cli` |

### 生成されるもの

```
my-project/
├── CLAUDE.md                 ← Claude Code 指示書
├── docs/
│   ├── idea/                 ← Step 3-4 で生成
│   ├── requirements/         ← Step 5 で生成
│   ├── design/               ← Step 5-6 で生成
│   ├── standards/            ← フレームワーク規約
│   ├── knowledge/            ← 知識データ（任意）
│   ├── notes/                ← 意思決定ログ
│   ├── ssot/                 ← Decision Backlog
│   └── ...
├── src/                      ← Step 8 で実装
└── tests/                    ← Step 8 で生成
```

---

## Step 2: 知識データ準備（任意）

Discovery の前に、既に持っている情報を `docs/knowledge/` に配置すると、ヒアリングの質が上がります。

```bash
# 例: 競合情報を事前に記入
# docs/knowledge/market/competitors.md を編集

# 例: ユーザーインタビュー結果を配置
# docs/knowledge/users/interviews.md を編集
```

知識データがなくても Discovery は実行できます。スキップ可能です。

---

## Step 3: ディスカバリー

```bash
framework discover
```

AIが対話形式で質問します。

### 実行されるStage

| Stage | テーマ | 質問例 |
|-------|--------|--------|
| 0 | 知識データ確認 | （自動。docs/knowledge/ を読み込む） |
| 1 | アイデアの核 | 「どんなサービスを作りたいですか？」 |
| 2 | ターゲット | 「誰のどんな課題を解決しますか？」 |
| 3 | 価値提案 | 「既存の解決策と何が違いますか？」 |
| 4 | 機能 | 「絶対に必要な機能は何ですか？」 |
| 5 | ビジネス | 「どうやって収益化しますか？」 |

タイプによって実行Stageが変わります:
- `app`: Stage 1-5（全Stage）
- `lp` / `api` / `cli`: Stage 1-3
- `hp`: Stage 1-2

### 完了時に生成されるもの

| 資料 | 完成度 |
|------|--------|
| IDEA_CANVAS.md | 80% |
| USER_PERSONA.md | 50% |
| COMPETITOR_ANALYSIS.md | 30% |
| VALUE_PROPOSITION.md | 50% |
| SSOT-0_PRD.md | 30% |
| PROJECT_PLAN.md | 20% |

---

## Step 4: 事業設計

```bash
framework generate business
```

Discovery の結果から事業設計ドキュメントを生成します。

```
生成順序:
  IDEA_CANVAS（90%に向上）
    → USER_PERSONA（80%に向上）
    → COMPETITOR_ANALYSIS（70%に向上）
    → VALUE_PROPOSITION（80%に向上）

各ドキュメント生成後にユーザー確認があります。
修正指示があれば反映して次へ進みます。
```

---

## Step 5: プロダクト設計

```bash
framework generate product
```

### Freeze 1: Domain（用語・スコープ確定）

この段階で以下が確定します:
- 機能の目的とスコープ
- ユーザーストーリー
- 用語定義
- 権限モデル

### Freeze 2: Contract（API・UI契約確定）

この段階で以下が確定します:
- PRD（プロダクト要件）
- FEATURE_CATALOG（機能カタログ）
- UI_STATE（画面・状態遷移）
- 各機能のSSOT（CORE層 + CONTRACT層）

```
生成順序:
  PRD
    → FEATURE_CATALOG
    → UI_STATE
    → 各機能SSOT（Freeze 2 まで）

Freeze 2 完了で実装を開始できます。
Freeze 3-4 は実装と並行で進められます。
```

---

## Step 6: 技術設計

```bash
framework generate technical
```

```
生成順序:
  TECH_STACK（技術選定）
    → API_CONTRACT（API共通ルール）
    → DATA_MODEL（DB設計）
    → CROSS_CUTTING（認証・エラー・ログ）
    → 開発規約（コーディング・Git・テスト）
    → プロジェクトスキャフォールド
```

---

## Step 7: 実装計画

```bash
framework plan
```

全SSOTの依存関係を分析し、実装順序を決定します。

```
出力:
  docs/management/IMPLEMENTATION_PLAN.md

内容:
  - 縦スライスの定義（ユーザー価値単位）
  - Wave分類（依存関係順）
  - 各タスクの見積もり
  - 実装順序の推奨
```

---

## Step 8: 開発＆監査

```bash
# 自動実行（全タスクを順番に）
framework run --auto

# または1タスクずつ
framework run FEAT-001
framework audit code
framework run FEAT-002
framework audit code
# ...

# 全体監査
framework audit all

# 進捗確認
framework status
```

### 開発中のサイクル

```
1. framework run FEAT-XXX     ← タスク実行
2. → SSOT読み込み → 実装 → コード監査 → テスト生成
3. framework audit code        ← 品質確認
4. → 問題があれば修正
5. framework status            ← 進捗確認
6. → 次のタスクへ
```

---

## プロジェクトタイプ別の違い

### lp（ランディングページ）

```
Step 1: framework init my-lp --type=lp
Step 3: framework discover          ← Stage 1-3 のみ
Step 4: framework generate business  ← VALUE_PROPOSITION 重視
    → LP_SPEC.md + SNS_STRATEGY.md も生成
Step 5: framework generate product   ← UI_STATE のみ（API/DB不要）
Step 6: スキップ（技術設計は最小限）
Step 8: framework audit code && framework audit visual
```

### api（API/バックエンド）

```
Step 1: framework init my-api --type=api
Step 5: framework generate product   ← UI_STATE はスキップ
Step 6: framework generate technical ← API_CONTRACT + DATA_MODEL 集中
Step 8: framework audit code && framework audit test
    ← visual 監査はスキップ
```

### cli（CLIツール）

```
Step 1: framework init my-cli --type=cli
Step 5: framework generate product
    ← API_CONTRACT をCLIコマンド定義に読み替え
    ← UI_STATE, DATA_MODEL はスキップ
Step 8: framework audit code && framework audit test
```
