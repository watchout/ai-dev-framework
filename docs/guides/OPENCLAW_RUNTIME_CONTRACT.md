# OpenClaw Runtime Contract

`ai-dev-framework` を配布可能な標準基盤として保ちつつ、`openclaw` を外部ランナーとして接続するための契約。

## Responsibility Split

### framework

- SSOT / plan / gate の単一責任
- 実行可能なタスクの選定
- `run-state.json` の永続化
- heartbeat / lease / timebox の管理
- stop reason と acceptance checks の記録
- GitHub 連携のベース状態管理

### openclaw

- ジョブ起動と再試行
- 並列数制御
- heartbeat の定期送信
- 停止判定に応じた通知
- 人間承認の要求
- Telegram / Slack / system event 連携

## Machine Interface

### Start Task

```bash
framework run <task-id> --start-only --json
framework run --start-only --json
```

返却:

- `taskId`
- `progress`
- `prompt`
- `heartbeatAt`
- `leaseExpiresAt`
- `error` (失敗時)

用途:

- openclaw が次タスクを claim する
- 実装プロンプトを外部エージェントへ渡す

### Refresh Heartbeat

```bash
framework run <task-id> --heartbeat --json
framework run --heartbeat --json
```

返却:

- `taskId`
- `progress`
- `heartbeatAt`
- `leaseExpiresAt`
- `error` (失敗時)

用途:

- 実行中タスクの lease 延長
- heartbeat 失敗時は openclaw が停止処理へ遷移

### Complete Task

```bash
framework run <task-id> --complete --json
```

返却:

- `progress`
- `issueClosed`
- `parentClosed`
- `error` (失敗時)

備考:

- framework 側で blocker / lease / modified files の基本チェックを行う
- 実装タスクは `.git/` が存在する場合、変更差分なしでは完了できない

### Fail Task

```bash
framework run <task-id> --fail-task --reason max_idle_exceeded --detail "No heartbeat for 7 minutes" --json
```

返却:

- `taskId`
- `progress`
- `issueLabeled`
- `error` (失敗時)

用途:

- openclaw が停止理由を framework に確定記録する

### Read Status

```bash
framework run --status --json
framework status --json
```

`framework run --status --json` は実行レイヤー中心、`framework status --json` はプロジェクト全体中心。

## Runtime State Fields

`run-state.json` の task には少なくとも以下を持つ。

- `status`
- `blockedBy`
- `startedAt`
- `heartbeatAt`
- `leaseExpiresAt`
- `maxRuntimeMin`
- `maxIdleMin`
- `stopReason`
- `stopDetails`
- `acceptanceChecks`

## Stop Reasons

標準 stop reason:

- `manual_fail`
- `dependency_blocked`
- `max_runtime_exceeded`
- `max_idle_exceeded`
- `acceptance_failed`
- `no_changes_detected`

openclaw は独自の文言を持たず、まず framework の標準値を優先する。

## OpenClaw Loop

推奨ループ:

1. `framework status --json` で gate / execution を確認
2. `framework run --start-only --json` で task を claim
3. 外部エージェントへ `prompt` を渡す
4. 2-5 分ごとに `framework run <task-id> --heartbeat --json`
5. 実装成功なら `framework run <task-id> --complete --json`
6. 異常時は `framework run <task-id> --fail-task --reason ... --json`

## Audit Checkpoints

以下のタイミングでは openclaw 単独判断で先へ進めず、監査を要求する。

- `review` タスク完了前
- `acceptanceChecks` に失敗がある
- `stopReason` が `acceptance_failed`
- 同一 task が 2 回以上失敗
- 変更ファイル数が想定より大きい
- feature 完了後に PR を作る直前

## Non-Goals

この契約は以下を framework に含めない。

- 通知チャネル固有の処理
- ジョブキュー基盤
- 分散ロック
- セッション再接続
- 外部エージェントの実行管理
