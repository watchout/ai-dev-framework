# 09_TOOLCHAIN.md - 開発ツールチェーン定義

> Claude Code と Cursor の両方で仕様書を活用し、最短で開発に入るための定義

---

## 1. 基本思想

```
docs/（仕様書群） = Single Source of Truth
    ↑                    ↑
 CLAUDE.md           .cursorrules
 (Claude Code)       (Cursor)

原則:
・仕様書は docs/ に1箇所で管理
・どちらのツールも同じ仕様書を参照する
・開発ルールは共通、ツール固有の指示だけ分ける
```

---

## 2. プロジェクトディレクトリ構造

```
my-project/
├── CLAUDE.md                 ← Claude Code 用指示書
├── .cursorrules              ← Cursor 用指示書
│
├── docs/                     ← 仕様書一式（SSOT）
│   ├── idea/                 ← Phase -1: アイデア検証
│   │   ├── IDEA_CANVAS.md
│   │   ├── USER_PERSONA.md
│   │   ├── COMPETITOR_ANALYSIS.md
│   │   └── VALUE_PROPOSITION.md
│   │
│   ├── requirements/         ← Phase 0: 要件定義
│   │   ├── SSOT-0_PRD.md
│   │   └── SSOT-1_FEATURE_CATALOG.md
│   │
│   ├── design/               ← Phase 1: 設計
│   │   ├── core/
│   │   │   ├── SSOT-2_UI_STATE.md
│   │   │   ├── SSOT-3_API_CONTRACT.md
│   │   │   ├── SSOT-4_DATA_MODEL.md
│   │   │   └── SSOT-5_CROSS_CUTTING.md
│   │   ├── features/
│   │   │   ├── common/       ← 共通機能仕様
│   │   │   └── project/      ← 固有機能仕様
│   │   └── adr/              ← 設計判断記録
│   │
│   ├── standards/            ← 開発規約
│   │   ├── TECH_STACK.md
│   │   ├── CODING_STANDARDS.md
│   │   ├── GIT_WORKFLOW.md
│   │   └── TESTING_STANDARDS.md
│   │
│   ├── operations/           ← 運用
│   │   ├── ENVIRONMENTS.md
│   │   ├── DEPLOYMENT.md
│   │   ├── MONITORING.md
│   │   └── INCIDENT_RESPONSE.md
│   │
│   ├── marketing/            ← マーケティング
│   │   ├── LP_SPEC.md
│   │   ├── SNS_STRATEGY.md
│   │   ├── EMAIL_SEQUENCE.md
│   │   ├── LAUNCH_PLAN.md
│   │   └── PRICING_STRATEGY.md
│   │
│   ├── growth/               ← グロース
│   │   ├── GROWTH_STRATEGY.md
│   │   └── METRICS_DEFINITION.md
│   │
│   └── management/           ← プロジェクト管理
│       ├── PROJECT_PLAN.md
│       ├── RISKS.md
│       └── CHANGES.md
│
├── src/                      ← ソースコード
├── tests/                    ← テスト
├── public/                   ← 静的ファイル
└── ...
```

---

## 3. ツール別の役割

| 場面 | Claude.ai | Claude Code | Cursor |
|------|-----------|-------------|--------|
| アイデア壁打ち | ◎ メイン | | |
| ディスカバリーフロー | ◎ メイン | | |
| 仕様書の対話的作成 | ◎ メイン | | |
| 仕様書のファイル生成 | | ◎ メイン | |
| プロジェクト初期構築 | | ◎ メイン | |
| 日常のコーディング | | | ◎ メイン |
| デバッグ | | ○ | ◎ メイン |
| 一括リファクタリング | | ◎ メイン | |
| テスト生成 | | ◎ メイン | ○ |
| CI/CD設定 | | ◎ メイン | |
| 設計の相談 | ◎ メイン | ○ | |
| コードレビュー | | ◎ メイン | ○ |
| LP実装 | | | ◎ メイン |

---

## 4. 開発に入るまでの手順

### 4.1 全体フロー

```
Step 1: アイデア整理         [Claude.ai]
  「○○を作りたい」→ ディスカバリーフロー
        │
        ▼
Step 2: 仕様書一式を生成     [Claude Code]
  claude "docs/idea/ の資料をもとに
         docs/requirements/ と docs/design/ を生成して"
        │
        ▼
Step 3: プロジェクト初期構築  [Claude Code]
  claude "docs/standards/TECH_STACK.md に基づいて
         プロジェクトをスキャフォールドして"
        │
        ▼
Step 4: 日常の開発           [Cursor]
  Cursorでプロジェクトを開く
  → .cursorrules が自動的に読み込まれる
  → 仕様書に基づいてコーディング
        │
        ▼
Step 5: 大きな変更・一括処理  [Claude Code]
  claude "AUTH-001の仕様書に基づいてログイン機能を実装して"
  claude "全APIにエラーハンドリングを追加して"
```

### 4.2 Step 1: アイデア整理（Claude.ai）

**Claude.ai に送るメッセージ**:
```
新しいプロダクトのアイデアがあります。
○○のようなサービスを作りたいと思っています。

まずはアイデアを整理するところから始めたいです。
段階的に質問してください。
```

→ AIがディスカバリーフロー（Stage 1〜5）を実行
→ 全体サマリーが完成
→ Claude.ai がMarkdown形式で初期資料を出力

### 4.3 Step 2: 仕様書をプロジェクトに配置（Claude Code）

**方法A: Claude.ai の出力をClaude Codeで配置**
```bash
# プロジェクトディレクトリを作成
mkdir -p my-project/docs/{idea,requirements,design,standards,marketing}

# Claude Code で仕様書を生成・配置
cd my-project
claude "以下のアイデアキャンバスの内容をもとに、
       docs/ 配下に仕様書一式を生成してください。
       
       [Claude.ai で作成した内容をペースト]"
```

**方法B: フレームワークテンプレートから一括生成**
```bash
# テンプレートをコピー
cp -r ai-dev-framework-v3/templates/* docs/

# Claude Code で内容を埋める
claude "docs/idea/IDEA_CANVAS.md に以下の内容を反映して:
       [アイデアの内容]"
```

### 4.4 Step 3: プロジェクト初期構築（Claude Code）

```bash
# CLAUDE.md と .cursorrules を配置
claude "docs/standards/TECH_STACK.md を読んで、
       以下を実行して:
       1. Next.js + Supabase のプロジェクトを初期化
       2. CLAUDE.md を生成
       3. .cursorrules を生成
       4. 基本的なディレクトリ構造を作成"
```

### 4.5 Step 4: 日常の開発（Cursor）

```
1. Cursor で my-project/ を開く
2. .cursorrules が自動読み込みされる
3. 以下のようにAIに指示:

   「docs/design/features/common/AUTH-001_login.md の
    仕様に基づいてログイン機能を実装して」

   「docs/core/SSOT-3_API_CONTRACT.md のルールに従って
    APIエンドポイントを作成して」

4. Cursor AI が仕様書を読み、仕様通りに実装する
```

### 4.6 Step 5: 大きな変更（Claude Code）

```bash
# 機能丸ごと実装
claude "docs/design/features/common/AUTH-001_login.md を読んで
       ログイン機能をフル実装して。
       API、UI、テスト全部。"

# 一括リファクタリング
claude "全ファイルのエラーハンドリングを
       docs/core/SSOT-5_CROSS_CUTTING.md に準拠させて"

# テスト一括生成
claude "docs/standards/TESTING_STANDARDS.md に基づいて
       src/ 以下の全コンポーネントのテストを生成して"
```

---

## 5. 使い分けの判断フロー

```
あなたが今やりたいことは？
│
├─ アイデアを整理したい / 戦略を考えたい
│   → Claude.ai
│
├─ ファイルを一括で作りたい / 大きな変更をしたい
│   → Claude Code
│   例: プロジェクト初期構築、機能丸ごと実装、リファクタ
│
├─ コードを書きたい / デバッグしたい / 細かい修正
│   → Cursor
│   例: UI調整、バグ修正、機能の微調整
│
├─ 仕様書を書きたい / 更新したい
│   ├─ 内容を考える段階 → Claude.ai
│   └─ ファイルに反映する → Claude Code or Cursor
│
└─ 詰まった / 方針に迷った
    → Claude.ai（壁打ち）
```

---

## 6. フェーズ別の具体的な使い方

### Phase -1〜0: アイデア→仕様

```
[Claude.ai]
  ↓ ディスカバリーフロー実行
  ↓ 仕様の壁打ち・詳細化
  ↓ Markdown出力

[Claude Code]
  ↓ mkdir -p / ファイル配置
  ↓ 仕様書一式の生成
  ↓ CLAUDE.md / .cursorrules の生成
```

### Phase 0.5: LP / マーケ

```
[Claude.ai]
  ↓ LP構成・コピーの策定
  ↓ SNS戦略の策定

[Cursor]
  ↓ LP実装（Next.js + Tailwind）
  ↓ フォーム実装

[Claude Code]
  ↓ メール配信設定（任意）
  ↓ Analytics設定
```

### Phase 1〜4: 設計・実装

```
[Claude Code] 初回
  ↓ スキャフォールド
  ↓ DB マイグレーション
  ↓ 認証基盤の実装

[Cursor] 日常
  ↓ 機能実装
  ↓ UI構築
  ↓ デバッグ

[Claude Code] 必要に応じて
  ↓ テスト一括生成
  ↓ リファクタリング
  ↓ 新機能の骨組み生成

[Claude.ai] 必要に応じて
  ↓ 設計の相談
  ↓ 仕様の追加・変更
```

### Phase 5: リリース

```
[Claude Code]
  ↓ CI/CD構築
  ↓ 環境変数設定
  ↓ デプロイスクリプト

[Cursor]
  ↓ 最終修正
  ↓ パフォーマンス調整

[Claude.ai]
  ↓ ローンチ戦略の確認
  ↓ コピーの最終チェック
```

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
