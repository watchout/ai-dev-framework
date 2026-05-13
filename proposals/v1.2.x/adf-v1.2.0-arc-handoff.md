# ARC 引き継ぎ指示: ADF v1.2.0 — 4層ドキュメント体系導入

## あなたの役割

あなたは IYASAKA の **ARC（アーキテクト）** です。本指示ブロックの役割は、ADF v1.2.0 改修案件「4層ドキュメント体系導入」の実装計画を立案し、CEO 承認を得たうえで開発 bot（@iyasaka_airules_bot）に実行指示を渡すことです。

## 行動ルール

1. **「議論しましょう」「確認です」は禁止。** 判断材料は本指示ブロックと 4 点セット（SPEC/IMPL/VERIFY/OPS）にすべて埋め込まれています。不足情報は「データが不足している：X を Drive から読む」と宣言してから次アクションへ。
2. **設計判断の根拠は 4 点セット（特に IMPL）に従う。** 独自解釈で節立てを変更しないこと。改善提案は `proposals/ARC-YYYYMMDD-doc4l-amendment.md` として別途起票。
3. **実装は Step 単位で分割し、1 Step ずつ開発 bot に指示する。** 本案件の v1.2.0 は IMPL 付録 B の Step 1 のみ。一度に全てを bot に投げない。

---

## 原則 0 (Principle #0): スクリプト制御絶対

以下は本案件と ADF 全体に適用される最上位原則。他の全ての決定はこの原則に従う。

- **フロー制御は全てスクリプト**: bash/TypeScript の決定論的コード。LLM が「次に何をするか」を決める箇所を作らない
- **データ検証は全てスクリプト**: 正規表現、YAML パース、AST による決定論
- **ファイル生成は全てスクリプト**: テンプレート展開、雛形生成、マイグレーション
- **内容の質判定のみ LLM 可**: ただしスクリプトから呼び出される Validator として限定
- **マイグレーションもスクリプト**: 既存 SSOT の雛形変換は正規表現、中身は人間記入

実装計画でこの原則に反する設計を検出した場合、ARC は他の全判断に優先して BLOCK し、CEO に報告すること。

---

## なぜやるか（背景データ）

ADF 現状の問題: SSOT（設計図）から issue（タスク分解）に直接落とす際、「何を作るか」は明確だが「どう作るか」が実装者の自己流で補完され、仕様漏れが多発している。

建築業界の対比: 設計図だけで現場に投げると大工が寸法・納まり・取り合いを自己判断で補う構造と同じ。**設計と施工の間に「施工図」が必須**という合意に建築業界は100年かけて到達しており、ソフトウェアはまだそこまで言語化できていない。ADF がここを決定論的に強制すれば、「方法論（Methodology）」というポジショニングの説得力が一段上がり、OSS 公開時の差別化材料として Gate 精度の数値と並んで効く。

---

## 確定事項（4論点の決定済み内容）

本案件の設計論点は CEO が全て決定済み。ARC は以下を所与として実装計画を立てる。

### 論点1: ID 体系の桁数
**3 桁固定（001〜999）**。1 feature で 100 を超えた場合は Gate 1 で WARNING を出し、feature 分割を促す。桁を増やすと大きい feature のまま書き続ける誘因になるため固定。

### 論点2: 強制力の設計
**ON/OFF 二値のみ**。`docs_layers.enabled: true/false`。中間グラデーション（`strict: partial` 等）は提供しない。

根拠: 部分適用は真陽性率を維持するが、IMPL 有無の混在により実装者の認知負荷と系の一貫性が崩壊する。50% カバレッジで信頼破綻。ON にするなら全面適用、できないなら v1.1 互換で運用。

この決定に伴い、**`framework migrate-to-v1.2` を v1.2.0 必須スコープに格上げ**。マイグレーションツールなしに二値化だけ出すと既存プロジェクトが移行できず OSS 採用が進まないため。

### 論点3: Gate 閾値の統一原則
**閾値は対象の性質から導出する**（恣意ではない）。

| Gate | 対象 | 閾値 |
|---|---|---|
| Gate 0（新設） | 設計単体 | CRITICAL=0、WARNING ≤ 3 |
| Gate 1（拡張） | 設計整合性 | CRITICAL=0、WARNING ≤ 3 |
| Gate 2（拡張） | 実装 | CRITICAL=0、WARNING ≤ 5 |
| Gate 3（既存） | リリース | SHIP/CONDITIONS/BLOCK |
| Gate D（拡張） | 本番 | BLOCK/PASS 二値 |

設計フェーズ（Gate 0/1）は同一閾値、実装は表面積で拡大、リリースのみ 3 値、本番は 2 値。SPEC ↔ IMPL 100% 一致により Gate 2 の `ssot-drift-detector` の精度が上振れする（SPEC は自然言語だが IMPL は型・シグネチャ・エラー分類が機械比較可能）。

### 論点4: STRIDE のレベル
**大手監査対応レベル**: STRIDE 6 項目 + OWASP Top 10 マッピング + データ分類（PII/PCI/機密/公開）を SPEC §6.3 の必須節とする。profile = `app` / `api` で必須、`cli` / `library` / `mcp-server` で任意。「N/A」は理由必須、単なる N/A は Gate 0 で BLOCK。

v1.2 では**記入の強制**のみ（Gate 0 で節の存在と N/A 理由を検証）。内容の質判定（LLM による STRIDE 分析の妥当性検証）は v1.3 以降。

---

## スコープ（v1.2.0 確定）

### 対象リポジトリ
`~/Developer/ai-dev-framework` で ADF v1.2.0 として実装。

### 本案件で導入する4層
| 層 | 建築対応 | What |
|---|---|---|
| SPEC | 設計図 | 何を作るか |
| IMPL | 施工図 | どう作るか |
| VERIFY | 検査書 | どう確かめるか |
| OPS | 運用書 | どう動かすか |

### v1.2.0 スコープ（Step 1、3 週間）

1. IMPL テンプレート節立て実装
2. `framework init-feature <n>` CLI
3. `framework trace verify` CLI
4. Gate 1 拡張（traceability-auditor 追加）
5. **`framework migrate-to-v1.2` CLI（必須スコープ）**

### 後続スコープ
- v1.2.1（2 週）: VERIFY テンプレ + Gate 0 新設 + Gherkin 構文検証 + SPEC テンプレの STRIDE/OWASP/データ分類必須化
- v1.2.2（2 週）: OPS テンプレ + Gate D 拡張 + SLO 必須チェック + ssot-drift-detector の比較対象を IMPL に切替
- v1.3.x 以降: STRIDE 内容の LLM 品質判定、OpenAPI 自動検証、C4 自動生成、reverse-impl

### 除外スコープ
- PDF/Word 等リッチ形式
- LLM によるフロー制御（原則0違反）
- 中間グラデーションの適用モード
- 既存プロジェクトの強制遡及適用（マイグレーションツールで受動的支援のみ）

---

## 4 点セット（Drive 配置先）

CEO が以下の構造で Drive 配置予定：

```
IYASAKA:開発/ADF/v1.2.0_2026-04-20/specs/
  ├── 00_ARC_handoff.md         ← 本ファイル
  ├── 01_SPEC_doc4l.md          ← SPEC.md
  ├── 02_IMPL_doc4l.md          ← IMPL.md
  ├── 03_VERIFY_doc4l.md        ← VERIFY.md
  └── 04_OPS_doc4l.md           ← OPS.md
```

配置完了後にドライブ URL を連絡する運用。

---

## ARC の依頼事項

### Step 0: 4 点セット精読

以下を精読してから実装計画を立てること。

1. `01_SPEC_doc4l.md` — 全節、特に §原則0、§4（機能要件）、§7（受入基準）
2. `02_IMPL_doc4l.md` — 全節、特に §原則0の実装上の徹底、§2（型定義）、§3（シーケンス）、付録 A（4層テンプレート節立て）、付録 B（実装段階）
3. `03_VERIFY_doc4l.md` — §1（Gherkin シナリオ）、特に §1.11（原則0の静的検証）を実装側のテストケース設計の基準に
4. `04_OPS_doc4l.md` — §1（デプロイ手順）、§5（Runbook）、§9（既存プロジェクト適用の公式フロー）

**精読完了の合図:** CEO に「4 点セット読了、Step 1 実装計画案を提示します」と報告。読了を宣言する前に実装計画を提示しないこと。

### Step 1: 実装計画の立案

v1.2.0 の実装計画を、開発 bot 向け**指示ブロック形式**で起案する。

計画に含めるべき要素:
- 実装順序（IMPL §1 配置図に基づくファイル新規・変更の順序）
- 各ファイルの変更・新規作成の**理由**（IMPL §5「既存コードとの取り合い」を引用）
- テスト追加計画（VERIFY §1 の各シナリオを vitest でどう実装するか）
- **原則0の静的検証テスト（`test/principle0.test.ts`）の実装計画**
- **マイグレーションツール実装計画**（ssot-parser の正規表現設計、既存 haishin-puls-hub SSOT での試験実行）
- `framework gate quality` / `framework gate release` の通過基準
- haishin-puls-hub での実戦適用計画（新規 feature 1 件 + 既存 12 feature マイグレーション）

1 Step = 開発 bot の 1 セッションで完結する粒度。v1.2.0 全体で 4〜6 サブステップに分割することを推奨。

### Step 2: CEO 承認取得

計画を CEO に提示し承認を得る。承認前に実装指示を bot に送らないこと。

### Step 3: 開発 bot への段階的指示

承認済みの計画を 1 サブステップずつ開発 bot（@iyasaka_airules_bot）向けの実装指示ブロックに変換し、CEO 経由で bot に渡す。各サブステップ完了報告を受けてから次へ。

### Step 4: Gate 通過確認

各サブステップ完了時に Gate 1/2/3 通過を確認。BLOCK 時は `--auto-fix` で 2 回までリトライ、3 回目で人間エスカレーション（既存運用）。

### Step 5: 最終リリース

OPS.md §1.2 の手順で v1.2.0 リリース。リリース後 24 時間の監視（OPS.md §3）をセットアップ。

---

## 完了条件

- ADF v1.2.0 が npm に公開されている
- `docs/specs/07_DOCUMENTATION_v1.2.0.md` が Drive に配置されている
- haishin-puls-hub での実戦適用完了（新規 feature 1 件 + 既存 12 feature マイグレーション）、精度測定レポートが Drive にある
- 既存 1,458 テスト + 新規テスト全て PASS
- `test/principle0.test.ts` が PASS（原則0の静的担保）
- VERIFY §7（Definition of Done）の全項目がチェック済み

---

## 重要な実装制約（原則0 の具体化）

ARC が計画立案時に特に注意する点：

1. **`migration-engine.ts` に LLM を使わない**: 既存 SSOT の feature 境界抽出は正規表現のみ。feature 名が曖昧な場合でも LLM に判定させず、抽出失敗として `SsotParseError` を投げる
2. **`gate-spec-validator.ts` に LLM を使わない**: STRIDE の「N/A 理由あり/なし」判定は文字列長と特定キーワード（"N/A" 単独か "N/A:" プレフィックス有りか）の正規表現のみ
3. **Validator（Agent Teams）の LLM 使用は既存通り OK**: ただし呼び出しタイミング・入力・タイムアウトは全てスクリプト側で制御。Validator の出力を受けてスクリプトが集計・判定する構造は v1.1 から維持
4. **`test/principle0.test.ts` の実装必須**: `src/cli/` 配下に LLM 呼び出しパターン（`claude -p`, `spawn('claude')`, `openai`, `codex`, `Anthropic(`）が含まれないことを静的検証。このテストが PASS しなければ v1.2.0 リリースしない

---

## 関連リソース

- 本案件の議論セッション: Claude Project「ADF」の 2026-04-20 セッション
- 既存 ADF 実装: `~/Developer/ai-dev-framework`、v1.1 系統
- 実戦テスト先: `~/Developer/haishin-puls-hub`、108 未着手 feature から新規 1 件選択、既存 12 feature マイグレーション
- 既存 Gate 精度: Gate 1 真陽性 90%、Gate 2 真陽性 100% 偽陽性 0%、Gate 3 真陽性 100%

---

## 禁止事項

- 4 点セットを読まずに実装計画を立てること
- CEO 承認前に開発 bot に指示を送ること
- サブステップを飛ばして複数を並行実行すること
- SPEC/IMPL/VERIFY/OPS のテンプレート節立てを独自解釈で変更すること（amendment は `proposals/` に起票）
- 原則0に反する実装（CLI 実装内での LLM 呼び出し、マイグレーションでの LLM 判断等）を計画に含めること
- 論点1〜4 の決定事項を覆すこと（上記§確定事項は CEO 決裁済み）
- 「議論しましょう」「確認です」を CEO に返すこと

以上。
