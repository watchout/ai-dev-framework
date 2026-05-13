# SPEC: 4層ドキュメント体系導入

## 0. メタ

- ID: SPEC-DOC4L-001
- Status: Draft
- 作成日: 2026-04-20
- 関連ADR: ADR-017（4層ドキュメント体系の採用判断）
- 対応リポジトリ: `~/Developer/ai-dev-framework`
- 対応バージョン: ADF v1.2.0

---

## 原則 0 (Principle #0): スクリプト制御絶対

本仕様および実装は、例外なく以下の原則に従う。

- **フロー制御は全てスクリプト**: bash/TypeScript で記述された決定論的コード。LLM が「次に何をするか」を決める箇所を作らない
- **データ検証は全てスクリプト**: 正規表現、YAML パース、AST による決定論的検証。LLM による意味論的判断は使わない
- **ファイル生成は全てスクリプト**: テンプレート展開、雛形生成、マイグレーション出力
- **内容の質判定のみ LLM 可**: ただしスクリプトから呼び出される Validator として限定。いつ・どの順で・どの入力で呼ばれるかはスクリプトが完全に制御
- **マイグレーションもスクリプト**: 既存 SSOT の雛形変換は正規表現ベース、中身は人間が記入

この原則に反する設計は、本仕様の他節に優先して BLOCK する。

---

## 1. 目的 (Goals)

ADF 適用プロジェクトにおいて、SSOT から issue（タスク）への分解時に発生する**仕様漏れを決定論的に検出可能にする**。設計（What）と実装（How）の間に「施工図」に相当する中間層を導入し、検証・運用の2層を加えた4層のドキュメント体系を必須化する。

## 2. 非目的 (Non-goals)

- 既存プロジェクトのドキュメントを手動で4層に書き換える運用（マイグレーションツールで自動足場生成）
- 自然言語の意味論的整合性検証（原則0によりスクリプト制御に限定）
- PDF/Word 等のリッチ形式サポート（Markdown + OpenAPI + Gherkin のみ）
- 「部分適用」「段階適用」モード（ON/OFF 二値のみ）

## 3. ユーザーストーリー

- ADF 利用開発者として、新規 feature 着手時に SPEC/IMPL/VERIFY/OPS の4ファイル雛形が生成され、実装前に全項目が埋まっていることを強制されたい
- 既存プロジェクトオーナーとして、マイグレーションツール 1 コマンドで全既存 feature の4層雛形が生成され、v1.2 移行の足場が整ってほしい
- レビュワーとして、PR 時に SPEC↔IMPL↔VERIFY↔OPS のトレーサビリティが機械検証されていることを知りたい
- 運用者として、本番デプロイ前に OPS の必須項目（Runbook、SLO、監視項目）が埋まっていることを保証したい
- セキュリティ監査対応者として、大手監査で STRIDE と OWASP Top 10 のマッピングが即答できる状態でありたい

## 4. 機能要件 (Core)

### 4.1 [SPEC-DOC4L-001] 4層ドキュメント体系の定義

| 層 | 建築対応 | 問いに答える | 格納先 |
|---|---|---|---|
| SPEC | 設計図 | What を作るか | `docs/spec/<feature>.md` |
| IMPL | 施工図 | How で作るか | `docs/impl/<feature>.md` |
| VERIFY | 検査書 | どう確かめるか | `docs/verify/<feature>.md` |
| OPS | 運用書 | どう動かすか | `docs/ops/<feature>.md` |

### 4.2 [SPEC-DOC4L-002] 4層テンプレートの必須節

各層の必須節は IMPL-DOC4L-001 付録 A に定義。テンプレートは `templates/project/docs/{spec,impl,verify,ops}/_template.md` に配置し、`framework init-feature <n>` で4ファイル同時生成。ID 体系は 3 桁固定（001〜999）。

### 4.3 [SPEC-DOC4L-003] トレーサビリティ

各層のドキュメントに一意 ID を付与。形式 `{LAYER}-{FEATURE}-{NNN}`（例: SPEC-AUTH-001 → IMPL-AUTH-001 → VERIFY-AUTH-001 → OPS-AUTH-001）。

- SPEC の全 ID に対応する IMPL ID が存在すること
- IMPL の参照先 SPEC ID が実在すること
- VERIFY の全 ID が対応する SPEC ID を持つこと
- OPS の ID は SPEC の非機能要件に対応すること（SLO 要件がある場合は必須）
- **1 feature 内の ID が 100 を超えた場合、Gate 1 で WARNING**（feature 分割の推奨）

### 4.4 [SPEC-DOC4L-004] 機械検証コマンド

`framework trace verify` を新設。原則0に従い正規表現＋YAML Front Matter のみで決定論的に動作。

### 4.5 [SPEC-DOC4L-005] Gate 統合と統一閾値

Gate 閾値は**対象の性質から導出**する（恣意ではなく原則）。

| Gate | 対象 | 閾値 |
|---|---|---|
| Gate 0（新設） | 設計単体（SPEC） | CRITICAL=0、WARNING ≤ 3 |
| Gate 1（拡張） | 設計整合性（SPEC↔IMPL トレース） | CRITICAL=0、WARNING ≤ 3 |
| Gate 2（拡張） | 実装（IMPL↔コード） | CRITICAL=0、WARNING ≤ 5 |
| Gate 3（既存） | リリース可否 | SHIP / CONDITIONS / BLOCK |
| Gate D（拡張） | 本番 | BLOCK / PASS 二値 |

設計フェーズ（Gate 0/1）は同一閾値（検査対象が設計書のみ）、実装フェーズ（Gate 2）は表面積に応じて拡大、リリース判断（Gate 3）のみ 3 値（条件付き合格が必要）、本番（Gate D）は 2 値（本番に WARNING は存在しない）。

### 4.6 [SPEC-DOC4L-006] マイグレーションツール

既存 v1.1.x プロジェクトが v1.2 に踏み切れるように、`framework migrate-to-v1.2` を v1.2.0 必須スコープとする。既存 SSOT を正規表現でスキャンし、feature 単位の 4 層雛形を自動生成する**純粋スクリプト**。雛形の中身（Gherkin シナリオ、型定義、SLO 数値等）は人間が記入。

### 4.7 [SPEC-DOC4L-007] 強制力は ON/OFF 二値

`docs_layers.enabled: true/false` のみ。中間グラデーション（`strict: partial` 等）は提供しない。

- `enabled: false` → ADF v1.1 互換モード（v1.2 機能全無効、`docs/ssot.md` 運用）
- `enabled: true` → v1.2 機能全有効、全 feature が 4 層必須。トレース未対応は Gate 1 で BLOCK

理由: 中途半端な適用は真陽性率は維持するが、IMPL 有無の混在により実装者の認知負荷と系の一貫性が崩壊する。ON にするなら全面適用、できないなら OFF のまま v1.1 互換で運用する。

## 5. インターフェース (Contract)

### 5.1 ファイルフォーマット

各4層ドキュメントは YAML Front Matter + Markdown。

```yaml
---
id: IMPL-AUTH-001
traces:
  spec: [SPEC-AUTH-001, SPEC-AUTH-002]
  verify: [VERIFY-AUTH-001]
  ops: [OPS-AUTH-001]
status: Draft | Frozen | Deprecated
---
```

### 5.2 CLI 契約

```bash
framework init-feature <n>           # 4ファイル雛形生成
framework trace verify                   # トレーサビリティ検証（純粋スクリプト）
framework trace graph                    # Mermaid形式のトレースグラフ出力
framework gate spec                      # Gate 0 新設
framework migrate-to-v1.2                # v1.1→v1.2 マイグレーション（純粋スクリプト）
```

### 5.3 DB スキーマ

なし（ファイルベース運用）。

## 6. 非機能要件 (Detail)

### 6.1 性能

- `framework trace verify` は 100 feature 規模で 5 秒以内
- `framework init-feature` は 1 秒以内
- `framework migrate-to-v1.2` は 100 feature 規模で 30 秒以内

### 6.2 可用性 (SLO)

CLI なので該当なし。`trace verify` の誤検出率（偽陽性）は 1% 以下を目標。

### 6.3 セキュリティ要件（大手監査対応レベル）

本改修自体のセキュリティ要件。また本改修が**ADF 利用プロジェクトの SPEC テンプレートに強制する**セキュリティ節立てもこの構造に準ずる。

#### 6.3.1 脅威モデル (STRIDE)

| カテゴリ | 本改修での該当 |
|---|---|
| Spoofing | N/A（CLI ツール、認証対象なし） |
| Tampering | テンプレートファイル改ざん → CLI 同梱版フォールバックで緩和 |
| Repudiation | N/A（監査ログは .framework/reports に残す） |
| Information Disclosure | Front Matter への秘密情報ハードコード → security-scanner 拡張で検出 |
| Denial of Service | 巨大 Front Matter / 無限ループ → サイズ上限 1MB、パース 5 秒タイムアウト |
| Elevation of Privilege | パストラバーサル → path.relative で外部書き込み防止 |

**「N/A」は理由を明記。単なる N/A は Gate 0 で BLOCK。**

#### 6.3.2 OWASP Top 10:2021 マッピング

- A01:2021 Broken Access Control → N/A（CLI、権限対象なし）
- A03:2021 Injection → YAML SAFE_SCHEMA でコード実行回避
- A08:2021 Software and Data Integrity Failures → テンプレート改ざん対策（§6.3.1 Tampering 参照）

#### 6.3.3 データ分類

- 本改修が扱うデータ: **公開**（Markdown ドキュメント、CLI 出力ログ）
- 該当なし区分: PII / PCI / 機密

#### 6.3.4 SPEC テンプレートへの強制

IMPL-DOC4L-001 付録 A の SPEC テンプレート §6.3 は §6.3.1〜6.3.3 と同じ構造を必須節とする。profile = `app` / `api` では必須、`cli` / `library` / `mcp-server` では任意。

### 6.4 監査ログ要件

- `framework trace verify` 実行結果を `.framework/reports/trace-verify-YYYYMMDD.md`
- `framework migrate-to-v1.2` 実行結果を `.framework/reports/migration-YYYYMMDD.md`（生成ファイル一覧、スキップ理由）

## 7. 受入基準 (Acceptance Criteria)

### 7.1 [SPEC-DOC4L-001] 4層体系

```gherkin
Given ADF v1.2.0 がインストール済みのプロジェクト
And `.framework/config.json` に docs_layers.enabled = true
When 開発者が `framework init-feature auth` を実行
Then 終了コード 0 で終了
And docs/spec/auth.md, docs/impl/auth.md, docs/verify/auth.md, docs/ops/auth.md の4ファイルが生成される
And 各ファイルには YAML Front Matter のひな形が含まれる
And 各ファイルには必須節のヘッダーが含まれる
```

### 7.2 [SPEC-DOC4L-003] トレーサビリティ（ID 100 超過 WARNING）

```gherkin
Given SPEC に SPEC-AUTH-001〜SPEC-AUTH-101 の 101 項目が定義
When `framework trace verify` を実行
Then 終了コード 0（PASS）
And レポートに "WARNING: feature 'auth' の ID 数が 100 を超過。feature 分割を検討せよ" が含まれる
```

### 7.3 [SPEC-DOC4L-005] Gate 0 統一閾値

```gherkin
Given SPEC に 5 項目あり、そのうち 1 項目が §7 の Gherkin を持たない
When `framework gate spec` を実行
Then 終了コード 1（BLOCK）
And レポートに "CRITICAL: 1 項目の受入基準が欠落" が含まれる

Given SPEC に 10 項目あり、全項目に受入基準があるが §2 非目的・§8 前提・§9 リスクが空（WARNING 3 件）
When `framework gate spec` を実行
Then 終了コード 0（PASS、WARNING ≤ 3）
```

### 7.4 [SPEC-DOC4L-006] マイグレーション

```gherkin
Given ADF v1.1.x で運用中のプロジェクトに docs/ssot.md のみ存在
When `framework migrate-to-v1.2` を実行
Then 終了コード 0
And docs/spec/, docs/impl/, docs/verify/, docs/ops/ の 4 ディレクトリが生成される
And 既存 SSOT から推定された feature ごとに 4 ファイルの雛形が生成される
And `.framework/config.json` に docs_layers.enabled = true が追記される
And 雛形の ID は連番で採番されている
And `.framework/reports/migration-*.md` に生成ファイル一覧が記録される
```

### 7.5 [SPEC-DOC4L-007] 強制力 ON/OFF

```gherkin
Given `.framework/config.json` に docs_layers.enabled = false
When `framework trace verify` を実行
Then 終了コード 0
And レポートに "INFO: v1.1 互換モード、4層検証スキップ" が含まれる

Given docs_layers.enabled = true かつ docs/spec/ に 1 feature があるが docs/impl/ に対応ファイルなし
When `framework trace verify` を実行
Then 終了コード 1（BLOCK）
And レポートに "CRITICAL: SPEC-<FEATURE>-001 に対応する IMPL なし" が含まれる
```

### 7.6 [SPEC-DOC4L-原則0] 全 CLI コマンドが LLM 非依存

```gherkin
Given ADF v1.2.0 のソースコード
When 静的解析で init-feature / trace / gate spec / migrate-to-v1.2 の実装を検査
Then CLI コマンドの実装コードに LLM 呼び出し（claude -p, OpenAI API, Codex 等）が含まれない
And Validator 呼び出しはスクリプトから関数として呼ばれる形に限定される
```

## 8. 前提・依存

- ADF v1.1.0 の SSOT 3-Layer 構造が migrate-to-v1.2 の入力として読めること
- Gate 1/2/3 の既存実装が動作していること
- `.framework/config.json` の `profile` フィールドが利用可能（v1.1 で導入済み）
- 既存 `docs/ssot.md` 形式が feature 境界を正規表現で抽出可能なレベルで構造化されていること

## 9. リスクと緩和策

| リスク | 影響 | 確率 | 緩和策 |
|---|---|---|---|
| 4ファイル強制で形骸化 | 高 | 中 | 雛形自動生成 + マイグレーション + 必須節の最小化 |
| 既存プロジェクトで ON 切替後に BLOCK 連発 | 中 | 高 | マイグレーション必須、ツール通過後のみ ON 推奨 |
| IMPL 内容が SPEC と重複して二重管理 | 中 | 中 | IMPL は「型・境界・取り合い」に絞り、仕様は SPEC 参照 |
| STRIDE 必須化で「N/A」乱発 | 中 | 中 | N/A は理由必須。理由欠落は Gate 0 で BLOCK |
| マイグレーション精度が低く手動修正多発 | 高 | 中 | v1.2.0 リリース前に haishin-puls-hub で実戦適用、精度測定 |
| OSS 公開前スコープが膨張 | 高 | 高 | v1.2.0 = IMPL + trace + Gate 0/1 拡張 + migration の 4 点に固定、他は v1.2.1 以降 |
