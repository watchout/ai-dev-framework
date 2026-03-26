# Gate 3: Adversarial Review

## Status
IMPLEMENTED

## Type
adversarial (sequential, interdependent — NOT parallelizable)

## Trigger
全実装完了後のリリース判定

## Agents (order fixed)
1. prosecutor → 起訴状
2. defense → 弁護書（起訴状を入力）
3. judge → 判決書（起訴状+弁護書を入力）

## Verdict
- SHIP: リリース可（GUILTY = 0）
- SHIP_WITH_CONDITIONS: 条件付きリリース（GUILTY MEDIUM以下のみ）
- BLOCK: リリース不可（GUILTY CRITICAL/HIGH ≥ 1）

## CLI
```
framework gate release
```

## Skill
```
/gate-release
```

## Input
- git diff（全変更）
- SSOT文書群
- Gate 1/2レポート
- テスト実行結果

## Review flow
```
All implementation complete
  ↓
┌─ Prosecutor ─────────────┐
│ リリースを止める理由を    │
│ 全力で探す（起訴状作成）  │
└──────────────────────────┘
  ↓ 起訴状
┌─ Defense ────────────────┐
│ 各起訴を検証             │
│ DISMISS/REDUCE/ACKNOWLEDGE│
└──────────────────────────┘
  ↓ 弁護書
┌─ Judge ──────────────────┐
│ 起訴状+弁護書のみで判定  │
│ SHIP / CONDITIONS / BLOCK │
└──────────────────────────┘
```
