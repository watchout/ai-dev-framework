---
id: SPEC-{FEATURE}-{NNN}
status: Draft
traces:
  impl: []
  verify: []
---

# SPEC: {feature-name}

## 0. メタ
- 作成日:
- 関連ADR:

## 1. 目的 (Goals) [必須]
## 2. 非目的 (Non-goals) [必須]
## 3. ユーザーストーリー [必須]

## 4. 機能要件 (Core) [必須]
### 4.1 [SPEC-{FEATURE}-001] <要件名>

## 5. インターフェース (Contract) [必須]
### 5.1 API契約（OpenAPI フラグメント推奨）
### 5.2 DBスキーマ
### 5.3 イベント/メッセージ [該当時]

## 6. 非機能要件 (Detail) [必須]
### 6.1 性能
### 6.2 可用性 (SLO)

### 6.3 セキュリティ要件 [app/api プロファイルで必須]

#### 6.3.1 脅威モデル (STRIDE)
| カテゴリ | 該当内容 |
|---|---|
| Spoofing（なりすまし） | |
| Tampering（改ざん） | |
| Repudiation（否認） | |
| Information Disclosure（情報漏洩） | |
| Denial of Service（DoS） | |
| Elevation of Privilege（権限昇格） | |

※「N/A」は理由を明記。単なる N/A は Gate 0 で BLOCK される。

#### 6.3.2 OWASP Top 10:2021 マッピング
- A01:2021 Broken Access Control:
- A02:2021 Cryptographic Failures:
- A03:2021 Injection:
- A04:2021 Insecure Design:
- A05:2021 Security Misconfiguration:
- A06:2021 Vulnerable and Outdated Components:
- A07:2021 Identification and Authentication Failures:
- A08:2021 Software and Data Integrity Failures:
- A09:2021 Security Logging and Monitoring Failures:
- A10:2021 Server-Side Request Forgery:

（該当する項目のみ記入、N/A は理由必須）

#### 6.3.3 データ分類
- 本 feature が扱うデータ:
  - [ ] PII（個人識別情報）
  - [ ] PCI（決済カード情報）
  - [ ] 機密（社内機密、顧客機密）
  - [ ] 公開
- 分類に応じた追加要件:

### 6.4 監査ログ要件 [該当時]

## 7. 受入基準 (Acceptance Criteria) [必須・Gherkin形式]
### 7.1 [SPEC-{FEATURE}-001] の受入基準
```gherkin
Feature: {feature-name}
  Scenario:
    Given
    When
    Then
```

## 8. 前提・依存 [必須]
## 9. リスクと緩和策 [該当時]

## 10. 制御機構選定原則 [必須]

> ADF 原則 0 (script 制御絶対 = LLM judgment 排除) を満たす実装機構の選定根拠を明記する。
> Canonical reference: [script 制御 vs Boris 式 Hook — 使い分け原則 (ADF 原則 0 整合)](https://www.notion.so/35ad2b26f3dc8122b9f5e513b769d4e4)

### 10.1 採択原則
- **default**: script 制御 (daemon / cron / launchd / pg trigger / GH Actions)
- **fallback**: Boris 式 Hook、不可避 4 case のみ:
  1. tool 呼出 BLOCK (PreToolUse)
  2. LLM context 注入 (UserPromptSubmit / SessionStart)
  3. session 起動時 state 復元 (SessionStart)
  4. tool 実行直後の検証 (PostToolUse)

### 10.2 本 spec の選定
本 feature の各 functional requirement について、**機構** と **不可避 case 該当根拠** を明記:

| FR | 機構 (script / Hook / 両者) | 不可避 case 該当 (Hook のみ) | 根拠 |
|---|---|---|---|
|  |  |  |  |

### 10.3 違反時 rollback
script で代替可能なのに Hook で実装 → CTO L3 review で reject、refactor 要請。
詳細: Notion canonical doc 参照。

## 11. Test Coverage Gap [SPEC-DOC4L-012、新規 feature 必須]

> [文献確認: SPEC-DOC4L-012] 新規 feature 起票時に 4 種 gap を必須評価。

| gap 種別 | 内容 | 解消アクション |
|---|---|---|
| Coverage gap | 仕様カバレッジ (要件 → test 漏れ) | test 追加 |
| Environment gap | 環境カバレッジ (dev/staging/production の差異漏れ) | 環境用意 |
| Tooling gap | 検証ツール不足 (mock では verify 不可な real env 検査漏れ) | tool 導入 |
| Skill gap | 知識不足 (担当 dev の expertise 不足) | pair / 学習 / 委譲 |

各 gap に対し: gap 内容 / 影響範囲 / 解消アクション / verify 方法 を明示。

## 12. Acceptance Criteria (BDD) [SPEC-DOC4L-013、必須]

> [文献確認: SPEC-DOC4L-013] §7 Gherkin Scenario と `tests/acceptance/` test を **1:1** で配置。

format 規約:
- `### AC-{FEATURE}-{NNN}` heading
- 直下に gherkin code block (Given/When/Then)
- 対応 test ファイル: `tests/acceptance/AC-{FEATURE}-{NNN}.test.{ts,sh}`

```gherkin
### AC-{FEATURE}-001
Feature: {feature-name}
  Scenario: {scenario-name}
    Given
    When
    Then
```

## 13. Invariants (Property-Based) [SPEC-DOC4L-014、重要 feature 該当時]

> [文献確認: SPEC-DOC4L-014] 重要 feature の invariant を明示、`tests/property/` に fast-check で 1000+ runs verify。

```
### INV-{FEATURE}-001
内容: 入力空間に対して常に成立すべき property
反例検出時: counterexample 記録 + test fail
```

## 14. Traceability Matrix [SPEC-DOC4L-015、必須]

> [文献確認: SPEC-DOC4L-015] 要件 ↔ test ↔ code の 3 者 link を `traceability.csv` (or 同等) で機械可読化。

| 要件 ID | test ID | code 範囲 |
|---|---|---|
| FR-XXX or AC-XXX | test file path + test name | file path + line range or symbol |

`framework trace verify` で完全性を CI gate 検証 (drift 検出時 exit 2)。
