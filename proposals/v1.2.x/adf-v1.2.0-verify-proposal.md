# VERIFY: 4層ドキュメント体系導入

## 0. 対応するSPEC / IMPL

- SPEC-ID: SPEC-DOC4L-001〜007
- IMPL-ID: IMPL-DOC4L-001

---

## 1. 機能テスト（Gherkin）

### 1.1 [VERIFY-DOC4L-001] 正常系: 4ファイル雛形生成

```gherkin
Feature: framework init-feature
  Scenario: 新規 feature の雛形が4ファイル生成される
    Given 作業ディレクトリが空のプロジェクトルート
    And `.framework/config.json` に docs_layers.enabled = true
    When `framework init-feature auth` を実行
    Then 終了コード 0 で終了
    And docs/spec/auth.md, docs/impl/auth.md, docs/verify/auth.md, docs/ops/auth.md の4ファイルが生成される
    And 各ファイルに YAML Front Matter のひな形が含まれる
    And 各ファイルに必須節のヘッダーが含まれる
    And spec/auth.md の id は "SPEC-AUTH-001" である
```

### 1.2 [VERIFY-DOC4L-002] 正常系: トレーサビリティ検証 PASS

```gherkin
Feature: framework trace verify
  Scenario: 全層のIDが対応している場合PASS
    Given docs/spec/auth.md に SPEC-AUTH-001 が定義されている
    And docs/impl/auth.md の traces.spec に SPEC-AUTH-001 が含まれる
    And docs/verify/auth.md の traces.spec に SPEC-AUTH-001 が含まれる
    And docs/ops/auth.md の traces.spec に SPEC-AUTH-001 が含まれる
    When `framework trace verify` を実行
    Then 終了コード 0 で終了
    And レポートに "PASS: 4/4 nodes traced" が含まれる
```

### 1.3 [VERIFY-DOC4L-003] 異常系: SPEC に対応する IMPL なし

```gherkin
Feature: framework trace verify
  Scenario: SPECに対応するIMPLが欠落している場合BLOCK
    Given docs_layers.enabled = true
    And docs/spec/auth.md に SPEC-AUTH-002 が定義されている
    And docs/impl/auth.md に IMPL-AUTH-002 が定義されていない
    When `framework trace verify` を実行
    Then 終了コード 1 で終了
    And レポートに "CRITICAL: SPEC-AUTH-002 → IMPL 未定義" が含まれる
```

### 1.4 [VERIFY-DOC4L-004] 異常系: 存在しない ID を参照

```gherkin
Feature: framework trace verify
  Scenario: IMPLが存在しないSPEC IDを参照している場合BLOCK
    Given docs/impl/auth.md の traces.spec に SPEC-AUTH-999 が含まれる
    And docs/spec/auth.md に SPEC-AUTH-999 が存在しない
    When `framework trace verify` を実行
    Then 終了コード 1 で終了
    And レポートに "CRITICAL: BrokenReference IMPL-AUTH-001 → SPEC-AUTH-999" が含まれる
```

### 1.5 [VERIFY-DOC4L-005] Gate 0 統一閾値（CRITICAL）

```gherkin
Feature: framework gate spec
  Scenario: 受入基準節が空の項目を検出（CRITICAL）
    Given docs/spec/auth.md の §4.1 に SPEC-AUTH-001 がある
    And docs/spec/auth.md の §7 に SPEC-AUTH-001 の受入基準が書かれていない
    When `framework gate spec` を実行
    Then 終了コード 1 で終了
    And レポートに "CRITICAL: SPEC-AUTH-001: 受入基準 (§7) が未記入" が含まれる
```

### 1.6 [VERIFY-DOC4L-005-2] Gate 0 統一閾値（WARNING ≤ 3 で PASS）

```gherkin
Feature: framework gate spec
  Scenario: WARNINGが3以下ならPASS
    Given docs/spec/auth.md の §4 全項目に §7 の受入基準がある
    And §2 非目的が空（WARNING 1）
    And §8 前提・依存が空（WARNING 2）
    And §9 リスクが空（WARNING 3）
    When `framework gate spec` を実行
    Then 終了コード 0 で終了
    And レポートに "PASS: CRITICAL=0, WARNING=3/3" が含まれる

  Scenario: WARNINGが4以上ならBLOCK
    Given WARNING 4 件の状態
    When `framework gate spec` を実行
    Then 終了コード 1 で終了
    And レポートに "BLOCK: WARNING 4 > 3" が含まれる
```

### 1.7 [VERIFY-DOC4L-006] マイグレーション

```gherkin
Feature: framework migrate-to-v1.2
  Scenario: v1.1.xプロジェクトを4層体系に変換
    Given ADF v1.1.x で運用中のプロジェクトに docs/ssot.md のみ存在
    And docs/ssot.md に "## Feature: auth" と "## Feature: billing" の 2 feature が含まれる
    When `framework migrate-to-v1.2` を実行
    Then 終了コード 0
    And docs/spec/auth.md, docs/spec/billing.md が生成される
    And 同様に impl/, verify/, ops/ にも 2 ファイルずつ生成される
    And `.framework/config.json` に docs_layers.enabled = true が追記される
    And 雛形の id は "SPEC-AUTH-001", "SPEC-BILLING-001" 等で採番されている
    And `.framework/reports/migration-*.md` に 8 ファイル生成のレポートが含まれる

  Scenario: dry-run で事前確認
    Given 同じプロジェクト状態
    When `framework migrate-to-v1.2 --dry-run` を実行
    Then 終了コード 0
    And ファイルは生成されない
    And 標準出力に生成予定ファイル一覧が表示される
```

### 1.8 [VERIFY-DOC4L-007] 強制力 ON/OFF 二値

```gherkin
Feature: docs_layers.enabled ON/OFF
  Scenario: OFFの場合はv1.1互換
    Given `.framework/config.json` に docs_layers.enabled = false
    When `framework trace verify` を実行
    Then 終了コード 0
    And レポートに "INFO: v1.1 互換モード、4層検証スキップ" が含まれる
    And `framework gate quality` は従来どおり docs/ssot.md を参照する

  Scenario: 未設定の場合もv1.1互換
    Given `.framework/config.json` に docs_layers セクションなし
    When `framework trace verify` を実行
    Then 終了コード 0（v1.1 互換モードとして動作）

  Scenario: ONの場合、中間グラデーションオプションは存在しない
    Given `.framework/config.json` に docs_layers.strict = "partial"
    When CLI コマンドを実行
    Then 終了コード 2
    And エラーメッセージに "docs_layers.strict は v1.2 で廃止。enabled: true/false のみ" が含まれる
```

### 1.9 [VERIFY-DOC4L-008] STRIDE N/A 理由必須

```gherkin
Feature: framework gate spec - STRIDE validation
  Scenario: STRIDE項目が単なる「N/A」の場合BLOCK（app/api プロファイル）
    Given `.framework/config.json` に profile = "app"
    And docs/spec/auth.md §6.3.1 Spoofing 欄に "N/A" のみ記入（理由なし）
    When `framework gate spec` を実行
    Then 終了コード 1
    And レポートに "CRITICAL: SPEC-AUTH §6.3.1 Spoofing = N/A（理由不明）。N/A の場合は理由を記述せよ" が含まれる

  Scenario: 「N/A: 理由」形式ならPASS
    Given §6.3.1 Spoofing 欄に "N/A: CLI ツール、認証対象なし" と記入
    When `framework gate spec` を実行
    Then 該当項目は PASS（他項目が条件を満たせば全体も PASS）

  Scenario: cli/library/mcp-server プロファイルではSTRIDE任意
    Given profile = "library"
    And §6.3 セクションが丸ごと空
    When `framework gate spec` を実行
    Then 該当項目は WARNING（BLOCK ではない）
```

### 1.10 [VERIFY-DOC4L-009] ID 100 超過で WARNING

```gherkin
Feature: framework trace verify - oversized feature
  Scenario: 1 feature の ID が 100 超過で WARNING
    Given docs/spec/auth.md に SPEC-AUTH-001〜SPEC-AUTH-101 の 101 項目
    When `framework trace verify` を実行
    Then 終了コード 0（閾値内なら PASS）
    And レポートに "WARNING: feature 'auth' の ID 数 101 が 100 を超過。feature 分割を検討せよ" が含まれる
```

### 1.11 [VERIFY-DOC4L-原則0] 全CLIコマンドがLLM非依存

```gherkin
Feature: Principle #0 - script-only control
  Scenario: CLI 実装に LLM 呼び出しが存在しない
    Given ADF v1.2.0 のソースコード
    When test/principle0.test.ts を実行
    Then src/cli/commands/ 配下の全ファイルで以下のパターンが検出されない:
      - "claude -p"
      - "spawn('claude'"
      - "openai" (case insensitive)
      - "codex"
      - "Anthropic("
    And src/cli/lib/ 配下も同様
    And Validator 呼び出しは `.claude/agents/validators/*.md` 参照経由に限定されている
```

---

## 2. 境界値テスト

| 項目 | 境界 | 期待値 |
|---|---|---|
| feature 名の長さ | 0 文字 | エラー（終了コード 2） |
| feature 名の長さ | 1 文字 | 成功 |
| feature 名の長さ | 64 文字 | 成功 |
| feature 名の長さ | 65 文字 | エラー（終了コード 2） |
| feature 名の文字種 | 英数字+ハイフン | 成功 |
| feature 名の文字種 | スペース含み | エラー（終了コード 2） |
| feature 名の文字種 | 日本語 | エラー（ASCII のみ許可） |
| ドキュメント数 | 0 件 | PASS（空プロジェクト扱い） |
| ドキュメント数 | 100 件 | 5 秒以内で完了 |
| ドキュメント数 | 1000 件 | 60 秒以内で完了 |
| ID 連番（1 feature 内） | 099 | PASS |
| ID 連番（1 feature 内） | 100 | PASS + WARNING（101 から WARNING） |
| ID 連番（1 feature 内） | 999 | PASS + WARNING |
| ID 連番（1 feature 内） | 1000 | エラー（3桁固定） |
| Gate 0 WARNING 件数 | 3 | PASS |
| Gate 0 WARNING 件数 | 4 | BLOCK |
| マイグレーション対象 feature 数 | 1 | 成功 |
| マイグレーション対象 feature 数 | 100 | 30 秒以内で完了 |
| マイグレーション対象 feature 数 | 1000 | エラーまたは警告（実用範囲外） |

## 3. 異常系テスト

| 入力 | 期待するエラー | エラーコード |
|---|---|---|
| 既存 feature 名で `init-feature`（`--force` なし） | FeatureAlreadyExists | 2 |
| Front Matter が YAML 不正 | InvalidFrontMatter | 1 |
| id が重複（例: SPEC-AUTH-001 が2ファイル） | DuplicateId | 1 |
| traces の参照先レイヤーが不正（例: `xyz:`） | InvalidTraceLayer | 1 |
| `--dir` に `../../etc` 等の外部パス | PathOutOfScope | 2 |
| config.json で `docs_layers.enabled` が非 boolean | ConfigValidationError | 2 |
| config.json で `docs_layers.strict` フィールド（廃止） | DeprecatedConfigField | 2 |
| マイグレーション先に既存ファイル（`--force` なし） | MigrationConflict | 2 |
| SSOT が feature 境界を抽出できない構造 | SsotParseError | 2 |
| STRIDE で app/api プロファイルかつ全項目 N/A（理由なし） | STRIDE_NA_WithoutReason | 1 |

## 4. 認証/認可テスト

該当なし（CLI ツール）。

## 5. パフォーマンステスト

| 項目 | 基準値 | 計測方法 |
|---|---|---|
| `init-feature` 実行時間 | 1 秒以内 | time コマンドで 10 回平均 |
| `trace verify`（10 feature） | 1 秒以内 | 同上 |
| `trace verify`（100 feature） | 5 秒以内 | 同上 |
| `trace verify`（1000 feature） | 60 秒以内 | 同上 |
| `migrate-to-v1.2`（10 feature） | 3 秒以内 | 同上 |
| `migrate-to-v1.2`（100 feature） | 30 秒以内 | 同上 |
| `gate spec`（10 feature） | 3 秒以内 | 同上 |
| `trace graph --format mermaid`（100 feature） | 3 秒以内 | 同上 |

## 6. セキュリティテスト（STRIDE / OWASP 参照）

| 攻撃ベクタ | STRIDE | OWASP | 想定結果 |
|---|---|---|---|
| `framework init-feature "../evil"` | Elevation | A01 | PathOutOfScope エラー |
| `framework trace verify --dir /etc` | Elevation | A01 | PathOutOfScope エラー |
| Front Matter に `!!python/object/new` 等のコード実行タグ | Tampering | A03/A08 | InvalidFrontMatter（SAFE_SCHEMA により無視） |
| 巨大な Front Matter（100MB） | DoS | - | サイズ上限エラー（1MB 上限） |
| YAML 無限ループ | DoS | - | タイムアウトエラー（5 秒） |
| ドキュメント内への秘密情報ハードコード | Info Disclosure | A02 | security-scanner 拡張で検出 |
| マイグレーション時の書き込み先パス改ざん | Tampering / Elevation | A01 | whitelist 検証で拒否 |

## 7. Definition of Done

- [ ] 全 Gherkin シナリオ（1.1〜1.11）が vitest として実装され PASS
- [ ] 境界値・異常系テストが vitest で実装され PASS
- [ ] パフォーマンステスト PASS（Mac mini M2 基準）
- [ ] セキュリティテスト PASS
- [ ] `framework gate quality` が本改修自身に対して PASS（dogfooding）
- [ ] `framework gate release`（Gate 3）が本改修の PR に対して SHIP 判定
- [ ] 既存テスト全 1,458 件が引き続き PASS（回帰なし）
- [ ] テンプレート4層が `templates/project/docs/` に配置されている
- [ ] `docs/specs/07_DOCUMENTATION_v1.2.0.md` が SSOT として Drive に配置
- [ ] CHANGELOG.md に v1.2.0 のエントリ追加
- [ ] README.md の CLI コマンド一覧に新規コマンド追加
- [ ] haishin-puls-hub の未着手 feature 1 件で実戦適用し、漏れ検出精度を計測（SPEC→IMPL 未対応の真陽性 95% 以上）
- [ ] haishin-puls-hub で `migrate-to-v1.2` を実戦適用し、既存 12 feature のマイグレーション精度を計測（手動修正 30% 以下）
- [ ] `test/principle0.test.ts` で LLM 非依存が静的担保されている

## 8. トレース

- SPEC: SPEC-DOC4L-001〜007
- IMPL: IMPL-DOC4L-001
- OPS: OPS-DOC4L-001, OPS-DOC4L-002
