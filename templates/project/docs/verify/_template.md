---
id: VERIFY-{FEATURE}-{NNN}
status: Draft
traces:
  spec: [SPEC-{FEATURE}-001]
  impl: [IMPL-{FEATURE}-001]
---

# VERIFY: {feature-name}

## 0. 対応するSPEC / IMPL [必須]

## 1. 機能テスト（Gherkin） [必須]
### 1.1 [VERIFY-{FEATURE}-001] 正常系: <シナリオ名>
Feature:
  Scenario:
    Given
    When
    Then

## 2. 境界値テスト [必須]
表形式: 項目 / 境界 / 期待値

## 3. 異常系テスト [必須]
表形式: 入力 / 期待するエラー / エラーコード

## 4. 認証/認可テスト [app/api プロファイルで必須]
表形式: ロール / 操作 / 期待結果

## 5. パフォーマンステスト [該当時]
表形式: 項目 / 基準値 / 計測方法

## 6. セキュリティテスト [app/api プロファイルで必須]
表形式: 攻撃ベクタ（STRIDE/OWASP 参照）/ 想定結果

## 7. Definition of Done [必須]
チェックボックス形式

## 8. トレース [必須]
