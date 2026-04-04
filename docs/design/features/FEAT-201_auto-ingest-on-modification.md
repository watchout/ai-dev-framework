# FEAT-201 修正指示時の自動Ingest処理 - 機能仕様書（SSOT）

> バージョン: 1.0
> ステータス: Draft
> 最終更新: 2026-04-03
> 作成者: ADF Dev Bot
> 承認者: CTO
> 親タスク: PT-INGEST

---

## 完全性チェックリスト（実装開始前に全項目 ✅ が必須）

> **このチェックリストが全て ✅ でない場合、実装を開始してはならない。**

| # | セクション | 必須 | 状態 | 備考 |
|---|-----------|------|------|------|
| 1 | §1 文書情報 | ✅ | ✅ | ID, バージョン, ステータス |
| 2 | §2 機能概要 [CORE] | ✅ | ✅ | 目的, スコープ, ストーリー |
| 3 | §3 機能要件 | ✅ | ✅ | MUST要件が3つ以上 |
| 4 | **§3-E 入出力例** | ✅ | ✅ | **最低5ケース（正常2+異常3）** |
| 5 | **§3-F 境界値** | 任意(CLI) | ✅ | **CLIプロファイル: 任意だが記載** |
| 6 | **§3-G 例外応答** | ✅ | ✅ | **全エラーケースの応答定義** |
| 7 | **§3-H Gherkin テスト** | ✅ | ✅ | **全MUST要件のシナリオ** |
| 8 | §4 データ仕様 [CONTRACT] | ✅ | ✅ | 項目, 型, バリデーション |
| 9 | §5 API仕様 [CONTRACT] | ✅ | ✅ | CLI コマンドIF定義 |
| 10 | §6 UI仕様 | 任意(CLI) | ☐ | CLIプロファイル: 該当なし |
| 11 | §7 ビジネスルール [CORE] | ✅ | ✅ | 条件→アクション |
| 12 | §8 非機能要件 [DETAIL] | ✅ | ✅ | 性能目標が数値 |
| 13 | §9 エラーハンドリング [DETAIL] | ✅ | ✅ | 全エラーケース |
| 14 | §10 テストケース | ✅ | ✅ | 正常/異常/境界値 |
| 15 | §11 依存関係 | ✅ | ✅ | 依存する/される機能 |
| 16 | §12 未決定事項 | ✅ | ✅ | CORE/CONTRACT層のTBD=0 |

> **Freeze 状態:**
> ☐☐☐☐ Freeze 1: Domain ⬜ | Freeze 2: Contract ⬜ | Freeze 3: Exception ⬜ | Freeze 4: NFR ⬜
> 実装可能: No（CTO承認待ち）

---

## §1 文書情報

| 項目 | 内容 |
|------|------|
| 機能ID | FEAT-201 |
| 機能名 | 修正指示時の自動Ingest処理 |
| ジャンル | Design Ingest Pipeline |
| 親タスク | PT-INGEST |
| 優先度 | P1 |
| 種別 | 個別機能（既存機能拡張） |
| 担当 | ADF Dev Bot |
| 推定規模 | M |

### 変更履歴

| バージョン | 日付 | 変更内容 | 変更者 |
|-----------|------|---------|-------|
| 1.0 | 2026-04-03 | 初版作成 | ADF Dev Bot |

### 関連ドキュメント

| ドキュメント | 関係 |
|-------------|------|
| specs/04_FEATURE_SPEC.md | SSOT生成フローの準拠元 |
| specs/03_SSOT_FORMAT.md | SSOT書式定義 |
| specs/05_IMPLEMENTATION.md | 実装順序・タスク分解の準拠元 |
| src/cli/commands/ingest.ts | 既存ingestコマンド（拡張対象） |
| src/cli/lib/ingest-engine.ts | 既存ingestエンジン（拡張対象） |
| src/cli/lib/ingest-model.ts | 既存ingestモデル（拡張対象） |

---

## §2 機能概要 [CORE]

### 2.1 目的

フレームワーク適用済みプロジェクトにおいて、修正指示が来た際にDev Botが直接コード修正するとSSOTと実装が乖離する問題を解決する。修正指示を自動的にingestパイプラインに通し、SSOTを先に更新してから実装する統一フローを構築する。

### 2.2 スコープ

#### 含まれるもの
- 修正指示テキストの `docs/inbox/` 配置 → `framework ingest` による差分SSOT更新フロー
- `framework coherence` コマンド: SSOT と実装コードの整合性チェック機能
- 不一致検出時の自動ingest実行（`framework coherence --auto-fix`）
- `framework modify` コマンド: 修正指示テキストから統一フロー実行のワンストップコマンド

#### 含まれないもの（明示的除外）
- 既存SSOTの手動エディタUI
- GitHub Issues との自動同期（既存の `framework plan --sync` を利用）
- SSOT監査スコアリングの自動化（別チケット）
- コード差分からのSSOT逆生成（将来検討）

### 2.3 ユーザーストーリー

```
フレームワーク適用プロジェクトのDev Bot として、
修正指示を受け取ったらSSOTを先に更新してから実装したい。
なぜなら SSOTと実装の整合性を維持し、仕様のドリフトを防ぎたいから。

受け入れ基準:
- 修正指示テキストからSSOT差分更新が自動生成される
- 既存SSOTの該当セクションのみが更新される（破壊的変更なし）
- SSOT更新後に実装タスクが自動生成される
- SSOTと実装の不一致を検出できる
```

### 2.4 ユーザーフロー

```
【フロー1: 修正指示からの統一フロー】
1. CTO/CEOから修正指示を受信
2. 修正指示テキストを docs/inbox/modification-XXX.md に保存
3. framework modify docs/inbox/modification-XXX.md を実行
   3a. 対象SSOTの特定（AIが指示内容と既存SSOTをマッチング）
   3b. 差分SSOT生成（既存SSOTの該当セクションのみ更新）
   3c. diff表示 → レビュー待ち
4. CTO承認 or framework ingest --approve
5. plan.json更新 → 実装タスク生成
6. framework run で実装

【フロー2: 整合性チェック】
1. framework coherence を実行
2. docs/design/features/ のSSOTと実装コードを比較
3. 不一致リストを出力
4. --auto-fix オプション時: 不一致部分を自動ingestで修正
```

---

## §3 機能要件 [CORE: FR] [DETAIL: 入出力例・境界値]

### RFC 2119 準拠の要件リスト

| 要件ID | レベル | 要件 | 検証方法 |
|--------|--------|------|---------|
| FR-001 | MUST | `framework modify <path>` コマンドが修正指示テキストを受け取り、対象SSOTを特定し、差分更新を生成する | ユニットテスト + 統合テスト |
| FR-002 | MUST | 差分SSOT生成時、既存SSOTの変更対象セクションのみを更新し、それ以外のセクションを保持する | ユニットテスト |
| FR-003 | MUST | `framework coherence` コマンドがSSOTと実装コードの不一致を検出し、不一致リストを出力する | ユニットテスト + 統合テスト |
| FR-004 | MUST | `.framework` ディレクトリが存在しないプロジェクトでは全コマンドがエラーメッセージを出力して終了する | ユニットテスト |
| FR-005 | MUST | 修正指示テキストが空または解析不能な場合、エラーメッセージを出力して終了する | ユニットテスト |
| FR-006 | SHOULD | `framework coherence --auto-fix` が不一致検出時に自動でingest処理を実行してSSOTを更新する | 統合テスト |
| FR-007 | SHOULD | 差分SSOT生成時にdiff形式で変更箇所を表示する | ユニットテスト |
| FR-008 | SHOULD | 対象SSOTが複数マッチした場合、ユーザーに選択肢を提示する | ユニットテスト |
| FR-009 | MAY | `--dry-run` オプションでファイル書き込みなしにプレビューできる | ユニットテスト |
| FR-010 | MUST NOT | 既存SSOTのCORE層（§2, §7）をユーザー承認なしに自動変更してはならない | ユニットテスト |
| FR-011 | MUST | AIのSSOTマッチング結果にconfidence閾値を適用する: >=0.8自動選択、0.5-0.8レビュー警告付き、<0.5マッチなし扱い | ユニットテスト |

### 要件の詳細

#### FR-001: modify コマンド
- **レベル**: MUST
- **説明**: 修正指示テキスト（.md）を入力として受け取り、(1) 既存SSOT群から対象を特定、(2) 影響セクションを分析、(3) 差分SSOTを生成する
- **根拠**: SSOTと実装の乖離防止がプロジェクトの最大課題
- **条件**: `.framework` ディレクトリと `docs/design/features/` に既存SSOTが存在すること
- **検証**: 修正指示から正しいSSOTが特定され、差分が生成されること

#### FR-002: 非破壊的SSOT更新
- **レベル**: MUST
- **説明**: 差分更新は影響セクションのみを対象とし、無関係なセクションの内容を保持する
- **根拠**: 全体再生成すると人間がレビュー済みの内容が失われる
- **検証**: 更新前後のSSOTをdiffし、指定セクション以外に変更がないこと

#### FR-003: coherence チェック
- **レベル**: MUST
- **説明**: SSOTの機能要件（§3）、API仕様（§5）、データ仕様（§4）と実装コードを比較し、不一致を検出する
- **根拠**: 実装ドリフトの早期発見
- **検証**: 意図的に不一致を仕込んだテストケースで検出されること

##### coherence マッチング手法（セクション別）

| 対象セクション | マッチング手法 | 抽出パターン | 検索方式 | 精度 |
|--------------|-------------|------------|---------|------|
| §5 API仕様 | **文字列パターンマッチ** | SSOTからHTTPメソッド+パス（例: `POST /api/v1/login`）を正規表現で抽出 | 実装コードをgrepし、ルーティング定義（Express: `app.post()`, Next.js: `route.ts`等）と突合 | 中〜高 |
| §4 データ仕様 | **物理名grep検索** | SSOTの§4.1データ項目一覧から物理名カラムを抽出 | 実装コード（モデル定義、マイグレーション、型定義）をgrepし、存在確認 | 中 |
| §3 機能要件 | **チェック対象外** | 自然言語のため静的解析困難 | - | - |
| §9 エラーハンドリング | **エラーコードgrep** | SSOTからエラーコード（例: `AUTH_001`）を抽出 | 実装コードをgrepし、定義済みか確認 | 高 |

**設計判断: AST解析を採用しない理由**
1. 言語非依存性: フレームワークはTypeScript/Python/Go等の複数言語プロジェクトに適用される。AST解析は言語別パーサーが必要でメンテコストが高い
2. 費用対効果: エンドポイントパスやデータ物理名の文字列grep検索で実用上十分な精度が得られる
3. 段階的改善: v1は文字列パターンマッチで実装し、精度不足が判明した場合にAST解析を追加する

**grep検索の対象ファイル:**
- `src/**/*.{ts,tsx,js,jsx,py,go}` — ソースコード
- `prisma/**/*.prisma`, `drizzle/**/*.ts` — DBスキーマ
- `**/migrations/**` — マイグレーション
- 除外: `node_modules/`, `dist/`, `.next/`, `__pycache__/`

#### FR-010: CORE層保護
- **レベル**: MUST NOT
- **説明**: §2（機能概要）と§7（ビジネスルール）はCORE層であり、自動変更禁止。変更が必要な場合はレビュー待ちステータスにする
- **根拠**: CORE層はFreeze 1後に変更不可（specs/03_SSOT_FORMAT.md）
- **検証**: CORE層の変更を含む修正指示で、レビュー待ちになること

#### FR-011: Confidence閾値によるマッチングフィルタリング
- **レベル**: MUST
- **説明**: AIがSSOTマッチング時に返すconfidence値に基づき、3段階でフィルタリングする
- **根拠**: 低confidence のマッチを自動適用すると誤ったSSOTを更新するリスクがある
- **閾値定義**:
  | レベル | 範囲 | 動作 |
  |--------|------|------|
  | 高 | confidence >= 0.8 | 自動選択。差分生成を実行 |
  | 中 | 0.5 <= confidence < 0.8 | 差分生成するが「manual review recommended」警告を表示（FR-008と連動） |
  | 低 | confidence < 0.5 | マッチなし扱い（ERR_NO_MATCH）。SKIPログを出力 |
- **検証**: 各閾値レベルで適切な動作をするユニットテスト

---

### §3-E: Example Table（入出力例） [DETAIL]

> **ルール**: 最低5ケース（正常系2 + 異常系3 以上）

| # | 入力 | 条件 | 期待出力 | 備考 |
|---|------|------|---------|------|
| 1 | `framework modify docs/inbox/fix-api-response.md` (API応答フォーマット変更指示) | 正常: 対象SSOT 1件マッチ | 対象SSOTの§5 API仕様セクションに差分生成、diff表示、review状態で保存 | 基本の正常系 |
| 2 | `framework modify docs/inbox/add-validation.md` (バリデーション追加指示) | 正常: §3,§4,§9に影響 | 複数セクション(§3機能要件,§4データ仕様,§9エラーハンドリング)に差分生成 | 複数セクション更新 |
| 3 | `framework modify docs/inbox/empty.md` (空ファイル) | 異常: ファイル内容なし | エラー: "Modification instruction is empty or unparseable" exit code 1 | 空ファイル |
| 4 | `framework modify docs/inbox/no-match.md` (既存SSOTに無関係の指示) | 異常: 対象SSOT 0件マッチ | エラー: "No matching SSOT found for this instruction. Consider using 'framework ingest' for new features." exit code 1 | マッチなし |
| 5 | `framework coherence` (.framework なし) | 異常: 非フレームワークプロジェクト | エラー: "Not a framework project (.framework not found)" exit code 1 | フレームワーク未適用 |
| 6 | `framework coherence` (SSOT=3件, 不一致=1件) | 正常: 不一致検出 | 不一致レポート出力: `FEAT-101: §5 API spec diverged (2 endpoints modified without SSOT update)` exit code 0 | 整合性チェック |
| 7 | `framework modify docs/inbox/change-purpose.md` (§2目的変更指示) | 異常: CORE層変更 | 警告: "CORE layer (§2) change detected. Requires manual review." 差分生成されるがstatus=review、自動適用されない | CORE層保護 |

---

### §3-F: Boundary Values（境界値） [DETAIL]

> CLIプロファイル: 任意だが品質向上のため記載

| 項目 | 最小値 | 最大値 | 空 | NULL/未指定 | 不正形式 |
|------|--------|--------|-----|------|---------|
| 修正指示テキスト | 1行のテキスト→正常処理 | 10MB超→"File too large (max 10MB)" | 0バイト→"empty or unparseable" | パス未指定→docs/inbox/をスキャン | バイナリファイル→"Unsupported format" |
| 既存SSOTファイル数 | 0件→"No SSOTs found" | 100件→正常処理（AI分析対象をサマリーに限定） | - | - | 壊れたmd→スキップしてwarning |
| 対象SSOTマッチ数 | 0件→エラー | 1件→自動選択 | - | - | - |
| coherenceチェック対象 | SSOT 1件→正常処理 | SSOT 100件→正常（並列チェック不要、逐次） | SSOT 0件→"No SSOTs to check" | - | - |

---

### §3-G: Exception Response（例外時の戻り） [DETAIL]

| # | 例外条件 | Exit Code | エラーコード | ユーザーメッセージ | リトライ可否 | 復旧方法 |
|---|---------|-----------|------------|-----------------|------------|---------|
| 1 | .framework ディレクトリ不在 | 1 | ERR_NOT_FRAMEWORK | "Not a framework project (.framework not found)" | No | `framework init` または `framework retrofit` を実行 |
| 2 | 修正指示ファイルが存在しない | 1 | ERR_FILE_NOT_FOUND | "File not found: {path}" | No | 正しいパスを指定 |
| 3 | 修正指示テキストが空/解析不能 | 1 | ERR_EMPTY_INPUT | "Modification instruction is empty or unparseable" | No | 修正指示テキストを記述してリトライ |
| 4 | 既存SSOTが0件 | 1 | ERR_NO_SSOTS | "No SSOTs found in docs/design/features/. Run 'framework ingest' first." | No | 先にingestで初期SSOTを作成 |
| 5 | 対象SSOTマッチなし | 1 | ERR_NO_MATCH | "No matching SSOT found for this instruction. Consider using 'framework ingest' for new features." | No | ingestで新規SSOT作成を検討 |
| 6 | Claude AI実行タイムアウト | 1 | ERR_AI_TIMEOUT | "AI analysis timed out after {timeout}ms" | Yes | リトライ or タイムアウト値を増やす |
| 7 | Claude AI実行エラー | 1 | ERR_AI_FAILURE | "AI analysis failed: {error}" | Yes | リトライ |
| 8 | 修正指示ファイルが10MB超 | 1 | ERR_FILE_TOO_LARGE | "File too large (max 10MB): {path}" | No | ファイルを分割 |
| 9 | SSOTファイルの書き込み権限なし | 1 | ERR_WRITE_PERMISSION | "Cannot write to {path}: permission denied" | No | ファイル権限を修正 |
| 10 | pandoc未インストール(.docx入力時) | 1 | ERR_PANDOC_MISSING | "pandoc is required for .docx files. Install: brew install pandoc" | No | pandocをインストール |

---

### §3-H: Acceptance Tests（Gherkin形式） [DETAIL]

```gherkin
Feature: FR-001 修正指示からの差分SSOT生成

  Scenario: 正常系 - API仕様変更の修正指示
    Given .frameworkディレクトリが存在する
    And docs/design/features/FEAT-101_login.md にSSOTが存在する
    And docs/inbox/fix-api-response.md に「ログインAPIのレスポンスにrefresh_tokenを追加」と記載されている
    When framework modify docs/inbox/fix-api-response.md を実行する
    Then FEAT-101_login.md が対象SSOTとして特定される
    And §5 API仕様セクションに差分が生成される
    And diff形式で変更箇所が表示される
    And .framework/ingest.json にstatus=reviewで記録される

  Scenario: 異常系 - 空の修正指示ファイル
    Given .frameworkディレクトリが存在する
    And docs/inbox/empty.md が空ファイルである
    When framework modify docs/inbox/empty.md を実行する
    Then "Modification instruction is empty or unparseable" エラーが表示される
    And exit code 1 で終了する

Feature: FR-002 非破壊的SSOT更新

  Scenario: 正常系 - 影響セクションのみ更新
    Given FEAT-101_login.md の§3に5つのMUST要件がある
    And 修正指示が「§5のAPIエンドポイントパス変更」である
    When framework modify を実行する
    Then §5のみが更新される
    And §3の5つのMUST要件はそのまま保持される

Feature: FR-003 SSOT-実装 整合性チェック

  Scenario: 正常系 - 不一致検出
    Given FEAT-101のSSOTに「POST /api/v1/login」が定義されている
    And 実装コードに「POST /api/v2/login」が存在する
    When framework coherence を実行する
    Then "FEAT-101: §5 API spec diverged" と不一致が報告される

  Scenario: 正常系 - 全整合
    Given 全SSOTと実装コードが一致している
    When framework coherence を実行する
    Then "All SSOTs are coherent with implementation" と表示される
    And exit code 0 で終了する

Feature: FR-004 フレームワーク未適用プロジェクト

  Scenario: 異常系 - .framework不在
    Given .frameworkディレクトリが存在しない
    When framework modify を実行する
    Then "Not a framework project (.framework not found)" エラーが表示される
    And exit code 1 で終了する

  Scenario: 異常系 - coherenceでも同様
    Given .frameworkディレクトリが存在しない
    When framework coherence を実行する
    Then "Not a framework project (.framework not found)" エラーが表示される

Feature: FR-005 空/解析不能な修正指示

  Scenario: 異常系 - 解析不能
    Given docs/inbox/binary.bin がバイナリファイルである
    When framework modify docs/inbox/binary.bin を実行する
    Then "Unsupported format" エラーが表示される

Feature: FR-010 CORE層保護

  Scenario: 異常系 - CORE層変更の検出
    Given 修正指示が「機能の目的を変更する」内容である
    When framework modify を実行する
    Then "CORE layer (§2) change detected. Requires manual review." 警告が表示される
    And 差分は生成されるが自動適用されない
    And status=review で保存される
```

---

## §4 データ仕様 [CONTRACT: 4.1] [DETAIL: 4.2, 4.3]

### 4.1 データ項目一覧

**ModificationRecord（.framework/ingest.json に追記）**

| # | 項目名 | 物理名 | 型 | 必須 | デフォルト | バリデーション | 備考 |
|---|--------|--------|-----|------|----------|--------------|------|
| 1 | ID | id | string | Yes | 自動採番 | `MOD-NNN` 形式 | 修正記録ID |
| 2 | ソースパス | sourcePath | string | Yes | - | 存在するファイルパス | 修正指示テキストのパス |
| 3 | 対象SSOT | targetSSOTs | string[] | Yes | [] | 既存FEAT-IDの配列 | マッチしたSSOT一覧 |
| 4 | 影響セクション | affectedSections | string[] | Yes | [] | §N形式の配列 | 更新対象セクション |
| 5 | ステータス | status | ModificationStatus | Yes | "pending" | enum値 | pending/analyzing/review/approved/applied/failed |
| 6 | 差分内容 | diffs | SSOTDiff[] | No | [] | - | セクション別diff |
| 7 | CORE層変更フラグ | coreLayerChanged | boolean | Yes | false | - | §2,§7の変更を含むか |
| 8 | 作成日時 | createdAt | string | Yes | 現在時刻 | ISO 8601 | |
| 9 | 更新日時 | updatedAt | string | Yes | 現在時刻 | ISO 8601 | |

**SSOTDiff**

| # | 項目名 | 物理名 | 型 | 必須 | デフォルト | バリデーション | 備考 |
|---|--------|--------|-----|------|----------|--------------|------|
| 1 | 対象SSOT ID | featureId | string | Yes | - | FEAT-NNN形式 | |
| 2 | セクション | section | string | Yes | - | §N形式 | |
| 3 | 変更前 | before | string | Yes | - | - | セクション内容 |
| 4 | 変更後 | after | string | Yes | - | - | 更新後のセクション内容 |
| 5 | 変更理由 | reason | string | Yes | - | - | AIが生成した変更理由 |

**CoherenceReport（.framework/coherence-report.json）**

| # | 項目名 | 物理名 | 型 | 必須 | デフォルト | バリデーション | 備考 |
|---|--------|--------|-----|------|----------|--------------|------|
| 1 | チェック日時 | checkedAt | string | Yes | 現在時刻 | ISO 8601 | |
| 2 | 結果 | results | CoherenceResult[] | Yes | [] | - | SSOT別結果 |
| 3 | 全体ステータス | status | "coherent" \| "diverged" | Yes | - | - | |

**CoherenceResult**

| # | 項目名 | 物理名 | 型 | 必須 | デフォルト | バリデーション | 備考 |
|---|--------|--------|-----|------|----------|--------------|------|
| 1 | SSOT ID | featureId | string | Yes | - | FEAT-NNN形式 | |
| 2 | SSOTパス | ssotPath | string | Yes | - | 存在するファイルパス | |
| 3 | ステータス | status | "ok" \| "diverged" \| "skipped" | Yes | - | - | |
| 4 | 不一致一覧 | divergences | Divergence[] | No | [] | - | |

**Divergence**

| # | 項目名 | 物理名 | 型 | 必須 | デフォルト | バリデーション | 備考 |
|---|--------|--------|-----|------|----------|--------------|------|
| 1 | セクション | section | string | Yes | - | §N形式 | |
| 2 | 種別 | type | "added" \| "removed" \| "changed" | Yes | - | - | |
| 3 | 詳細 | detail | string | Yes | - | - | 人間可読な説明 |
| 4 | 深刻度 | severity | "critical" \| "major" \| "minor" | Yes | - | - | |

### 4.2 バリデーションルール

| 項目 | ルール | エラーメッセージ |
|------|-------|----------------|
| sourcePath | ファイルが存在し、.md または .docx 拡張子 | "File not found" / "Unsupported format" |
| targetSSOTs | 空配列の場合はエラー（modify時） | "No matching SSOT found" |
| status | 有効なenum値のみ | 内部エラー |
| featureId | FEAT-NNN形式 | 内部エラー |

### 4.3 データライフサイクル

```
ModificationRecord:
  作成: framework modify 実行時
  更新: approve/apply時にstatus更新
  削除: 論理削除なし（履歴として永続保持）
  保持期間: プロジェクト存続中

CoherenceReport:
  作成: framework coherence 実行時
  更新: 毎回上書き（最新結果のみ保持）
  削除: 不要
  保持期間: 次回実行まで
```

---

## §5 API仕様 [CONTRACT]

> CLI型機能のため、APIエンドポイントではなくCLIコマンドインターフェースを定義

### 5.1 コマンド一覧

| コマンド | 説明 | 引数 | オプション |
|---------|------|------|----------|
| `framework modify <path>` | 修正指示から差分SSOT生成 | path: 修正指示ファイルまたはディレクトリ | --dry-run, --approve [id] |
| `framework coherence` | SSOT-実装 整合性チェック | なし | --auto-fix, --verbose |

### 5.2 コマンド詳細

#### `framework modify <path>`

**引数:**
- `path` (optional): 修正指示ファイルまたはディレクトリのパス。省略時は `docs/inbox/` をスキャン

**オプション:**
- `--dry-run`: ファイル書き込みなしにプレビュー
- `--approve [id]`: レビュー済みの修正を承認して適用（idは MOD-NNN）
- `--status`: 修正記録のステータス表示

**出力（正常系）:**
```
[modify] Analyzing: docs/inbox/fix-api-response.md
[modify] Matched SSOT: FEAT-101 (login) — confidence: 0.92
[modify] Affected sections: §5 (API Spec)
[modify] Generating diff...

--- docs/design/features/FEAT-101_login.md  (before)
+++ docs/design/features/FEAT-101_login.md  (after)
@@ §5.2 POST /api/v1/login @@
   response: {
     token: string;
+    refreshToken: string;
   }

[modify] 1 modification saved as MOD-001 (status: review)
[modify] Review the diff, then: framework modify --approve MOD-001
```

**出力（エラー系）:**
```
Error: Not a framework project (.framework not found)
Error: File not found: docs/inbox/nonexistent.md
Error: Modification instruction is empty or unparseable
Error: No matching SSOT found for this instruction.
```

#### `framework coherence`

**オプション:**
- `--auto-fix`: 不一致検出時に自動でingest修正を実行
- `--verbose`: 詳細な比較結果を表示

**出力（正常系 - 不一致あり）:**
```
[coherence] Checking 3 SSOTs against implementation...
[coherence] FEAT-101 (login): §5 diverged — POST /api/v1/login endpoint path changed in code
[coherence] FEAT-102 (signup): OK
[coherence] FEAT-103 (profile): §4 diverged — 'avatar_url' field added in code but not in SSOT

Result: 2 divergences found (1 major, 1 minor)
Run 'framework coherence --auto-fix' to generate SSOT updates.
```

**出力（正常系 - 全整合）:**
```
[coherence] Checking 3 SSOTs against implementation...
[coherence] All SSOTs are coherent with implementation. ✓
```

---

## §6 UI仕様

> CLIプロファイル: 該当なし（CLIターミナル出力のみ）

---

## §7 ビジネスルール [CORE]

### 7.1 ルール一覧

| ルールID | ルール名 | 条件 | アクション | レベル |
|---------|---------|------|----------|--------|
| BR-001 | SSOT先行更新原則 | IF 修正指示を受信 | THEN SSOTを先に更新してから実装 | MUST |
| BR-002 | CORE層保護 | IF 修正がCORE層(§2,§7)に影響 | THEN 自動適用せずレビュー待ちにする | MUST |
| BR-003 | 差分更新の原則 | IF SSOTを更新する | THEN 影響セクションのみ更新し、他を保持 | MUST |
| BR-004 | 整合性維持 | IF framework coherence で不一致検出 | THEN 不一致レポートを出力 | MUST |
| BR-005 | 新規機能の判別 | IF 修正指示が既存SSOTにマッチしない | THEN framework ingest での新規SSOT作成を案内 | SHOULD |
| BR-006 | 修正履歴の保持 | IF 修正を適用 | THEN ModificationRecordを永続保持 | SHOULD |

### 7.2 ルール詳細

#### BR-001: SSOT先行更新原則
- **条件**: フレームワーク適用プロジェクトで修正指示を受けた場合
- **ロジック**: 修正指示テキスト → SSOT差分生成 → レビュー → 承認 → 実装、の順序を強制
- **例外**: 緊急のバグ修正（hotfix）はこのフローをバイパス可能（将来の --hotfix オプション）
- **根拠**: SSOTと実装の乖離がプロジェクト品質低下の主因

#### BR-002: CORE層保護
- **条件**: AI分析により§2（機能概要）または§7（ビジネスルール）への変更が検出された場合
- **ロジック**: 差分は生成するが status=review のままにし、`--approve` による明示的承認を必須にする
- **例外**: なし（CORE層の自動変更は常に禁止）
- **根拠**: specs/03_SSOT_FORMAT.md の Freeze 1 ルール準拠

---

## §8 非機能要件（ISO 25010 準拠） [DETAIL]

### 8.1 性能

| 指標 | 目標値 | 測定方法 |
|------|-------|---------|
| modify コマンド応答時間 | 30秒以内（AI分析含む） | CLIタイマー |
| coherence チェック時間 | SSOT 1件あたり5秒以内 | CLIタイマー |
| AI呼び出しタイムアウト | 300秒（5分） | spawn timeout |
| 修正指示ファイル最大サイズ | 10MB | ファイルサイズチェック |

### 8.2 セキュリティ

| 要件 | レベル | 対策 |
|------|--------|------|
| ファイルパス検証 | MUST | パストラバーサル防止（プロジェクトディレクトリ外へのアクセス禁止） |
| AI入力サニタイズ | MUST | プロンプトインジェクション対策（ユーザー入力をデータとしてのみ扱う） |
| 一時ファイル管理 | SHOULD | 処理完了後に一時ファイルを削除 |

### 8.3 可用性

| 要件 | 目標 |
|------|------|
| オフライン動作（coherence） | coherenceコマンドはAI不要で動作 |
| AI障害時のフォールバック | modify はAI必須、エラーメッセージで案内 |

### 8.4 保守性

| 要件 | 対策 |
|------|------|
| ログ出力 | logger.info/warn/error で主要ステップを記録 |
| テストカバレッジ | 新規コード80%以上 |
| 既存コードとの統合 | ingest-engine.ts, ingest-model.ts を拡張（別ファイル分割可） |

---

## §9 エラーハンドリング [DETAIL]

### 9.1 エラーケース一覧

| # | エラー条件 | 種別 | ユーザーメッセージ | システム動作 | 復旧方法 |
|---|----------|------|-----------------|------------|---------|
| 1 | .framework 不在 | 環境エラー | "Not a framework project" | exit code 1 | framework init 実行 |
| 2 | 修正指示ファイル不在 | 入力エラー | "File not found: {path}" | exit code 1 | パス確認 |
| 3 | 空/解析不能ファイル | 入力エラー | "empty or unparseable" | exit code 1 | 内容記述 |
| 4 | 非対応形式 | 入力エラー | "Unsupported format: {ext}" | exit code 1 | .md/.docx使用 |
| 5 | ファイルサイズ超過 | 入力エラー | "File too large (max 10MB)" | exit code 1 | ファイル分割 |
| 6 | 既存SSOT 0件 | 状態エラー | "No SSOTs found" | exit code 1 | 先にingest実行 |
| 7 | SSOTマッチなし | 処理エラー | "No matching SSOT found" | exit code 1 | ingestで新規作成 |
| 8 | AI タイムアウト | 外部エラー | "AI analysis timed out" | exit code 1, state=failed | リトライ |
| 9 | AI 実行エラー | 外部エラー | "AI analysis failed: {err}" | exit code 1, state=failed | リトライ |
| 10 | ファイル書き込み権限なし | 環境エラー | "Cannot write to {path}" | exit code 1 | 権限修正 |
| 11 | ingest.json 破損 | 状態エラー | "Corrupted state file" | バックアップから復元試行 | 手動で.framework/ingest.json修正 |

### 9.2 エラー時のフォールバック

```
AI実行エラー時:
  1. エラー詳細をlogger.errorで出力
  2. .framework/ingest.json のstatus=failedに更新
  3. ユーザーにリトライを案内
  4. 部分的な結果がある場合は保持（次回実行時に再利用可能）

状態ファイル破損時:
  1. .framework/ingest.json.bak があれば復元試行
  2. 復元不可の場合、空の初期状態で再作成
  3. 警告メッセージを出力
```

---

## §10 テストケース

### 10.1 正常系

| TC-ID | テスト名 | 前提条件 | 操作 | 期待結果 | 優先度 |
|-------|---------|---------|------|---------|--------|
| TC-N-001 | modify: 単一SSOT マッチ | SSOT 1件, 修正指示1件 | framework modify path | 対象SSOT特定、差分生成、review状態 | P0 |
| TC-N-002 | modify: 複数セクション更新 | SSOT 1件, §3,§4,§9影響の修正 | framework modify path | 3セクションに差分生成 | P0 |
| TC-N-003 | modify: approve | MOD-001がreview状態 | framework modify --approve MOD-001 | status=approved, SSOT更新 | P0 |
| TC-N-004 | coherence: 全整合 | SSOT=実装 | framework coherence | "All coherent" 表示 | P0 |
| TC-N-005 | coherence: 不一致検出 | SSOT≠実装 | framework coherence | 不一致レポート出力 | P0 |
| TC-N-006 | modify: dry-run | 修正指示1件 | framework modify --dry-run path | diff表示、ファイル変更なし | P1 |
| TC-N-007 | coherence: auto-fix | 不一致1件 | framework coherence --auto-fix | 自動でmodify実行、review状態 | P1 |

### 10.2 異常系

| TC-ID | テスト名 | 前提条件 | 操作 | 期待結果 | 優先度 |
|-------|---------|---------|------|---------|--------|
| TC-E-001 | .framework 不在 | .framework なし | framework modify | エラー, exit 1 | P0 |
| TC-E-002 | ファイル不在 | パスが存在しない | framework modify nonexistent.md | エラー, exit 1 | P0 |
| TC-E-003 | 空ファイル | 0バイトファイル | framework modify empty.md | エラー, exit 1 | P0 |
| TC-E-004 | マッチなし | 無関係な修正指示 | framework modify unrelated.md | エラー, exit 1 | P0 |
| TC-E-005 | CORE層変更 | §2変更を含む修正 | framework modify core-change.md | 警告, review状態 | P0 |
| TC-E-006 | AI タイムアウト | AIが5分超 | framework modify path | タイムアウトエラー | P1 |
| TC-E-007 | 非対応形式 | .txt ファイル | framework modify file.txt | "Unsupported format" | P1 |

### 10.3 境界値

| TC-ID | テスト名 | 入力値 | 期待結果 |
|-------|---------|--------|---------|
| TC-B-001 | 最小修正指示 | 1行テキスト "§5にフィールド追加" | 正常処理 |
| TC-B-002 | 大きな修正指示 | 10MB未満のファイル | 正常処理 |
| TC-B-003 | 10MB超のファイル | 10.1MBファイル | "File too large" エラー |
| TC-B-004 | SSOT 1件 | 最小構成 | 正常処理 |
| TC-B-005 | SSOT 100件 | 最大想定 | 正常処理（サマリーモードでAI呼び出し） |

### 10.4 テストカバレッジ

```
MUST要件: 全てテストケースが存在すること → FR-001〜FR-005, FR-010 に対応
SHOULD要件: 主要なケースのテストが存在すること → FR-006〜FR-008 に対応
MAY要件: テスト任意 → FR-009
```

---

## §11 依存関係・影響範囲

### 11.1 依存する機能

| 依存先 | 依存内容 | 影響度 |
|--------|---------|--------|
| framework ingest | 既存のingestパイプライン（parseDocument, AI runner, state管理）を再利用 | 高 |
| ingest-model.ts | IngestState, IngestDocument 型を拡張 | 高 |
| plan-model.ts | PlanState, Task 型を利用 | 中 |
| Claude CLI | AI分析に `claude` コマンドを使用 | 高 |

### 11.2 依存される機能

| 依存元 | 依存内容 | 影響度 |
|--------|---------|--------|
| framework run | coherenceチェック後の実装フローで利用 | 中 |
| Pre-Code Gate | 将来的にcoherenceチェックをGate条件に統合 | 低 |

### 11.3 外部サービス依存

| サービス | 用途 | 障害時の影響 | フォールバック |
|---------|------|------------|--------------|
| Claude CLI | SSOT差分生成、SSOTマッチング | modify コマンドが使用不可 | エラーメッセージで案内、リトライ推奨 |
| pandoc | .docx変換（オプション） | .docxファイルのみ影響 | .md形式での入力を案内 |

---

## §12 未決定事項・制約

### 12.1 未決定事項（TBD）

| # | 項目 | 層 | 理由 | Decision Backlog ID |
|---|------|-----|------|-------------------|
| - | なし | - | CORE/CONTRACT層のTBD=0 | - |

### 12.2 前提条件

- フレームワーク適用済みプロジェクト（`.framework` ディレクトリ存在）
- `docs/design/features/` に1件以上のSSOTが存在（modifyコマンド使用時）
- Claude CLI がインストール済みでPATH上で利用可能（modifyコマンド使用時）
- Node.js 20+ 環境

### 12.3 制約事項

- coherenceチェックはAI不要（静的解析ベース）だが、精度はSSOTの記述品質に依存する
- AI分析の精度は100%ではない。対象SSOTの特定やセクション分析に誤りが生じる可能性がある。そのためレビューステップ（status=review）を必須としている
- 既存の `framework ingest` と `framework modify` は並行して使用可能だが、同一SSOTに対する同時操作は未サポート

---

## 監査情報

| 項目 | 内容 |
|------|------|
| 監査日 | 未実施 |
| 監査スコア | - /100 |
| 合格判定 | CTO レビュー待ち |
| 指摘事項数 | - |
| 監査詳細 | - |
