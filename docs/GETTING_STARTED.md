# Getting Started

> AI開発フレームワークを使い始めるためのガイド。

---

## 前提条件

| 項目 | 要件 |
|------|------|
| Node.js | 18 以上 |
| npm | 9 以上 |
| Git | 2.30 以上 |
| Claude Code | 最新版（`npm install -g @anthropic-ai/claude-code`）|

### 推奨環境

- **OS**: macOS / Linux / WSL2
- **エディタ**: 不要（Claude Code がエディタを兼ねる）
- **ターミナル**: iTerm2 / Warp / Windows Terminal

---

## インストール

```bash
# 1. CLIツールをインストール
git clone https://github.com/watchout/ai-dev-framework.git
cd ai-dev-framework
npm install
npm link

# 2. インストール確認
shirube --version
```

---

## 新規プロジェクト vs 既存プロジェクト

```
あなたのプロジェクトは？
│
├─ ゼロから作る（コードも資料もない）
│   → 新規プロジェクト
│   → shirube init → shirube start → discover → generate → plan → run
│   → 詳細: GUIDE_NEW_PROJECT.md
│
├─ 資料はあるがコードはない（README、ペルソナ等）
│   → Cursor ベース導入
│   → 既存資料 → SSOT 変換 → 開発開始
│   → 詳細: GUIDE_CURSOR_INTRODUCTION.md
│
└─ 既にコードがある
    → 既存プロジェクト
    → shirube retrofit → shirube start
    → 詳細: GUIDE_EXISTING_PROJECT.md
```

---

## 新規プロジェクト（最短ルート）

```bash
# Step 1: プロジェクト初期化
shirube init my-project --type=app
cd my-project

# Step 2: フレームワーク主導開発を開始
shirube start . --feature FEAT-001 --audit-level standard
# → .framework/current-session.json が作成される
# → ここから「フレームワーク主導」として扱う

# Step 3: ディスカバリー（ヒアリング）
shirube discover
# → AIが対話形式で質問し、アイデアを構造化

# Step 4: SSOT生成（仕様書一式）
shirube generate business    # 事業設計
shirube generate product     # プロダクト設計
shirube generate technical   # 技術設計

# Step 5: 実装計画
shirube plan

# Step 6: 開発
shirube run --auto           # 自動実行
# or
shirube run FEAT-001         # 1タスクずつ

# Step 7: 品質監査
shirube audit all

# Step 8: 進捗確認
shirube status
```

---

## 既存プロジェクト（最短ルート）

```bash
# Step 1: 既存プロジェクトに移動
cd /path/to/existing-project

# Step 2: フレームワーク導入
shirube retrofit
# → 既存コードをスキャン
# → ギャップ分析レポート
# → SSOT逆生成（ユーザー確認あり）

# Step 3: フレームワーク主導開発を開始
shirube start . --feature FEAT-001 --audit-level standard
# → retrofit は導入、start は開発開始

# Step 4: 以降は新規と同じ
shirube plan
shirube run --auto
shirube audit all
```

---

## プロジェクトタイプ

初期化時に `--type` でプロジェクトの種類を指定できます。

| タイプ | 用途 | コマンド |
|--------|------|---------|
| `app` | フルスタックWebアプリ（デフォルト） | `shirube init my-app` |
| `lp` | ランディングページ | `shirube init my-lp --type=lp` |
| `hp` | ホームページ | `shirube init my-hp --type=hp` |
| `api` | API/バックエンド | `shirube init my-api --type=api` |
| `cli` | CLIツール | `shirube init my-cli --type=cli` |

タイプによって生成されるSSOT・実行される監査・Discoveryの範囲が変わります。
詳細: 00_MASTER_GUIDE.md「プロジェクトタイプ別プロファイル」

---

## 各コマンドの概要

### shirube init
プロジェクトのディレクトリ構造と初期ファイルを生成します。

### shirube start
フレームワーク主導開発の開始境界を作ります。
`.framework/current-session.json` を作成し、対象 feature、品質モード、次に実行すべき phase を明示します。

`init` / `retrofit` / `update` は「適用・更新」であり、開発開始ではありません。
`shirube start` 実行後から、`/design`、`/implement`、`/gate-design`、`/gate-quality`、`/review` の phase authority に従って進めます。

既に `.framework/current-session.json` がある場合、`shirube start` は勝手に上書きしません。
既存セッションを続ける場合は `shirube start --resume`、新しい feature として切り直す場合は `shirube start --force --feature <id>` を使います。
`shirube exit` で framework mode を抜けた後も、適用済みプロジェクトであれば `shirube start --resume` で再開・再アクティベートできます。

`framework-managed` repository topic は discoverability と hook activation の補助 marker です。
framework-led development の正本は `.framework/current-session.json` と `.framework/config.json` であり、topic ではありません。
GitHub 権限不足などで topic 追加に失敗しても、local/draft/design workflow の `shirube start` は構造化 warning (`repo_topic_activation_unavailable`) を記録して続行します。
topic を開始条件として厳格に要求する場合だけ、`shirube start --require-repo-topic` または `.framework/config.json` の `workflow.requireRepoTopic: true` を使います。

Shirube の基本条件はフルオーケストラ運用です。
デフォルトでは `qualityMode: "multi-agent"` として、producer と gate/review を別エージェントまたは別ロールに分離します。

単一エージェント運用は、小変更、移行初期、dogfooding、外部エージェント未整備のリポジトリ向けの lightweight mode です。
使う場合は `--quality-mode single-agent` を明示します。
単一エージェントでも Producer phase は自己チェックまでで、PASS/BLOCK 判定は Gate / Review phase だけが行えます。
`--audit-level strict` では単一エージェント運用は使えません。

監査段数は `--audit-level` で選択します。

| auditLevel | 必須監査 | 用途 |
|------------|----------|------|
| `minimal` | L0 + L1 | 小変更、低リスク修正。単一エージェント可 |
| `standard` | L0 + L1 + L2 | 通常開発。デフォルト。フルオーケストラ推奨 |
| `strict` | L0 + L1 + L2 + L3 | framework変更、仕様変更、cross-cutting変更。フルオーケストラ必須 |

L0 は CI、自動テスト、breaking-change check。
L1 は lead review、L2 は独立 auditor review、L3 は technical governance owner / CTO review。
L4 は `route:ceo-approval` や戦略判断が必要な場合だけ追加します。

`strict` は世界公開しても恥ずかしくない MCP 品質の基準です。
そのため `strict` では `.framework/config.json` の `roles.bindings` に具体的な role binding が必要です。
role が未設定または placeholder のままなら `strict` は BLOCK し、`standard` / `minimal` では warning として表示して移行中・dogfooding 中の進行を許容します。
producer と gate/review/L3 authority が同一 target、または同一 actor label の場合、`standard` / `strict` は BLOCK します。
`architecture_owner` は設計担当、`l3_governance_owner` は技術責任者 / L3 最終監査として分離します。

### 実行コマンドの状態遷移

| コマンド | 使う条件 | 何をするか | 次の状態 |
|----------|----------|------------|----------|
| `shirube init <name>` | 新規プロジェクト作成時 | `.framework/`、docs、hooks、templates を作成し framework mode を有効化 | applied |
| `shirube retrofit [path] --generate` | 既存リポジトリを Shirube 管理に入れる時 | 既存構造を分析し、不足 docs/hooks/templates を導入して framework mode を有効化 | applied |
| `shirube update [path]` | 適用済みリポジトリを最新 Shirube に追従させる時 | docs/templates/hooks/GitHub templates/gates cache を更新 | applied |
| `shirube roles doctor` | init/retrofit 後、start 前 | role binding の未設定/placeholder を診断 | role readiness checked |
| `shirube roles set <role> --type <type> --id <id>` | strict 開始前、または担当変更時 | `.framework/config.json` の role binding を更新 | roles configured |
| `shirube start [path] --feature <id>` | applied だが active session がない時 | `.framework/current-session.json` を作成し framework-led development を開始、framework mode 有効化を試行 | framework-led |
| `shirube start [path] --resume` | active session があり、継続または exit 後に戻る時 | 既存 session を読み、framework mode 再有効化を試行 | framework-led |
| `shirube start [path] --force --feature <id>` | 既存 session を破棄して新しい feature で切り直す時 | `.framework/current-session.json` を明示的に置き換える | framework-led |
| `shirube gate check` | 実装前、または update 後 | Gate A/B/C を評価し `.framework/gates.json` を hook cache として再生成 | gate status refreshed |
| `shirube trace verify` | 4-layer docs の整合性確認時 | SPEC/IMPL/VERIFY/OPS の trace を検証 | trace checked |
| `shirube exit --reason <reason>` | CEO 承認で一時的に Shirube 管理を抜ける時 | `framework-managed` topic を外し、監査ログへ記録。session file は残す | exited |

`framework` は後方互換 alias です。新しいドキュメント、公開例、MCP 利用ガイドでは `shirube` を primary command とします。

### shirube discover
対話形式でヒアリングを行い、アイデアを構造化します。
docs/knowledge/ に知識データがある場合は事前に読み込みます。

### shirube generate
ヒアリング結果からSSOT（仕様書）を段階的に生成します。
- `business`: IDEA_CANVAS → PERSONA → COMPETITOR → VALUE_PROPOSITION
- `product`: PRD → FEATURE_CATALOG → UI_STATE → 機能仕様書
- `technical`: TECH_STACK → API → DB → CROSS_CUTTING

### shirube plan
全SSOTの依存関係を分析し、実装順序（縦スライス × Wave）を決定します。

### shirube audit
品質監査を実行します。
- `ssot`: SSOT監査（95点合格）
- `code`: コード監査（100点合格）
- `test`: テスト監査（100点合格）
- `visual`: ビジュアル監査（100点合格）
- `all`: プロジェクトタイプに応じた全監査

### shirube run
タスクを実行します。SSOTを読み込み、実装 → コード監査 → テストを自動実行。

### shirube status
プロジェクトの進捗をビジュアル表示します。

### shirube retrofit
既存プロジェクトをフレームワーク管理下に移行します。

### shirube update
フレームワーク自体を最新版に更新します。

`.framework/config.json` は operator-owned config として扱います。`shirube update` は concrete な `roles.bindings`、`workflow`、その他の手動設定を上書きせず、追加された required role が存在しない場合だけ placeholder を補完します。補完された placeholder は `shirube roles set ...` で concrete binding に置き換えてください。

---

## トラブルシューティング

### `shirube: command not found`

```bash
# npm link が正しく実行されているか確認
npm link
# or グローバルインストール
npm install -g @watchout/shirube
```

### Discovery が途中で止まった

```bash
# 中断したディスカバリーを再開
shirube discover --resume
```

### SSOT監査で不合格になる

```
よくある原因:
1. TBD項目が残っている（CORE/CONTRACT層）
   → Decision Backlog に記録済みか確認
   → DETAIL層のTBDは許容される

2. 入出力例が不足（§3-E）
   → 最低5ケース必要（正常系2 + 異常系3）

3. 受け入れテストがない（§3-H）
   → Gherkin形式で記述が必要

対処:
  shirube audit ssot --detail  # 詳細を確認
  shirube audit ssot --fix     # 自動修正（対応可能な項目のみ）
```

### 既存プロジェクトで retrofit が失敗する

```
よくある原因:
1. Git管理されていない
   → git init してからretrofitを実行

2. ファイルが多すぎてスキャンに時間がかかる
   → .frameworkignore を作成して除外パターンを指定

対処:
  shirube retrofit --scan-only  # スキャンのみ実行して状況確認
```

---

## 次のステップ

- 新規プロジェクトの詳細手順 → [GUIDE_NEW_PROJECT.md](GUIDE_NEW_PROJECT.md)
- 資料ありの導入（Cursor ベース） → [GUIDE_CURSOR_INTRODUCTION.md](GUIDE_CURSOR_INTRODUCTION.md)
- 既存プロジェクトの詳細手順 → [GUIDE_EXISTING_PROJECT.md](GUIDE_EXISTING_PROJECT.md)
- フレームワーク全体の概要 → [FRAMEWORK_SUMMARY.md](FRAMEWORK_SUMMARY.md)
- フレームワークの設計思想 → 00_MASTER_GUIDE.md
