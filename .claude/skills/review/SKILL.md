---
name: review
description: |
  Review & Audit Phase。品質保証の最終ゲート + SSOT監査 + コード監査。
  「レビュー」「review」「監査」「audit」「レビュー評議会」で実行。
---

# Review & Audit Skill

## 概要

実装完了後の最終品質ゲート。複数の専門家（R1-R5）がそれぞれの観点から
レビューし、リリース可否を判定する。SSOT監査とコード監査も統合。

## Agents（参照）

### Review Council Members (Validators)
1. @agents/validators/r1-ssot-auditor.md → SSOT準拠性監査
2. @agents/validators/r2-quality-gatekeeper.md → 品質ゲート検証
3. @agents/validators/r3-security-guardian.md → セキュリティ監査
4. @agents/validators/r4-ux-advocate.md → UX検証
5. @agents/validators/r5-performance-analyst.md → パフォーマンス検証

## ワークフロー

```
Review Council
─────────────────────────────────────────
R1: SSOT Compliance Auditor  → SSOT準拠性を監査
R2: Quality Gate Keeper      → 品質基準を検証
R3: Security Guardian        → セキュリティを監査
R4: User Experience Advocate → UXを検証
R5: Performance Analyst      → パフォーマンスを検証
         │
         ▼
   合議による最終判定
         │
    ├─ ✅ Approve → リリース可
    ├─ ❌ Reject → 修正後再レビュー
    └─ ⛔ Block → 重大問題、合議で解決策検討
```

## 最終判定基準

### Approve 条件（全て ✅ が必要）

```
✅ R1: SSOT準拠 100%
✅ R2: 品質ゲート全通過
✅ R3: Critical/High セキュリティ問題なし
⚠️ R4: UX改善提案あり（軽微）→ 許容
⚠️ R5: パフォーマンス改善余地あり（基準内）→ 許容
```

### Reject 条件（1つでも該当したらReject）

```
❌ SSOT未実装の MUST 要件がある
❌ テストが失敗している
❌ カバレッジ 80% 未満
❌ Critical/High セキュリティ脆弱性がある
❌ ビルドが失敗している
```

## 合議プロトコル

レビューで意見が分かれた場合、以下のプロセスで合意形成:

1. **問題提起**: 議題と関連する専門家を特定
2. **個別見解**: 各専門家が独立して見解を表明（根拠と懸念点を明示）
3. **討議**: 見解の相違点を整理、妥協点・統合案を模索
4. **合意形成**: 最終案の確定、残存リスクの明示、反対意見の記録
5. **決定記録**: ADR（Architecture Decision Record）として記録

### 合議レベル

| レベル | 参加者 | 対象 | 時間目安 |
|--------|--------|------|---------|
| 軽量合議 | 2-3名 | DETAIL層の決定 | 5分以内 |
| 標準合議 | 3-4名 | CONTRACT層の決定 | 15分 |
| 重量合議 | 全専門家 | CORE層の決定 | 30分+ |

### 合議トリガー（自動）

1. CORE層の変更提案 → 重量合議
2. CONTRACT層の新規定義 → 標準合議
3. 複数SSOTへの影響 → 標準合議
4. 技術的負債の可能性 → 軽量合議
5. セキュリティ関連 → 標準合議

## Multi-perspective Check

レビュー判定を確定する前に、以下の視点を検討:
- **Product**: ユーザー価値が実現されているか？
- **Technical**: コード品質・アーキテクチャは健全か？
- **Business**: リリース後のビジネスインパクトは？リスクは？

視点間の緊張があれば、それを明記して解決策を示す。

## 追加コンテキスト: notes/

レビュー対象のタスクに対応する `notes/` ファイルがある場合、実装者の判断理由・申し送り事項を確認すること。技術的判断の妥当性評価に活用する。

## Post-Review Gate（Gate 3: Adversarial Review）

レビュー評議会完了後、リリース前にGate 3を通すこと:

```
1. framework gate release     ← コンテキスト収集（CLI）
2. /gate-release               ← 裁判実行（スキル）
3. SHIP → PR作成・マージ可
   SHIP_WITH_CONDITIONS → 条件修正後マージ（Gate 3再実行不要）
   BLOCK → Gate 2から再実行
```

### 裁判構造
- **Prosecutor**: リリースを止める理由を全力で探す
- **Defense**: 各起訴を検証（DISMISS/REDUCE/ACKNOWLEDGE）
- **Judge**: 起訴状+弁護書のみで判決（SHIP/CONDITIONS/BLOCK）

## 3層品質保証

```
Layer 4: Gate 3 Adversarial Review → リリース前の最終裁判
Layer 3: Review Council（本スキル）→ レビュー評議会
Layer 2: Gate 2 Quality Sweep      → 実装後の品質検証
Layer 1: CI/CD Pipeline            → 自動化された品質チェック
```
