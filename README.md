# Shirube v3.2

Shirube は、AI駆動の開発フレームワークです。曖昧なプロダクトアイデアから実装まで、品質を保証しながら自動化します。

> 旧称: AI Development Framework / ADF。
> The `framework` command is a deprecated alias for `shirube`.
> `.framework/` ディレクトリ名は既存プロジェクトとの互換性のため当面維持します。

## 特徴

- **IEEE/ISO準拠のSSOT**: 機能仕様書を国際規格ベースで定義（3層構造: Core/Contract/Detail）
- **8段階の品質ゲート**: SSOT監査からCI/PRまで、各工程で品質を保証
- **AI中断プロトコル**: AIが不明点を推測せず、必ず確認する体制
- **止まらないルール**: DETAIL層はデフォルトで進み、Decision Backlogで管理
- **完全な開発ライフサイクル**: アイデア → 仕様 → 実装 → テスト → デプロイ → 保守
- **5種類のプロジェクトタイプ**: app / lp / hp / api / cli
- **知識データベース**: docs/knowledge/ にドメイン知識を蓄積し、仕様品質を向上
- **外部ランナー連携**: `--json` / heartbeat / lease により openclaw 等の外部オーケストレータと接続可能

---

## クイックスタート

### 前提条件
- Node.js 18+
- npm
- Claude Code CLI (`claude`) **or** Codex CLI (`codex`) — at least one LLM provider required

### LLMプロバイダー設定

`.framework/config.json` の `provider` セクションで切り替えます:

```json
{
  "provider": {
    "default": "claude",
    "remediation": "claude",
    "validation": "claude",
    "ingestion": "claude",
    "worktree": "claude"
  }
}
```

- `default`: 全般デフォルト
- `remediation`: 自動修正（Gate BLOCK後）
- `validation`: Validator実行（Gate 2）
- `ingestion`: 設計書取り込み（`shirube ingest`）
- `worktree`: 並列タスク実行

設定ファイルがない場合、`claude` → `codex` の優先順で自動検出します。
利用可能なプロバイダー: `claude`, `codex`。

### MCP role / workflow 設定

MCP product として利用する場合、Shirube は内部エージェント名ではなく抽象 role を解決します。`shirube init --type=mcp-server` は `.framework/config.json` に role binding placeholders と workflow policy を生成します。

```json
{
  "roles": {
    "bindings": {
      "architecture_owner": {
        "type": "external",
        "id": "todo-architecture-owner",
        "placeholder": true
      },
      "l3_governance_owner": {
        "type": "external",
        "id": "todo-l3-governance-owner",
        "placeholder": true
      }
    }
  },
  "workflow": {
    "publishPolicy": "draft_only",
    "outputs": ["local_files"]
  }
}
```

`publishPolicy` は `draft_only` / `approval_required` / `auto_publish` を指定できます。`draft_only` は GitHub Issue/PR などの remote artifact を作成せず、外部公開には concrete role bindings と policy approval が必要です。Secrets、bot tokens、API keys、platform credentials は `.framework/config.json` に保存しません。

### インストール
```bash
git clone https://github.com/watchout/ai-dev-framework.git
cd ai-dev-framework
npm install
npm link
```

### 利用可能なコマンド
```bash
shirube --help
```

### 新規プロジェクト
```bash
shirube init my-project --type=app
cd my-project
shirube discover
shirube generate business
shirube generate product
shirube generate technical
shirube plan
shirube run --start-only --json
shirube audit all
```

### 既存プロジェクト
```bash
cd /path/to/existing-project
shirube retrofit
shirube plan
shirube run --start-only --json
shirube audit all
```

### 進捗確認
```bash
shirube status
```

詳細は [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) を参照。

---

## CLIコマンド

```
shirube init [name]       プロジェクト初期化（--type=app|lp|hp|api|cli）
shirube discover          ディスカバリー（ヒアリング実行）
shirube generate <step>   SSOT生成（business|product|technical）
shirube plan              実装計画作成（タスク分解）
shirube audit [target]    品質監査（ssot|code|test|visual|all）
shirube run <task-id>     タスク実行 / start-only / heartbeat / fail-task
shirube status            進捗表示（--json でダッシュボード・ランナー連携）
shirube workflow          Gate Engine 状態の観測・検査（status|doctor|check|explain）
shirube workflow check    action別の停止判定（--action implementation_start 等）
shirube retrofit          既存プロジェクト導入
shirube update            フレームワーク更新
```

---

## ドキュメント構成

| # | ドキュメント | 内容 |
|---|------------|------|
| 00 | MASTER_GUIDE | 全体マップ・プロジェクトタイプ別プロファイル |
| 01-07 | プロセス定義 | 開発プロセス・ライフサイクル・マーケティング |
| 08-10 | ディスカバリー〜生成 | ヒアリング・ドキュメント生成・生成チェーン |
| 11-13 | SSOT | フォーマット（3層構造）・監査基準 |
| 14 | 実装順序 | タスク分解・縦スライス・優先度定義 |
| 15-16 | プロンプト | フォーマット・監査基準 |
| 17 | コード監査 | 実装品質監査・Adversarial Review |
| 18-20 | テスト | テスト実施・CI/PR・ビジュアルテスト |
| 21 | AI中断 | 独断禁止プロトコル・止まらないルール・Memory Persistence |
| 22-24 | 検証〜保守 | 機能検証・デプロイ・変更管理 |
| 25 | 検証ループ | Checkpoint/Verify・pass@k metrics |

### ガイド

| ドキュメント | 対象 |
|------------|------|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | 初めての方 |
| [GUIDE_NEW_PROJECT.md](docs/GUIDE_NEW_PROJECT.md) | 新規プロジェクト |
| [GUIDE_EXISTING_PROJECT.md](docs/GUIDE_EXISTING_PROJECT.md) | 既存プロジェクト導入 |
| [FRAMEWORK_SUMMARY.md](docs/FRAMEWORK_SUMMARY.md) | 全体サマリー・引き継ぎ |
| [OPENCLAW_RUNTIME_CONTRACT.md](docs/guides/OPENCLAW_RUNTIME_CONTRACT.md) | 外部ランナー連携契約 |

---

## プロジェクトタイプ

| タイプ | 用途 | コマンド |
|--------|------|---------|
| `app` | フルスタックWebアプリ（デフォルト） | `shirube init my-app` |
| `lp` | ランディングページ | `shirube init my-lp --type=lp` |
| `hp` | ホームページ | `shirube init my-hp --type=hp` |
| `api` | API/バックエンド | `shirube init my-api --type=api` |
| `cli` | CLIツール | `shirube init my-cli --type=cli` |

タイプによって生成されるSSOT・実行される監査・Discoveryの範囲が変わります。

---

## 関連リポジトリ

| リポジトリ | 説明 |
|-----------|------|
| [ai-dev-framework](https://github.com/watchout/ai-dev-framework) | Shirube CLI本体（`shirube` コマンド） |

---

## ライセンス

MIT
