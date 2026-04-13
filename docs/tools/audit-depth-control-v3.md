# 監査深度コントロール v3

## 原則

```
自動化できるチェックは全てLayer 0。人間/LLMに渡さない。
Layer 0を通過しないPRはレビュー対象にならない。
チェック項目数で制御。「もっとできないか」は禁止。
```

---

## Layer 0: 自動ゲート（CI/pre-commit/CLIが実行）

全PRに適用。通過しなければレビュー対象にならない。

- tsc --noEmit（型チェック）
- ESLint（ルール違反0件）
- テスト全PASS
- pre-commit checks（console.log、.skip/.only、秘密情報）
- framework check tests（偽テスト検出）
- detect-breaking-changes.sh（破壊的変更検出）

Layer 0で自動チェック済みの項目は、Layer 1/2で重複チェックしない。

---

## Layer 1: LLMチェック（LLMベースのGateが担当。6項目固定）

Layer 0通過後のみ。自動化できない意味的判断のみ。
デフォルトではGate 2（品質スイープ）/Gate 3（敵対的レビュー）が担当。
組織に応じてレビュアーチェーンの構成は自由（例: lead reviewer → auditor → approver）。

```
スコープ判断（2項目）:
  [ ] PR descriptionが変更の意図を正確に表現しているか
  [ ] 1 PR 1 concern原則に適合しているか

設計整合性（2項目）:
  [ ] 変更がSSOTの意図と一致しているか
  [ ] 既存アーキテクチャのパターンと一貫しているか

影響分析（2項目）:
  [ ] 変更が他のモジュール/サービスに予期しない影響を与えないか
  [ ] エッジケースが適切に考慮されているか
```

全てPASS/FAIL/N/Aで埋めたら完了。7項目目を追加する余地はない。

---

## Layer 2: 承認者(approver)判断（該当PRのみ）

水壊的変更 / OSS公開 / セキュリティ変更のみ発動。
通常PRではLayer 2不要（承認なしでmerge可）。
承認者の定義はプロジェクトごとに設定（.framework/config.json の approver フィールド）。

---

## PRタイプ別の適用

```
docs/test/lint/typo:
  Layer 0のみ → 自動通過すればmerge可

通常の機能追加/バグ修正:
  Layer 0 + Layer 1（6項目）

破壊的変更/セキュリティ/公開前:
  Layer 0 + Layer 1（6項目）+ Layer 2（承認者判断）
```

---

## 修正ループ制御

サイクル上限: 3
- サイクル1: BLOCKER/CRITICALのみ修正要求
- サイクル2: 修正確認のみ（新しい指摘は追加しない）
- サイクル3: 解決しなければエスカレーション

WARNING以下はfollow-up issueに記録。PR内での修正は不要。

---

## 重大度定義

| 重大度 | 定義 | PRでの扱い |
|--------|------|-----------|
| BLOCKER | 本番障害 or セキュリティ脆弱性 | 修正必須。マージ不可 |
| CRITICAL | 機能が正しく動かない | 修正必須。マージ不可 |
| WARNING | 動作に影響しない | follow-up。マージ可 |
| INFO | 推奨・スタイル | 記録のみ。マージ可 |

---

## MCP tool統合（v1.1）

```bash
framework audit-level <PR番号>       # PRタイプからLayer自動判定
framework audit-checklist <PR番号>   # Layer 1チェックリスト生成
framework audit-report <PR番号>      # 監査レポート提出（--output json対応）
```

MCP tool として公開時は、上記コマンドのJSON出力をそのままtool resultとして返す。

---

## 「もっとチェックできないか」が構造的に発生しない理由

- Layer 0は自動。人間の判断余地がない
- Layer 1は6項目固定。全てPASS/FAIL/N/Aで埋まったら完了
- Layer 2は該当PRのみ。通常PRでは発動しない
