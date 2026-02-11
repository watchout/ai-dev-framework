---
name: implementation
description: |
  Implementation Phase専門家チーム。実装とテストを担当。
  「実装を開始」「implementation」で実行。
  個別エージェント: 「I1」「I2」「I3」「I4」「I5」で個別実行可能。
---

# Implementation Phase Skill - 実装

## 概要

技術設計を実際のコードに落とし込み、
テストと品質保証を行う専門家チーム。

## エージェント構成

```
Implementation Workflow
─────────────────────────────────────────────────────

I1: Code Implementer（コード実装者）
    ↓ 機能を実装
I2: Test Writer（テスト作成者）
    ↓ テストを作成
I3: Code Auditor（コード監査者）
    ↓ コード品質を監査
I4: Integration Validator（統合検証者）
    ↓ 統合テストを実行
I5: Documentation Writer（ドキュメント作成者）
    ↓ 技術ドキュメントを作成

→ 実装完了 + テスト完了 + CI/CD通過
```

## 各エージェントの役割

### I1: Code Implementer（コード実装者）

**役割**: SSOTに基づいてコードを実装

**実装順序**:
1. SSOT確認（CORE→CONTRACT→DETAIL）
2. カスタマイズログ確認（共通機能の場合）
3. 実装
4. 自己レビュー

**参照**: 機能SSOT、SSOT-5_CROSS_CUTTING.md

詳細: `agents/i1-code-implementer.md`

### I2: Test Writer（テスト作成者）

**役割**: テストコードを作成

**テスト種別**:
- 単体テスト（Vitest/Jest）
- 統合テスト
- APIテスト
- E2Eテスト（Playwright）

**TDD条件**:
- CORE/CONTRACT層 → テストを先に書く
- DETAIL層/UI → 後付けテストOK

詳細: `agents/i2-test-writer.md`

### I3: Code Auditor（コード監査者）

**役割**: 17_CODE_AUDIT.md に基づいてコードを監査

**監査観点**:
- SSOT準拠性
- 型安全性（any不使用）
- エラーハンドリング
- セキュリティ
- パフォーマンス

**出力**: 監査結果、修正指示

詳細: `agents/i3-code-auditor.md`

### I4: Integration Validator（統合検証者）

**役割**: 統合テストとCI/CDパイプラインを検証

**検証内容**:
- 統合テスト実行
- CI/CDパイプライン通過確認
- ステージング環境での動作確認

詳細: `agents/i4-integration-validator.md`

### I5: Documentation Writer（ドキュメント作成者）

**役割**: 技術ドキュメントを作成・更新

**ドキュメント種別**:
- API仕様書（OpenAPI自動生成）
- 開発者向けREADME
- ADR（設計判断記録）
- 変更履歴

詳細: `agents/i5-documentation-writer.md`

## 実行方法

### フルワークフロー

```
「実装を開始して」
「implementation」
```

### 個別エージェント

```
「I1を実行」→ Code Implementerのみ
「I2を実行」→ Test Writerのみ
「I3を実行」→ Code Auditorのみ
「I4を実行」→ Integration Validatorのみ
「I5を実行」→ Documentation Writerのみ
```

### 機能別実装

```
「I1: AUTH-001を実装」→ 特定機能を実装
「I2: AUTH-001のテストを作成」→ 特定機能のテスト
「I3: AUTH-001を監査」→ 特定機能を監査
```

## 実装フロー

### TDD強制の場合（api/cli、CORE/CONTRACT層）

```
1. SSOT確認
2. I2: テスト作成（Red）
3. I1: 実装（Green）
4. I1: リファクタリング（Refactor）
5. I3: コード監査
6. I4: 統合検証
```

### TDD任意の場合（app/lp/hp、DETAIL層）

```
1. SSOT確認
2. I1: 実装
3. I3: コード監査
4. I2: テスト作成
5. I4: 統合検証
```

## 合議ポイント

Implementation Phase中に以下の合議を行う：

1. **SSOT不明点の解決**
   - 参加者: I1 + Product Expert
   - トリガー: CORE/CONTRACT層の不明点発見時
   - 判定: 仕様を明確化して続行

2. **技術的課題の解決**
   - 参加者: I1 + Technical Expert
   - トリガー: 実装困難な仕様発見時
   - 判定: 代替案を検討して決定

3. **品質基準未達の対応**
   - 参加者: I3 + Quality Expert
   - トリガー: 監査で重大な問題発見時
   - 判定: 修正方針を決定

## CI/CD基準

19_CI_PR_STANDARDS.md に従う：

```
必須（1つでも失敗したらマージ不可）:
✅ TypeScript エラー 0件
✅ ESLint エラー 0件
✅ Prettier 差分 0件
✅ 単体テスト 全パス
✅ 統合テスト 全パス
✅ カバレッジ 80%以上
✅ ビルド成功
```

## 成果物

| 成果物 | 完成度 | 検証方法 |
|--------|--------|----------|
| 実装コード | 100% | テスト通過 |
| テストコード | 100% | カバレッジ80%+ |
| 監査結果 | 100% | 全項目✅ |
| CI/CD通過 | 100% | 全ジョブグリーン |

## 止まらないルール

21_AI_ESCALATION.md に従う：

- **T4（矛盾）, T6（影響不明）** → 常に停止して確認
- **CORE/CONTRACT層の不明点** → 停止して質問
- **DETAIL層の不明点** → デフォルトで進む + Decision Backlog

## 次のフェーズ

Implementation完了後は `.claude/skills/review-council/SKILL.md` で最終レビュー。
