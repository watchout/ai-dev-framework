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
