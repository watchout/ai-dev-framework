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
| | Cursor削除、Claude Code一本化。git worktree並列開発、サブエージェント活用を追加 | |
| | CLIコマンド一覧（framework コマンド）を追加 | |
| | Skill Creator（スキル自動生成）セクション追加 | |
| | プロジェクトタイプ別プロファイル（--type オプション）対応 | |
| | CI/CD自動配置オプション追加（--deploy, --skip-ci）、タイプ別ワークフロー選択 | |
