# Gate 2: Quality Sweep

## Status
IMPLEMENTED

## Type
parallel

## Trigger
各タスク実装完了後、PRマージ前

## Agents
- ssot-drift-detector
- security-scanner
- test-coverage-auditor
- perf-profiler

## Pass criteria
- Zero CRITICAL findings
- Maximum 3 WARNING findings

## On fail
auto-remediate (max=2 attempts) then escalate

## CLI
```
framework gate quality
```

## Description
実装済みコードの品質を多角的に並列検証するGate。
SSOT乖離、セキュリティ、テストカバレッジ、パフォーマンスを同時にチェックする。

## Check flow
```
Implementation complete
  ↓
┌─────────────────────────────┐
│ ssot-drift-detector         │ → SSOT仕様との乖離
│ security-scanner            │ → セキュリティ脆弱性
│ test-coverage-auditor       │ → テストカバレッジ (L1/L2/L3)
│ perf-profiler               │ → パフォーマンス問題
└─────────────────────────────┘
  ↓ (parallel)
Aggregate results
  ├── Zero CRITICAL, ≤3 WARNING → PASS → PR merge可
  ├── CRITICAL found → auto-remediate (max 2 attempts)
  │   ├── Fixed → re-check → PASS
  │   └── Not fixed → ESCALATE to CTO
  └── >3 WARNING → Review required
```

## Skill
```
/gate-quality
```
