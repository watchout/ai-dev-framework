---
id: OPS-{FEATURE}-{NNN}
status: Draft
traces:
  spec: [SPEC-{FEATURE}-001]
  impl: [IMPL-{FEATURE}-001]
---

# OPS: {feature-name}

## 0. 対応するSPEC / IMPL [必須]

## 1. デプロイ手順 [必須]
### 1.1 前提条件
### 1.2 手順（番号付き、コマンド含む）
### 1.3 デプロイ後確認

## 2. ロールバック手順 [必須]
### 2.1 ロールバック条件
### 2.2 手順

## 3. 監視項目 [必須]
表形式: メトリクス名 / 正常範囲 / アラート条件 / 通知先

## 4. SLO [必須]
表形式: SLI / 目標値 / 測定方法 / エラーバジェット

## 5. 障害対応 Runbook [必須、3症状以上]
### 5.1 症状: <よくある障害パターン>
- 一次対応:
- エスカレーション:
- 再発防止:

## 6. 定期メンテナンス [該当時]

## 7. バックアップ・リストア [該当時]
### 7.1 対象・頻度
### 7.2 RTO / RPO

## 8. 権限管理 [app/api プロファイルで必須]

## 9. 制御機構の使い分け原則 [必須]

> ADF 原則 0 (script 制御絶対) の運用視点。本 feature の運用機構が原則と整合していることを明記する。
> Canonical reference: [script 制御 vs Boris 式 Hook — 使い分け原則 (ADF 原則 0 整合)](https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4)

### 9.1 採択原則 (運用視点)
- **default**: script 制御 (daemon / cron / launchd / pg trigger / GH Actions)
- **fallback**: Boris 式 Hook、不可避 4 case のみ:
  1. tool 呼出 BLOCK (PreToolUse)
  2. LLM context 注入 (UserPromptSubmit / SessionStart)
  3. session 起動時 state 復元 (SessionStart)
  4. tool 実行直後の検証 (PostToolUse)

### 9.2 本 feature の運用機構
SPEC §10 (制御機構選定原則) を参照、運用視点で補足する場合は本節に追記。

## 10. トレース [必須]
