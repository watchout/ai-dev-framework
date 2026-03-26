---
name: implement
description: |
  Implementation Phase。実装・テスト・品質保証を担当。
  「実装」「implement」「コーディング」「テスト」で実行。
---

# Implementation Skill

## 概要

技術設計を実際のコードに落とし込み、テストと品質保証を行う専門家チーム。
Pre-Code Gate (A/B/C) が全て passed であることが前提。

## ワークフロー

```
Gate Check → I1: 実装 → I2: テスト → I3: 監査 → I4: 統合 → I5: ドキュメント
```

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

## Pre-Code Gate 確認

コードを1行でも書く前に `.framework/gates.json` を確認:

- **Gate A** (Environment): 開発環境が稼働しているか
- **Gate B** (Planning): タスク分解・Wave分類が完了しているか
- **Gate C** (SSOT): §3-E/F/G/H が記入済みか

全Gate passed でなければ `framework gate check` を実行して解決する。

## エージェント詳細

### I1: Code Implementer（コード実装者）

**役割**: SSOTに基づいてコードを実装

**実装順序**:
1. SSOT確認（CORE → CONTRACT → DETAIL）
2. カスタマイズログ確認（共通機能の場合）
3. 標準タスク分解に従い実装:
   - Task 1: DB（マイグレーション、シード、インデックス）
   - Task 2: API（エンドポイント、バリデーション、エラーハンドリング）
   - Task 3: UI（画面、状態管理、フロー）
   - Task 4: 結合（API + UI接続、E2E）
4. 自己レビュー

**コーディング規約**:
- Components: PascalCase (LoginForm.tsx)
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case（コンポーネント以外）
- Max ~200 lines per file
- No `any` type
- No `console.log` in production code

### I2: Test Writer（テスト作成者）

**役割**: テストコードを作成

**テスト3層（ADR-010）**:

project.jsonのtesting設定を確認し、各層のテストを作成する。

| 層 | 種別 | 必須条件 | ツール参照 |
|---|---|---|---|
| L1: Unit | ロジックテスト（モックOK） | 必須 | testing.l1.tool |
| L2: Integration | 実DB接続APIテスト | API/DBがある場合必須 | testing.l2.tool |
| L3: E2E/Browser | ブラウザ操作テスト | UIがある場合必須 | testing.l3.tool |

**L1のみではスコア上限70点**。L2/L3が該当するプロジェクトでは必ず作成すること。

**L1テスト作成**:
1. 単体テスト — 全関数・モジュールの正確性検証
2. モック使用OK（外部API、DB接続等）

**L2テスト作成**（該当時）:
1. テスト用DBに実接続してAPIエンドポイントをテスト
2. マイグレーション → シード → リクエスト → 検証 → クリーンアップ
3. 全エンドポイントの正常系 + 認証フロー + CRUD全操作
4. 参照: templates/testing/l2-integration-setup.md

**L3テスト作成**（該当時）:
1. staging環境でブラウザ操作テスト
2. ログインフロー、全ページ表示、主要CRUD操作
3. 失敗時はスクリーンショット保存
4. 参照: templates/testing/l3-e2e-browser-use.md

**テスト構造**:
```
describe('[機能ID] [機能名]', () => {
  describe('正常系', () => {
    it('§3-E #1: [テストケース名]', () => { ... });
  });
  describe('異常系', () => {
    it('§3-G #1: [例外条件]', () => { ... });
  });
  describe('境界値', () => {
    it('§3-F: [項目] - 最小値', () => { ... });
  });
});
```

**カバレッジ目標**: L1 80%以上（新規コードは90%以上）、L2 全エンドポイント、L3 主要フロー

### I3: Code Auditor（コード監査者）

**役割**: コード品質を監査（Adversarial Review）

**監査チェックリスト**:
- [ ] **SSOT準拠性**: 仕様通りに実装されているか
- [ ] **型安全性**: any不使用、適切な型定義
- [ ] **エラーハンドリング**: 全エラーパスが処理されているか
- [ ] **セキュリティ**: SQLインジェクション、XSS、CSRF対策
- [ ] **パフォーマンス**: N+1クエリなし、適切なインデックス
- [ ] **コーディング規約**: 命名規則、ファイルサイズ
- [ ] **禁止事項**: console.log, any, 仕様外機能

**出力形式**:
```markdown
## 監査結果: [機能ID]
- Critical: [件数] — 即時修正必須
- Warning: [件数] — 修正推奨
- Info: [件数] — 改善提案
```

### I4: Integration Validator（統合検証者）

**役割**: 統合テストとCI/CDパイプラインを検証

**CI必須チェック（1つでも失敗したらマージ不可）**:
- TypeScript エラー 0件
- ESLint エラー 0件
- Prettier 差分 0件
- 単体テスト 全パス
- 統合テスト 全パス
- カバレッジ 80%以上
- ビルド成功

### I5: Documentation Writer（ドキュメント作成者）

**役割**: 技術ドキュメントを作成・更新

**ドキュメント種別**:
- API仕様書（OpenAPI自動生成）
- 開発者向けREADME
- ADR（設計判断記録）
- 変更履歴

## 止まらないルール

- **T4（矛盾）, T6（影響不明）** → 常に停止して確認
- **CORE/CONTRACT層の不明点** → 停止して質問
- **DETAIL層の不明点** → デフォルトで進む + Decision Backlog に記録

## ブランチ戦略

```
main: 常にデプロイ可能（直接コミット禁止）
feature/[機能ID]-[レイヤー]: 機能実装用
fix/[機能ID]-[説明]: バグ修正用
```

## Multi-perspective Check

実装を完了する前に、以下の視点を検討:
- **Product**: SSOTの要件を漏れなく実装したか？
- **Technical**: 保守しやすいコードか？技術的負債を生んでいないか？
- **Business**: パフォーマンスはビジネス要件を満たすか？

視点間の緊張があれば、それを明記して解決策を示す。

## 実装中の知見記録

実装中に以下を発見した場合、.learnings/LEARNINGS.md に記録する:
- **技術的負債**: 既存コードの問題を発見した場合
- **SSOT曖昧さ**: 仕様が不明確で判断が必要だった箇所
- **パフォーマンス判断**: 実装時にパフォーマンスを意識した設計判断
- **依存関係の問題**: ライブラリの制約・非互換性を発見した場合

記録フォーマット:
```markdown
## [YYYY-MM-DD] [カテゴリ]: [タイトル]
- **発見元**: 実装中
- **重要度**: WARNING
- **内容**: [何を発見したか]
- **対策**: [次回どう回避するか]
- **繰り返し回数**: 1
- **promoted**: false
```

## 実装メモの記録（notes/）

実装中に以下を発見した場合、`notes/{taskId}-{説明}.md` に記録する:

- 技術的判断の理由（なぜこの実装方針を選んだか）
- 発見した技術負債（workaround、TODO、既知の制限）
- SSOTの曖昧さや矛盾（どう解釈して実装したか）
- 依存関係の注意点（バージョン制約、breaking change情報）
- 後続タスクへの申し送り事項

notesファイルは短く具体的に書くこと。1ファイル50行以内を目安とする。
何も記録すべきことがなければ、notesファイルは作成しなくてよい。

## Post-Implementation Gate（Gate 2: Quality Sweep）

実装完了後、PR作成前にGate 2を通すこと:

```
1. framework gate quality     ← コンテキスト収集（CLI）
2. /gate-quality               ← Validator実行（スキル）
3. PASS → PR作成に進む
   BLOCK → 指摘事項を修正 → 1に戻る
```

### BLOCKルール
- **1回目BLOCK**: 指摘事項を修正して再実行
- **2回目連続BLOCK**: 根本原因を分析してから再実行（場当たり的修正禁止）
- **3回目BLOCK**: CEOにエスカレーション

### Gate 2判定結果は報告に含めること

## 次のフェーズ

Implementation 完了後:
1. Gate 2（Quality Sweep）をPASS
2. 実装結果をユーザーに報告
3. 「レビュー（/review）を実施しますか？」と提案
4. 承認されたら Skill ツールで /review を起動
