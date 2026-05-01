# Gate 1: Design Validation

## Status
IMPLEMENTED

## Type
sequential

## Trigger
Design Phase（/design）完了後、Planning（framework plan）開始前

## Agents
- feasibility-checker → 技術的実現可能性
- coherence-auditor → SSOT間の整合性
- gap-detector → 仕様の漏れ検出
- traceability-auditor → SSOT↔IMPL trace整合性（`framework trace verify` ラッパー）

## Pass criteria
- Zero CRITICAL findings
- Maximum 5 WARNING findings（Gate 2と同等）

## On fail
設計書修正 → 再実行。2回連続BLOCK → 設計アプローチ見直し

## CLI
```
framework gate design
```

## Skill
```
/gate-design
```

## Input

**Primary**（feasibility-checker / coherence-auditor / gap-detector が消費）— 設計書群の全文（git diffではない）:
- SSOT-0_PRD.md
- SSOT-1_FEATURE_CATALOG.md
- SSOT-2_UI_STATE.md
- SSOT-3_API_CONTRACT.md
- SSOT-4_DATA_MODEL.md
- SSOT-5_CROSS_CUTTING.md
- TECH_STACK.md
- docs/design/features/*.md

**Supplementary**（traceability-auditor が消費）— 設計書群を補完する traceability metadata:
- `npx framework trace verify` の出力（SSOT↔IMPL trace の整合性）
- `docs_layers` 未設定の consumer は traceability-auditor を skip（graceful degrade、Gate 1 の overall verdict には影響しない）

## Check flow
```
Design complete
  ↓
┌─────────────────────────┐
│ feasibility-checker     │ → PRD↔API/DB実現可能性
│ coherence-auditor       │ → SSOT間の矛盾検出
│ gap-detector            │ → 未定義事項の検出
│ traceability-auditor    │ → SSOT↔IMPL trace整合性
└─────────────────────────┘
  ↓ (sequential)
Aggregate results
  ├── Zero CRITICAL, ≤5 WARNING → PASS → framework plan
  └── Any CRITICAL or >5 WARNING → BLOCK → 設計修正
```
