# 09_TOOLCHAIN.md - 開発ツールチェーン定義

> Claude.ai と Claude Code の2ツール体制で、仕様書を活用し最短で開発に入るための定義

---

## 1. 基本思想

```
docs/（仕様書群） = Single Source of Truth
         ↑
      CLAUDE.md
     (Claude Code)

原則:
・仕様書は docs/ に1箇所で管理
・Claude Code が CLAUDE.md を通じて仕様書を参照する
・コーディングも Claude Code で完結する（エディタ不要）
```

### ツール体制: Claude.ai + Claude Code の2本柱

```
Before（3ツール体制）:
  Claude.ai / Claude Code / Cursor
  → ツール間のコンテキスト分断が課題

After（2ツール体制）:
  Claude.ai（思考・設計）/ Claude Code（実装・実行）
  → Claude Code がコーディングからCI/CDまで一貫して担当
  → Cursor は不要（Claude Code で代替可能）
```

---

## 2. プロジェクトディレクトリ構造

```
my-project/
├── CLAUDE.md                 ← Claude Code 用指示書
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
│   ├── notes/                ← 意思決定ログ（AIの長期記憶）
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

| 場面 | Claude.ai | Claude Code |
|------|-----------|-------------|
| アイデア壁打ち | **メイン** | |
| ディスカバリーフロー | **メイン** | |
| 仕様書の対話的作成 | **メイン** | |
| 仕様書のファイル生成 | | **メイン** |
| プロジェクト初期構築 | | **メイン** |
| 日常のコーディング | | **メイン** |
| デバッグ | | **メイン** |
| 一括リファクタリング | | **メイン** |
| テスト生成 | | **メイン** |
| CI/CD設定 | | **メイン** |
| 設計の相談 | **メイン** | サブ |
| コードレビュー | | **メイン**（Adversarial Review） |
| LP実装 | | **メイン** |

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
Step 4: 開発                 [Claude Code]
  claude "AUTH-001の仕様書に基づいてログイン機能を実装して"
  → CLAUDE.md が自動的に読み込まれる
  → 仕様書に基づいてコーディング
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
mkdir -p my-project/docs/{idea,requirements,design,standards,marketing,notes}

# Claude Code で仕様書を生成・配置
cd my-project
claude "以下のアイデアキャンバスの内容をもとに、
       docs/ 配下に仕様書一式を生成してください。

       [Claude.ai で作成した内容をペースト]"
```

**方法B: フレームワークテンプレートから一括生成**
```bash
# テンプレートをコピー
cp -r ai-dev-framework/templates/* docs/

# Claude Code で内容を埋める
claude "docs/idea/IDEA_CANVAS.md に以下の内容を反映して:
       [アイデアの内容]"
```

### 4.4 Step 3: プロジェクト初期構築（Claude Code）

```bash
# CLAUDE.md を配置しプロジェクトを初期化
claude "docs/standards/TECH_STACK.md を読んで、
       以下を実行して:
       1. Next.js + Supabase のプロジェクトを初期化
       2. CLAUDE.md を生成
       3. 基本的なディレクトリ構造を作成"
```

### 4.5 Step 4: 開発（Claude Code）

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
├─ 仕様書の内容を考えたい / 壁打ちしたい
│   → Claude.ai
│
├─ コードを書きたい / デバッグしたい
│   → Claude Code
│   例: 機能実装、バグ修正、テスト、リファクタ
│
├─ ファイルを一括で作りたい / 大きな変更をしたい
│   → Claude Code
│   例: プロジェクト初期構築、機能丸ごと実装
│
├─ 仕様書をファイルに反映したい
│   → Claude Code
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
  ↓ CLAUDE.md の生成
```

### Phase 0.5: LP / マーケ

```
[Claude.ai]
  ↓ LP構成・コピーの策定
  ↓ SNS戦略の策定

[Claude Code]
  ↓ LP実装（Next.js + Tailwind）
  ↓ フォーム実装
  ↓ メール配信設定（任意）
  ↓ Analytics設定
```

### Phase 1〜4: 設計・実装

```
[Claude Code]
  ↓ スキャフォールド
  ↓ DB マイグレーション
  ↓ 認証基盤の実装
  ↓ 機能実装
  ↓ UI構築
  ↓ テスト一括生成
  ↓ リファクタリング
  ↓ デバッグ

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
  ↓ 最終修正
  ↓ パフォーマンス調整

[Claude.ai]
  ↓ ローンチ戦略の確認
  ↓ コピーの最終チェック
```

---

## 7. git worktree による並列開発

### 基本概念

```
1つのリポジトリで複数のworking treeを持つ。
各worktreeで独立したClaude Codeインスタンスを実行できる。

通常:
  my-project/（mainブランチ）
  └── Claude Code インスタンス1つ

worktree:
  my-project/                      ← mainブランチ
  my-project-wt/feature-auth/      ← feature/auth ブランチ
  my-project-wt/feature-dashboard/ ← feature/dashboard ブランチ

  各ディレクトリで独立した Claude Code を起動
  → 並列で別機能を開発できる
```

### セットアップ

```bash
# worktree用ディレクトリを作成
mkdir -p ~/worktrees/my-project

# worktreeを追加
cd my-project
git worktree add ~/worktrees/my-project/auth feature/auth
git worktree add ~/worktrees/my-project/dashboard feature/dashboard

# 各worktreeでClaude Codeを起動
cd ~/worktrees/my-project/auth && claude
cd ~/worktrees/my-project/dashboard && claude
```

### シェルエイリアス

```bash
# ~/.bashrc or ~/.zshrc に追加

# プロジェクト固有のworktreeエイリアス
# プロジェクトセットアップ時に生成する

# worktree作成
alias gwta='git worktree add'

# worktree一覧
alias gwtl='git worktree list'

# worktree削除
alias gwtr='git worktree remove'

# 短縮エイリアス（プロジェクトごとに設定）
# alias za='cd ~/worktrees/my-project/auth && claude'
# alias zb='cd ~/worktrees/my-project/dashboard && claude'
```

### 並列開発のルール

```
並列開発可能な条件:
  ✅ 異なる機能（異なるSSOT）を実装する場合
  ✅ 異なるファイルを変更する場合
  ✅ 依存関係がない機能同士

並列開発してはいけない条件:
  ❌ 同じファイルを変更する可能性がある場合
  ❌ 同じDBテーブルのマイグレーションを含む場合
  ❌ 依存関係がある機能同士（Wave が異なる場合）

マージ戦略:
  1. 各worktreeでブランチをPR
  2. CI通過を確認
  3. コンフリクトがあれば先にマージした方が優先
  4. 後からマージする方がコンフリクト解消
```

---

## 8. サブエージェント活用

### 基本概念

```
Claude Code の Task tool を活用し、
メインエージェントからサブエージェントにタスクを委譲する。

メインエージェント（オーケストレーター）
  │
  ├── サブエージェント A: テスト生成
  ├── サブエージェント B: コードレビュー（Adversarial Review）
  ├── サブエージェント C: ドキュメント検索
  └── サブエージェント D: 並列ファイル編集

メリット:
  - メインエージェントのコンテキストを節約
  - 専門的なロールを持つエージェントに委譲
  - 並列実行で速度向上
```

### 活用パターン

```
パターン1: Adversarial Review（17_CODE_AUDIT.md 参照）
────────────────────────────────
  メイン（Role A）が実装
  → サブエージェント（Role B）が批判的レビュー
  → メインが修正
  → 合格まで反復

パターン2: 並列テスト生成
────────────────────────────────
  メインが機能を実装完了
  → サブエージェントにテスト生成を委譲
  → メインは次の機能の実装に着手
  → サブエージェントの結果を後で確認

パターン3: ドキュメント検索
────────────────────────────────
  メインが実装中にSSOTの参照が必要
  → サブエージェントにSSOTの検索・要約を委譲
  → メインは結果を受け取って実装に反映

パターン4: 影響分析
────────────────────────────────
  コード変更の影響範囲を調べたい
  → サブエージェントにコードベース全体をスキャンさせる
  → 影響を受けるファイル・関数のリストを取得
```

### CLAUDE.md での設定

```markdown
## サブエージェント活用

以下のタスクはサブエージェントに委譲してコンテキストを節約すること:

1. Adversarial Review: 実装完了後、別エージェントでコード監査
2. テスト生成: 実装と並行してテストを生成
3. SSOT検索: 大量のドキュメントから必要な情報を抽出
4. 影響分析: コード変更の影響範囲を調査
```

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
| | Cursor削除、Claude Code一本化。git worktree並列開発、サブエージェント活用を追加 | |
