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

## Agents（参照）

### Producers
1. @agents/producers/implementation/i1-code-implementer.md → コード実装
2. @agents/producers/implementation/i2-test-writer.md → テスト作成 (L1/L2/L3)
3. @agents/producers/implementation/i5-documentation-writer.md → ドキュメント

### Validators
4. @agents/validators/code-auditor.md → コード品質監査 (Adversarial Review)
5. @agents/validators/integration-validator.md → 統合テスト・CI検証

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
