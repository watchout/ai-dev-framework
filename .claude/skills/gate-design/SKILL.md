---
name: gate-design
description: |
  Gate 1: Design Validation。設計完了後の設計書検証Gate。
  「gate-design」「設計ゲート」「design validation」で実行。
---

# Gate 1: Design Validation

## 概要

設計完了後、Planning（framework plan）開始前に3つのValidatorが設計書群の矛盾・不整合・欠落を検出するGateスキル。設計欠陥は実装後に10倍のコストがかかるため、Gate 2より厳格な基準を適用する。

## Agents（参照）

4つのValidatorを順次実行する:

1. @agents/validators/feasibility-checker.md → 技術的実現可能性の検証
2. @agents/validators/coherence-auditor.md → 設計書間の矛盾検出
3. @agents/validators/gap-detector.md → 設計欠落の検出
4. @agents/validators/traceability-auditor.md → SSOT↔IMPL trace整合性検証（`framework trace verify` ラッパー）

## 実行フロー

```
1. コンテキスト収集
   - docs/配下の設計書群を全文読み込み
   - PRD, API Contract, Data Model, Cross-Cutting, Feature Catalog, UI State, Tech Stack

2. Validator並列実行（Agent Teams独立セッション）
   feasibility-checker  ┐
   coherence-auditor    ├→ 並列
   gap-detector         │
   traceability-auditor ┘

3. 統合判定
   - PASS: 全CRITICAL = 0 かつ WARNING ≤ 5
   - BLOCK: CRITICAL ≥ 1 または WARNING > 5

4. レポート出力
   → .framework/reports/design-validation-{project}.md
```

## 判定基準

| 条件 | 判定 |
|------|------|
| 全CRITICAL = 0、WARNING ≤ 5 | **PASS** → framework plan 実行可 |
| CRITICAL ≥ 1 | **BLOCK** → 設計書修正優先 |
| WARNING > 5 | **BLOCK** → 設計改善必要 |

<!-- 閾値変更: ≤3 → ≤5（2026-03-26）
  根拠: haishin-puls-hub実戦テストで真陽性WARNING 20件中、
  設計段階で修正すべきものは約5件。残りは実装段階で対処可能。
  ≤3だと有用なWARNINGでもBLOCKされ、設計フェーズが停滞する。
-->
> WARNING ≤ 5はGate 2と同等。CRITICAL = 0の厳格さで設計品質を担保する。

## 実行手順

### 事前準備（CLI）

```bash
# コンテキスト収集（CLIコマンド）
framework gate design

# → .framework/gate-context/design-validation.md が生成される
```

### Validator実行（スキル）

```
/gate-design を実行
```

### 結果の扱い

- **PASS**: `framework plan` に進む
- **BLOCK（1回目）**: 指摘事項に基づき設計書を修正 → 再実行
- **BLOCK（2回目連続）**: 設計アプローチ自体を見直す。場当たり的な設計書修正は禁止
- **BLOCK（3回目）**: CEOにエスカレーション

## レポートフォーマット

```markdown
# Design Validation Report

## Date: {date}
## Project: {project}
## Verdict: PASS / BLOCK

## Design Completeness Score
| Document | Status | Completeness |
|----------|--------|-------------|
| SSOT-0_PRD.md | Found/Missing | XX% |
| SSOT-1_FEATURE_CATALOG.md | Found/Missing | XX% |
| SSOT-2_UI_STATE.md | Found/Missing | XX% |
| SSOT-3_API_CONTRACT.md | Found/Missing | XX% |
| SSOT-4_DATA_MODEL.md | Found/Missing | XX% |
| SSOT-5_CROSS_CUTTING.md | Found/Missing | XX% |
| TECH_STACK.md | Found/Missing | XX% |

## Validator Results

### 1. Feasibility Checker
{findings}

### 2. Coherence Auditor
{findings}

### 3. Gap Detector
{findings}

### 4. Traceability Auditor
{findings}

## Aggregate
- Total CRITICAL: X
- Total WARNING: X
- Total INFO: X
- Verdict: PASS / BLOCK
```

## ルール

1. **BLOCK時はframework planを実行せず設計書修正優先**
2. **2回連続BLOCK時は設計アプローチ自体を見直す**
3. **Gate判定結果はCEOへの報告に含めること**
4. **Design Completeness Scoreを必ず算出すること**
