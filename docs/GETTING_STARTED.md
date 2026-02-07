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
git clone https://github.com/watchout/ai-dev-platform.git
cd ai-dev-platform
npm install
npm link

# 2. インストール確認
framework --version
```

---

## 新規プロジェクト vs 既存プロジェクト

```
あなたのプロジェクトは？
│
├─ ゼロから作る（コードも資料もない）
│   → 新規プロジェクト
│   → framework init → discover → generate → plan → run
│   → 詳細: GUIDE_NEW_PROJECT.md
│
├─ 資料はあるがコードはない（README、ペルソナ等）
│   → Cursor ベース導入
│   → 既存資料 → SSOT 変換 → 開発開始
│   → 詳細: GUIDE_CURSOR_INTRODUCTION.md
│
└─ 既にコードがある
    → 既存プロジェクト
    → framework retrofit
    → 詳細: GUIDE_EXISTING_PROJECT.md
```

---

## 新規プロジェクト（最短ルート）

```bash
# Step 1: プロジェクト初期化
framework init my-project --type=app
cd my-project

# Step 2: ディスカバリー（ヒアリング）
framework discover
# → AIが対話形式で質問し、アイデアを構造化

# Step 3: SSOT生成（仕様書一式）
framework generate business    # 事業設計
framework generate product     # プロダクト設計
framework generate technical   # 技術設計

# Step 4: 実装計画
framework plan

# Step 5: 開発
framework run --auto           # 自動実行
# or
framework run FEAT-001         # 1タスクずつ

# Step 6: 品質監査
framework audit all

# Step 7: 進捗確認
framework status
```

---

## 既存プロジェクト（最短ルート）

```bash
# Step 1: 既存プロジェクトに移動
cd /path/to/existing-project

# Step 2: フレームワーク導入
framework retrofit
# → 既存コードをスキャン
# → ギャップ分析レポート
# → SSOT逆生成（ユーザー確認あり）

# Step 3: 以降は新規と同じ
framework plan
framework run --auto
framework audit all
```

---

## プロジェクトタイプ

初期化時に `--type` でプロジェクトの種類を指定できます。

| タイプ | 用途 | コマンド |
|--------|------|---------|
| `app` | フルスタックWebアプリ（デフォルト） | `framework init my-app` |
| `lp` | ランディングページ | `framework init my-lp --type=lp` |
| `hp` | ホームページ | `framework init my-hp --type=hp` |
| `api` | API/バックエンド | `framework init my-api --type=api` |
| `cli` | CLIツール | `framework init my-cli --type=cli` |

タイプによって生成されるSSOT・実行される監査・Discoveryの範囲が変わります。
詳細: 00_MASTER_GUIDE.md「プロジェクトタイプ別プロファイル」

---

## 各コマンドの概要

### framework init
プロジェクトのディレクトリ構造と初期ファイルを生成します。

### framework discover
対話形式でヒアリングを行い、アイデアを構造化します。
docs/knowledge/ に知識データがある場合は事前に読み込みます。

### framework generate
ヒアリング結果からSSOT（仕様書）を段階的に生成します。
- `business`: IDEA_CANVAS → PERSONA → COMPETITOR → VALUE_PROPOSITION
- `product`: PRD → FEATURE_CATALOG → UI_STATE → 機能仕様書
- `technical`: TECH_STACK → API → DB → CROSS_CUTTING

### framework plan
全SSOTの依存関係を分析し、実装順序（縦スライス × Wave）を決定します。

### framework audit
品質監査を実行します。
- `ssot`: SSOT監査（95点合格）
- `code`: コード監査（100点合格）
- `test`: テスト監査（100点合格）
- `visual`: ビジュアル監査（100点合格）
- `all`: プロジェクトタイプに応じた全監査

### framework run
タスクを実行します。SSOTを読み込み、実装 → コード監査 → テストを自動実行。

### framework status
プロジェクトの進捗をビジュアル表示します。

### framework retrofit
既存プロジェクトをフレームワーク管理下に移行します。

### framework update
フレームワーク自体を最新版に更新します。

---

## トラブルシューティング

### `framework: command not found`

```bash
# npm link が正しく実行されているか確認
npm link
# or グローバルインストール
npm install -g @watchout/framework
```

### Discovery が途中で止まった

```bash
# 中断したディスカバリーを再開
framework discover --resume
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
  framework audit ssot --detail  # 詳細を確認
  framework audit ssot --fix     # 自動修正（対応可能な項目のみ）
```

### 既存プロジェクトで retrofit が失敗する

```
よくある原因:
1. Git管理されていない
   → git init してからretrofitを実行

2. ファイルが多すぎてスキャンに時間がかかる
   → .frameworkignore を作成して除外パターンを指定

対処:
  framework retrofit --scan-only  # スキャンのみ実行して状況確認
```

---

## 次のステップ

- 新規プロジェクトの詳細手順 → [GUIDE_NEW_PROJECT.md](GUIDE_NEW_PROJECT.md)
- 資料ありの導入（Cursor ベース） → [GUIDE_CURSOR_INTRODUCTION.md](GUIDE_CURSOR_INTRODUCTION.md)
- 既存プロジェクトの詳細手順 → [GUIDE_EXISTING_PROJECT.md](GUIDE_EXISTING_PROJECT.md)
- フレームワーク全体の概要 → [FRAMEWORK_SUMMARY.md](FRAMEWORK_SUMMARY.md)
- フレームワークの設計思想 → 00_MASTER_GUIDE.md
