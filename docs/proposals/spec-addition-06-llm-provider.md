# 仕様書追記提案: LLMプロバイダー設定

## 追記先
`docs/specs/06_CODE_QUALITY_v1.0.0.md` の末尾（変更履歴の前）

## ステータス
**提案中** — CEOレビュー待ち

## 提案理由
改修D（LLMプロバイダー抽象化）の導入により、Validator / remediation / ingestion / worktree 実行時に使用するLLMプロバイダーを切り替え可能になった。OSS公開時に Claude Code / Codex CLI の両方をサポートするため、`06_CODE_QUALITY.md` に以下を追記する必要がある。

## 追記内容（新規セクション: 7章）

```markdown
## 7. LLMプロバイダー構成

### 7.1 プロバイダー設定

`.framework/config.json` の `provider` セクションで、役割ごとに使用する LLM プロバイダーを切り替える:

| 役割 | 用途 | デフォルト |
|-----|------|-----------|
| `default` | 全般 | 自動検出（claude → codex） |
| `remediation` | 自動修正（Gate BLOCK後） | `default` を継承 |
| `validation` | Validator 実行（Gate 2） | `default` を継承 |
| `ingestion` | 設計書取り込み（`framework ingest`） | `default` を継承 |
| `worktree` | 並列タスク実行 | `default` を継承 |

### 7.2 設定例

```json
{
  "provider": {
    "default": "claude",
    "validation": "codex"
  }
}
```

### 7.3 サポート済みプロバイダー

- `claude`: Anthropic Claude Code CLI (`claude -p "<prompt>"`)
- `codex`: OpenAI Codex CLI (`codex exec --full-auto "<prompt>"`)

### 7.4 自動検出

`.framework/config.json` が存在しない or `provider` セクションが無効な場合:
1. `claude` コマンドが PATH にあれば `claude` を選択
2. そうでなければ `codex` を選択
3. どちらも無ければ `claude`（実行時エラーとなるが、README に記載された前提条件を参照）

### 7.5 OSS利用時の前提条件

ユーザーは以下いずれか1つ以上を事前インストール:
- Claude Code CLI
- Codex CLI

README の "前提条件" に明記すること。
```

## 承認フロー
1. CEOが本提案をレビュー
2. 承認後、`framework feedback approve <id>` 経由で docs/specs/06_CODE_QUALITY.md に自動追記

## 関連変更
- `src/cli/lib/llm-provider.ts` 新規
- `src/cli/lib/gate-quality-engine.ts` / `auto-remediation.ts` / `worktree-manager.ts` / `ingest-engine.ts` 置換
- `.framework/config.json` / `templates/project/.framework/config.json` 追加
- `README.md` 前提条件セクション更新
