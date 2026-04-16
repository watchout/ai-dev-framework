# ADF ロードマップ

## v1.0 — OSS公開（現在）

### 完了
- 改善#1-#6（自己進化型CLAUDE.md、notes/、Plan Mode 80/20、Gate 1/3実戦テスト、Auto-remediation、git worktree並列）
- 改修A-E（Validator出力検証、偽テスト機械検出、pre-commit、LLMプロバイダー抽象化、Gate結果JSON出力）
- Gate Aプロファイル拡張（app/api/mcp-server/cli/library）
- プリフライトチェック（scripts/preflight-check.sh）
- 破壊的変更検出（scripts/detect-breaking-changes.sh + CI workflow）
- 監査深度コントロール Layer 0/1/2（governance-flow.md）
- CI修復（PR #53）

### 残り
- PR #52 merge（verdict:"SHIP"除去のcycle 2確認→merge）
- OSS公開 Step 1: 内部情報クリーンアップ
- OSS公開 Step 2: README + LICENSE + CONTRIBUTING
- OSS公開 Step 3: サンプルプロジェクト
- OSS公開 Step 4: GitHub Actions CI
- OSS公開 Step 5: npmパッケージ準備
- OSS公開 Step 6: セキュリティ監査（route:ceo-approval）
- OSS公開 Step 7: GitHub Public化（CEO手動実行）

### Open PR判断
- PR #51 (FEAT-201 framework modify/coherence): v1.1送り。保留（closeしない）
- PR #44 (framework-runner): close。--auto相当。CEO決定に反する

---

## v1.1 — CLI化 + 品質強化

### CLI化（スクリプト→frameworkコマンド）
- `framework preflight` — 必読資料チェック（scripts/preflight-check.sh のCLI化）
- `framework audit-level <PR>` — PRタイプからLayer自動判定
- `framework audit-checklist <PR>` — Layer 1チェックリスト生成
- `framework audit-report <PR>` — 監査レポート提出（--output json対応）
- `framework check drift` — SSOT drift検出（SSOT機械可読化が前提）
- `framework modify` — SSOT自動更新（PR #51のv1.1再開）
- `framework coherence` — SSOT-実装整合性チェック（PR #51のv1.1再開）

### 品質強化
- TypeScript AST解析化（現状の正規表現ベース偽テスト検出をAST化）
- SSOT機械可読化（Markdownの仕様書をJSON Schemaで構造化）
- Freeze進行チェックの決定論化（F1-F4の進行状態を機械判定）
- Gemini CLI対応（LLMプロバイダーにGemini追加）
- Gate 3起訴チェックリスト（Prosecutorの検査項目を固定化）
- CLAUDE.md → ESLint変換（ルールをESLint pluginとして機械強制）
- スキルチェックポイント（スキル実行中の中間状態保存）

### 依存関係
```
SSOT機械可読化 → framework check drift
                → framework coherence（PR #51再開）
                → Freeze進行チェックの決定論化

scripts/preflight-check.sh → framework preflight

改修B（偽テスト正規表現）→ TypeScript AST解析化
```

---

## v1.2 — MCP化 + agent-com統合

### MCP tool化（CLI→MCP server）
- preflight_verify — 必読資料チェック（framework preflightをMCP tool化）
- breaking_change_detect — 破壊的変更検出
- audit_level / audit_checklist / audit_report — 監査ツール群
- gate_quality / gate_release — Gate 2/3のMCP tool化

### agent-com統合
- タスクdispatch前にpreflight_verifyを自動呼び出し（実装者がスキップ不可）
- governance chainのMCP化（reviewer chainの自動進行）
- Gate結果のagent-com通知連携

### 依存関係
```
v1.1 CLI化 → v1.2 MCP化（MCP toolはCLIコマンドの薄いラッパー）
agent-com安定稼働 → agent-com統合
```

---

## v2.0 — Dashboard + 有料プラン

### Dashboard（Pro/Enterprise）
- Gate結果の可視化（時系列、プロジェクト横断）
- テスト品質トレンド
- SSOT drift傾向分析
- チーム別の品質スコア

### Custom Validators（Pro/Enterprise）
- ユーザー定義のValidator追加
- 業界固有のルールセット（HIPAA、SOC2等）

### Enterprise機能
- SSO/RBAC
- コンプライアンスレポート
- オンプレミス対応
- 監査ログ

---

## 価格（確定）

| | Community | Pro | Enterprise |
|---|---|---|---|
| 価格 | 無料 | $49/dev/月 | $149/dev/月 |
| CLI全機能 | ✅ 制限なし | ✅ | ✅ |
| Dashboard | — | ✅ | ✅ |
| Custom Validators | — | ✅ | ✅ |
| SSO/RBAC/コンプライアンス | — | — | ✅ |

CLI機能制限なし原則。有料は「可視化・チーム管理・ガバナンス」のみ。

---

## 実行の原則

- 実装は開発bot（@iyasaka_airules_bot）が実行。CTO botは判断層
- 全指示のSSOTはGoogle Drive（IYASAKA:開発/ADF/）に配置
- 仕様書にない機能を追加する場合は docs/proposals/ に追記提案を出力
- バージョン境界を越えない（v1.1の機能をv1.0に入れない）
