---
name: gate-design
description: |
  Gate 1: Design Validation。設計完了後の設計書検証Gate。
  「gate-design」「設計ゲート」「design validation」で実行。
---

# Gate 1: Design Validation

## 概要

設計完了後、Planning（shirube plan）開始前に6つのValidatorが設計書群の矛盾・不整合・欠落・制御設計漏れ・DB/state正本設計漏れを検出するGateスキル。設計欠陥は実装後に10倍のコストがかかるため、Gate 2より厳格な基準を適用する。

## Gate Authority

`/gate-design` は独立Gateであり、設計Producer (`/design`) の成果物に対して PASS / BLOCK / CONDITIONAL PASS を出せる。
Producer の自己チェック結果は参考情報として扱い、Gate判定の代替とはしない。

このスキルはユーザー承認後に実行する。`/design` から自動遷移してはいけない。

## Agents（参照）

6つのValidatorを順次実行する:

1. @agents/validators/feasibility-checker.md → 技術的実現可能性の検証
2. @agents/validators/coherence-auditor.md → 設計書間の矛盾検出
3. @agents/validators/gap-detector.md → 設計欠落の検出
4. traceability-auditor → SSOT↔IMPL trace整合性（`shirube trace verify` ラッパー）
5. llm-control-design-validator → automation 設計の Source of Truth / deterministic control / Hook / runtime adapter / startup / gates / authority を機械検証
6. data-authority-design-validator → DB/state 設計の mutable fact SSOT / 正規化 / 参照整合 / projection 派生規則を機械検証

## 実行フロー

```
1. コンテキスト収集
   - docs/配下の設計書群を全文読み込み
   - PRD, API Contract, Data Model, Cross-Cutting, Feature Catalog, UI State, Tech Stack

2. Validator実行（Agent Teams独立セッション + deterministic precheck）
   feasibility-checker ┐
   coherence-auditor   ├→ 並列
   gap-detector        ┘
   traceability-auditor → shirube trace verify
   llm-control-design-validator → shirube gate design --strict
   data-authority-design-validator → shirube gate design --strict

3. 統合判定
   - PASS: 全CRITICAL = 0 かつ WARNING ≤ 5
   - BLOCK: CRITICAL ≥ 1 または WARNING > 5

4. レポート出力
   → .framework/reports/design-validation-{project}.md
```

## 判定基準

| 条件 | 判定 |
|------|------|
| 全CRITICAL = 0、WARNING ≤ 5 | **PASS** → shirube plan 実行可 |
| CRITICAL ≥ 1 | **BLOCK** → 設計書修正優先 |
| WARNING > 5 | **BLOCK** → 設計改善必要 |
| automation 設計で LLM Control Design section 欠落 | **BLOCK** → Source of Truth / deterministic control / Hook / runtime adapter / startup / gates / authority を補完 |
| LLM adapter に queue state transition / finalize / delivery を割当 | **BLOCK** → Runner / deterministic service に責務を戻す |
| DB/state 設計で Data Authority / Normalization section 欠落 | **BLOCK** → mutable fact のSSOT、正規化、参照整合、projection 派生規則を補完 |
| 同じ mutable fact を複数 table / registry / cache に独立正本として保存 | **BLOCK** → canonical owner への参照、projection、または証跡 snapshot に戻す |
| 軽微な未解決事項のみ | **CONDITIONAL PASS** → 条件を明記して次工程可 |

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
shirube gate design

# strict mode: automation-related specs must include LLM Control Design sections
shirube gate design --strict

# → .framework/gate-context/design-validation.md が生成される
```

### Validator実行（スキル）

```
/gate-design を実行
```

### 結果の扱い

- **PASS**: `shirube plan` に進む
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

### 5. LLM Control Design Validator
{findings}

### 6. Data Authority Design Validator
{findings}

## Aggregate
- Total CRITICAL: X
- Total WARNING: X
- Total INFO: X
- Verdict: PASS / BLOCK
```

## ルール

1. **BLOCK時はshirube planを実行せず設計書修正優先**
2. **2回連続BLOCK時は設計アプローチ自体を見直す**
3. **Gate判定結果はCEOへの報告に含めること**
4. **Design Completeness Scoreを必ず算出すること**
