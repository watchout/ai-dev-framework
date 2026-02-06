# 09_TOOLCHAIN.md - 開発ツールチェーン定義

> Claude.ai と Claude Code（CLI / Web）の3ツール体制で、仕様書を活用し最短で開発に入るための定義

---

## 0. 用語定義

```
本フレームワークでは「Claude Code」を以下の通り区別する。
曖昧な「Claude Code」単独表記は禁止し、必ず修飾子をつける。

┌────────────────────────────────────────────────────────────────────┐
│ Claude.ai                                                          │
│   ブラウザの対話UI。思考・設計・壁打ち専用。                           │
│   コード実行・ファイル操作はできない。                                 │
│   URL: claude.ai                                                   │
├────────────────────────────────────────────────────────────────────┤
│ Claude Code CLI                                                    │
│   ターミナルで `claude` コマンドとして起動する対話型エージェント。       │
│   ローカルPCで実行。ファイル読み書き・bash・git 全操作可能。            │
│   制約: ターミナルを閉じる / PCスリープで停止する。                     │
├────────────────────────────────────────────────────────────────────┤
│ Claude Code Web                                                    │
│   claude.ai/code から起動、またはCLIから `&` プレフィックスで送信。     │
│   Anthropic管理のクラウドVM上で実行。                                 │
│   ✅ 非同期実行（PCを閉じてもタスクが継続）                            │
│   ✅ 複数タスクの並列実行                                             │
│   ✅ 完了時に自動PR作成                                               │
│   ✅ iOSアプリ / ブラウザから進捗監視・指示可能                        │
│   制約: GitHubリポジトリのみ対応。レート制限は全ツール共有。            │
├────────────────────────────────────────────────────────────────────┤
│ Claude Code GitHub Actions                                         │
│   GitHub Actionsワークフローから起動。                                │
│   イベントトリガー（PR, issue, schedule）で自動実行。                  │
│   用途: 自動コードレビュー、定期監査、CI統合。                         │
├────────────────────────────────────────────────────────────────────┤
│ Claude Code SDK                                                    │
│   @anthropic-ai/claude-agent-sdk。TypeScript/Python。               │
│   プログラムからエージェントを制御する。                               │
│   エージェント定義・フック・構造化出力。                               │
│   用途: カスタムツール構築。現フレームワークでは使用しない。            │
└────────────────────────────────────────────────────────────────────┘

セッション移動:
  CLI → Web: `& タスク内容` または `claude --remote "タスク内容"`
  Web → CLI: `/teleport` または `claude --teleport`
```

---

## 1. 基本思想

```
docs/（仕様書群） = Single Source of Truth
         ↑
      CLAUDE.md
     (Claude Code CLI / Web が自動読込)

原則:
・仕様書は docs/ に1箇所で管理
・Claude Code CLI / Web が CLAUDE.md を通じて仕様書を参照する
・コーディングは Claude Code CLI（対話型）または Claude Code Web（非同期）で完結する
```

### ツール体制: Claude.ai + Claude Code CLI + Claude Code Web の3本柱

```
Claude.ai（思考・設計）
  → アイデア壁打ち、仕様の対話的作成、戦略相談

Claude Code CLI（対話型の実装・実行）
  → リアルタイムの対話が必要な作業
  → デバッグ、設計判断を含む実装、環境構築

Claude Code Web（非同期の実装・実行）
  → 明確に定義されたタスクの自動実行
  → 複数タスクの並列実行（PCを閉じても継続）
  → バグ修正、テスト生成、リファクタリング等の定型作業
  → 完了後に自動PR作成 → レビュー
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

| 場面 | Claude.ai | Claude Code CLI | Claude Code Web |
|------|-----------|----------------|----------------|
| アイデア壁打ち | **メイン** | | |
| ディスカバリーフロー | **メイン** | | |
| 仕様書の対話的作成 | **メイン** | | |
| 仕様書のファイル生成 | | **メイン** | |
| プロジェクト初期構築 | | **メイン** | |
| 対話型のコーディング | | **メイン** | |
| デバッグ（原因調査） | | **メイン** | |
| 一括リファクタリング | | | **メイン** |
| テスト生成 | | | **メイン** |
| CI/CD設定 | | **メイン** | |
| 設計の相談 | **メイン** | | |
| コードレビュー | | | **メイン** |
| バグ修正（原因明確） | | | **メイン** |
| 機能実装（仕様確定済） | | サブ | **メイン** |
| LP実装 | | | **メイン** |
| 複数タスク並列実行 | | | **メイン** |

```
使い分けの原則:
  ・設計判断やリアルタイム対話が必要 → Claude Code CLI
  ・仕様が確定しており自律実行できる → Claude Code Web
  ・思考・壁打ち・戦略 → Claude.ai

  Claude Code Web は CLAUDE.md を読み込むため、
  プロジェクトの規約・仕様に従って自律的に動作する。
```

---

## 4. 開発に入るまでの手順

### 4.1 全体フロー

```
Step 1: アイデア整理         [Claude.ai]
  「○○を作りたい」→ ディスカバリーフロー
        │
        ▼
Step 2: 仕様書一式を生成     [Claude Code CLI]
  claude "docs/idea/ の資料をもとに
         docs/requirements/ と docs/design/ を生成して"
        │
        ▼
Step 3: プロジェクト初期構築  [Claude Code CLI]
  claude "docs/standards/TECH_STACK.md に基づいて
         プロジェクトをスキャフォールドして"
        │
        ▼
Step 4: 開発                 [Claude Code Web]
  仕様確定済みのタスクを並列送信:
  & "AUTH-001の仕様書に基づいてログイン機能を実装して"
  & "ACCT-001の仕様書に基づいてサインアップ機能を実装して"
  → 各タスクがクラウドで非同期実行
  → CLAUDE.md が自動読込 → 仕様に従い自律実行
  → 完了後にPR作成 → レビュー
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

### 4.3 Step 2: 仕様書をプロジェクトに配置（Claude Code CLI）

**方法A: Claude.ai の出力を Claude Code CLI で配置**
```bash
# プロジェクトディレクトリを作成
mkdir -p my-project/docs/{idea,requirements,design,standards,marketing,notes}

# Claude Code CLI で仕様書を生成・配置
cd my-project
claude "以下のアイデアキャンバスの内容をもとに、
       docs/ 配下に仕様書一式を生成してください。

       [Claude.ai で作成した内容をペースト]"
```

**方法B: フレームワークテンプレートから一括生成**
```bash
# テンプレートをコピー
cp -r ai-dev-framework/templates/* docs/

# Claude Code CLI で内容を埋める
claude "docs/idea/IDEA_CANVAS.md に以下の内容を反映して:
       [アイデアの内容]"
```

### 4.4 Step 3: プロジェクト初期構築（Claude Code CLI）

```bash
# Claude Code CLI で CLAUDE.md を配置しプロジェクトを初期化
claude "docs/standards/TECH_STACK.md を読んで、
       以下を実行して:
       1. Next.js + Supabase のプロジェクトを初期化
       2. CLAUDE.md を生成
       3. 基本的なディレクトリ構造を作成"
```

### 4.5 Step 4: 開発（Claude Code Web）

```bash
# Claude Code Web に複数タスクを並列送信
# CLIから & プレフィックスで Web セッションを作成
& "docs/design/features/common/AUTH-001_login.md を読んで
   ログイン機能をフル実装して。API、UI、テスト全部。"

& "docs/design/features/common/ACCT-001_signup.md を読んで
   サインアップ機能をフル実装して。API、UI、テスト全部。"

& "全ファイルのエラーハンドリングを
   docs/core/SSOT-5_CROSS_CUTTING.md に準拠させて"

# → 3タスクがクラウドで同時実行
# → PCを閉じてもOK
# → /tasks で進捗確認
# → 完了後に各タスクからPRが作成される

# 対話が必要な作業は Claude Code CLI で実行
claude "認証基盤の設計について相談しながら実装したい"
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
├─ 対話しながら実装したい / デバッグしたい
│   → Claude Code CLI
│   例: 設計判断を含む実装、原因不明のバグ調査、環境構築
│
├─ 仕様が確定したタスクを自動実行したい
│   → Claude Code Web
│   例: 機能実装、テスト生成、リファクタリング、バグ修正
│
├─ 複数タスクを並列で回したい / PCを閉じても進めたい
│   → Claude Code Web
│   例: 複数機能の同時実装、一括テスト生成
│
├─ 仕様書をファイルに反映したい
│   → Claude Code CLI（対話確認が必要なため）
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

[Claude Code CLI]
  ↓ プロジェクト初期化 / ファイル配置
  ↓ 仕様書一式の生成
  ↓ CLAUDE.md の生成
```

### Phase 0.5: LP / マーケ

```
[Claude.ai]
  ↓ LP構成・コピーの策定
  ↓ SNS戦略の策定

[Claude Code Web]
  ↓ LP実装（Next.js + Tailwind）
  ↓ フォーム実装
  ↓ メール配信設定（任意）
  ↓ Analytics設定
```

### Phase 1〜4: 設計・実装

```
[Claude Code CLI] 対話が必要な作業
  ↓ スキャフォールド
  ↓ DB マイグレーション（初回設計）
  ↓ 認証基盤の設計・実装
  ↓ デバッグ（原因調査）

[Claude Code Web] 仕様確定済みのタスクを並列実行
  ↓ 機能実装（仕様書ベースで自律実行）
  ↓ UI構築
  ↓ テスト一括生成
  ↓ リファクタリング
  ↓ コードレビュー
  → 各タスクから自動PR → レビュー → マージ

[Claude.ai] 必要に応じて
  ↓ 設計の相談
  ↓ 仕様の追加・変更
```

### Phase 5: リリース

```
[Claude Code CLI]
  ↓ CI/CD構築
  ↓ 環境変数設定
  ↓ デプロイスクリプト

[Claude Code Web]
  ↓ 最終修正（並列実行）
  ↓ パフォーマンス調整

[Claude.ai]
  ↓ ローンチ戦略の確認
  ↓ コピーの最終チェック
```

---

## 7. Claude Code Web による並列開発

### 基本概念

```
Claude Code Web の非同期実行を活用し、
複数のタスクをクラウド上で同時に実行する。

従来（git worktree + Claude Code CLI）:
  ローカルPCで複数ターミナルを開いて並列実行
  → PCの前にいる間しか動かない
  → リソース（CPU/メモリ）を消費する

現在（Claude Code Web）:
  Claude Code CLI から & プレフィックスでタスクを送信
  → Anthropicのクラウドで独立したVMが起動
  → 各タスクが非同期で並列実行
  → PCを閉じても継続、完了時にPR作成
```

### 使い方

```bash
# Claude Code CLI から複数タスクを並列送信
& "AUTH-001の仕様に基づいてログイン機能を実装して"
& "ACCT-001の仕様に基づいてサインアップ機能を実装して"
& "AUTH-005の仕様に基づいてログアウト機能を実装して"

# または claude --remote で直接送信
claude --remote "AUTH-001の仕様に基づいてログイン機能を実装して"

# 進捗確認
/tasks

# 完了したセッションをローカルに取り込む
/teleport
# または
claude --teleport <session-id>
```

### Web での計画→実行パターン

```bash
# 1. Claude Code CLI で計画を立てる（plan mode）
claude --permission-mode plan

# 2. 計画が固まったら Web に送信して自律実行
& "先ほど議論した認証基盤の実装計画を実行して"

# → CLI では対話的に計画策定
# → Web では計画に基づき自律実行
# → PCを閉じてもOK
```

### 並列開発のルール

```
並列実行可能な条件:
  ✅ 異なる機能（異なるSSOT）を実装する場合
  ✅ 異なるファイルを変更する場合
  ✅ 依存関係がない機能同士

並列実行してはいけない条件:
  ❌ 同じファイルを変更する可能性がある場合
  ❌ 同じDBテーブルのマイグレーションを含む場合
  ❌ 依存関係がある機能同士（Wave が異なる場合）

マージ戦略:
  1. 各タスクが完了時にPRを自動作成
  2. CI通過を確認
  3. コンフリクトがあれば先にマージした方が優先
  4. 後からマージする方がコンフリクト解消
```

### git worktree（補足）

```
git worktree は Claude Code CLI でローカル並列開発する場合に
引き続き使用可能。ただし Claude Code Web が推奨。

git worktree を使うケース:
  - ネットワークがない環境での開発
  - プライベートリポジトリでGitHub連携が制限される場合
  - リアルタイム対話が必要な作業を複数同時に行う場合
```

---

## 8. Agent Teams（CLI パターン専用）

### 8.1 概要

```
Claude Code CLI の Agent Teams 機能を使い、
専門エージェントをファイルシステムベースで定義・起動する。

.claude/agents/ にMarkdownファイルを配置すると、
Claude Code CLI の Agent Teams が自動的にエージェントとして認識する。
メインエージェントから委譲されたタスクを、
コンテキスト分離された状態で実行する。

※ Agent Teams は Claude Code CLI 専用の機能。
  Claude Code Web ではタスク単位の並列実行（§7）を使用する。
```

### 8.2 アーキテクチャ

```
メインエージェント（実装担当）
  │
  ├── visual-tester エージェント
  │     ビジュアルテスト専門。Playwright MCP でブラウザ操作。
  │     → 20_VISUAL_TEST.md §4 参照
  │
  ├── code-reviewer エージェント
  │     Adversarial Review の Role B。批判的コードレビュー。
  │     → 17_CODE_AUDIT.md 参照
  │
  └── ssot-explorer エージェント
        SSOT検索・要約。メインのコンテキスト節約。
        → 12_SSOT_FORMAT.md 参照

メリット:
  - メインエージェントのコンテキストを消費しない
  - 専門的な指示を事前に定義できる（Markdown）
  - リアルタイムで対話・デバッグ可能
  - 同一セッション内で並列実行
  - 読み取り専用の制約をエージェント単位で設定可能
```

### 8.3 セットアップ

#### ディレクトリ構造

```
.claude/
└── agents/
    ├── visual-tester.md     ← ビジュアルテスト専門
    ├── code-reviewer.md     ← Adversarial Review Role B
    └── ssot-explorer.md     ← SSOT検索・要約

テンプレートは templates/project/agents/ に用意。
framework init 実行時に .claude/agents/ にコピーされる。
```

#### テンプレート配置

```bash
# framework init 実行時に自動配置
framework init my-project --type=app

# 手動配置の場合
mkdir -p .claude/agents
cp templates/project/agents/*.md .claude/agents/
# {{PROJECT_NAME}} 等のプレースホルダーを置換
```

### 8.4 エージェント定義ファイルの書き方

```markdown
<!-- .claude/agents/[agent-name].md -->

# [Agent Name]

エージェントの説明（1行目がCLIの表示名になる）。

## 実行手順

1. 手順1
2. 手順2
3. ...

## 確認観点

- 確認ポイントA
- 確認ポイントB

## 報告形式

結果のフォーマットを定義

## 制約

- 制約1（例: ファイルの変更は行わない）
- 制約2
```

### 8.5 活用パターン

```
パターン1: 実装 → ビジュアルテスト（同時進行）
────────────────────────────────
  メインが AUTH-001 を実装完了
  → visual-tester に AUTH-001 のテストを委譲
  → メインは ACCT-001 の実装に着手
  → visual-tester の結果を受け取り、問題があれば修正

  指示例:
  "visual-tester エージェントでAUTH-001のビジュアルテストを実行して"

パターン2: 実装 → Adversarial Review（反復）
────────────────────────────────
  メイン（Role A）が実装
  → code-reviewer（Role B）が批判的レビュー
  → メインが修正
  → code-reviewer が再レビュー
  → スコア100点になるまで反復

  指示例:
  "code-reviewer エージェントで実装したコードをレビューして"

パターン3: SSOT参照（コンテキスト節約）
────────────────────────────────
  メインが実装中にSSOTの詳細仕様を確認したい
  → ssot-explorer にSSOTの検索・要約を委譲
  → メインは要約結果のみを受け取る（コンテキスト節約）

  指示例:
  "ssot-explorer エージェントで AUTH-001 のAPI仕様を調べて"

パターン4: 変更影響分析
────────────────────────────────
  コード変更の影響範囲を調べたい
  → ssot-explorer にコードベース全体の影響分析を委譲
  → 影響を受けるファイル・関数のリストを取得

  指示例:
  "ssot-explorer エージェントで User モデルの変更影響を調査して"
```

### 8.6 §7（Claude Code Web）との使い分け

```
┌──────────────────────────────────────────────────────────────────────┐
│            Claude Code CLI                Claude Code Web           │
│            Agent Teams（§8）              タスク並列実行（§7）       │
├──────────────────────────────────────────────────────────────────────┤
│ 実行場所    ローカルPC                    クラウドVM                 │
│ 並列単位    エージェント委譲              タスク（独立セッション）    │
│ 対話性      リアルタイムで対話可能        非同期（結果をPRで受領）    │
│ 継続性      PCを閉じると停止             PCを閉じても継続           │
│ ブランチ    同一ブランチ                  タスクごとに別ブランチ      │
│ コンテキスト メインから分離だが同一環境    完全に独立                 │
│ 最適用途    実装中のサポートタスク        独立した実装・テストタスク   │
│ エージェント .claude/agents/ で定義       プロンプトで都度指示        │
│ 定義                                                                │
└──────────────────────────────────────────────────────────────────────┘

判断フロー:
  Q: タスクは実装中のサポート（レビュー、検索、テスト）か？
    YES → Agent Teams（§8）: エージェントに委譲
    NO  → 独立した実装タスクか？
      YES → Claude Code Web（§7）: 非同期タスクとして送信
      NO  → メインエージェントで直接実行
```

### 8.7 CLAUDE.md での設定

```markdown
## Agent Teams 活用（CLI パターン）

以下のタスクは Agent Teams に委譲してコンテキストを節約すること:

1. ビジュアルテスト: visual-tester エージェントで画面テスト
2. Adversarial Review: code-reviewer エージェントでコード監査
3. SSOT検索: ssot-explorer エージェントで仕様参照
4. 影響分析: ssot-explorer エージェントで変更影響調査

エージェント定義: .claude/agents/ 配下のMarkdownファイル
```

---

## 9. CLIコマンド一覧（framework コマンド）

### 概要

```
framework CLI は ai-dev-platform で開発する Node.js ツール。
フレームワークの各プロセスをコマンドとして実行する。

インストール:
  npm install -g @watchout/framework
  # or
  npx @watchout/framework <command>

基本構文:
  framework <command> [options]
```

### コマンド一覧

| コマンド | 対応Step | 説明 |
|---------|---------|------|
| `framework init` | Step 3 | プロジェクト初期化 |
| `framework discover` | Step 0 | ディスカバリー（ヒアリング実行） |
| `framework generate` | Step 1-3 | SSOT生成（生成チェーン実行） |
| `framework plan` | Step 4準備 | 実装計画作成（タスク分解） |
| `framework audit` | 品質ゲート | 品質監査（SSOT/コード/テスト） |
| `framework run` | Step 4 | タスク実行（1タスク or 連続） |
| `framework status` | 常時 | 進捗表示 |
| `framework retrofit` | Step R | 既存プロジェクト導入 |
| `framework update` | 保守 | フレームワーク更新 |

### 各コマンドの詳細

```
framework init [project-name]
────────────────────────────
  プロジェクトを初期化する。

  処理:
  1. プロファイル（--type）に基づきスコープを決定
  2. docs/ ディレクトリ構造を作成（タイプに応じて不要なディレクトリはスキップ）
  3. 有効なテンプレートのみ docs/ にコピー
  4. CLAUDE.md を生成（プロファイル情報を含む）
  5. .gitignore 等の設定
  6. .github/workflows/ci.yml を配置（タイプに応じたワークフロー）

  オプション:
  --type <type>       プロジェクトタイプを指定（app|lp|hp|api|cli, default: app）
  --template <name>   テンプレートを指定（default: standard）
  --skip-git          git init をスキップ
  --skip-ci           CI/CD ワークフローをスキップ
  --deploy <target>   デプロイワークフローも追加（vercel|dokku|vps|docker）

  タイプ別の動作:
  --type=app  全SSOT・全監査・全ディレクトリを生成（デフォルト）
  --type=lp   PRD+UI_STATEのみ、マーケティング必須、API/DB設計スキップ
  --type=hp   PRD+UI_STATEのみ、最小構成
  --type=api  PRD+API+DATA+CROSS、UI関連スキップ
  --type=cli  PRD+API(コマンド定義)、UI/DB関連スキップ

  CI/CDワークフロー選択ロジック:
  --type=app  → templates/ci/app.yml（PostgreSQL, Redis, 全テスト）
  --type=api  → templates/ci/api.yml（DB統合テスト重視）
  --type=lp   → templates/ci/lp.yml（Lighthouse重視）
  --type=hp   → templates/ci/hp.yml（Lighthouse + アクセシビリティ）
  --type=cli  → templates/ci/cli.yml（マルチプラットフォーム）

  プロファイル定義: templates/profiles/<type>.json
  CI/CDテンプレート: templates/ci/<type>.yml, templates/ci/deploy/


framework discover
────────────────────────────
  ディスカバリーフロー（08_DISCOVERY_FLOW.md）を実行する。

  処理:
  1. プロファイルから実行するStageを決定
  2. Claude.ai または Claude Code で対話実行
  3. 回答を記録
  4. 全体サマリーを生成
  5. 初期資料を docs/idea/ に配置

  タイプ別Stage:
  app  → Stage 1-5（全Stage）
  lp   → Stage 1-3（課題・ターゲット・価値）
  hp   → Stage 1-2（概要・構成）
  api  → Stage 1-3（課題・ターゲット・機能）
  cli  → Stage 1-3（課題・ターゲット・機能）

  オプション:
  --resume             中断したディスカバリーを再開


framework generate <step>
────────────────────────────
  生成チェーン（10_GENERATION_CHAIN.md）を実行する。

  処理:
  step=business   → Step 1: IDEA_CANVAS → PERSONA → COMPETITOR → VALUE_PROP
  step=product    → Step 2: PRD → FEATURE_CATALOG → UI_STATE → 機能仕様書
  step=technical  → Step 3: TECH_STACK → API → DB → CROSS_CUTTING → 規約

  各ドキュメント生成後にユーザー確認を挟む。

  オプション:
  --auto              ユーザー確認をスキップ（テスト用）


framework plan
────────────────────────────
  実装計画を作成する（14_IMPLEMENTATION_ORDER.md に従う）。

  処理:
  1. 全SSOTの依存関係を分析
  2. トポロジカルソートでWave分類
  3. タスク分解（DB/API/UI/結合/テスト/レビュー）
  4. 実装順序を出力

  出力: docs/management/IMPLEMENTATION_PLAN.md


framework audit [target]
────────────────────────────
  品質監査を実行する。

  target:
  ssot             → SSOT監査（13_SSOT_AUDIT.md）合格: 95点
  prompt           → プロンプト監査（16_PROMPT_AUDIT.md）合格: 100点
  code             → コード監査（17_CODE_AUDIT.md）合格: 100点
  test             → テスト監査（18_TEST_FORMAT.md）合格: 100点
  visual           → ビジュアル監査（20_VISUAL_TEST.md）合格: 100点
  acceptance       → 機能検証（22_FEATURE_ACCEPTANCE.md）合格: 100点
  all              → プロファイルで有効な監査を全て実行

  タイプ別 all の動作:
  app  → ssot, prompt, code, test, visual, acceptance
  lp   → code, visual
  hp   → code, visual
  api  → code, test
  cli  → code, test

  オプション:
  --feature <id>      特定の機能のみ監査
  --fix               問題を自動修正（コード監査のみ）


framework run <task-id>
────────────────────────────
  タスクを実行する。

  処理:
  1. タスクIDに対応するSSOTを読み込み
  2. プロンプトを生成（15_PROMPT_FORMAT.md）
  3. 実装を実行
  4. コード監査を自動実行
  5. テストを生成・実行

  オプション:
  --auto              連続自動実行（全タスクを順番に）
  --dry-run           実行せずプロンプトのみ生成


framework status
────────────────────────────
  プロジェクトの進捗を表示する。

  処理:
  1. docs/ 配下のファイル存在チェック
  2. 各Stepの完了判定
  3. 進捗バーを表示（00_MASTER_GUIDE.md の形式）

  オプション:
  --json              JSON形式で出力（ダッシュボード連携用）
  --detail            各ドキュメントの完成度も表示


framework retrofit
────────────────────────────
  既存プロジェクトをフレームワーク管理下に移行する。
  詳細: 10_GENERATION_CHAIN.md Step R

  処理:
  1. 既存コードスキャン
  2. 既存ドキュメント読み込み
  3. ギャップ分析 → レポート表示
  4. SSOT逆生成（ユーザー確認あり）
  5. CLAUDE.md 生成
  6. docs/ 配下にSSOT配置

  オプション:
  --scan-only         スキャンとギャップ分析のみ（SSOT生成しない）


framework update
────────────────────────────
  フレームワーク自体を最新版に更新する。

  処理:
  1. ai-dev-framework リポジトリの最新を取得
  2. docs/standards/ と差分を比較
  3. 変更点をレポート表示
  4. ユーザー確認後に docs/standards/ を更新
  5. CLAUDE.md への影響を確認・反映

  更新対象:
  - docs/standards/ 配下の全フレームワークドキュメント
  - テンプレート
  - チェックリスト

  更新しない:
  - プロジェクト固有のSSOT
  - カスタマイズ済みの共通機能仕様
  - ユーザーが変更したファイル

  オプション:
  --check             更新可能かチェックのみ（適用しない）
  --force             ユーザー確認なしで更新
```

### コマンドのフロー図

```
新規プロジェクト:
  framework init --type=app    # or lp, hp, api, cli
    → framework discover
    → framework generate business
    → framework generate product
    → framework generate technical
    → framework plan
    → framework run --auto
    → framework audit all
    → framework status

既存プロジェクト:
  framework retrofit
    → framework plan
    → framework run --auto
    → framework audit all
    → framework status

日常の開発:
  framework status          ← 現在地を確認
  framework run FEAT-001    ← 1タスク実行
  framework audit code      ← コード監査
  framework run --auto      ← 連続実行

保守:
  framework update          ← フレームワーク更新
  framework audit all       ← 全体監査
```

---

## 10. Skill Creator（スキル自動生成）

### 基本概念

```
開発中に繰り返されるパターンを検出し、
再利用可能な「スキル」として定型化する。

スキル = 再利用可能なパターン定義
  - いつ使うか（trigger）
  - 何をするか（steps）
  - 完了条件（done_when）
  - テンプレートコード（template）

保存先: .claude/skills/
形式: SKILL.md
```

### スキルの定義フォーマット（SKILL.md）

```markdown
# SKILL: {スキル名}

## メタデータ
- ID: SKILL-{NNN}
- カテゴリ: {implementation | testing | refactoring | debugging}
- 確信度: {N}/100
- 使用回数: {N}
- 作成日: YYYY-MM-DD
- 出典: {どの実装から抽出したか}

## トリガー（いつ使うか）
{このスキルが適用される条件}

## 手順（何をするか）
1. {ステップ1}
2. {ステップ2}
3. {ステップ3}

## テンプレート
\`\`\`typescript
{テンプレートコード}
\`\`\`

## チェックリスト
- [ ] {確認項目1}
- [ ] {確認項目2}

## 使用履歴
| 日付 | 対象 | 結果 |
|------|------|------|
| YYYY-MM-DD | {機能ID} | 成功/失敗 |
```

### スキルの例

```markdown
# SKILL: CRUD API エンドポイント作成

## メタデータ
- ID: SKILL-001
- カテゴリ: implementation
- 確信度: 90/100
- 使用回数: 5
- 作成日: 2025-01-15
- 出典: AUTH-001, ACCT-001, BOOK-001 の実装パターン

## トリガー
新しいリソースのCRUD APIを作成するとき

## 手順
1. SSOT-3 からエンドポイント定義を確認
2. Router ファイルを作成（src/api/{resource}.ts）
3. バリデーションスキーマを定義（Zod）
4. Handler関数を実装（create, read, update, delete）
5. ミドルウェアを適用（auth, rateLimit, validation）
6. テストを生成（正常系 + エラー系）
7. SSOT-3 との整合性を /verify で確認

## テンプレート
// src/api/{resource}.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@/middleware/auth';
import { rateLimit } from '@/middleware/rateLimit';
import { validate } from '@/middleware/validate';

const router = Router();

const createSchema = z.object({
  // SSOT-4 のスキーマから生成
});

router.post('/', authenticate, rateLimit, validate(createSchema), async (req, res) => {
  // 実装
});

// ... read, update, delete

## チェックリスト
- [ ] SSOT-3 のエンドポイント定義と一致
- [ ] バリデーションが SSOT-4 のスキーマと一致
- [ ] 認証ミドルウェアが適用されている
- [ ] レート制限が適用されている
- [ ] エラーハンドリングが SSOT-5 に準拠
- [ ] テストが全エンドポイントをカバー
```

### /skill-create コマンド

```
/skill-create [options]

処理フロー:
  1. git履歴から直近のN件のコミットを分析
  2. 繰り返されるコードパターンを抽出
  3. パターンをスキル定義に変換
  4. ユーザーに確認
  5. .claude/skills/SKILL-{NNN}.md に保存

オプション:
  --from <commit>     分析開始のコミット
  --category <cat>    カテゴリでフィルタ
  --pattern <desc>    特定のパターンを指定してスキル化

例:
  /skill-create
  → 直近20コミットから自動抽出

  /skill-create --pattern "API エンドポイント作成"
  → 指定パターンに関連するコミットを分析してスキル化
```

### スキル抽出のアルゴリズム

```
Step 1: コミット履歴をスキャン
────────────────────────────────
  git log --oneline -20
  各コミットの変更ファイルと差分を取得

Step 2: パターンを検出
────────────────────────────────
  以下の類似性を判定:
  - ファイル構造の類似性（同じディレクトリに同じ構造）
  - コード構造の類似性（同じ関数パターン）
  - 変更パターンの類似性（同じ種類の変更を繰り返し）

Step 3: パターンをクラスタリング
────────────────────────────────
  類似度が閾値（70%）以上のパターンをグループ化
  グループ内で共通部分と可変部分を分離

Step 4: スキル定義を生成
────────────────────────────────
  共通部分 → テンプレート
  可変部分 → パラメータ
  実行順序 → 手順
  品質基準 → チェックリスト

Step 5: 確信度を算出
────────────────────────────────
  出現回数 × 成功率 で確信度を計算
  Continuous Learning v2 の Instinct と連動
```

### Instinct との連動

```
Instinct-based Learning（21_AI_ESCALATION.md）との連携:

Instinct → Skill:
  Instinct の confidence が 80+ に到達
  → /skill-create --pattern で詳細なスキルに昇格
  → テンプレートコードと手順書を生成

Skill → Instinct:
  スキルを使用するたびに関連 Instinct の confidence を更新
  → 使用結果（成功/失敗）をフィードバック
```

### スキルの活用

```
スキルの適用タイミング:

1. 新しいタスクを開始する時
   → .claude/skills/ からマッチするスキルを検索
   → 「SKILL-001 が適用可能です。使用しますか？」

2. /skill-create で新しいスキルを生成した時
   → 既存の実装に適用可能か確認
   → 「SKILL-005 を以下のファイルにも適用しますか？
       - src/api/users.ts
       - src/api/products.ts」

3. framework run で自動実行する時
   → マッチするスキルのテンプレートを自動適用
   → チェックリストで品質を確認
```

### ファイル構造

```
.claude/skills/
├── SKILL-001_crud-api.md
├── SKILL-002_form-validation.md
├── SKILL-003_error-handling.md
├── SKILL-004_test-pattern.md
└── _index.json               ← スキル一覧

_index.json:
{
  "skills": [
    {
      "id": "SKILL-001",
      "name": "CRUD API エンドポイント作成",
      "category": "implementation",
      "confidence": 90,
      "use_count": 5,
      "last_used": "2025-01-15"
    }
  ],
  "stats": {
    "total": 4,
    "avg_confidence": 78,
    "most_used": "SKILL-001"
  }
}
```

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
| | Cursor削除、Claude Code一本化。git worktree並列開発、Agent Teams活用を追加 | |
| | CLIコマンド一覧（framework コマンド）を追加 | |
| | Skill Creator（スキル自動生成）セクション追加 | |
| | プロジェクトタイプ別プロファイル（--type オプション）対応 | |
| | CI/CD自動配置オプション追加（--deploy, --skip-ci）、タイプ別ワークフロー選択 | |
| | §8をAgent Teams（CLI専用）に全面改訂。.claude/agents/によるファイルシステムベースのエージェント定義を追加 | |
